import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ShieldCheck, ArrowLeft, RefreshCw, Copy, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Navigation } from "@/components/Navigation";
import { ValidatorCard } from "@/components/ValidatorCard";
import { x1Client } from "@/lib/x1-rpc";
import { getValidatorByVotePubkey } from "@/lib/validators-db";
import { toast } from "sonner";
import { ChartSettingsProvider } from "@/hooks/useChartSettings";
import { EpochReward } from "@/components/ValidatorDashboard";

const getEpochTimestampCache = (): Map<number, string> => {
  try {
    const cache = localStorage.getItem('epochTimestampCache');
    if (cache) {
      const parsed = JSON.parse(cache);
      return new Map(Object.entries(parsed).map(([k, v]) => [Number(k), v as string]));
    }
  } catch (error) {
    console.error('Error loading epoch timestamp cache:', error);
  }
  return new Map();
};

const saveEpochTimestampCache = (cache: Map<number, string>) => {
  try {
    const obj = Object.fromEntries(cache);
    localStorage.setItem('epochTimestampCache', JSON.stringify(obj));
  } catch (error) {
    console.error('Error saving epoch timestamp cache:', error);
  }
};

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
      const epochInfo = await x1Client.getEpochInfo();
      const currentEpoch = epochInfo.epoch;
      const voteAccounts = await x1Client.getVoteAccounts();
      
      const activeValidator = voteAccounts.current?.find((v: any) => v.votePubkey === address);
      const delinquentValidator = voteAccounts.delinquent?.find((v: any) => v.votePubkey === address);
      
      const validatorInfo = activeValidator || delinquentValidator;
      const status = activeValidator ? 'active' : delinquentValidator ? 'delinquent' : 'unknown';
      const activatedStake = validatorInfo?.activatedStake ? validatorInfo.activatedStake / 1e9 : 0;

      // Fetch validator name and avatar
      let validatorName: string | undefined;
      let validatorAvatar: string | undefined;
      try {
        const cachedValidatorMeta = await getValidatorByVotePubkey(address);
        if (cachedValidatorMeta) {
          validatorName = cachedValidatorMeta.name;
          validatorAvatar = cachedValidatorMeta.iconUrl;
        }
        
        const response = await fetch(`https://api.xen.network/v1/x1/validators?network=mainnet&votePubkey=${address}`);
        if (response.ok) {
          const data = await response.json();
          validatorName = validatorName || data[0]?.name || undefined;
          validatorAvatar = validatorAvatar || data[0]?.iconUrl || undefined;
        }
      } catch (error) {
        console.log("Could not fetch validator metadata");
      }

      // Get self-stake info
      let selfStakeAmount = 0;
      if (validatorInfo?.nodePubkey) {
        try {
          const selfStakeAddresses = await x1Client.getStakeAccountsForVote(address, validatorInfo.nodePubkey);
          if (selfStakeAddresses.length > 0) {
            const accountsInfo = await x1Client.getMultipleAccounts(selfStakeAddresses);
            selfStakeAmount = accountsInfo.value
              .filter((acc: any) => acc !== null)
              .reduce((sum: number, acc: any) => sum + (acc.lamports || 0), 0) / 1e9;
          }
        } catch (error) {
          console.error("Failed to fetch self-stake:", error);
        }
      }

      // Fetch epoch rewards
      const epochsToFetch = 100;
      const epochNumbers = Array.from({ length: epochsToFetch }, (_, i) => currentEpoch - i).filter(e => e >= 0);
      
      const epochTimestampCache = getEpochTimestampCache();
      const epochsMeta = await fetch("https://api.xen.network/v1/x1/epochs").then(res => res.json());
      const epochSlotMap = new Map(epochsMeta.map((e: any) => [e.epoch, e.endSlot]));

      let stakeHistoryMap = new Map<number, number>();
      if (validatorInfo?.nodePubkey) {
        try {
          const historyResponse = await fetch(`https://api.xen.network/v1/x1/validators/${validatorInfo.nodePubkey}/history?groupBy=epoch&network=mainnet`);
          if (historyResponse.ok) {
            const historyData = await historyResponse.json();
            historyData.forEach((item: any) => {
              if (item.epoch !== undefined && item.activatedStake !== undefined) {
                stakeHistoryMap.set(item.epoch, item.activatedStake / 1e9);
              }
            });
          }
        } catch (error) {
          console.error("Failed to fetch stake history:", error);
        }
      }

      // Get self-stake addresses for rewards
      let selfStakeAddresses: string[] = [];
      if (validatorInfo?.nodePubkey) {
        selfStakeAddresses = await x1Client.getStakeAccountsForVote(address, validatorInfo.nodePubkey);
      }

      const batchRequests = epochNumbers.map(epoch => ({
        method: "getInflationReward",
        params: [[address], { epoch }],
      }));

      let selfStakeBatchRequests: any[] = [];
      if (selfStakeAddresses.length > 0) {
        selfStakeBatchRequests = epochNumbers.map(epoch => ({
          method: "getInflationReward",
          params: [selfStakeAddresses, { epoch }],
        }));
      }

      const epochsNeedingTimestamp = epochNumbers.filter(epoch => 
        !epochTimestampCache.has(epoch) && epochSlotMap.has(epoch)
      );

      const timeRequests = epochsNeedingTimestamp.map(epoch => ({
        method: "getBlockTime",
        params: [epochSlotMap.get(epoch)],
      }));

      const allRequests = [...batchRequests, ...selfStakeBatchRequests, ...timeRequests];
      const batchResults = await x1Client.batchCall(allRequests);

      const validatorResults = batchResults.slice(0, epochNumbers.length);
      const selfStakeResults = batchResults.slice(epochNumbers.length, 2 * epochNumbers.length);
      const timeResults = batchResults.slice(2 * epochNumbers.length);

      const epochTimeMap = new Map(epochTimestampCache);
      for (let i = 0; i < timeResults.length; i++) {
        const epoch = epochsNeedingTimestamp[i];
        const timestamp = timeResults[i];
        if (timestamp) {
          const d = new Date(timestamp * 1000);
          const datePart = d.toLocaleDateString('en-US', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          });
          const hours = String(d.getHours()).padStart(2, "0");
          const minutes = String(d.getMinutes()).padStart(2, "0");
          epochTimeMap.set(epoch, `${datePart} ${hours}:${minutes}`);
        }
      }
      saveEpochTimestampCache(epochTimeMap);

      const epochRewards: EpochReward[] = [];
      for (let i = 0; i < epochNumbers.length; i++) {
        const epoch = epochNumbers[i];
        const result = validatorResults[i];

        if (result?.[0]?.amount) {
          let selfStakeReward = 0;
          if (Array.isArray(selfStakeResults[i])) {
            selfStakeReward = selfStakeResults[i]
              .filter((r: any) => r && r.amount)
              .reduce((sum: number, r: any) => sum + r.amount / 1e9, 0);
          }

          const voteReward = result[0].amount / 1e9;
          epochRewards.push({
            epoch,
            voteReward,
            reward: voteReward + selfStakeReward,
            commission: result[0].commission || 10,
            selfStakeReward,
            date: epochTimeMap.get(epoch) || undefined,
            activeStake: stakeHistoryMap.get(epoch) || 0,
            postBalance: result[0].postBalance ? result[0].postBalance / 1e9 : undefined,
          });
        }
      }

      epochRewards.sort((a, b) => b.epoch - a.epoch);

      // Fetch block production
      let blocksProduced = 0;
      let skippedSlots = 0;
      if (validatorInfo?.nodePubkey) {
        try {
          const blockProduction = await x1Client.getBlockProduction(currentEpoch);
          const validatorBlockData = blockProduction?.value?.byIdentity?.[validatorInfo.nodePubkey];
          blocksProduced = validatorBlockData ? validatorBlockData[0] : 0;
          skippedSlots = validatorBlockData ? blocksProduced - validatorBlockData[1] : 0;
        } catch (error) {
          console.error("Failed to fetch block production:", error);
        }
      }

      const totalRewards = epochRewards.reduce((sum, r) => sum + r.reward, 0);
      const averageReward = epochRewards.length > 0 ? totalRewards / epochRewards.length : 0;

      setValidator({
        voteAddress: address,
        totalRewards,
        epochCount: epochRewards.length,
        averageReward,
        currentEpoch,
        activatedStake,
        commission: validatorInfo?.commission || 10,
        epochRewards,
        status,
        name: validatorName,
        avatar: validatorAvatar,
        selfStakeAmount,
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
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b bg-card">
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
