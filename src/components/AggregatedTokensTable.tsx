import { useState, useEffect } from "react";
import { Coins, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  const [isOpen, setIsOpen] = useState<string[]>([]);

  // Load state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(AGGREGATED_ACCORDION_KEY);
    if (saved !== null) {
      setIsOpen(saved === "true" ? ["aggregated"] : []);
    } else {
      setIsOpen(["aggregated"]);
    }
  }, []);

  // Save state to localStorage
  useEffect(() => {
    localStorage.setItem(AGGREGATED_ACCORDION_KEY, String(isOpen.includes("aggregated")));
  }, [isOpen]);

  // Calculate total XNT balance from all wallets
  const totalXNT = wallets.reduce((sum, wallet) => sum + wallet.solBalance, 0);

  // Aggregate tokens from all wallets
  const aggregatedTokens: AggregatedToken[] = [];
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

  // Convert map to array and sort by totalAmount
  for (const token of tokenMap.values()) {
    aggregatedTokens.push(token);
  }
  aggregatedTokens.sort((a, b) => b.totalAmount - a.totalAmount);

  const hasXNT = totalXNT > 0;
  const hasTokens = aggregatedTokens.length > 0 || hasXNT;

  if (!hasTokens) {
    return null;
  }

  return (
    <Accordion type="multiple" value={isOpen} onValueChange={setIsOpen}>
      <AccordionItem value="aggregated" className="border-none">
        <Card>
          <CardHeader className="p-0">
            <AccordionTrigger className="hover:no-underline px-6 py-4">
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5" />
                <span>All Tokens (Combined)</span>
                <span className="text-sm text-muted-foreground font-normal">
                  — from {wallets.length} wallet{wallets.length !== 1 ? 's' : ''}
                </span>
              </CardTitle>
            </AccordionTrigger>
          </CardHeader>
          <AccordionContent>
            <CardContent className="pt-0">
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Token</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead className="text-right">Total Balance</TableHead>
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
                          {totalXNT.toLocaleString(undefined, { maximumFractionDigits: 6 })}
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
            </CardContent>
          </AccordionContent>
        </Card>
      </AccordionItem>
    </Accordion>
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
        {token.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
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