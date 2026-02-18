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
  totalValueUsd?: number;
  price?: number;
  decimals: number;
}

interface AggregatedTokensTableProps {
  wallets: WalletBalance[];
}

const formatUsd = (value: number) =>
  value >= 0.01
    ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${value.toFixed(4)}`;

export const AggregatedTokensTable = ({ wallets }: AggregatedTokensTableProps) => {
  const [isOpen, setIsOpen] = useState(true);
  const [nativeLogoError, setNativeLogoError] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(AGGREGATED_ACCORDION_KEY);
    if (saved !== null) setIsOpen(saved === "true");
  }, []);

  useEffect(() => {
    localStorage.setItem(AGGREGATED_ACCORDION_KEY, String(isOpen));
  }, [isOpen]);

  const totalXNT = wallets.reduce((sum, w) => sum + w.solBalance, 0);
  const nativeLogo = wallets.find(w => w.nativeLogo)?.nativeLogo;
  const nativePrice = wallets.find(w => w.nativePrice != null)?.nativePrice;
  const totalXNTValueUsd = nativePrice != null ? totalXNT * nativePrice : undefined;

  const tokenMap = new Map<string, AggregatedToken>();
  for (const wallet of wallets) {
    for (const token of wallet.tokens) {
      const existing = tokenMap.get(token.mint);
      if (existing) {
        existing.totalAmount += token.uiAmount;
        if (token.valueUsd != null) existing.totalValueUsd = (existing.totalValueUsd ?? 0) + token.valueUsd;
      } else {
        tokenMap.set(token.mint, {
          mint: token.mint,
          symbol: token.symbol || "???",
          name: token.name || "Unknown Token",
          logoURI: token.logoURI,
          totalAmount: token.uiAmount,
          totalValueUsd: token.valueUsd,
          price: token.price,
          decimals: token.decimals,
        });
      }
    }
  }

  const aggregatedTokens = Array.from(tokenMap.values())
    .sort((a, b) => {
      const aHasPrice = a.price != null;
      const bHasPrice = b.price != null;
      if (aHasPrice !== bHasPrice) return aHasPrice ? -1 : 1;
      return aHasPrice
        ? (b.totalValueUsd ?? 0) - (a.totalValueUsd ?? 0)
        : b.totalAmount - a.totalAmount;
    });
  const hasXNT = totalXNT > 0;
  const hasTokens = aggregatedTokens.length > 0 || hasXNT;

  if (!hasTokens) return null;

  const tokenCount = aggregatedTokens.length + (hasXNT ? 1 : 0);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/50 transition-colors"
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
        <div className="px-6 pb-6 pt-3">
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Token</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Price</TableHead>
                  <TableHead className="text-right pr-4">Amount</TableHead>
                  <TableHead className="text-right hidden md:table-cell pr-4">USD Value</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hasXNT && (
                  <TableRow className="hover:bg-muted/50">
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        {nativeLogo && !nativeLogoError ? (
                          <img
                            src={nativeLogo}
                            alt="XNT"
                            className="h-7 w-7 rounded-full object-cover ring-1 ring-border"
                            onError={() => setNativeLogoError(true)}
                          />
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center ring-1 ring-border">
                            <Coins className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-sm">X1 Native Token</div>
                          <div className="text-xs text-muted-foreground">XNT</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right hidden md:table-cell text-sm text-muted-foreground">
                      {nativePrice != null ? formatUsd(nativePrice) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium pr-4">
                      {totalXNT.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </TableCell>
                    <TableCell className="text-right hidden md:table-cell pr-4 text-sm font-medium">
                      {totalXNTValueUsd != null ? formatUsd(totalXNTValueUsd) : "—"}
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
  const [imageError, setImageError] = useState(false);

  const copyMint = async () => {
    try {
      await navigator.clipboard.writeText(token.mint);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable (e.g. HTTP context)
    }
  };

  return (
    <TableRow className="hover:bg-muted/50">
      <TableCell className="pl-4">
        <div className="flex items-center gap-3">
          {token.logoURI && !imageError ? (
            <img
              src={token.logoURI}
              alt={token.symbol}
              className="h-7 w-7 rounded-full object-cover ring-1 ring-border"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center ring-1 ring-border">
              <Coins className="h-3 w-3 text-muted-foreground" />
            </div>
          )}
          <div>
            <div className="font-medium text-sm">{token.name}</div>
            <div className="text-xs text-muted-foreground">{token.symbol}</div>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right hidden md:table-cell text-sm text-muted-foreground">
        {token.price != null ? formatUsd(token.price) : "—"}
      </TableCell>
      <TableCell className="text-right font-medium pr-4">
        {token.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
      </TableCell>
      <TableCell className="text-right hidden md:table-cell pr-4 text-sm font-medium">
        {token.totalValueUsd != null ? formatUsd(token.totalValueUsd) : "—"}
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
