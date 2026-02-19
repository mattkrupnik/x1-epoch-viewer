import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Wallet, ArrowLeft, RefreshCw, Copy, Check } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SettingsDialog } from "@/components/shared/SettingsDialog";
import { Navigation } from "@/components/shared/Navigation";
import { WalletTokens } from "@/components/portfolio/WalletTokens";
import { getMultipleWalletBalances, WalletBalance } from "@/lib/wallet-rpc";
import { formatXNT } from "@/lib/format";
import { toast } from "sonner";
import { Footer } from "@/components/shared/Footer";

const Address = () => {
  const { address } = useParams<{ address: string }>();
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchWallet = async (isRefresh = false) => {
    if (!address) return;
    
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [balance] = await getMultipleWalletBalances([address]);
      setWallet(balance);
    } catch (error) {
      console.error("Failed to fetch wallet:", error);
      toast.error("Failed to fetch wallet data");
    }

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchWallet();
  }, [address]);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-card/70 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-gradient-primary flex items-center justify-center flex-shrink-0">
                <Wallet className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold truncate">Wallet Details</h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                  {address ? truncateAddress(address) : "Loading..."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link to="/portfolio">
                <Button variant="outline" size="icon" className="h-9 w-9 sm:h-10 sm:w-10" title="Back to Portfolio">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <Navigation showNavigation={true} />
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 sm:h-10 sm:w-10"
                onClick={() => fetchWallet(true)}
                disabled={refreshing || loading}
                title="Refresh wallet"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              <SettingsDialog page="portfolio" />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 sm:py-8 space-y-6">
        {loading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <RefreshCw className="h-8 w-8 mx-auto text-muted-foreground animate-spin mb-4" />
              <p className="text-muted-foreground">Loading wallet data...</p>
            </CardContent>
          </Card>
        ) : wallet ? (
          <>
            {/* Wallet Info */}
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="font-mono text-sm sm:text-base truncate">{address}</div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0"
                      onClick={copyAddress}
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <div className="flex items-center gap-4 text-sm flex-wrap">
                    <Badge variant={wallet.accountType} className="text-xs capitalize">
                      {wallet.accountType}
                    </Badge>
                    <div>
                      <span className="text-muted-foreground">Balance: </span>
                      <span className="font-medium">{formatXNT(wallet.solBalance)} XNT</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Tokens: </span>
                      <span className="font-medium">{wallet.tokens.length}</span>
                    </div>
                    {(() => {
                      const tokenVal = wallet.tokens.reduce((s, t) => s + (t.valueUsd ?? 0), 0);
                      const xntVal = wallet.nativePrice != null ? wallet.solBalance * wallet.nativePrice : 0;
                      const total = tokenVal + xntVal;
                      if (!isFinite(total) || total <= 0) return null;
                      return (
                        <div>
                          <span className="text-muted-foreground">Total Value: </span>
                          <span className="font-semibold">
                            ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Token Holdings */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold">Token Holdings</h3>
              </CardHeader>
              <CardContent>
                <WalletTokens
                  tokens={wallet.tokens}
                  solBalance={wallet.solBalance}
                  nativeLogo={wallet.nativeLogo}
                  nativePrice={wallet.nativePrice}
                  nativeChange24h={wallet.nativeChange24h}
                  showHideControls={false}
                />
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Wallet not found</h3>
              <p className="text-muted-foreground">
                Could not load data for this address
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Address;
