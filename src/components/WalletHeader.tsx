import { Copy, Check, ExternalLink, Trash2, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatXNT } from "@/lib/format";
import { Link } from "react-router-dom";
import { WalletAccountType } from "@/lib/wallet-rpc";

interface WalletHeaderProps {
  address: string;
  solBalance: number;
  tokenCount: number;
  accountType: WalletAccountType;
  isCopied: boolean;
  onCopy: () => void;
  onRemove: () => void;
}

export const WalletHeader = ({
  address,
  solBalance,
  tokenCount,
  accountType,
  isCopied,
  onCopy,
  onRemove
}: WalletHeaderProps) => {
  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-6)}`;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-gradient-primary flex items-center justify-center flex-shrink-0">
          <Coins className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <Link
              to={`/portfolio/${address}`}
              className="font-mono text-base font-semibold hover:underline"
              onClick={(e) => e.stopPropagation()}
              title="Open wallet details"
            >
              {truncateAddress(address)}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onCopy();
              }}
            >
              {isCopied ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
            <a
              href={`https://explorer.x1.xyz/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={accountType} className="text-xs capitalize">
              {accountType}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {formatXNT(solBalance)} XNT
            </Badge>
            {tokenCount > 0 && (
              <Badge variant="outline" className="text-xs">
                {tokenCount} token{tokenCount !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground self-end sm:self-auto"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
};
