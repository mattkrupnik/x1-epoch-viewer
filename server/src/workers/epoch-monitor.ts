import pool from '../db/connection.js';
import { x1Client } from '../lib/x1-rpc.js';
import { fetchEpochSlotMap, fetchStakeHistoryForEpoch, fetchValidatorMetadata } from '../lib/xen-api.js';
import { formatEpochTimestamp, calculateSelfStakeReward } from '../lib/epoch-helpers.js';

const FALLBACK_INTERVAL_MS = 5 * 60_000; // 5 min fallback if calculation fails
const POLLING_THRESHOLD_MS = 5 * 60_000; // Start fast polling within 5 min of epoch end
const POLLING_INTERVAL_MS = 30_000; // Poll every 30s near epoch boundary
const FAR_POLLING_THRESHOLD_MS = 10 * 60_000; // Start moderate polling within 10 min
const FAR_POLLING_INTERVAL_MS = 2 * 60_000; // Poll every 2 min when 5-10 min away
const MAX_REWARD_RETRIES = 4;
const REWARD_RETRY_DELAY_MS = 15_000; // 15s between retries
const STAKE_HISTORY_CONCURRENCY = 10;

async function getLastProcessedEpoch(): Promise<number | null> {
  const result = await pool.query(
    "SELECT value FROM sync_state WHERE key = 'last_processed_epoch'"
  );
  if (result.rows.length === 0) return null;
  return parseInt(result.rows[0].value, 10);
}

