import { useState, useEffect } from "react";
import { Wallet, Plus, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import { toast } from "sonner";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { Navigation } from "./Navigation";
import { WalletCard } from "./WalletCard";
import { PortfolioStats } from "./PortfolioStats";
import { AggregatedTokensTable } from "./AggregatedTokensTable";
import { getMultipleWalletBalances, WalletBalance } from "@/lib/wallet-rpc";

const STORAGE_KEY = "portfolioWallets";
const ACCORDION_STATE_KEY = "portfolioAccordionState";

export const PortfolioDashboard = () => {
  const [walletAddress, setWalletAddress] = useState("");
  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [openAccordions, setOpenAccordions] = useState<string[]>([]);

  // Load saved addresses and accordion state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    let addresses: string[] = [];
    if (saved) {
      try {
        addresses = JSON.parse(saved);
        setSavedAddresses(addresses);
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
    if (addresses.length === 1) {
      setOpenAccordions([addresses[0]]);
    }
    
    setInitialLoading(false);
  }, []);

  // Save addresses to localStorage
  useEffect(() => {
    if (!initialLoading) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedAddresses));
    }
  }, [savedAddresses, initialLoading]);

  // Save accordion state to localStorage
  useEffect(() => {
    if (openAccordions.length > 0 || wallets.length > 0) {
      localStorage.setItem(ACCORDION_STATE_KEY, JSON.stringify(openAccordions));
    }
  }, [openAccordions, wallets.length]);

  // Fetch balances when addresses change
  useEffect(() => {
    if (savedAddresses.length > 0 && !initialLoading) {
      refreshWallets();
    } else if (savedAddresses.length === 0) {
      setWallets([]);
    }
  }, [savedAddresses, initialLoading]);

  const refreshWallets = async () => {
    if (savedAddresses.length === 0) return;
    
    setRefreshing(true);
    try {
      const balances = await getMultipleWalletBalances(savedAddresses);
      setWallets(balances);
    } catch (error) {
      console.error("Failed to refresh wallets:", error);
      toast.error("Failed to refresh wallet balances");
    }
    setRefreshing(false);
  };

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

    if (savedAddresses.includes(address)) {
      toast.error("Wallet already added");
      return;
    }

    setLoading(true);
    try {
      const [balance] = await getMultipleWalletBalances([address]);
      setSavedAddresses(prev => [...prev, address]);
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
    setSavedAddresses(prev => prev.filter(a => a !== address));
    setWallets(prev => prev.filter(w => w.address !== address));
    setOpenAccordions(prev => prev.filter(a => a !== address));
    toast.success("Wallet removed");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) {
      addWallet();
    }
  };

  const totalSolBalance = wallets.reduce((sum, w) => sum + w.solBalance, 0);
  const totalTokenCount = wallets.reduce((sum, w) => sum + w.tokens.length, 0);

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
              <Navigation />
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
              <ThemeSwitcher />
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

        {/* Summary Stats - separate boxes like Validators */}
        {wallets.length > 0 && (
          <>
            <PortfolioStats
              walletsCount={wallets.length}
              totalXnt={totalSolBalance}
              totalTokens={totalTokenCount}
            />
            <AggregatedTokensTable wallets={wallets} />
          </>
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

        {/* Wallet List - With Accordion like ValidatorCard */}
        {wallets.length > 0 && (
          <Accordion
            type="multiple"
            value={openAccordions}
            onValueChange={setOpenAccordions}
            className="space-y-4"
          >
            {wallets.map((wallet) => (
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

      <footer className="border-t bg-card mt-auto">
        <div className="container mx-auto px-4 py-4 text-center text-sm text-muted-foreground">
          Portfolio data from X1 Network RPC
        </div>
      </footer>
    </div>
  );
};
