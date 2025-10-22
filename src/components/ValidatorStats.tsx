import { formatXNT } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CircleAlert, TrendingUp, TrendingDown } from "lucide-react";

interface ValidatorStatsProps {
  totalRewards: number;
  epochCount: number;
  averageReward: number;
  activatedStake: number;
  blocksProduced: number;
  skippedSlots: number;
  totalVoteRewards?: number;
  totalSelfStakeRewards?: number;
  selfStakeAmount?: number;
  lastEpochReward?: number;
  lastEpochVoteReward?: number;
  lastEpochSelfStakeReward?: number;
  previousEpochReward?: number;
}

export const ValidatorStats = ({
  totalRewards,
  epochCount,
  averageReward,
  activatedStake,
  blocksProduced,
  skippedSlots,
  totalVoteRewards,
  totalSelfStakeRewards,
  selfStakeAmount,
  lastEpochReward,
  lastEpochVoteReward,
  lastEpochSelfStakeReward,
  previousEpochReward
}: ValidatorStatsProps) => {
  const percentageChange = lastEpochReward && previousEpochReward && previousEpochReward > 0
    ? ((lastEpochReward - previousEpochReward) / previousEpochReward) * 100
    : null;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <TooltipProvider delayDuration={0}>
        <div className="space-y-1">
          <Tooltip>
              <p className="text-sm text-muted-foreground cursor-help gap-2 flex items-center">Total Rewards
                <TooltipTrigger asChild>
                  <CircleAlert className="h-[.8rem] w-[.8rem] text-muted-foreground"/>
                </TooltipTrigger></p>
            <TooltipContent>
              <div className="space-y-1 text-xs">
                <p className="font-semibold pt-2 mt-2">Total Breakdown</p>
                <p className="text-muted-foreground">Vote Reward: {formatXNT(totalVoteRewards || 0)} XNT</p>
                <p className="text-muted-foreground">Self-Stake Reward: {formatXNT(totalSelfStakeRewards || 0)} XNT</p>
                <p className="font-semibold pt-1 border-t text-muted-foreground">Total: {formatXNT(totalRewards)} XNT</p>
              </div>
            </TooltipContent>
          </Tooltip>
          <p className="text-2xl font-bold">{formatXNT(totalRewards)} XNT</p>
        </div>
      </TooltipProvider>
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Average Reward</p>
        <p className="text-2xl font-bold">{formatXNT(averageReward)} XNT</p>
        <p className="text-xs text-muted-foreground mt-1 font-normal">XNT per epoch ({epochCount} epochs)</p>
      </div>
      <TooltipProvider delayDuration={0}>
        <div className="space-y-1">
          <Tooltip>
            <p className="text-sm text-muted-foreground cursor-help gap-2 flex items-center">Last Epoch
              <TooltipTrigger asChild>
                <CircleAlert className="h-[.8rem] w-[.8rem] text-muted-foreground"/>
              </TooltipTrigger>
            </p>
            <TooltipContent>
              <div className="space-y-1 text-xs">
                <p className="font-semibold">Last Epoch</p>
                <p className="text-muted-foreground">Vote Reward: {formatXNT(lastEpochVoteReward || 0)} XNT</p>
                <p className="text-muted-foreground">Self-Stake
                  Reward: {formatXNT(lastEpochSelfStakeReward || 0)} XNT</p>
                <p className="font-semibold pt-1 border-t text-muted-foreground">Total: {formatXNT(lastEpochReward || 0)} XNT</p>
              </div>
            </TooltipContent>
          </Tooltip>
          <div className="space-y-1">
            <p className="text-2xl font-bold">{formatXNT(lastEpochReward || 0)} XNT</p>
            <div className="flex items-center gap-1 mt-1">
              <p className="text-xs text-muted-foreground font-normal">Earned change</p>
              {percentageChange !== 0 && (
                  <span className={`flex items-center text-xs font-medium ${
                      percentageChange > 0 ? 'text-green-500' : 'text-red-500'
                  }`}>
                              {percentageChange > 0 ? (
                                  <TrendingUp className="h-3 w-3 mr-0.5"/>
                              ) : (
                                  <TrendingDown className="h-3 w-3 mr-0.5"/>
                              )}
                    {Math.abs(percentageChange).toFixed(2)}%
                            </span>
              )}
            </div>
          </div>
        </div>
      </TooltipProvider>
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Activated Stake</p>
        <p className="text-2xl font-bold">{formatXNT(activatedStake)} XNT</p>
        {selfStakeAmount !== undefined && selfStakeAmount > 0 && (
            <p className="text-xs text-muted-foreground mt-1 font-normal">Self-Stake
              Amount: {formatXNT(selfStakeAmount)} XNT</p>
        )}
      </div>
      {/*<div className="space-y-1">*/}
      {/*  <p className="text-sm text-muted-foreground">Current Epoch Performance</p>*/}
      {/*  <div className="flex gap-4">*/}
      {/*    <div>*/}
      {/*      <p className="text-lg font-bold text-success">{blocksProduced}</p>*/}
      {/*      <p className="text-xs text-muted-foreground">Blocks Produced</p>*/}
      {/*    </div>*/}
      {/*    <div>*/}
      {/*      <p className="text-lg font-bold text-destructive">{skippedSlots}</p>*/}
      {/*      <p className="text-xs text-muted-foreground">Skipped Slots</p>*/}
      {/*    </div>*/}
      {/*  </div>*/}
      {/*</div>*/}
    </div>
  );
};
