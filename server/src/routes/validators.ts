import { Router } from 'express';
import pool from '../db/connection.js';
import { x1Client } from '../lib/x1-rpc.js';
import { fetchEpochSlotMap, fetchStakeHistory, fetchValidatorMetadata } from '../lib/xen-api.js';
import {
  buildInflationRewardRequests,
  buildBlockTimeRequests,
  processTimestampResults,
  processEpochRewards,
  processEpochRewardsForResponse,
} from '../lib/epoch-helpers.js';
import {
  getExistingTimestamps,
  getAllTimestamps,
  saveTimestampsBatch,
  saveEpochRewardsBatch,
} from '../lib/db-helpers.js';
import type { ValidatorData, EpochReward } from '../lib/types.js';

const router = Router();

// Sync missing epochs for a validator when page is visited
async function syncMissingEpochs(v: any, currentRpcEpoch: number): Promise<void> {
  const latestRewardEpoch = currentRpcEpoch - 1;

  const maxEpochResult = await pool.query(
    'SELECT MAX(epoch) as max_epoch FROM epoch_rewards WHERE vote_address = $1',
    [v.vote_address]
  );
  const maxEpochInDB = maxEpochResult.rows[0]?.max_epoch || 0;

  if (maxEpochInDB >= latestRewardEpoch) {
    // epoch_rewards are up to date — ensure current_epoch in DB is also current
    await pool.query(
      'UPDATE validators SET current_epoch = $1, updated_at = NOW() WHERE vote_address = $2',
      [currentRpcEpoch, v.vote_address]
    );
    return;
  }

  const missingEpochs: number[] = [];
  for (let e = maxEpochInDB + 1; e <= latestRewardEpoch; e++) {
    missingEpochs.push(e);
  }
  if (missingEpochs.length === 0) return;

  console.log(`[sync-on-visit] ${v.vote_address}: syncing ${missingEpochs.length} missing epoch(s) (${missingEpochs[0]}–${missingEpochs[missingEpochs.length - 1]})`);

  const selfStakeAddresses: string[] = v.self_stake_addresses || [];
  const hasSelfStake = selfStakeAddresses.length > 0;

  // Build RPC requests
  const voteRewardRequests = buildInflationRewardRequests([v.vote_address], missingEpochs);
  const selfStakeRequests = hasSelfStake
    ? buildInflationRewardRequests(selfStakeAddresses, missingEpochs)
    : [];

  // Get timestamps
  const existingTimestamps = await getExistingTimestamps(missingEpochs);
  const epochSlotMap = await fetchEpochSlotMap();
  const epochsNeedingTimestamp = missingEpochs.filter(
    epoch => !existingTimestamps.has(epoch) && epochSlotMap.has(epoch)
  );
  const timeRequests = buildBlockTimeRequests(epochsNeedingTimestamp, epochSlotMap);

  // Execute all RPC requests in one batch
  const allRequests = [...voteRewardRequests, ...selfStakeRequests, ...timeRequests];
  const batchResults = await x1Client.batchCall(allRequests);

  const voteRewardResults = batchResults.slice(0, missingEpochs.length);
  const selfStakeResults = batchResults.slice(missingEpochs.length, missingEpochs.length + selfStakeRequests.length);
  const timeResults = batchResults.slice(missingEpochs.length + selfStakeRequests.length);

  // Process timestamps
  const { epochTimeMap, newTimestamps } = processTimestampResults(
    timeResults, epochsNeedingTimestamp, existingTimestamps
  );

  // Fetch stake history
  const stakeHistoryMap = v.node_pubkey
    ? await fetchStakeHistory(v.node_pubkey)
    : new Map<number, number>();

  // Process rewards
  const rewardRows = processEpochRewards(
    voteRewardResults, selfStakeResults, missingEpochs,
    epochTimeMap, stakeHistoryMap, hasSelfStake
  );

  // Save to DB in a transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await saveTimestampsBatch(client, newTimestamps);
    await saveEpochRewardsBatch(client, v.vote_address, rewardRows);

    await client.query(
      'UPDATE validators SET current_epoch = $1, updated_at = NOW() WHERE vote_address = $2',
      [currentRpcEpoch, v.vote_address]
    );

    await client.query('COMMIT');
    console.log(`[sync-on-visit] ${v.vote_address}: saved ${rewardRows.length} epoch rewards`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[sync-on-visit] Failed to save:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Helper: Refresh current validator fields from RPC (status, stake, commission, self_stake_amount)
async function refreshValidatorFields(voteAddress: string): Promise<void> {
  const freshVoteAccounts = await x1Client.getVoteAccounts();
  const freshActive = freshVoteAccounts.current?.find((a: any) => a.votePubkey === voteAddress);
  const freshDelinquent = freshVoteAccounts.delinquent?.find((a: any) => a.votePubkey === voteAddress);
  const freshAccount = freshActive || freshDelinquent;

  if (!freshAccount) return;

  const newStatus = freshActive ? 'active' : 'delinquent';
  const newActivatedStake = freshAccount.activatedStake ? freshAccount.activatedStake / 1e9 : 0;
  const newCommission = freshAccount.commission;

  const storedResult = await pool.query(
    'SELECT self_stake_addresses, self_stake_amount FROM validators WHERE vote_address = $1',
    [voteAddress]
  );
  const stored = storedResult.rows[0];
  const storedAddresses: string[] = stored?.self_stake_addresses || [];
  let newSelfStakeAmount = stored?.self_stake_amount ?? 0;

  if (storedAddresses.length > 0) {
    try {
      const accountsInfo = await x1Client.getMultipleAccounts(storedAddresses);
      newSelfStakeAmount = accountsInfo.value
        .filter((acc: any) => acc !== null)
        .reduce((sum: number, acc: any) => sum + (acc.lamports || 0), 0) / 1e9;
    } catch (err) {
      console.error(`[refreshValidatorFields] ${voteAddress}: getMultipleAccounts failed:`, (err as Error).message);
    }
  }

  await pool.query(
    `UPDATE validators
     SET status = $1, activated_stake = $2, commission = $3, self_stake_amount = $4, updated_at = NOW()
     WHERE vote_address = $5`,
    [newStatus, newActivatedStake, newCommission, newSelfStakeAmount, voteAddress]
  );
  console.log(`[refreshValidatorFields] ${voteAddress}: stake=${newActivatedStake}, selfStake=${newSelfStakeAmount}, status=${newStatus}`);
}

// GET /api/validators/search?q= - Search validators list
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (q.length < 2 || q.length > 100) {
      return res.json([]);
    }

    const result = await pool.query(
      `SELECT vote_pubkey, node_pubkey, name, icon_url
       FROM validators_list
       WHERE vote_pubkey ILIKE $1 OR name ILIKE $1
       LIMIT 10`,
      [`%${q}%`]
    );

    res.json(result.rows.map((r: any) => ({
      votePubkey: r.vote_pubkey,
      nodePubkey: r.node_pubkey,
      name: r.name,
      iconUrl: r.icon_url,
    })));
  } catch (error) {
    console.error('Error searching validators:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/validators/:voteAddress - Get validator from DB (with sync-on-visit)
router.get('/:voteAddress', async (req, res) => {
  try {
    const { voteAddress } = req.params;

    const validatorResult = await pool.query(
      'SELECT * FROM validators WHERE vote_address = $1 AND is_tracked = true',
      [voteAddress]
    );

    if (validatorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Validator not found' });
    }

    const v = validatorResult.rows[0];

    // Sync-on-visit: check if there are newer epochs available
    let rpcEpoch: number | null = null;
    try {
      const epochInfo = await x1Client.getEpochInfo();
      rpcEpoch = epochInfo.epoch;

      const latestCheck = await pool.query(
        'SELECT 1 FROM epoch_rewards WHERE vote_address = $1 AND epoch = $2',
        [voteAddress, epochInfo.epoch - 1]
      );

      if (latestCheck.rows.length === 0 || v.current_epoch !== epochInfo.epoch) {
        await syncMissingEpochs(v, epochInfo.epoch);
      }
    } catch (syncError) {
      console.error('[sync-on-visit] Sync check failed, serving cached data:', syncError);
    }

    // Read (potentially updated) data from DB
    const rewardsResult = await pool.query(
      'SELECT * FROM epoch_rewards WHERE vote_address = $1 ORDER BY epoch DESC',
      [voteAddress]
    );

    const epochRewards: EpochReward[] = rewardsResult.rows.map(r => ({
      epoch: r.epoch,
      voteReward: r.vote_reward,
      reward: r.reward,
      commission: r.commission,
      selfStakeReward: r.self_stake_reward,
      date: r.date,
      activeStake: r.active_stake,
      postBalance: r.post_balance,
    }));

    const totalRewards = epochRewards.reduce((sum, r) => sum + r.reward, 0);
    const epochCount = epochRewards.length;

    const validator: ValidatorData = {
      voteAddress: v.vote_address,
      totalRewards,
      epochCount,
      averageReward: epochCount > 0 ? totalRewards / epochCount : 0,
      currentEpoch: rpcEpoch || v.current_epoch,
      activatedStake: v.activated_stake,
      commission: v.commission,
      epochRewards,
      status: v.status,
      name: v.name,
      avatar: v.avatar,
      selfStakeAddresses: v.self_stake_addresses,
      selfStakeAmount: v.self_stake_amount,
    };

    res.json(validator);
  } catch (error) {
    console.error('Error fetching validator:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/validators/:voteAddress/status - Check if validator exists in DB
router.get('/:voteAddress/status', async (req, res) => {
  try {
    const { voteAddress } = req.params;
    const result = await pool.query(
      'SELECT vote_address, current_epoch, updated_at FROM validators WHERE vote_address = $1',
      [voteAddress]
    );

    if (result.rows.length === 0) {
      return res.json({ exists: false });
    }

    res.json({
      exists: true,
      currentEpoch: result.rows[0].current_epoch,
      updatedAt: result.rows[0].updated_at,
    });
  } catch (error) {
    console.error('Error checking validator status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/validators - Add validator (fetch from RPC and save to DB)
router.post('/', async (req, res) => {
  try {
    const { voteAddress } = req.body;

    if (!voteAddress || typeof voteAddress !== 'string') {
      return res.status(400).json({ error: 'voteAddress is required' });
    }

    // Check if already in DB (including soft-deleted)
    const existing = await pool.query(
      'SELECT vote_address, is_tracked FROM validators WHERE vote_address = $1',
      [voteAddress]
    );

    if (existing.rows.length > 0) {
      // Re-activate if soft-deleted
      if (!existing.rows[0].is_tracked) {
        await pool.query(
          'UPDATE validators SET is_tracked = true, updated_at = NOW() WHERE vote_address = $1',
          [voteAddress]
        );
      }

      // Refresh validator fields and sync missing epochs before returning
      try {
        await refreshValidatorFields(voteAddress);
      } catch (refreshErr) {
        console.warn('[POST validator] Field refresh failed:', (refreshErr as Error).message);
      }
      try {
        const epochInfo = await x1Client.getEpochInfo();
        const v = (await pool.query('SELECT * FROM validators WHERE vote_address = $1', [voteAddress])).rows[0];
        await syncMissingEpochs(v, epochInfo.epoch);
      } catch (syncErr) {
        console.warn('[POST validator] Sync failed, returning cached data:', (syncErr as Error).message);
      }

      const getResponse = await buildValidatorResponse(voteAddress);
      if (getResponse) {
        return res.json(getResponse);
      }
    }

    // Fetch full data from RPC
    console.log(`Fetching data for new validator: ${voteAddress}`);
    const validatorData = await fetchValidatorFromRPC(voteAddress);

    if (!validatorData) {
      return res.status(404).json({ error: 'Validator not found on chain' });
    }

    await saveValidatorToDB(validatorData);
    res.json(validatorData);
  } catch (error) {
    console.error('Error adding validator:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/validators/:voteAddress/resync - Fill missing epoch rewards
router.post('/:voteAddress/resync', async (req, res) => {
  try {
    const { voteAddress } = req.params;

    const validatorResult = await pool.query(
      'SELECT * FROM validators WHERE vote_address = $1',
      [voteAddress]
    );
    if (validatorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Validator not found' });
    }

    const v = validatorResult.rows[0];

    // Refresh current validator fields from RPC (status, stake, commission, self_stake_amount)
    try {
      await refreshValidatorFields(voteAddress);
    } catch (refreshErr) {
      console.error(`[resync] ${voteAddress}: failed to refresh validator fields:`, (refreshErr as Error).message);
    }

    // Get existing epochs from DB
    const existingEpochs = await pool.query(
      'SELECT epoch FROM epoch_rewards WHERE vote_address = $1',
      [voteAddress]
    );
    const existingSet = new Set(existingEpochs.rows.map((r: any) => r.epoch));

    // Get current epoch from RPC
    const epochInfo = await x1Client.getEpochInfo();
    const currentEpoch = epochInfo.epoch;

    // Always keep current_epoch in DB up to date
    await pool.query(
      'UPDATE validators SET current_epoch = $1, updated_at = NOW() WHERE vote_address = $2',
      [currentEpoch, voteAddress]
    );

    // Find missing epochs (all from beginning)
    const allEpochs = Array.from({ length: currentEpoch }, (_, i) => currentEpoch - 1 - i).filter(e => e >= 0);
    const missingEpochs = allEpochs.filter(e => !existingSet.has(e));

    if (missingEpochs.length === 0) {
      const response = await buildValidatorResponse(voteAddress);
      return res.json(response);
    }

    console.log(`[resync] ${voteAddress}: found ${missingEpochs.length} missing epochs, fetching...`);

    const selfStakeAddresses = v.self_stake_addresses || [];
    const hasSelfStake = selfStakeAddresses.length > 0;

    // Build RPC requests
    const voteRewardRequests = buildInflationRewardRequests([voteAddress], missingEpochs);
    const selfStakeRequests = hasSelfStake
      ? buildInflationRewardRequests(selfStakeAddresses, missingEpochs)
      : [];

    // Get timestamps
    const stakeHistoryMap = v.node_pubkey
      ? await fetchStakeHistory(v.node_pubkey)
      : new Map<number, number>();

    const existingTimestamps = await getAllTimestamps();
    const epochSlotMap = await fetchEpochSlotMap();

    const epochsNeedingTimestamp = missingEpochs.filter(
      epoch => !existingTimestamps.has(epoch) && epochSlotMap.has(epoch)
    );
    const timeRequests = buildBlockTimeRequests(epochsNeedingTimestamp, epochSlotMap);

    const allRequests = [...voteRewardRequests, ...selfStakeRequests, ...timeRequests];
    const batchResults = await x1Client.batchCall(allRequests);

    const voteRewardResults = batchResults.slice(0, missingEpochs.length);
    const selfStakeResults = batchResults.slice(missingEpochs.length, missingEpochs.length + selfStakeRequests.length);
    const timeResults = batchResults.slice(missingEpochs.length + selfStakeRequests.length);

    // Process timestamps
    const { epochTimeMap, newTimestamps } = processTimestampResults(
      timeResults, epochsNeedingTimestamp, existingTimestamps
    );

    // Process rewards
    const rewardRows = processEpochRewards(
      voteRewardResults, selfStakeResults, missingEpochs,
      epochTimeMap, stakeHistoryMap, hasSelfStake
    );

    // Save to DB
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await saveTimestampsBatch(client, newTimestamps);
      await saveEpochRewardsBatch(client, voteAddress, rewardRows);
      await client.query('COMMIT');
      console.log(`[resync] ${voteAddress}: filled ${rewardRows.length} missing epochs`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const response = await buildValidatorResponse(voteAddress);
    res.json(response);
  } catch (error) {
    console.error('Error resyncing validator:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/validators/:voteAddress - Soft delete (stop tracking, keep data)
router.delete('/:voteAddress', async (req, res) => {
  try {
    const { voteAddress } = req.params;

    const result = await pool.query(
      'UPDATE validators SET is_tracked = false, updated_at = NOW() WHERE vote_address = $1 RETURNING vote_address',
      [voteAddress]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Validator not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting validator:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper: Build validator response from DB
async function buildValidatorResponse(voteAddress: string): Promise<ValidatorData | null> {
  const validatorResult = await pool.query(
    'SELECT * FROM validators WHERE vote_address = $1',
    [voteAddress]
  );

  if (validatorResult.rows.length === 0) return null;

  const v = validatorResult.rows[0];
  const rewardsResult = await pool.query(
    'SELECT * FROM epoch_rewards WHERE vote_address = $1 ORDER BY epoch DESC',
    [voteAddress]
  );

  const epochRewards: EpochReward[] = rewardsResult.rows.map(r => ({
    epoch: r.epoch,
    voteReward: r.vote_reward,
    reward: r.reward,
    commission: r.commission,
    selfStakeReward: r.self_stake_reward,
    date: r.date,
    activeStake: r.active_stake,
    postBalance: r.post_balance,
  }));

  const totalRewards = epochRewards.reduce((sum, r) => sum + r.reward, 0);
  const epochCount = epochRewards.length;

  return {
    voteAddress: v.vote_address,
    totalRewards,
    epochCount,
    averageReward: epochCount > 0 ? totalRewards / epochCount : 0,
    currentEpoch: v.current_epoch,
    activatedStake: v.activated_stake,
    commission: v.commission,
    epochRewards,
    status: v.status,
    name: v.name,
    avatar: v.avatar,
    selfStakeAddresses: v.self_stake_addresses,
    selfStakeAmount: v.self_stake_amount,
  };
}

// Helper: Fetch full validator data from RPC
export async function fetchValidatorFromRPC(voteAddress: string): Promise<ValidatorData | null> {
  const epochInfo = await x1Client.getEpochInfo();
  const currentEpoch = epochInfo.epoch;
  const voteAccounts = await x1Client.getVoteAccounts();

  const activeValidator = voteAccounts.current?.find((v: any) => v.votePubkey === voteAddress);
  const delinquentValidator = voteAccounts.delinquent?.find((v: any) => v.votePubkey === voteAddress);
  const validatorInfo = activeValidator || delinquentValidator;

  if (!validatorInfo) return null;

  const status = activeValidator ? 'active' : 'delinquent';
  const activatedStake = validatorInfo.activatedStake ? validatorInfo.activatedStake / 1e9 : 0;
  const nodePubkey = validatorInfo.nodePubkey;

  // Fetch validator metadata
  const { name: validatorName, avatar: validatorAvatar } = await fetchValidatorMetadata(voteAddress);

  // Fetch self-stake addresses
  let selfStakeAddresses: string[] = [];
  let selfStakeAmount = 0;
  if (nodePubkey) {
    selfStakeAddresses = await x1Client.getStakeAccountsForVote(voteAddress, nodePubkey);
    if (selfStakeAddresses.length > 0) {
      try {
        const accountsInfo = await x1Client.getMultipleAccounts(selfStakeAddresses);
        selfStakeAmount = accountsInfo.value
          .filter((acc: any) => acc !== null)
          .reduce((sum: number, acc: any) => sum + (acc.lamports || 0), 0) / 1e9;
      } catch (err) {
        console.warn('[fetchValidatorFromRPC] getMultipleAccounts:', (err as Error).message);
      }
    }
  }

  // Fetch stake history and epoch metadata
  const stakeHistoryMap = nodePubkey
    ? await fetchStakeHistory(nodePubkey)
    : new Map<number, number>();

  const epochSlotMap = await fetchEpochSlotMap();
  const existingTimestamps = await getAllTimestamps();

  // Build batch RPC requests for all epochs from beginning
  const hasSelfStake = selfStakeAddresses.length > 0;
  const epochNumbers = Array.from({ length: currentEpoch }, (_, i) => currentEpoch - 1 - i).filter(e => e >= 0);

  const voteRewardRequests = buildInflationRewardRequests([voteAddress], epochNumbers);
  const selfStakeRequests = hasSelfStake
    ? buildInflationRewardRequests(selfStakeAddresses, epochNumbers)
    : [];

  const epochsNeedingTimestamp = epochNumbers.filter(
    epoch => !existingTimestamps.has(epoch) && epochSlotMap.has(epoch)
  );
  const timeRequests = buildBlockTimeRequests(epochsNeedingTimestamp, epochSlotMap);

  const allRequests = [...voteRewardRequests, ...selfStakeRequests, ...timeRequests];
  console.log(`Fetching ${allRequests.length} RPC requests for ${voteAddress}...`);
  const batchResults = await x1Client.batchCall(allRequests);

  const validatorResults = batchResults.slice(0, epochNumbers.length);
  const selfStakeResults = batchResults.slice(epochNumbers.length, epochNumbers.length + selfStakeRequests.length);
  const timeResults = batchResults.slice(epochNumbers.length + selfStakeRequests.length);

  // Process timestamps
  const { epochTimeMap, newTimestamps } = processTimestampResults(
    timeResults, epochsNeedingTimestamp, existingTimestamps
  );

  // Save new timestamps to DB
  if (newTimestamps.length > 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await saveTimestampsBatch(client, newTimestamps);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error saving timestamps:', err);
    } finally {
      client.release();
    }
  }

  // Process epoch rewards
  const epochRewards = processEpochRewardsForResponse(
    validatorResults, selfStakeResults, epochNumbers,
    epochTimeMap, stakeHistoryMap, hasSelfStake
  );

  epochRewards.sort((a, b) => b.epoch - a.epoch);

  if (epochRewards.length === 0) return null;

  const totalRewards = epochRewards.reduce((sum, r) => sum + r.reward, 0);

  return {
    voteAddress,
    totalRewards,
    epochCount: epochRewards.length,
    averageReward: totalRewards / epochRewards.length,
    currentEpoch,
    activatedStake,
    commission: validatorInfo.commission || 10,
    epochRewards,
    status,
    name: validatorName,
    avatar: validatorAvatar,
    selfStakeAddresses,
    selfStakeAmount,
    nodePubkey,
  };
}

// Helper: Save validator data to DB
export async function saveValidatorToDB(data: ValidatorData): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO validators (vote_address, name, avatar, status, activated_stake, commission, current_epoch, self_stake_addresses, self_stake_amount, node_pubkey, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (vote_address) DO UPDATE SET
         name = COALESCE($2, validators.name),
         avatar = COALESCE($3, validators.avatar),
         status = $4,
         activated_stake = $5,
         commission = $6,
         current_epoch = $7,
         self_stake_addresses = $8,
         self_stake_amount = $9,
         node_pubkey = COALESCE($10, validators.node_pubkey),
         updated_at = NOW()`,
      [
        data.voteAddress,
        data.name || null,
        data.avatar || null,
        data.status,
        data.activatedStake,
        data.commission,
        data.currentEpoch,
        data.selfStakeAddresses || [],
        data.selfStakeAmount || 0,
        data.nodePubkey || null,
      ]
    );

    // Batch upsert epoch rewards
    const rewardRows = data.epochRewards.map(r => ({
      voteAddress: data.voteAddress,
      epoch: r.epoch,
      voteReward: r.voteReward,
      reward: r.reward,
      commission: r.commission,
      selfStakeReward: r.selfStakeReward || 0,
      date: r.date || null,
      activeStake: r.activeStake || 0,
      postBalance: r.postBalance ?? null,
    }));

    await saveEpochRewardsBatch(client, data.voteAddress, rewardRows, true);

    await client.query('COMMIT');
    console.log(`Saved validator ${data.voteAddress} with ${data.epochRewards.length} epoch rewards`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default router;
