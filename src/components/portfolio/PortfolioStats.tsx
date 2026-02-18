import { Wallet, Coins, Layers, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatXNT } from "@/lib/format";

interface PortfolioStatsProps {
  walletsCount: number;
  totalXnt: number;
  totalTokens: number;
  totalValueUsd?: number;
}

export const PortfolioStats = ({ walletsCount, totalXnt, totalTokens, totalValueUsd }: PortfolioStatsProps) => {
  const formatUsd = (value: number) =>
    `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Coins className="h-4 w-4 text-emerald-500" />
            </div>
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

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base">Wallets Tracked</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{walletsCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Active wallets</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <Layers className="h-4 w-4 text-accent" />
            </div>
            <CardTitle className="text-base">Total Tokens</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{totalTokens}</p>
          <p className="text-xs text-muted-foreground mt-1">SPL tokens held</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-yellow-500" />
            </div>
            <CardTitle className="text-base">Portfolio Value</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">
            {totalValueUsd != null ? formatUsd(totalValueUsd) : "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Total USD value</p>
        </CardContent>
      </Card>
    </div>
  );
};
