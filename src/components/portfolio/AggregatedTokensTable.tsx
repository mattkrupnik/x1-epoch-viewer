import { useState, useEffect } from "react";
import { Coins, Copy, Check, ChevronDown, EyeOff, Eye } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WalletBalance } from "@/lib/wallet-rpc";
import { useHiddenTokens } from "@/lib/hidden-tokens";

const AGGREGATED_ACCORDION_KEY = "aggregatedTokensOpen";

interface AggregatedToken {
  mint: string;
  symbol: string;
  name: string;
  logoURI?: string;
  totalAmount: number;
  totalValueUsd?: number;
  price?: number;
  change24h?: number;
  decimals: number;
}

interface AggregatedTokensTableProps {
  wallets: WalletBalance[];
}

const formatUsd = (value: number) =>
  value >= 0.01
    ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${value.toFixed(4)}`;

const Change24h = ({ value }: { value?: number }) => {
  if (value == null) return null;
  const isPositive = value >= 0;
  return (
    <span className={`text-xs font-medium ${isPositive ? "text-green-500" : "text-red-500"}`}>
      {isPositive ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
};

export const AggregatedTokensTable = ({ wallets }: AggregatedTokensTableProps) => {
  const [isOpen, setIsOpen] = useState(true);
  const [nativeLogoError, setNativeLogoError] = useState(false);
  const { hidden, hide } = useHiddenTokens();

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
  const nativeChange24h = wallets.find(w => w.nativeChange24h != null)?.nativeChange24h;
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
          change24h: token.change24h,
          decimals: token.decimals,
        });
      }
    }
  }

  const allTokens = Array.from(tokenMap.values()).sort((a, b) => {
    const aHasPrice = a.price != null;
    const bHasPrice = b.price != null;
    if (aHasPrice !== bHasPrice) return aHasPrice ? -1 : 1;
    return aHasPrice
      ? (b.totalValueUsd ?? 0) - (a.totalValueUsd ?? 0)
      : b.totalAmount - a.totalAmount;
  });

  const visibleTokens = allTokens.filter(t => !hidden.has(t.mint));

  const hasXNT = totalXNT > 0;
  const hasTokens = allTokens.length > 0 || hasXNT;
  if (!hasTokens) return null;

  const visibleCount = visibleTokens.length + (hasXNT ? 1 : 0);

  return (
    <div>
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
                {visibleCount} token{visibleCount !== 1 ? "s" : ""} across {wallets.length} wallet{wallets.length !== 1 ? "s" : ""}
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
                    <TableHead className="text-right hidden md:table-cell">USD Value</TableHead>
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
                        <span>{nativePrice != null ? formatUsd(nativePrice) : "—"}</span>
                      </TableCell>
                      <TableCell className="text-right font-medium pr-4">
                        {totalXNT.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </TableCell>
                      <TableCell className="text-right hidden md:table-cell text-sm font-medium">
                        <div className="flex flex-col items-end gap-0.5">
                          <span>{totalXNTValueUsd != null ? formatUsd(totalXNTValueUsd) : "—"}</span>
                          <Change24h value={nativeChange24h} />
                        </div>
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                  {visibleTokens.map((token) => (
                    <AggregatedTokenRow key={token.mint} token={token} onHide={() => hide(token.mint)} />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

const AggregatedTokenRow = ({
  token,
  onHide,
  onUnhide,
}: {
  token: AggregatedToken;
  onHide?: () => void;
  onUnhide?: () => void;
}) => {
  const [copied, setCopied] = useState(false);
  const [imageError, setImageError] = useState(false);

  const copyMint = async () => {
    try {
      await navigator.clipboard.writeText(token.mint);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
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
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-muted-foreground">{token.symbol}</span>
              <div
                onClick={copyMint}
                title="Copy token mint"
                className="h-3.5 w-3.5 flex items-center justify-center rounded hover:bg-muted hover:text-primary cursor-pointer transition-colors"
              >
                {copied ? (
                  <Check className="h-2.5 w-2.5 text-green-500" />
                ) : (
                  <Copy className="h-2.5 w-2.5 text-muted-foreground" />
                )}
              </div>
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right hidden md:table-cell text-sm text-muted-foreground">
        {token.price != null ? formatUsd(token.price) : "—"}
      </TableCell>
      <TableCell className="text-right font-medium pr-4">
        {token.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
      </TableCell>
      <TableCell className="text-right hidden md:table-cell text-sm font-medium">
        <div className="flex flex-col items-end gap-0.5">
          <span>{token.totalValueUsd != null ? formatUsd(token.totalValueUsd) : "—"}</span>
          <Change24h value={token.change24h} />
        </div>
      </TableCell>
      <TableCell>
        {onHide && (
          <div
            onClick={onHide}
            title="Hide token"
            className="h-5 w-5 flex items-center justify-center rounded-md hover:bg-muted hover:text-primary cursor-pointer transition-colors"
          >
            <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        )}
        {onUnhide && (
          <div
            onClick={onUnhide}
            title="Show token"
            className="h-5 w-5 flex items-center justify-center rounded-md hover:bg-muted hover:text-primary cursor-pointer transition-colors"
          >
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        )}
      </TableCell>
    </TableRow>
  );
};
