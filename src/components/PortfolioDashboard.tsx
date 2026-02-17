import { useState, useEffect, useRef, useCallback } from "react";
import { Wallet, Plus, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { SettingsDialog } from "./SettingsDialog";
import { Navigation } from "./Navigation";
import { WalletCard } from "./WalletCard";
import { PortfolioStats } from "./PortfolioStats";
import { AggregatedTokensTable } from "./AggregatedTokensTable";
import { getMultipleWalletBalances, WalletBalance, WalletAccountType } from "@/lib/wallet-rpc";
import { Footer } from "./Footer";

const STORAGE_KEY = "portfolioWallets";
const ACCORDION_STATE_KEY = "portfolioAccordionState";

interface SavedWallet {
  address: string;
  accountType: WalletAccountType;
}

export const PortfolioDashboard = () => {
  const [walletAddress, setWalletAddress] = useState("");
  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [savedWallets, setSavedWallets] = useState<SavedWallet[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [openAccordions, setOpenAccordions] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | WalletAccountType>("all");

  // Load saved addresses and accordion state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    let loaded: SavedWallet[] = [];
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (typeof parsed[0] === "string") {
            // Migrate old format: string[] → SavedWallet[]
            loaded = parsed.map((addr: string) => ({ address: addr, accountType: "wallet" as WalletAccountType }));
          } else {
            loaded = parsed;
          }
          setSavedWallets(loaded);
        }
      } catch (error) {
        console.error("Failed to parse saved wallets:", error);
      }
    }

    const savedAccordionState = localStorage.getItem(ACCORDION_STATE_KEY);
    if (savedAccordionState) {
      try {
        setOpenAccordions(JSON.parse(savedAccordionState));
      } catch (error) {
        console.error("Error loading accordion state:", error);
      }
    }

    // Auto-expand if only one address
    if (loaded.length === 1) {
      setOpenAccordions([loaded[0].address]);
    }

    setInitialLoading(false);
  }, []);

  // Save wallets to localStorage
  useEffect(() => {
    if (!initialLoading) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedWallets));
    }
  }, [savedWallets, initialLoading]);

  // Save accordion state to localStorage
  useEffect(() => {
    if (openAccordions.length > 0 || wallets.length > 0) {
      localStorage.setItem(ACCORDION_STATE_KEY, JSON.stringify(openAccordions));
    }
  }, [openAccordions, wallets.length]);

  // Stable address list key to avoid re-fetching on accountType updates
  const addressListKey = savedWallets.map(w => w.address).join(",");
  const savedWalletsRef = useRef(savedWallets);
  savedWalletsRef.current = savedWallets;

  // Fetch balances when addresses change
  useEffect(() => {
    if (addressListKey && !initialLoading) {
      refreshWallets();
    } else if (!addressListKey) {
      setWallets([]);
    }
  }, [addressListKey, initialLoading]);

  const refreshWallets = useCallback(async () => {
    const current = savedWalletsRef.current;
    if (current.length === 0) return;

    setRefreshing(true);
    try {
      const addresses = current.map(w => w.address);
      const balances = await getMultipleWalletBalances(addresses);
      setWallets(balances);
      // Update saved wallets with detected account types (won't re-trigger fetch)
      setSavedWallets(prev => {
        const updated = prev.map((sw, i) => ({
          ...sw,
          accountType: balances[i]?.accountType ?? sw.accountType,
        }));
        // Only update if types actually changed
        const changed = updated.some((u, i) => u.accountType !== prev[i].accountType);
        return changed ? updated : prev;
      });
    } catch (error) {
      console.error("Failed to refresh wallets:", error);
      toast.error("Failed to refresh wallet balances");
    }
    setRefreshing(false);
  }, []);

  const addWallet = async () => {
    const address = walletAddress.trim();

    if (!address) {
      toast.error("Please enter a wallet address");
      return;
    }

    // Basic validation - Solana addresses are 32-44 characters
    if (address.length < 32 || address.length > 44) {
      toast.error("Invalid wallet address format");
      return;
    }

    if (savedWallets.some(w => w.address === address)) {
      toast.error("Wallet already added");
      return;
    }

    setLoading(true);
    try {
      const [balance] = await getMultipleWalletBalances([address]);
      setSavedWallets(prev => [...prev, { address, accountType: balance.accountType }]);
      setWallets(prev => [...prev, balance]);
      setWalletAddress("");
      // Auto-expand newly added wallet
      setOpenAccordions(prev => [...prev, address]);
      toast.success("Wallet added successfully");
    } catch (error) {
      console.error("Failed to add wallet:", error);
      toast.error("Failed to fetch wallet data");
    }
    setLoading(false);
  };

  const removeWallet = (address: string) => {
    setSavedWallets(prev => prev.filter(w => w.address !== address));
    setWallets(prev => prev.filter(w => w.address !== address));
    setOpenAccordions(prev => prev.filter(a => a !== address));
    toast.success("Wallet removed");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) {
      addWallet();
    }
  };

  const filteredWallets = activeTab === "all"
    ? wallets
    : wallets.filter(w => w.accountType === activeTab);

  const tabCounts = {
    all: wallets.length,
    vote: wallets.filter(w => w.accountType === "vote").length,
    stake: wallets.filter(w => w.accountType === "stake").length,
    wallet: wallets.filter(w => w.accountType === "wallet").length,
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-gradient-primary flex items-center justify-center flex-shrink-0">
                <Wallet className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold truncate">Portfolio Tracker</h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                  Track your wallet holdings
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Navigation showNavigation={true} />
              {wallets.length > 0 && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 sm:h-10 sm:w-10"
                  onClick={refreshWallets}
                  disabled={refreshing}
                  title="Refresh all wallets"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                </Button>
              )}
              <SettingsDialog page="portfolio" />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 sm:py-8 space-y-6">
        {/* Add Wallet Section */}
        <Card>
          <CardHeader>
            <CardTitle>Add Wallet</CardTitle>
            <CardDescription>
              Enter a wallet address to track its holdings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Input
                placeholder="Enter wallet address..."
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1"
              />
              <Button onClick={addWallet} disabled={loading}>
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        {wallets.length > 0 && (
          <>
            <PortfolioStats
              walletsCount={wallets.length}
              totalXnt={wallets.reduce((sum, w) => sum + w.solBalance, 0)}
              totalTokens={wallets.reduce((sum, w) => sum + w.tokens.length, 0)}
            />
            <AggregatedTokensTable wallets={wallets} />
          </>
        )}

        {/* Wallet Type Tabs */}
        {wallets.length > 0 && (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "all" | WalletAccountType)}>
            <TabsList>
              <TabsTrigger value="all">All ({tabCounts.all})</TabsTrigger>
              <TabsTrigger value="vote">Vote ({tabCounts.vote})</TabsTrigger>
              <TabsTrigger value="stake">Stake ({tabCounts.stake})</TabsTrigger>
              <TabsTrigger value="wallet">Wallet ({tabCounts.wallet})</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {/* Wallet List - Empty State */}
        {wallets.length === 0 && !initialLoading && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No wallets added</h3>
              <p className="text-muted-foreground">
                Add a wallet address above to start tracking its holdings
              </p>
            </CardContent>
          </Card>
        )}

        {/* Filtered empty state */}
        {wallets.length > 0 && filteredWallets.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No {activeTab} accounts</h3>
              <p className="text-muted-foreground">
                None of your tracked wallets are {activeTab} accounts
              </p>
            </CardContent>
          </Card>
        )}

        {/* Wallet List - With Accordion like ValidatorCard */}
        {filteredWallets.length > 0 && (
          <Accordion
            type="multiple"
            value={openAccordions}
            onValueChange={setOpenAccordions}
            className="space-y-4"
          >
            {filteredWallets.map((wallet) => (
              <WalletCard
                key={wallet.address}
                wallet={wallet}
                onRemove={() => removeWallet(wallet.address)}
                useAccordion={true}
                accordionValue={wallet.address}
              />
            ))}
          </Accordion>
        )}
      </main>

      <Footer />
    </div>
  );
};
