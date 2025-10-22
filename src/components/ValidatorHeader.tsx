import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardTitle, CardDescription } from "@/components/ui/card";
import { User, Copy, Check, X, Share } from "lucide-react";
import { formatAddress } from "@/lib/format";
import { toast } from "sonner";
interface ValidatorHeaderProps {
  name?: string;
  avatar?: string;
  voteAddress: string;
  status: 'active' | 'delinquent' | 'unknown';
  isCopied: boolean;
  onCopy: () => void;
  onRemove?: () => void;
  showRemoveButton?: boolean;
  compact?: boolean;
}

export const ValidatorHeader = ({
  name,
  avatar,
  voteAddress,
  status,
  isCopied,
  onCopy,
  onRemove,
  showRemoveButton = false,
  compact = false
}: ValidatorHeaderProps) => {
  const statusConfig = {
    active: { className: 'bg-green-600 hover:bg-green-700', icon: '✓' },
    delinquent: { className: 'bg-destructive hover:bg-destructive/90', icon: '⚠' },
    unknown: { className: 'bg-secondary hover:bg-secondary/80', icon: '?' }
  };

  const statusStyle = statusConfig[status];

  return (
    <div className="flex items-start sm:items-center justify-between w-full gap-2">
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        <Avatar className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0">
          <AvatarImage src={avatar} alt={name || voteAddress} />
          <AvatarFallback>
            <User className="h-4 w-4 sm:h-5 sm:w-5" />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-sm sm:text-base truncate">
              {name || 'Unknown Validator'}
            </CardTitle>
            <Badge className={`text-xs ${statusStyle.className} px-1.5 py-0`}>
              {statusStyle.icon}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
            <CardDescription className="font-mono text-xs truncate">
              {formatAddress(voteAddress, compact ? 6 : 12)}
            </CardDescription>
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
            <div
                onClick={(e) => {
                  e.stopPropagation();
                  const url = `${window.location.origin}/validator/${voteAddress}`;
                  navigator.clipboard.writeText(url);
                  toast.success("Validator link copied to clipboard");
                }}
                title="Share the link to the validator"
                className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 flex items-center justify-center rounded-md hover:bg-muted hover:text-primary cursor-pointer transition-colors"
            >
              <Share className="h-3 w-3" />
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {showRemoveButton && onRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <X className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};
