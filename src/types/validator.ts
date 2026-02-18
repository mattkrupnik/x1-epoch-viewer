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
