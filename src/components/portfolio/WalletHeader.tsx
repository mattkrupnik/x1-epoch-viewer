import { Copy, Check, ExternalLink, Trash2, Vote, Landmark, Wallet } from "lucide-react";
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

const accountTypeConfig = {
  vote: { icon: Vote, bg: "bg-orange-500/10", text: "text-orange-500" },
  stake: { icon: Landmark, bg: "bg-violet-500/10", text: "text-violet-500" },
  wallet: { icon: Wallet, bg: "bg-primary/10", text: "text-primary" },
};

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
  const config = accountTypeConfig[accountType];
  const Icon = config.icon;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`h-10 w-10 rounded-xl ${config.bg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`h-5 w-5 ${config.text}`} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              to={`/portfolio/${address}`}
              className="font-mono text-sm sm:text-base font-semibold hover:underline truncate"
              onClick={(e) => e.stopPropagation()}
              title={address}
            >
              {truncateAddress(address)}
            </Link>
            <div
              onClick={(e) => {
                e.stopPropagation();
                onCopy();
              }}
              title="Copy address"
              className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 flex items-center justify-center rounded-md hover:bg-muted hover:text-primary cursor-pointer transition-colors"
            >
              {isCopied ? (
                <Check className="h-3 w-3 text-success" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </div>
            <a
              href={`https://explorer.x1.xyz/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="View on explorer"
              className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 flex items-center justify-center rounded-md hover:bg-muted hover:text-primary cursor-pointer transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <Badge variant={accountType} className="text-xs capitalize">
              {accountType}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {formatXNT(solBalance)} XNT
            </Badge>
            {tokenCount > 0 && (
              <Badge variant="outline" className="text-xs">
                {tokenCount} token{tokenCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>
      </div>
      <div
        role="button"
        className="h-8 w-8 rounded-lg bg-secondary/50 text-muted-foreground hover:bg-destructive/10 hover:text-destructive self-end sm:self-auto transition-colors flex items-center justify-center cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <Trash2 className="h-4 w-4" />
      </div>
    </div>
  );
};
