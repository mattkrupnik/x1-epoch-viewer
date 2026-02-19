import { useState } from "react";
import { Coins, Copy, Check } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TokenBalance } from "@/lib/wallet-rpc";

interface WalletTokensProps {
  tokens: TokenBalance[];
  solBalance?: number;
  nativeLogo?: string;
  nativePrice?: number;
  nativeChange24h?: number;
}

const formatUsd = (value: number) =>
  value >= 0.01
    ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${value.toFixed(4)}`;

const formatPrice = (price: number) =>
  price >= 0.01
    ? `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
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

export const WalletTokens = ({ tokens, solBalance, nativeLogo, nativePrice, nativeChange24h }: WalletTokensProps) => {
  const [nativeLogoError, setNativeLogoError] = useState(false);

  const hasXNT = solBalance !== undefined && solBalance > 0;
  const hasTokens = tokens.length > 0 || hasXNT;
  const nativeValueUsd = nativePrice != null && solBalance ? solBalance * nativePrice : undefined;

  if (!hasTokens) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Coins className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No tokens found in this wallet</p>
      </div>
    );
  }

  return (
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
                <div className="flex flex-col items-end gap-0.5">
                  <span>{nativePrice != null ? formatPrice(nativePrice) : "—"}</span>
                  <Change24h value={nativeChange24h} />
                </div>
              </TableCell>
              <TableCell className="text-right font-medium pr-4">
                {solBalance!.toLocaleString(undefined, { maximumFractionDigits: 4 })}
              </TableCell>
              <TableCell className="text-right hidden md:table-cell pr-4 text-sm font-medium">
                {nativeValueUsd != null ? formatUsd(nativeValueUsd) : "—"}
              </TableCell>
              <TableCell></TableCell>
            </TableRow>
          )}
          {tokens.map((token) => (
            <TokenRow key={token.mint} token={token} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

const TokenRow = ({ token }: { token: TokenBalance }) => {
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
        <div className="flex flex-col items-end gap-0.5">
          <span>{token.price != null ? formatPrice(token.price) : "—"}</span>
          <Change24h value={token.change24h} />
        </div>
      </TableCell>
      <TableCell className="text-right font-medium pr-4">
        {token.uiAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
      </TableCell>
      <TableCell className="text-right hidden md:table-cell pr-4 text-sm font-medium">
        {token.valueUsd != null ? formatUsd(token.valueUsd) : "—"}
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
