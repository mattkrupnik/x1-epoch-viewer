import pg from 'pg';
import pool from '../db/connection.js';
import type { EpochRewardRow } from './types.js';

export async function getExistingTimestamps(
  epochs: number[]
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (epochs.length === 0) return map;

  const result = await pool.query(
    'SELECT epoch, timestamp_str FROM epoch_timestamps WHERE epoch = ANY($1)',
    [epochs]
  );
  result.rows.forEach((r: any) => map.set(r.epoch, r.timestamp_str));
  return map;
}

export async function getAllTimestamps(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const result = await pool.query('SELECT epoch, timestamp_str FROM epoch_timestamps');
  result.rows.forEach((r: any) => map.set(r.epoch, r.timestamp_str));
  return map;
}

export async function saveTimestampsBatch(
  client: pg.PoolClient,
  timestamps: Array<{ epoch: number; timestampStr: string }>
): Promise<void> {
  if (timestamps.length === 0) return;

  const CHUNK_SIZE = 100;
  for (let i = 0; i < timestamps.length; i += CHUNK_SIZE) {
    const chunk = timestamps.slice(i, i + CHUNK_SIZE);
    const values: any[] = [];
    const placeholders: string[] = [];

    chunk.forEach((t, idx) => {
      const offset = idx * 2;
      placeholders.push(`($${offset + 1}, $${offset + 2})`);
      values.push(t.epoch, t.timestampStr);
    });

    await client.query(
      `INSERT INTO epoch_timestamps (epoch, timestamp_str)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (epoch) DO NOTHING`,
      values
    );
  }
}

export async function saveEpochRewardsBatch(
  client: pg.PoolClient,
  voteAddress: string,
  rewards: EpochRewardRow[],
  upsert = false
): Promise<void> {
  if (rewards.length === 0) return;

  const CHUNK_SIZE = 100;
  for (let i = 0; i < rewards.length; i += CHUNK_SIZE) {
    const chunk = rewards.slice(i, i + CHUNK_SIZE);
    const values: any[] = [];
    const placeholders: string[] = [];

    chunk.forEach((r, idx) => {
      const offset = idx * 9;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`
      );
      values.push(
        voteAddress, r.epoch, r.voteReward, r.reward,
        r.commission, r.selfStakeReward, r.date, r.activeStake, r.postBalance
      );
    });

    const conflictClause = upsert
      ? `ON CONFLICT (vote_address, epoch) DO UPDATE SET
           vote_reward = EXCLUDED.vote_reward,
           reward = EXCLUDED.reward,
           commission = EXCLUDED.commission,
           self_stake_reward = EXCLUDED.self_stake_reward,
           date = COALESCE(EXCLUDED.date, epoch_rewards.date),
           active_stake = EXCLUDED.active_stake,
           post_balance = EXCLUDED.post_balance`
      : 'ON CONFLICT (vote_address, epoch) DO NOTHING';

    await client.query(
      `INSERT INTO epoch_rewards (vote_address, epoch, vote_reward, reward, commission, self_stake_reward, date, active_stake, post_balance)
       VALUES ${placeholders.join(', ')}
       ${conflictClause}`,
      values
    );
  }
}
