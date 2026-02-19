import { useState } from "react";
import { Eye, EyeOff, Coins, Copy, Check, ChevronDown } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { WalletBalance } from "@/lib/wallet-rpc";
import { useHiddenTokens } from "@/lib/hidden-tokens";

const formatUsd = (value: number) =>
  value >= 0.01
    ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${value.toFixed(4)}`;

interface HiddenToken {
  mint: string;
  name: string;
  symbol: string;
  logoURI?: string;
  totalAmount: number;
  totalValueUsd?: number;
  price?: number;
}

interface HiddenTokensSectionProps {
  wallets: WalletBalance[];
}

export const HiddenTokensSection = ({ wallets }: HiddenTokensSectionProps) => {
  const { hidden, unhide } = useHiddenTokens();
  const [isOpen, setIsOpen] = useState(false);

  const tokenMap = new Map<string, HiddenToken>();
  for (const wallet of wallets) {
    for (const token of wallet.tokens) {
      if (!hidden.has(token.mint)) continue;
      const existing = tokenMap.get(token.mint);
      if (existing) {
        existing.totalAmount += token.uiAmount;
        if (token.valueUsd != null) existing.totalValueUsd = (existing.totalValueUsd ?? 0) + token.valueUsd;
      } else {
        tokenMap.set(token.mint, {
          mint: token.mint,
          name: token.name || "Unknown Token",
          symbol: token.symbol || "???",
          logoURI: token.logoURI,
          totalAmount: token.uiAmount,
          totalValueUsd: token.valueUsd,
          price: token.price,
        });
      }
    }
  }

  const hiddenTokens = Array.from(tokenMap.values());
  if (hiddenTokens.length === 0) return null;

  const hiddenValue = hiddenTokens.reduce((s, t) => s + (t.totalValueUsd ?? 0), 0);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        onClick={() => setIsOpen(v => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-left">
            <span className="font-semibold text-sm">Hidden Tokens</span>
            <span className="text-xs text-muted-foreground ml-2">
              {hiddenTokens.length} token{hiddenTokens.length !== 1 ? "s" : ""}
              {hiddenValue > 0 && ` · ${formatUsd(hiddenValue)}`}
            </span>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && <div className="px-6 pb-6">
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
              {hiddenTokens.map(token => (
                <HiddenTokenRow key={token.mint} token={token} onUnhide={() => unhide(token.mint)} />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>}
    </div>
  );
};

const HiddenTokenRow = ({ token, onUnhide }: { token: HiddenToken; onUnhide: () => void }) => {
  const [imageError, setImageError] = useState(false);
  const [copied, setCopied] = useState(false);

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
              className="h-7 w-7 rounded-full object-cover ring-1 ring-border opacity-60"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center ring-1 ring-border opacity-60">
              <Coins className="h-3 w-3 text-muted-foreground" />
            </div>
          )}
          <div>
            <div className="font-medium text-sm text-muted-foreground">{token.name}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-muted-foreground">{token.symbol}</span>
              <div
                onClick={copyMint}
                title="Copy token mint"
                className="h-3.5 w-3.5 flex items-center justify-center rounded hover:bg-muted cursor-pointer transition-colors"
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
        {token.price != null ? `$${token.price.toPrecision(4)}` : "—"}
      </TableCell>
      <TableCell className="text-right font-medium pr-4 text-muted-foreground">
        {token.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
      </TableCell>
      <TableCell className="text-right hidden md:table-cell pr-4 text-sm text-muted-foreground">
        {token.totalValueUsd != null ? formatUsd(token.totalValueUsd) : "—"}
      </TableCell>
      <TableCell>
        <div
          onClick={onUnhide}
          title="Show token"
          className="h-5 w-5 flex items-center justify-center rounded-md hover:bg-muted hover:text-primary cursor-pointer transition-colors"
        >
          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </TableCell>
    </TableRow>
  );
};
