import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {formatXNT} from "@/lib/format.ts";

interface EpochReward {
  epoch: number;
  voteReward: number;
  reward: number;
  commission: number;
  selfStakeReward?: number;
  activeStake?: number;
  postBalance?: number;
}

interface EpochRewardsTableProps {
  voteAddress: string;
  epochRewards: EpochReward[];
}

export const EpochRewardsTable = ({ voteAddress, epochRewards }: EpochRewardsTableProps) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const totalPages = Math.ceil(epochRewards.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentEpochs = epochRewards.slice(startIndex, endIndex);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Epoch Rewards History</CardTitle>
        <CardDescription>
          Detailed breakdown of rewards from each epoch for {voteAddress.slice(0, 8)}...{voteAddress.slice(-8)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Epoch</TableHead>
                <TableHead>Activated Stake (XNT)</TableHead>
                <TableHead className="text-right">Self-Stake Reward (XNT)</TableHead>
                <TableHead className="text-right">Vote Reward (XNT)</TableHead>
                <TableHead className="text-right">Total Rewards (XNT)</TableHead>
                <TableHead className="text-right">Post Balance (XNT) <p className="text-xs text-muted-foreground font-normal">Applies to Vote account only</p></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentEpochs.map((epoch) => (
                <TableRow key={epoch.epoch}>
                  <TableCell className="font-medium">{epoch.epoch}</TableCell>
                  <TableCell className="font-medium">
                    {formatXNT(epoch.activeStake)}
                    <p className="text-xs text-muted-foreground">Comm.: {epoch.commission}%</p>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {epoch.selfStakeReward !== undefined && epoch.selfStakeReward !== null
                        ? formatXNT(epoch.selfStakeReward)
                        : '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatXNT(epoch.voteReward)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-success">
                    {formatXNT(epoch.reward)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-primary">
                    {epoch.postBalance !== undefined && epoch.postBalance !== null
                        ? formatXNT(epoch.postBalance)
                        : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(endIndex, epochRewards.length)} of {epochRewards.length} epochs
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
