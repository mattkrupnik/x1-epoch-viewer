import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ShieldCheck, ArrowLeft, RefreshCw, Copy, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navigation } from "@/components/shared/Navigation";
import { ValidatorCard } from "@/components/validator/ValidatorCard";
import { x1Client } from "@/lib/x1-rpc";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ChartSettingsProvider } from "@/hooks/useChartSettings";
import { EpochReward } from "@/types/validator";

interface ValidatorData {
  voteAddress: string;
  totalRewards: number;
  epochCount: number;
  averageReward: number;
  currentEpoch: number;
  activatedStake: number;
  commission: number;
  epochRewards: EpochReward[];
  status: 'active' | 'delinquent' | 'unknown';
  name?: string;
  avatar?: string;
  selfStakeAmount?: number;
  blocksProduced: number;
  skippedSlots: number;
}

const Validator = () => {
  const { address } = useParams<{ address: string }>();
  const [validator, setValidator] = useState<ValidatorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchValidator = async (isRefresh = false) => {
    if (!address) return;

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      // Get validator data from API (or add if not in DB)
      let data = await api.getValidator(address);
      if (!data) {
        data = await api.addValidator(address);
      }

      if (!data) {
        toast.error("Validator not found");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Fetch live block production from RPC
      let blocksProduced = 0;
      let skippedSlots = 0;
      try {
        const epochInfo = await x1Client.getEpochInfo();
        const voteAccounts = await x1Client.getVoteAccounts();
        const allAccounts = [...voteAccounts.current, ...voteAccounts.delinquent];
        const account = allAccounts.find((acc: any) => acc.votePubkey === address);

        if (account?.nodePubkey) {
          const blockProduction = await x1Client.getBlockProduction(epochInfo.epoch);
          const validatorBlockData = blockProduction?.value?.byIdentity?.[account.nodePubkey];
          blocksProduced = validatorBlockData ? validatorBlockData[0] : 0;
          skippedSlots = validatorBlockData ? blocksProduced - validatorBlockData[1] : 0;
        }
      } catch (error) {
        console.error("Failed to fetch block production:", error);
      }

      setValidator({
        ...data,
        blocksProduced,
        skippedSlots,
      });
    } catch (error) {
      console.error("Failed to fetch validator:", error);
      toast.error("Failed to fetch validator data");
    }

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchValidator();
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
    <ChartSettingsProvider>
      <div className="min-h-screen flex flex-col">
        <header className="border-b bg-card/70 backdrop-blur-xl">
          <div className="container mx-auto px-4 py-3 sm:py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-gradient-primary flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold truncate">
                    {validator?.name || "Validator Details"}
                  </h1>
                  <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                    {address ? truncateAddress(address) : "Loading..."}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link to="/">
                  <Button variant="outline" size="icon" className="h-9 w-9 sm:h-10 sm:w-10" title="Back to Dashboard">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
                <Navigation showNavigation={true}/>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6 sm:py-8 space-y-6">
          {loading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <RefreshCw className="h-8 w-8 mx-auto text-muted-foreground animate-spin mb-4" />
                <p className="text-muted-foreground">Loading validator data...</p>
              </CardContent>
            </Card>
          ) : validator ? (
            <ValidatorCard
              voteAddress={validator.voteAddress}
              name={validator.name}
              avatar={validator.avatar}
              status={validator.status}
              totalRewards={validator.totalRewards}
              epochCount={validator.epochCount}
              averageReward={validator.averageReward}
              activatedStake={validator.activatedStake}
              commission={validator.commission}
              blocksProduced={validator.blocksProduced}
              skippedSlots={validator.skippedSlots}
              epochRewards={validator.epochRewards}
              isCopied={copied}
              onCopy={copyAddress}
              onRemove={() => {}}
              showRemoveButton={false}
              selfStakeAmount={validator.selfStakeAmount}
            />
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Validator not found</h3>
                <p className="text-muted-foreground">
                  Could not load data for this address
                </p>
              </CardContent>
            </Card>
          )}
        </main>

        <footer className="border-t bg-card mt-auto">
          <div className="container mx-auto px-4 py-4 text-center text-sm text-muted-foreground">
            Validator data from X1 Network RPC
          </div>
        </footer>
      </div>
    </ChartSettingsProvider>
  );
};

export default Validator;