async function setLastProcessedEpoch(epoch: number): Promise<void> {
  await pool.query(
    `INSERT INTO sync_state (key, value, updated_at)
     VALUES ('last_processed_epoch', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [String(epoch)]
  );
}

async function updateValidatorsForNewEpoch(newEpoch: number, currentEpoch: number): Promise<void> {
  // Get all tracked validators from DB
  const validatorsResult = await pool.query(
    'SELECT vote_address, self_stake_addresses, node_pubkey FROM validators WHERE is_tracked = true'
  );

  const validators = validatorsResult.rows;
  if (validators.length === 0) {
    console.log('[epoch-monitor] No tracked validators in DB, nothing to update');
    return;
  }

  console.log(`[epoch-monitor] Updating ${validators.length} validators for epoch ${newEpoch}`);

  // Fetch vote accounts for status/stake updates
  let voteAccounts: { current: any[]; delinquent: any[] };
  try {
    voteAccounts = await x1Client.getVoteAccounts();
  } catch (error) {
    console.error('[epoch-monitor] Failed to fetch vote accounts:', error);
    return;
  }
  const allAccounts = [...voteAccounts.current, ...voteAccounts.delinquent];

  for (const v of validators) {
    const account = allAccounts.find((acc: any) => acc.votePubkey === v.vote_address);
    if (!account?.nodePubkey) continue;

    try {
      v.self_stake_addresses = await x1Client.getStakeAccountsForVote(v.vote_address, account.nodePubkey);
      v.node_pubkey = account.nodePubkey;
    } catch (error) {
      console.error(`[epoch-monitor] Failed to refresh self_stake_addresses for ${v.vote_address}:`, (error as Error).message);
    }
  }

  // Fetch epoch metadata for timestamp
  let epochEndSlot: number | undefined;
  const epochSlotMap = await fetchEpochSlotMap();
  epochEndSlot = epochSlotMap.get(newEpoch);

  // Fetch timestamp for the new epoch
  let epochTimestamp: string | undefined;
  if (epochEndSlot) {
    try {
      const blockTime = await x1Client.getBlockTime(epochEndSlot);
      if (blockTime) {
        epochTimestamp = formatEpochTimestamp(blockTime);

        // Save timestamp to DB
        await pool.query(
          `INSERT INTO epoch_timestamps (epoch, timestamp_str)
           VALUES ($1, $2)
           ON CONFLICT (epoch) DO NOTHING`,
          [newEpoch, epochTimestamp]
        );
      }
    } catch (error) {
      console.error(`[epoch-monitor] Failed to fetch block time for epoch ${newEpoch}:`, error);
    }
  }

  // Build batch requests for all validators
  const voteRewardRequests = validators.map(v => ({
    method: 'getInflationReward',
    params: [[v.vote_address], { epoch: newEpoch }],
  }));

  // Self-stake reward requests (only for validators that have self-stake addresses)
  const selfStakeRequests: Array<{ method: string; params: any[]; validatorIndex: number }> = [];
  validators.forEach((v, index) => {
    if (v.self_stake_addresses && v.self_stake_addresses.length > 0) {
      selfStakeRequests.push({
        method: 'getInflationReward',
        params: [v.self_stake_addresses, { epoch: newEpoch }],
        validatorIndex: index,
      });
    }
  });

  // Execute batch calls with retry logic for reward availability
  const allBatchRequests = [
    ...voteRewardRequests,
    ...selfStakeRequests.map(r => ({ method: r.method, params: r.params })),
  ];

  let batchResults: any[] = [];
  let voteRewardResults: any[] = [];
  let selfStakeResults: any[] = [];

  for (let attempt = 0; attempt <= MAX_REWARD_RETRIES; attempt++) {
    try {
      batchResults = await x1Client.batchCall(allBatchRequests);
    } catch (error) {
      console.error('[epoch-monitor] Batch RPC call failed:', error);
      return;
    }

    voteRewardResults = batchResults.slice(0, validators.length);
    selfStakeResults = batchResults.slice(validators.length);

    const hasAnyReward = voteRewardResults.some(r => r?.[0]?.amount);
    if (hasAnyReward || attempt >= MAX_REWARD_RETRIES) {
      if (!hasAnyReward) {
        console.warn(`[epoch-monitor] No rewards available after ${MAX_REWARD_RETRIES} retries for epoch ${newEpoch}`);
      }
      break;
    }

    console.log(`[epoch-monitor] No rewards available yet for epoch ${newEpoch}, retry ${attempt + 1}/${MAX_REWARD_RETRIES} in ${REWARD_RETRY_DELAY_MS / 1000}s...`);
    await new Promise(resolve => setTimeout(resolve, REWARD_RETRY_DELAY_MS));
  }

  // Fetch stake history for all validators in parallel (with concurrency limit)
  const stakeHistoryMap = new Map<string, number>();
  const validatorsWithPubkey = validators.filter(v => v.node_pubkey);

  const executing: Promise<void>[] = [];
  for (const v of validatorsWithPubkey) {
    const p = (async () => {
      const stake = await fetchStakeHistoryForEpoch(v.node_pubkey, newEpoch);
      if (stake !== undefined) {
        stakeHistoryMap.set(v.vote_address, stake);
      }
    })().then(() => {
      const idx = executing.indexOf(p);
      if (idx !== -1) executing.splice(idx, 1);
    });
    executing.push(p);
    if (executing.length >= STAKE_HISTORY_CONCURRENCY) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);

  // Fetch fresh self_stake_amount for all validators (batched, before transaction)
  const selfStakeAmountMap = new Map<string, number>();
  const validatorsWithStake = validators.filter(v => v.self_stake_addresses?.length > 0);

  if (validatorsWithStake.length > 0) {
    const addrToVote = new Map<string, string>();
    const allStakeAddresses: string[] = [];
    for (const v of validatorsWithStake) {
      for (const addr of v.self_stake_addresses) {
        addrToVote.set(addr, v.vote_address);
        allStakeAddresses.push(addr);
      }
    }

    try {
      const CHUNK_SIZE = 100;
      const allResults: any[] = [];
      for (let i = 0; i < allStakeAddresses.length; i += CHUNK_SIZE) {
        const chunk = allStakeAddresses.slice(i, i + CHUNK_SIZE);
        const info = await x1Client.getMultipleAccounts(chunk);
        allResults.push(...info.value);
      }

      allResults.forEach((acc: any, idx: number) => {
        if (acc === null) return;
        const voteAddr = addrToVote.get(allStakeAddresses[idx])!;
        selfStakeAmountMap.set(voteAddr, (selfStakeAmountMap.get(voteAddr) || 0) + (acc.lamports || 0));
      });
      for (const [voteAddr, lamports] of selfStakeAmountMap) {
        selfStakeAmountMap.set(voteAddr, lamports / 1e9);
      }
    } catch (stakeErr) {
      console.error('[epoch-monitor] Failed to refresh self_stake amounts:', (stakeErr as Error).message);
    }
  }

  const validatorMetadataMap = new Map<string, { name?: string; avatar?: string }>();
  for (const v of validators) {
    validatorMetadataMap.set(v.vote_address, await fetchValidatorMetadata(v.vote_address));
  }

  // Process results and save to DB
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let selfStakeIndex = 0;

    for (let i = 0; i < validators.length; i++) {
      const v = validators[i];
      const voteResult = voteRewardResults[i];
      const account = allAccounts.find((acc: any) => acc.votePubkey === v.vote_address);

      // Update validator status and stake
      if (account) {
        const newActivatedStake = account.activatedStake ? account.activatedStake / 1e9 : 0;
        const newStatus = voteAccounts.current.some((a: any) => a.votePubkey === v.vote_address)
          ? 'active'
          : 'delinquent';
        const metadata = validatorMetadataMap.get(v.vote_address) || {};

        if (selfStakeAmountMap.has(v.vote_address)) {
          await client.query(
            `UPDATE validators SET
              name = COALESCE($1, name),
              avatar = COALESCE($2, avatar),
              status = $3,
              activated_stake = $4,
              commission = $5,
              current_epoch = $6,
              self_stake_amount = $7,
              self_stake_addresses = $8,
              node_pubkey = COALESCE($9, node_pubkey),
              updated_at = NOW()
             WHERE vote_address = $10`,
            [
              metadata.name || null,
              metadata.avatar || null,
              newStatus,
              newActivatedStake,
              account.commission,
              currentEpoch,
              selfStakeAmountMap.get(v.vote_address)!,
              v.self_stake_addresses || [],
              v.node_pubkey || null,
              v.vote_address,
            ]
          );
        } else {
          await client.query(
            `UPDATE validators SET
              name = COALESCE($1, name),
              avatar = COALESCE($2, avatar),
              status = $3,
              activated_stake = $4,
              commission = $5,
              current_epoch = $6,
              self_stake_addresses = $7,
              node_pubkey = COALESCE($8, node_pubkey),
              updated_at = NOW()
             WHERE vote_address = $9`,
            [
              metadata.name || null,
              metadata.avatar || null,
              newStatus,
              newActivatedStake,
              account.commission,
              currentEpoch,
              v.self_stake_addresses || [],
              v.node_pubkey || null,
              v.vote_address,
            ]
          );
        }
      }

      // Process vote reward
      if (voteResult?.[0]?.amount) {
        let selfStakeReward = 0;

        if (v.self_stake_addresses && v.self_stake_addresses.length > 0) {
          const ssResult = selfStakeResults[selfStakeIndex];
          selfStakeIndex++;
          selfStakeReward = calculateSelfStakeReward(ssResult);
        }

        const voteReward = voteResult[0].amount / 1e9;
        const activeStake = stakeHistoryMap.get(v.vote_address) || 0;

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
            v.vote_address,
            newEpoch,
            voteReward,
            voteReward + selfStakeReward,
            voteResult[0].commission || 10,
            selfStakeReward,
            epochTimestamp || null,
            activeStake,
            voteResult[0].postBalance ? voteResult[0].postBalance / 1e9 : null,
          ]
        );
      } else {
        // No reward but still skip self-stake index if applicable
        if (v.self_stake_addresses && v.self_stake_addresses.length > 0) {
          selfStakeIndex++;
        }
      }
    }

    await client.query('COMMIT');
    console.log(`[epoch-monitor] Successfully updated ${validators.length} validators for epoch ${newEpoch}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[epoch-monitor] Failed to save epoch updates:', error);
  } finally {
    client.release();
  }
}

