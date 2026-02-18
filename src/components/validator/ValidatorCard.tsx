import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ValidatorHeader } from "./ValidatorHeader";
import { ValidatorStats } from "./ValidatorStats";
import { ValidatorDetails } from "./ValidatorDetails";
import { EpochReward } from "@/types/validator";

interface ValidatorCardProps {
  voteAddress: string;
  name?: string;
  avatar?: string;
  status: 'active' | 'delinquent' | 'unknown';
  totalRewards: number;
  epochCount: number;
  averageReward: number;
  activatedStake: number;
  commission: number;
  blocksProduced: number;
  skippedSlots: number;
  epochRewards: EpochReward[];
  isCopied: boolean;
  onCopy: () => void;
  onRemove: () => void;
  showRemoveButton: boolean;
  useAccordion?: boolean;
  accordionValue?: string;
  selfStakeAmount?: number;
}

export const ValidatorCard = ({
  voteAddress,
  name,
  avatar,
  status,
  totalRewards,
  epochCount,
  averageReward,
  activatedStake,
  blocksProduced,
  skippedSlots,
  epochRewards,
  isCopied,
  onCopy,
  onRemove,
  showRemoveButton,
  useAccordion = false,
  accordionValue,
  selfStakeAmount
}: ValidatorCardProps) => {
  const totalVoteRewards = epochRewards.reduce((sum, r) => sum + r.voteReward, 0);
  const totalSelfStakeRewards = epochRewards.reduce((sum, r) => sum + (r.selfStakeReward || 0), 0);
  
  const lastEpoch = epochRewards.length > 0 ? epochRewards[0] : undefined;
  const lastEpochReward = lastEpoch ? lastEpoch.voteReward + (lastEpoch.selfStakeReward || 0) : undefined;
  const lastEpochVoteReward = lastEpoch?.voteReward;
  const lastEpochSelfStakeReward = lastEpoch?.selfStakeReward;
  
  const previousEpoch = epochRewards.length > 1 ? epochRewards[1] : undefined;
  const previousEpochReward = previousEpoch ? previousEpoch.voteReward + (previousEpoch.selfStakeReward || 0) : undefined;
  
  const statsProps = {
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
  };

  const headerProps = {
    name,
    avatar,
    voteAddress,
    status,
    isCopied,
    onCopy,
    onRemove,
    showRemoveButton
  };

  if (useAccordion && accordionValue) {
    return (
      <AccordionItem value={accordionValue} className="border-none">
        <Card>
          <CardHeader className="p-0">
            <AccordionTrigger className="hover:no-underline py-0 p-6 items-start md:items-center">
              <div className="w-full pr-4 text-left">
                <ValidatorHeader {...headerProps} />
                <div className="mt-3">
                  <ValidatorStats {...statsProps} />
                </div>
              </div>
            </AccordionTrigger>
          </CardHeader>
          <AccordionContent>
            <CardContent className="pt-3">
              <ValidatorDetails
                voteAddress={voteAddress}
                epochRewards={epochRewards}
                validatorName={name}
                validatorAvatar={avatar}
              />
            </CardContent>
          </AccordionContent>
        </Card>
      </AccordionItem>
    );
  }

  return (
    <Card>
      <CardHeader>
        <ValidatorHeader {...headerProps} compact />
      </CardHeader>
      <CardContent className="space-y-6">
        <ValidatorStats {...statsProps} />
        <ValidatorDetails
          voteAddress={voteAddress}
          epochRewards={epochRewards}
          validatorName={name}
          validatorAvatar={avatar}
        />
      </CardContent>
    </Card>
  );
};
