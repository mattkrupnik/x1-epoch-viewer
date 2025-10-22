import { useState } from "react";
import { Coins, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <div className="text-center py-6 text-muted-foreground">
        <p>No tokens found in this wallet</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Token</TableHead>
            <TableHead>Symbol</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {hasXNT && (
            <TableRow>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">X1</span>
                  </div>
                  <span className="font-medium">X1 Native Token</span>
                </div>
              </TableCell>
              <TableCell className="font-medium">XNT</TableCell>
              <TableCell className="text-right font-mono font-medium">
                {solBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })}
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
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          {token.logoURI ? (
            <img
              src={token.logoURI}
              alt={token.symbol}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
              <Coins className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <span className="font-medium">{token.name}</span>
        </div>
      </TableCell>
      <TableCell className="font-medium">{token.symbol}</TableCell>
      <TableCell className="text-right font-mono font-medium">
        {token.uiAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={copyMint}
          title="Copy token mint"
        >
          {copied ? (
            <Check className="h-3 w-3 text-success" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </TableCell>
    </TableRow>
  );
};
