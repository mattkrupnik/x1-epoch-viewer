import { Router } from 'express';
import pool from '../db/connection.js';
import { x1Client } from '../lib/x1-rpc.js';

const router = Router();

// Shared interface matching frontend ValidatorData
interface ValidatorData {
  voteAddress: string;
  totalRewards: number;
  epochCount: number;
  averageReward: number;
  currentEpoch: number;
  activatedStake: number;
  commission: number;
  epochRewards: EpochReward[];
  status: string;
  name?: string;
  avatar?: string;
  selfStakeAddresses?: string[];
  selfStakeAmount?: number;
  nodePubkey?: string;
}

interface EpochReward {
  epoch: number;
  voteReward: number;
  reward: number;
  commission: number;
  selfStakeReward?: number;
  date?: string;
  activeStake?: number;
  postBalance?: number;
}

// Sync missing epochs for a validator when page is visited
async function syncMissingEpochs(v: any, currentRpcEpoch: number): Promise<void> {
  const latestRewardEpoch = currentRpcEpoch - 1;

  // Find which epochs are missing
  const maxEpochResult = await pool.query(
    'SELECT MAX(epoch) as max_epoch FROM epoch_rewards WHERE vote_address = $1',
    [v.vote_address]
  );
  const maxEpochInDB = maxEpochResult.rows[0]?.max_epoch || 0;

  if (maxEpochInDB >= latestRewardEpoch) return;

  const missingEpochs: number[] = [];
  for (let e = maxEpochInDB + 1; e <= latestRewardEpoch; e++) {
    missingEpochs.push(e);
  }

  if (missingEpochs.length === 0) return;

  console.log(`[sync-on-visit] ${v.vote_address}: syncing ${missingEpochs.length} missing epoch(s) (${missingEpochs[0]}–${missingEpochs[missingEpochs.length - 1]})`);

  // Build batch RPC requests for inflation rewards
  const voteRewardRequests = missingEpochs.map(epoch => ({
    method: 'getInflationReward',
    params: [[v.vote_address], { epoch }],
  }));

  const selfStakeAddresses: string[] = v.self_stake_addresses || [];
  let selfStakeRequests: Array<{ method: string; params: any[] }> = [];
  if (selfStakeAddresses.length > 0) {
    selfStakeRequests = missingEpochs.map(epoch => ({
      method: 'getInflationReward',
      params: [selfStakeAddresses, { epoch }],
    }));
  }

  // Check which epoch timestamps we already have
  const tsResult = await pool.query(
    'SELECT epoch, timestamp_str FROM epoch_timestamps WHERE epoch = ANY($1)',
    [missingEpochs]
  );
  const existingTimestamps = new Map<number, string>();
  tsResult.rows.forEach((r: any) => existingTimestamps.set(r.epoch, r.timestamp_str));

  // Get epoch metadata for timestamps we don't have
  let epochSlotMap = new Map<number, number>();
  try {
    const epochsMeta = await fetch('https://api.xen.network/v1/x1/epochs').then(r => r.json()) as any[];
    epochsMeta.forEach((e: any) => epochSlotMap.set(e.epoch, e.endSlot));
  } catch { /* ignore */ }

  const epochsNeedingTimestamp = missingEpochs.filter(
    epoch => !existingTimestamps.has(epoch) && epochSlotMap.has(epoch)
  );
  const timeRequests = epochsNeedingTimestamp.map(epoch => ({
    method: 'getBlockTime',
    params: [epochSlotMap.get(epoch)],
  }));

  // Execute all RPC requests in one batch
  const allRequests = [...voteRewardRequests, ...selfStakeRequests, ...timeRequests];
  const batchResults = await x1Client.batchCall(allRequests);

  const voteRewardResults = batchResults.slice(0, missingEpochs.length);
  const selfStakeResults = batchResults.slice(missingEpochs.length, missingEpochs.length + selfStakeRequests.length);
  const timeResults = batchResults.slice(missingEpochs.length + selfStakeRequests.length);

  // Process timestamps
  const epochTimeMap = new Map(existingTimestamps);
  const newTimestamps: Array<{ epoch: number; timestampStr: string }> = [];
  for (let i = 0; i < timeResults.length; i++) {
    const epoch = epochsNeedingTimestamp[i];
    const timestamp = timeResults[i];
    if (timestamp) {
      const d = new Date(timestamp * 1000);
      const datePart = d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const timestampStr = `${datePart} ${hours}:${minutes}`;
      epochTimeMap.set(epoch, timestampStr);
      newTimestamps.push({ epoch, timestampStr });
    }
  }

  // Fetch stake history
  const stakeHistoryMap = new Map<number, number>();
  if (v.node_pubkey) {
    try {
      const historyResponse = await fetch(
        `https://api.xen.network/v1/x1/validators/${v.node_pubkey}/history?groupBy=epoch&network=mainnet`
      );
      if (historyResponse.ok) {
        const historyData = await historyResponse.json() as any[];
        historyData.forEach((item: any) => {
          if (item.epoch !== undefined && item.activatedStake !== undefined) {
            stakeHistoryMap.set(item.epoch, item.activatedStake / 1e9);
          }
        });
      }
    } catch { /* ignore */ }
  }

  // Save to DB in a transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Save new timestamps
    for (const { epoch, timestampStr } of newTimestamps) {
      await client.query(
        'INSERT INTO epoch_timestamps (epoch, timestamp_str) VALUES ($1, $2) ON CONFLICT (epoch) DO NOTHING',
        [epoch, timestampStr]
      );
    }

    // Save epoch rewards
    let savedCount = 0;
    for (let i = 0; i < missingEpochs.length; i++) {
      const epoch = missingEpochs[i];
      const result = voteRewardResults[i];

      if (result?.[0]?.amount) {
        let selfStakeReward = 0;
        if (selfStakeAddresses.length > 0 && Array.isArray(selfStakeResults[i])) {
          selfStakeReward = selfStakeResults[i]
            .filter((r: any) => r && r.amount)
            .reduce((sum: number, r: any) => sum + r.amount / 1e9, 0);
        }

        const voteReward = result[0].amount / 1e9;
        await client.query(
          `INSERT INTO epoch_rewards (vote_address, epoch, vote_reward, reward, commission, self_stake_reward, date, active_stake, post_balance)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (vote_address, epoch) DO NOTHING`,
          [
            v.vote_address, epoch, voteReward, voteReward + selfStakeReward,
            result[0].commission || 10, selfStakeReward,
            epochTimeMap.get(epoch) || null,
            stakeHistoryMap.get(epoch) || 0,
            result[0].postBalance ? result[0].postBalance / 1e9 : null,
          ]
        );
        savedCount++;
      }
    }

    // Update validator's current_epoch
    await client.query(
      'UPDATE validators SET current_epoch = $1, updated_at = NOW() WHERE vote_address = $2',
      [currentRpcEpoch, v.vote_address]
    );

    await client.query('COMMIT');
    console.log(`[sync-on-visit] ${v.vote_address}: saved ${savedCount} epoch rewards`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[sync-on-visit] Failed to save:', error);
    throw error;
  } finally {
    client.release();
  }
}

