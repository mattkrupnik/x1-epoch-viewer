import authorAvatar from "@/assets/author-avatar.jpg";

export const Footer = () => {
  return (
    <footer className="border-t bg-card mt-auto">
      <div className="container mx-auto px-4 py-6 flex  text-xs sm:text-sm justify-center flex-wrap gap-4 lg:justify-between">
        <div className="flex items-center justify-center gap-2 text-muted-foreground flex-wrap"><a
            href="https://x.com/JustDeMatt"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-foreground transition-colors"
        >
          <img
              src={authorAvatar}
              alt="JustDeMatt"
              className="h-6 w-6 rounded-full"
          />
        </a> Support my work with XNT:
          <span onCopy={() => {
            if (typeof window !== "undefined" && (window as any).gtag) {
              (window as any).gtag("event", "copy_support_wallet_address", {
                event_category: "engagement",
                event_label: "footer__copy_support_wallet_address",
                value: "DrLEY6BaUPWPbZ8qu3mR7wDGtgZzuR4hSJRNmSPq3Zpu",
              });
            }
          }}
                className="cursor-text select-text underline decoration-dotted"
                title="Copy or select to copy">DrLEY6BaUPWPbZ8qu3mR7wDGtgZzuR4hSJRNmSPq3Zpu</span>
        </div>
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <p>Made with <span className="text-red-500">❤</span> in Poland</p>
        </div>
      </div>
    </footer>
  );
};
