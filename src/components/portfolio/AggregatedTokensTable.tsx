import { useState, useEffect } from "react";
import { Coins, Copy, Check, ChevronDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WalletBalance } from "@/lib/wallet-rpc";

const AGGREGATED_ACCORDION_KEY = "aggregatedTokensOpen";

interface AggregatedToken {
  mint: string;
  symbol: string;
  name: string;
  logoURI?: string;
  totalAmount: number;
  decimals: number;
}

interface AggregatedTokensTableProps {
  wallets: WalletBalance[];
}

export const AggregatedTokensTable = ({ wallets }: AggregatedTokensTableProps) => {
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(AGGREGATED_ACCORDION_KEY);
    if (saved !== null) {
      setIsOpen(saved === "true");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(AGGREGATED_ACCORDION_KEY, String(isOpen));
  }, [isOpen]);

  const totalXNT = wallets.reduce((sum, wallet) => sum + wallet.solBalance, 0);

  const tokenMap = new Map<string, AggregatedToken>();
  for (const wallet of wallets) {
    for (const token of wallet.tokens) {
      const existing = tokenMap.get(token.mint);
      if (existing) {
        existing.totalAmount += token.uiAmount;
      } else {
        tokenMap.set(token.mint, {
          mint: token.mint,
          symbol: token.symbol || "???",
          name: token.name || "Unknown Token",
          logoURI: token.logoURI,
          totalAmount: token.uiAmount,
          decimals: token.decimals,
        });
      }
    }
  }

  const aggregatedTokens = Array.from(tokenMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  const hasXNT = totalXNT > 0;
  const hasTokens = aggregatedTokens.length > 0 || hasXNT;

  if (!hasTokens) return null;

  const tokenCount = aggregatedTokens.length + (hasXNT ? 1 : 0);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Coins className="h-4 w-4 text-primary" />
          </div>
          <div className="text-left">
            <span className="font-semibold text-sm">All Tokens</span>
            <span className="text-xs text-muted-foreground ml-2">
              {tokenCount} token{tokenCount !== 1 ? "s" : ""} across {wallets.length} wallet{wallets.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="px-5 pb-5 pt-3">
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Token</TableHead>
                  <TableHead className="hidden sm:table-cell">Symbol</TableHead>
                  <TableHead className="text-right pr-4">Total Balance</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hasXNT && (
                  <TableRow className="hover:bg-muted/50">
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-sm">
                          <span className="text-[9px] font-bold text-white">X1</span>
                        </div>
                        <div>
                          <span className="font-medium text-sm">X1 Native Token</span>
                          <span className="sm:hidden text-xs text-muted-foreground ml-2">XNT</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell font-medium text-muted-foreground text-sm">XNT</TableCell>
                    <TableCell className="text-right font-medium pr-4">
                      {totalXNT.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                )}
                {aggregatedTokens.map((token) => (
                  <AggregatedTokenRow key={token.mint} token={token} />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
};

const AggregatedTokenRow = ({ token }: { token: AggregatedToken }) => {
  const [copied, setCopied] = useState(false);

  const copyMint = async () => {
    await navigator.clipboard.writeText(token.mint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TableRow className="hover:bg-muted/50">
      <TableCell className="pl-4">
        <div className="flex items-center gap-3">
          {token.logoURI ? (
            <img
              src={token.logoURI}
              alt={token.symbol}
              className="h-7 w-7 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center ring-1 ring-border">
              <Coins className="h-3 w-3 text-muted-foreground" />
            </div>
          )}
          <div>
            <span className="font-medium text-sm">{token.name}</span>
            <span className="sm:hidden text-xs text-muted-foreground ml-2">{token.symbol}</span>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell font-medium text-muted-foreground text-sm">{token.symbol}</TableCell>
      <TableCell className="text-right font-medium pr-4">
        {token.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
      </TableCell>
      <TableCell>
        <div
          onClick={copyMint}
          title="Copy token mint"
          className="h-4 w-4 sm:h-5 sm:w-5 flex items-center justify-center rounded-md hover:bg-muted hover:text-primary cursor-pointer transition-colors"
        >
          {copied ? (
            <Check className="h-3 w-3 text-success" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </div>
      </TableCell>
    </TableRow>
  );
};
