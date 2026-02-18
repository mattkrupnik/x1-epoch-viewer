import { useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { WalletHeader } from "./WalletHeader";
import { WalletTokens } from "./WalletTokens";
import { WalletBalance } from "@/lib/wallet-rpc";
import { toast } from "sonner";

interface WalletCardProps {
  wallet: WalletBalance;
  onRemove: () => void;
  useAccordion?: boolean;
  accordionValue?: string;
}

export const WalletCard = ({
  wallet,
  onRemove,
  useAccordion = false,
  accordionValue
}: WalletCardProps) => {
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const shareWallet = () => {
    const url = `${window.location.origin}/portfolio/${wallet.address}`;
    navigator.clipboard.writeText(url);
    toast.success("Wallet link copied to clipboard");
  };

  const headerProps = {
    address: wallet.address,
    solBalance: wallet.solBalance,
    tokenCount: wallet.tokens.length,
    accountType: wallet.accountType,
    isCopied: copied,
    onCopy: copyAddress,
    onShare: shareWallet,
    onRemove
  };

  if (useAccordion && accordionValue) {
    return (
      <AccordionItem value={accordionValue} className="border-none">
        <Card>
          <CardHeader className="p-0">
            <AccordionTrigger className="hover:no-underline py-0 p-6 items-start md:items-center">
              <div className="w-full pr-4 text-left">
                <WalletHeader {...headerProps} />
              </div>
            </AccordionTrigger>
          </CardHeader>
          <AccordionContent>
            <CardContent className="pt-3">
              <WalletTokens tokens={wallet.tokens} solBalance={wallet.solBalance} nativeLogo={wallet.nativeLogo} nativePrice={wallet.nativePrice} />
            </CardContent>
          </AccordionContent>
        </Card>
      </AccordionItem>
    );
  }

  return (
    <Card>
      <CardHeader>
        <WalletHeader {...headerProps} />
      </CardHeader>
      <CardContent>
        <WalletTokens tokens={wallet.tokens} solBalance={wallet.solBalance} nativeLogo={wallet.nativeLogo} nativePrice={wallet.nativePrice} />
      </CardContent>
    </Card>
  );
};