// GET /api/validators/search?q= - Search validators list
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (q.length < 2) {
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
      'SELECT * FROM validators WHERE vote_address = $1',
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
      const latestRewardEpoch = epochInfo.epoch - 1;

      const latestCheck = await pool.query(
        'SELECT 1 FROM epoch_rewards WHERE vote_address = $1 AND epoch = $2',
        [voteAddress, latestRewardEpoch]
      );

      if (latestCheck.rows.length === 0) {
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

    // Check if already in DB
    const existing = await pool.query(
      'SELECT vote_address FROM validators WHERE vote_address = $1',
      [voteAddress]
    );

    if (existing.rows.length > 0) {
      // Already exists - return existing data via GET logic
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

    // Save to DB
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

    // Get existing epochs from DB
    const existingEpochs = await pool.query(
      'SELECT epoch FROM epoch_rewards WHERE vote_address = $1',
      [voteAddress]
    );
    const existingSet = new Set(existingEpochs.rows.map((r: any) => r.epoch));

    // Get current epoch from RPC
    const epochInfo = await x1Client.getEpochInfo();
    const currentEpoch = epochInfo.epoch;

    // Find missing epochs (last 400)
    const allEpochs = Array.from({ length: 400 }, (_, i) => currentEpoch - 1 - i).filter(e => e >= 0);
    const missingEpochs = allEpochs.filter(e => !existingSet.has(e));

    if (missingEpochs.length === 0) {
      const response = await buildValidatorResponse(voteAddress);
      return res.json(response);
    }

    console.log(`[resync] ${voteAddress}: found ${missingEpochs.length} missing epochs, fetching...`);

    // Fetch rewards for missing epochs
    const batchRequests = missingEpochs.map(epoch => ({
      method: 'getInflationReward',
      params: [[voteAddress], { epoch }],
    }));

    let selfStakeBatchRequests: Array<{ method: string; params: any[] }> = [];
    const selfStakeAddresses = v.self_stake_addresses || [];
    if (selfStakeAddresses.length > 0) {
      selfStakeBatchRequests = missingEpochs.map(epoch => ({
        method: 'getInflationReward',
        params: [selfStakeAddresses, { epoch }],
      }));
    }

    // Fetch stake history
    let stakeHistoryMap = new Map<number, number>();
    if (v.node_pubkey) {
      try {
        const historyResponse = await fetch(
          `https://api.xen.network/v1/x1/validators/${v.node_pubkey}/history?groupBy=epoch&network=mainnet`
        );
        if (historyResponse.ok) {
          const historyData = await historyResponse.json() as any[];
          historyData.forEach((item: any) => {
            if (item.epoch !== undefined && item.activatedStake !== undefined) {
              stakeHistoryMap.set(item.epoch, item.activatedStake / 1e9);
            }
          });
        }
      } catch { /* ignore */ }
    }

    // Load existing timestamps
    const existingTimestamps = new Map<number, string>();
    const tsResult = await pool.query('SELECT epoch, timestamp_str FROM epoch_timestamps');
    tsResult.rows.forEach((r: any) => existingTimestamps.set(r.epoch, r.timestamp_str));

    // Fetch epoch metadata for missing timestamps
    let epochSlotMap = new Map<number, number>();
    try {
      const epochsMeta = await fetch('https://api.xen.network/v1/x1/epochs').then(r => r.json()) as any[];
      epochsMeta.forEach((e: any) => epochSlotMap.set(e.epoch, e.endSlot));
    } catch { /* ignore */ }

    const epochsNeedingTimestamp = missingEpochs.filter(
      epoch => !existingTimestamps.has(epoch) && epochSlotMap.has(epoch)
    );
    const timeRequests = epochsNeedingTimestamp.map(epoch => ({
      method: 'getBlockTime',
      params: [epochSlotMap.get(epoch)],
    }));

    const allRequests = [...batchRequests, ...selfStakeBatchRequests, ...timeRequests];
    const batchResults = await x1Client.batchCall(allRequests);

    const voteRewardResults = batchResults.slice(0, missingEpochs.length);
    const selfStakeResults = batchResults.slice(missingEpochs.length, missingEpochs.length + selfStakeBatchRequests.length);
    const timeResults = batchResults.slice(missingEpochs.length + selfStakeBatchRequests.length);

    // Process timestamps
    const epochTimeMap = new Map(existingTimestamps);
    const newTimestamps: Array<{ epoch: number; timestampStr: string }> = [];
    for (let i = 0; i < timeResults.length; i++) {
      const epoch = epochsNeedingTimestamp[i];
      const timestamp = timeResults[i];
      if (timestamp) {
        const d = new Date(timestamp * 1000);
        const datePart = d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const timestampStr = `${datePart} ${hours}:${minutes}`;
        epochTimeMap.set(epoch, timestampStr);
        newTimestamps.push({ epoch, timestampStr });
      }
    }

    // Save to DB
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Save new timestamps
      for (const { epoch, timestampStr } of newTimestamps) {
        await client.query(
          `INSERT INTO epoch_timestamps (epoch, timestamp_str) VALUES ($1, $2) ON CONFLICT (epoch) DO NOTHING`,
          [epoch, timestampStr]
        );
      }

      // Save missing epoch rewards
      let savedCount = 0;
      for (let i = 0; i < missingEpochs.length; i++) {
        const epoch = missingEpochs[i];
        const result = voteRewardResults[i];

        if (result?.[0]?.amount) {
          let selfStakeReward = 0;
          if (selfStakeAddresses.length > 0 && Array.isArray(selfStakeResults[i])) {
            selfStakeReward = selfStakeResults[i]
              .filter((r: any) => r && r.amount)
              .reduce((sum: number, r: any) => sum + r.amount / 1e9, 0);
          }

          const voteReward = result[0].amount / 1e9;
          await client.query(
            `INSERT INTO epoch_rewards (vote_address, epoch, vote_reward, reward, commission, self_stake_reward, date, active_stake, post_balance)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (vote_address, epoch) DO NOTHING`,
            [
              voteAddress, epoch, voteReward, voteReward + selfStakeReward,
              result[0].commission || 10, selfStakeReward,
              epochTimeMap.get(epoch) || null,
              stakeHistoryMap.get(epoch) || 0,
              result[0].postBalance ? result[0].postBalance / 1e9 : null,
            ]
          );
          savedCount++;
        }
      }

      await client.query('COMMIT');
      console.log(`[resync] ${voteAddress}: filled ${savedCount} missing epochs`);
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

// DELETE /api/validators/:voteAddress - Remove validator from DB
router.delete('/:voteAddress', async (req, res) => {
  try {
    const { voteAddress } = req.params;

    // CASCADE will delete epoch_rewards too
    const result = await pool.query(
      'DELETE FROM validators WHERE vote_address = $1 RETURNING vote_address',
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

  // Fetch validator metadata from xen.network
  let validatorName: string | undefined;
  let validatorAvatar: string | undefined;
  try {
    const response = await fetch(`https://api.xen.network/v1/x1/validators?network=mainnet&votePubkey=${voteAddress}`);
    if (response.ok) {
      const data = await response.json() as any[];
      validatorName = data[0]?.name || undefined;
      validatorAvatar = data[0]?.iconUrl || undefined;
    }
  } catch {
    // Silently ignore metadata errors
  }

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
      } catch {
        // Silently ignore
      }
    }
  }

  // Fetch stake history from xen.network
  let stakeHistoryMap = new Map<number, number>();
  if (nodePubkey) {
    try {
      const historyResponse = await fetch(
        `https://api.xen.network/v1/x1/validators/${nodePubkey}/history?groupBy=epoch&network=mainnet`
      );
      if (historyResponse.ok) {
        const historyData = await historyResponse.json() as any[];
        historyData.forEach((item: any) => {
          if (item.epoch !== undefined && item.activatedStake !== undefined) {
            stakeHistoryMap.set(item.epoch, item.activatedStake / 1e9);
          }
        });
      }
    } catch {
      // Silently ignore
    }
  }

  // Fetch epoch metadata for timestamps
  let epochSlotMap = new Map<number, number>();
  try {
    const epochsMeta = await fetch('https://api.xen.network/v1/x1/epochs').then(r => r.json()) as any[];
    epochsMeta.forEach((e: any) => epochSlotMap.set(e.epoch, e.endSlot));
  } catch {
    // Silently ignore
  }

  // Load existing timestamps from DB
  const existingTimestamps = new Map<number, string>();
  try {
    const tsResult = await pool.query('SELECT epoch, timestamp_str FROM epoch_timestamps');
    tsResult.rows.forEach(r => existingTimestamps.set(r.epoch, r.timestamp_str));
  } catch {
    // Silently ignore
  }

  // Build batch RPC requests for epoch rewards
  const epochsToFetch = 400;
  const epochNumbers = Array.from({ length: epochsToFetch }, (_, i) => currentEpoch - i).filter(e => e >= 0);

  const batchRequests = epochNumbers.map(epoch => ({
    method: 'getInflationReward',
    params: [[voteAddress], { epoch }],
  }));

  let selfStakeBatchRequests: Array<{ method: string; params: any[] }> = [];
  if (selfStakeAddresses.length > 0) {
    selfStakeBatchRequests = epochNumbers.map(epoch => ({
      method: 'getInflationReward',
      params: [selfStakeAddresses, { epoch }],
    }));
  }

  // Timestamps for epochs we don't have yet
  const epochsNeedingTimestamp = epochNumbers.filter(
    epoch => !existingTimestamps.has(epoch) && epochSlotMap.has(epoch)
  );
  const timeRequests = epochsNeedingTimestamp.map(epoch => ({
    method: 'getBlockTime',
    params: [epochSlotMap.get(epoch)],
  }));

  const allRequests = [...batchRequests, ...selfStakeBatchRequests, ...timeRequests];
  console.log(`Fetching ${allRequests.length} RPC requests for ${voteAddress}...`);
  const batchResults = await x1Client.batchCall(allRequests);

  const validatorResults = batchResults.slice(0, epochNumbers.length);
  const selfStakeResults = batchResults.slice(epochNumbers.length, 2 * epochNumbers.length);
  const timeResults = batchResults.slice(2 * epochNumbers.length);

  // Process timestamps
  const epochTimeMap = new Map(existingTimestamps);
  const newTimestamps: Array<{ epoch: number; timestampStr: string }> = [];

  for (let i = 0; i < timeResults.length; i++) {
    const epoch = epochsNeedingTimestamp[i];
    const timestamp = timeResults[i];
    if (timestamp) {
      const d = new Date(timestamp * 1000);
      const datePart = d.toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const timestampStr = `${datePart} ${hours}:${minutes}`;
      epochTimeMap.set(epoch, timestampStr);
      newTimestamps.push({ epoch, timestampStr });
    }
  }

  // Save new timestamps to DB
  if (newTimestamps.length > 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { epoch, timestampStr } of newTimestamps) {
        await client.query(
          `INSERT INTO epoch_timestamps (epoch, timestamp_str)
           VALUES ($1, $2)
           ON CONFLICT (epoch) DO NOTHING`,
          [epoch, timestampStr]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error saving timestamps:', err);
    } finally {
      client.release();
    }
  }

  // Process epoch rewards
  const epochRewards: EpochReward[] = [];
  for (let i = 0; i < epochNumbers.length; i++) {
    const epoch = epochNumbers[i];
    const result = validatorResults[i];

    if (result?.[0]?.amount) {
      let selfStakeReward = 0;
      if (Array.isArray(selfStakeResults[i])) {
        selfStakeReward = selfStakeResults[i]
          .filter((r: any) => r && r.amount)
          .reduce((sum: number, r: any) => sum + r.amount / 1e9, 0);
      }

      const voteReward = result[0].amount / 1e9;
      epochRewards.push({
        epoch,
        voteReward,
        reward: voteReward + selfStakeReward,
        commission: result[0].commission || 10,
        selfStakeReward,
        date: epochTimeMap.get(epoch) || undefined,
        activeStake: stakeHistoryMap.get(epoch) || 0,
        postBalance: result[0].postBalance ? result[0].postBalance / 1e9 : undefined,
      });
    }
  }

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

    // Upsert validator
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
    for (const r of data.epochRewards) {
      await client.query(
        `INSERT INTO epoch_rewards (vote_address, epoch, vote_reward, reward, commission, self_stake_reward, date, active_stake, post_balance)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (vote_address, epoch) DO UPDATE SET
           vote_reward = $3,
           reward = $4,
           commission = $5,
           self_stake_reward = $6,
           date = COALESCE($7, epoch_rewards.date),
           active_stake = $8,
           post_balance = $9`,
        [
          data.voteAddress,
          r.epoch,
          r.voteReward,
          r.reward,
          r.commission,
          r.selfStakeReward || 0,
          r.date || null,
          r.activeStake || 0,
          r.postBalance ?? null,
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`Saved validator ${data.voteAddress} with ${data.epochRewards.length} epoch rewards`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Also save node_pubkey when we fetch validator data
export async function updateValidatorNodePubkey(voteAddress: string, nodePubkey: string): Promise<void> {
  await pool.query(
    'UPDATE validators SET node_pubkey = $1 WHERE vote_address = $2',
    [nodePubkey, voteAddress]
  );
}

export default router;
