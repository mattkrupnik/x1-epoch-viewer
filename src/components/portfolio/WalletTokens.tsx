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
}

export const WalletTokens = ({ tokens, solBalance }: WalletTokensProps) => {
  const hasXNT = solBalance !== undefined && solBalance > 0;
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
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Token</TableHead>
            <TableHead className="hidden sm:table-cell">Symbol</TableHead>
            <TableHead className="text-right pr-4">Balance</TableHead>
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
                {solBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
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
        {token.uiAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
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
