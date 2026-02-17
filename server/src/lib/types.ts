export interface ValidatorData {
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

export interface EpochReward {
  epoch: number;
  voteReward: number;
  reward: number;
  commission: number;
  selfStakeReward?: number;
  date?: string;
  activeStake?: number;
  postBalance?: number;
}

export interface EpochRewardRow {
  voteAddress: string;
  epoch: number;
  voteReward: number;
  reward: number;
  commission: number;
  selfStakeReward: number;
  date: string | null;
  activeStake: number;
  postBalance: number | null;
}
