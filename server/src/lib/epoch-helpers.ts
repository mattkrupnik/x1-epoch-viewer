import type { EpochReward, EpochRewardRow } from './types.js';

export function formatEpochTimestamp(unixTimestamp: number): string {
  const d = new Date(unixTimestamp * 1000);
  const datePart = d.toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${datePart} ${hours}:${minutes}`;
}

export function buildInflationRewardRequests(
  addresses: string[],
  epochs: number[]
): Array<{ method: string; params: any[] }> {
  return epochs.map(epoch => ({
    method: 'getInflationReward',
    params: [addresses, { epoch }],
  }));
}

export function buildBlockTimeRequests(
  epochs: number[],
  epochSlotMap: Map<number, number>
): Array<{ method: string; params: any[] }> {
  return epochs.map(epoch => ({
    method: 'getBlockTime',
    params: [epochSlotMap.get(epoch)],
  }));
}

export function processTimestampResults(
  timeResults: any[],
  epochsNeedingTimestamp: number[],
  existingTimestamps: Map<number, string>
): {
  epochTimeMap: Map<number, string>;
  newTimestamps: Array<{ epoch: number; timestampStr: string }>;
} {
  const epochTimeMap = new Map(existingTimestamps);
  const newTimestamps: Array<{ epoch: number; timestampStr: string }> = [];

  for (let i = 0; i < timeResults.length; i++) {
    const epoch = epochsNeedingTimestamp[i];
    const timestamp = timeResults[i];
    if (timestamp) {
      const timestampStr = formatEpochTimestamp(timestamp);
      epochTimeMap.set(epoch, timestampStr);
      newTimestamps.push({ epoch, timestampStr });
    }
  }

  return { epochTimeMap, newTimestamps };
}

export function calculateSelfStakeReward(selfStakeResult: any[]): number {
  if (!Array.isArray(selfStakeResult)) return 0;
  return selfStakeResult
    .filter((r: any) => r && r.amount)
    .reduce((sum: number, r: any) => sum + r.amount / 1e9, 0);
}

export function processEpochRewards(
  voteRewardResults: any[],
  selfStakeResults: any[],
  epochs: number[],
  epochTimeMap: Map<number, string>,
  stakeHistoryMap: Map<number, number>,
  hasSelfStake: boolean
): EpochRewardRow[] {
  const rows: EpochRewardRow[] = [];

  for (let i = 0; i < epochs.length; i++) {
    const epoch = epochs[i];
    const result = voteRewardResults[i];

    if (!result?.[0]?.amount) continue;

    const selfStakeReward = hasSelfStake
      ? calculateSelfStakeReward(selfStakeResults[i])
      : 0;

    const voteReward = result[0].amount / 1e9;

    rows.push({
      voteAddress: '', // filled by caller
      epoch,
      voteReward,
      reward: voteReward + selfStakeReward,
      commission: result[0].commission || 10,
      selfStakeReward,
      date: epochTimeMap.get(epoch) || null,
      activeStake: stakeHistoryMap.get(epoch) || 0,
      postBalance: result[0].postBalance ? result[0].postBalance / 1e9 : null,
    });
  }

  return rows;
}

export function processEpochRewardsForResponse(
  voteRewardResults: any[],
  selfStakeResults: any[],
  epochs: number[],
  epochTimeMap: Map<number, string>,
  stakeHistoryMap: Map<number, number>,
  hasSelfStake: boolean
): EpochReward[] {
  const rewards: EpochReward[] = [];

  for (let i = 0; i < epochs.length; i++) {
    const epoch = epochs[i];
    const result = voteRewardResults[i];

    if (!result?.[0]?.amount) continue;

    const selfStakeReward = hasSelfStake
      ? calculateSelfStakeReward(selfStakeResults[i])
      : 0;

    const voteReward = result[0].amount / 1e9;

    rewards.push({
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

  return rewards;
}