async function checkEpoch(): Promise<void> {
  try {
    const epochInfo = await x1Client.getEpochInfo();
    const currentEpoch = epochInfo.epoch;
    const lastProcessed = await getLastProcessedEpoch();

    if (lastProcessed === null) {
      console.log(`[epoch-monitor] First run, recording current epoch: ${currentEpoch}`);
      await setLastProcessedEpoch(currentEpoch);
      return;
    }

    if (currentEpoch > lastProcessed) {
      for (let epoch = lastProcessed + 1; epoch <= currentEpoch; epoch++) {
        const rewardEpoch = epoch - 1;
        console.log(`[epoch-monitor] New epoch detected: ${epoch}, fetching rewards for epoch ${rewardEpoch}`);
        await updateValidatorsForNewEpoch(rewardEpoch, epoch);
      }
      await setLastProcessedEpoch(currentEpoch);
    }
  } catch (error) {
    console.error('[epoch-monitor] Error checking epoch:', error);
  }
}

async function getTimeUntilNextEpoch(): Promise<number> {
  const epochInfo = await x1Client.getEpochInfo();
  const perfSamples = await x1Client.getRecentPerformanceSamples(1);
  const sample = perfSamples[0];
  const slotTimeSec = (sample?.samplePeriodSecs && sample?.numSlots)
    ? sample.samplePeriodSecs / sample.numSlots
    : 0.4;

  const slotsRemaining = epochInfo.slotsInEpoch - epochInfo.slotIndex;
  const msRemaining = slotsRemaining * slotTimeSec * 1000;
  const progress = ((epochInfo.slotIndex / epochInfo.slotsInEpoch) * 100).toFixed(1);

  console.log(`[epoch-monitor] Epoch ${epochInfo.epoch} progress: ${progress}%, slotTime: ${slotTimeSec.toFixed(3)}s, ~${Math.round(msRemaining / 60_000)} min remaining`);

  return msRemaining;
}

async function scheduleNextCheck(): Promise<void> {
  await checkEpoch();

  let nextCheckMs = FALLBACK_INTERVAL_MS;
  try {
    const msUntilEpochEnd = await getTimeUntilNextEpoch();

    if (msUntilEpochEnd <= POLLING_THRESHOLD_MS) {
      nextCheckMs = POLLING_INTERVAL_MS;
      console.log(`[epoch-monitor] Near epoch boundary, polling every ${POLLING_INTERVAL_MS / 1000}s`);
    } else if (msUntilEpochEnd <= FAR_POLLING_THRESHOLD_MS) {
      nextCheckMs = FAR_POLLING_INTERVAL_MS;
      console.log(`[epoch-monitor] Approaching epoch boundary, polling every ${FAR_POLLING_INTERVAL_MS / 1000}s`);
    } else {
      nextCheckMs = msUntilEpochEnd - FAR_POLLING_THRESHOLD_MS;
    }
  } catch (error) {
    console.error('[epoch-monitor] Failed to calculate next check time, using fallback:', error);
  }

  setTimeout(scheduleNextCheck, nextCheckMs);
}

export function startEpochMonitor(): void {
  scheduleNextCheck();
}
