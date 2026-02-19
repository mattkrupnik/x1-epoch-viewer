import { useState } from "react";
import { Coins, Copy, Check, EyeOff, Eye } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TokenBalance } from "@/lib/wallet-rpc";
import { useHiddenTokens } from "@/lib/hidden-tokens";

interface WalletTokensProps {
  tokens: TokenBalance[];
  solBalance?: number;
  nativeLogo?: string;
  nativePrice?: number;
  nativeChange24h?: number;
  showHideControls?: boolean;
}

const formatUsd = (value: number) =>
  value >= 0.01
    ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${value.toFixed(4)}`;

const formatPrice = (price: number) =>
  price >= 0.01
    ? `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
    : `$${price.toPrecision(4)}`;

const Change24h = ({ value }: { value?: number }) => {
  if (value == null) return null;
  const isPositive = value >= 0;
  return (
    <span className={`text-xs font-medium ${isPositive ? "text-green-500" : "text-red-500"}`}>
      {isPositive ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
};

export const WalletTokens = ({ tokens, solBalance, nativeLogo, nativePrice, nativeChange24h, showHideControls = true }: WalletTokensProps) => {
  const [nativeLogoError, setNativeLogoError] = useState(false);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const { hidden, hide, unhide } = useHiddenTokens();

  const hasXNT = solBalance !== undefined && solBalance > 0;
  const nativeValueUsd = nativePrice != null && solBalance ? solBalance * nativePrice : undefined;

  const visibleTokens = tokens.filter(t => !hidden.has(t.mint));
  const hiddenTokens = tokens.filter(t => hidden.has(t.mint));
  const hiddenValue = hiddenTokens.reduce((s, t) => s + (t.valueUsd ?? 0), 0);

  const hasTokens = tokens.length > 0 || hasXNT;

  if (!hasTokens) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Coins className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No tokens found in this wallet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
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
                  {nativePrice != null ? formatPrice(nativePrice) : "—"}
                </TableCell>
                <TableCell className="text-right font-medium pr-4">
                  {solBalance!.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </TableCell>
                <TableCell className="text-right hidden md:table-cell text-sm font-medium">
                  <div className="flex flex-col items-end gap-0.5">
                    <span>{nativeValueUsd != null ? formatUsd(nativeValueUsd) : "—"}</span>
                    <Change24h value={nativeChange24h} />
                  </div>
                </TableCell>
                <TableCell />
              </TableRow>
            )}
            {visibleTokens.map((token) => (
              <TokenRow key={token.mint} token={token} onHide={showHideControls ? () => hide(token.mint) : undefined} />
            ))}
          </TableBody>
        </Table>
      </div>

    </div>
  );
};

const TokenRow = ({
  token,
  onHide,
  onUnhide,
}: {
  token: TokenBalance;
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
        {token.price != null ? formatPrice(token.price) : "—"}
      </TableCell>
      <TableCell className="text-right font-medium pr-4">
        {token.uiAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
      </TableCell>
      <TableCell className="text-right hidden md:table-cell text-sm font-medium">
        <div className="flex flex-col items-end gap-0.5">
          <span>{token.valueUsd != null ? formatUsd(token.valueUsd) : "—"}</span>
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
