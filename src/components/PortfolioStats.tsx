import { Wallet, Coins, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatXNT } from "@/lib/format";

interface PortfolioStatsProps {
  walletsCount: number;
  totalXnt: number;
  totalTokens: number;
}

export const PortfolioStats = ({ walletsCount, totalXnt, totalTokens }: PortfolioStatsProps) => {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="border-2">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Wallets Tracked</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{walletsCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Active wallets</p>
        </CardContent>
      </Card>

      <Card className="border-2">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-success" />
            <CardTitle className="text-base">Total XNT</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold bg-gradient-to-r from-green-500 to-blue-500 bg-clip-text text-transparent">
            {formatXNT(totalXnt)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">XNT across all wallets</p>
        </CardContent>
      </Card>

      <Card className="border-2">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-accent" />
            <CardTitle className="text-base">Total Tokens</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{totalTokens}</p>
          <p className="text-xs text-muted-foreground mt-1">SPL tokens held</p>
        </CardContent>
      </Card>
    </div>
  );
};
