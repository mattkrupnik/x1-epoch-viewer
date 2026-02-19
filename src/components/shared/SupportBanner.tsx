import { useState } from "react";
import { Heart, Copy, Check } from "lucide-react";
import authorAvatar from "@/assets/author-avatar.jpg";

const WALLET = "DrLEY6BaUPWPbZ8qu3mR7wDGtgZzuR4hSJRNmSPq3Zpu";

export const SupportBanner = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(WALLET);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", "copy_support_wallet_address", {
          event_category: "engagement",
          event_label: "banner__copy_support_wallet_address",
          value: WALLET,
        });
      }
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="container mx-auto px-4 mt-4 sm:mt-6">
      <div className="relative overflow-hidden bg-gradient-to-r from-primary/20 via-blue-500/15 to-violet-500/20 border border-primary/20 rounded-xl px-4 py-2 sm:py-2.5 flex items-center justify-center gap-2 sm:gap-4 flex-wrap">
      {/* subtle shimmer line at top */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <div className="flex items-center gap-2 text-sm">
          <Heart className="h-3 w-3 text-red-500 fill-red-500 flex-shrink-0" />
          <span className="text-foreground/90 font-medium text-xs sm:text-sm">
            Enjoying the dashboard? Support development with XNT
          </span>
        </div>

        <button
          onClick={handleCopy}
          title={WALLET}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono
            bg-background/60 hover:bg-background/90 border border-primary/30 hover:border-primary/60
            text-muted-foreground hover:text-foreground transition-all duration-200 shadow-sm"
        >
          <span className="hidden md:inline">{WALLET.slice(0, 10)}…{WALLET.slice(-6)}</span>
          <span className="md:hidden">DrLEY6…q3Zpu</span>
          {copied ? (
            <Check className="h-3 w-3 text-green-500 flex-shrink-0" />
          ) : (
            <Copy className="h-3 w-3 flex-shrink-0" />
          )}
        </button>

        {copied && (
          <span className="text-xs text-green-500 font-medium animate-in fade-in">Copied!</span>
        )}
      </div>
    </div>
  );
};
