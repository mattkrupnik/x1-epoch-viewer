import { RewardsChart } from "./RewardsChart";
import { EpochRewardsTable } from "./EpochRewardsTable";
import { EpochReward } from "@/types/validator";

interface ValidatorDetailsProps {
  voteAddress: string;
  epochRewards: EpochReward[];
  validatorName?: string;
  validatorAvatar?: string;
}

export const ValidatorDetails = ({
  voteAddress,
  epochRewards,
  validatorName,
  validatorAvatar
}: ValidatorDetailsProps) => {
  return (
    <div className="space-y-6">
      <RewardsChart 
        epochRewards={epochRewards} 
        validatorName={validatorName}
        validatorAvatar={validatorAvatar}
      />
      <EpochRewardsTable 
        voteAddress={voteAddress} 
        epochRewards={epochRewards} 
      />
    </div>
  );
};
