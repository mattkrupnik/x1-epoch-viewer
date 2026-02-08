import pool from '../db/connection.js';
import { x1Client } from '../lib/x1-rpc.js';

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
  // Get all validators from DB
  const validatorsResult = await pool.query(
    'SELECT vote_address, self_stake_addresses, node_pubkey FROM validators'
  );

  const validators = validatorsResult.rows;
  if (validators.length === 0) {
    console.log('[epoch-monitor] No validators in DB, nothing to update');
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

  // Fetch epoch metadata for timestamp
  let epochEndSlot: number | undefined;
  try {
    const epochsMeta = await fetch('https://api.xen.network/v1/x1/epochs').then(r => r.json()) as any[];
    const epochMeta = epochsMeta.find((e: any) => e.epoch === newEpoch);
    if (epochMeta) epochEndSlot = epochMeta.endSlot;
  } catch {
    // Will try to get timestamp later
  }

  // Fetch timestamp for the new epoch
  let epochTimestamp: string | undefined;
  if (epochEndSlot) {
    try {
      const blockTime = await x1Client.getBlockTime(epochEndSlot);
      if (blockTime) {
        const d = new Date(blockTime * 1000);
        const datePart = d.toLocaleDateString('en-US', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        epochTimestamp = `${datePart} ${hours}:${minutes}`;

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
      try {
        const historyResponse = await fetch(
          `https://api.xen.network/v1/x1/validators/${v.node_pubkey}/history?groupBy=epoch&network=mainnet`
        );
        if (historyResponse.ok) {
          const historyData = await historyResponse.json() as any[];
          const epochData = historyData.find((item: any) => item.epoch === newEpoch);
          if (epochData?.activatedStake !== undefined) {
            stakeHistoryMap.set(v.vote_address, epochData.activatedStake / 1e9);
          }
        }
      } catch {
        // Silently ignore per-validator errors
      }
    })().then(() => { executing.splice(executing.indexOf(p), 1); });
    executing.push(p);
    if (executing.length >= STAKE_HISTORY_CONCURRENCY) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);

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

        await client.query(
          `UPDATE validators SET
            status = $1,
            activated_stake = $2,
            commission = $3,
            current_epoch = $4,
            updated_at = NOW()
           WHERE vote_address = $5`,
          [newStatus, newActivatedStake, account.commission, currentEpoch, v.vote_address]
        );
      }

      // Process vote reward
      if (voteResult?.[0]?.amount) {
        let selfStakeReward = 0;

        // Check if this validator had self-stake requests
        if (v.self_stake_addresses && v.self_stake_addresses.length > 0) {
          const ssResult = selfStakeResults[selfStakeIndex];
          selfStakeIndex++;
          if (Array.isArray(ssResult)) {
            selfStakeReward = ssResult
              .filter((r: any) => r && r.amount)
              .reduce((sum: number, r: any) => sum + r.amount / 1e9, 0);
          }
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
  const slotTimeSec = sample?.samplePeriodSecs / sample?.numSlots || 0.4;

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
      // Within 5 minutes: poll every 30 seconds
      nextCheckMs = POLLING_INTERVAL_MS;
      console.log(`[epoch-monitor] Near epoch boundary, polling every ${POLLING_INTERVAL_MS / 1000}s`);
    } else if (msUntilEpochEnd <= FAR_POLLING_THRESHOLD_MS) {
      // Within 10 minutes: poll every 2 minutes
      nextCheckMs = FAR_POLLING_INTERVAL_MS;
      console.log(`[epoch-monitor] Approaching epoch boundary, polling every ${FAR_POLLING_INTERVAL_MS / 1000}s`);
    } else {
      // Far from epoch end: wake up when we enter the 10-minute window
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
