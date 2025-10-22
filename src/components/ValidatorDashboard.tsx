import { useState, useEffect, useRef } from "react";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Coins,
  Calendar,
  Plus,
  RefreshCw,
  User,
  ShieldCheck,
  Clock,
  X,
  Copy,
  Check,
  CircleAlert
} from "lucide-react";
import authorAvatar from "@/assets/author-avatar.jpg";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CombinedRewardsChart } from "./CombinedRewardsChart";
import { toast } from "sonner";
import { x1Client } from "@/lib/x1-rpc";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { dashboardConfig } from "@/config/dashboard";
import * as htmlToImage from 'html-to-image';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList, CommandInput } from "@/components/ui/command";
import { saveValidators, searchValidators, getValidatorByVotePubkey } from "@/lib/validators-db";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ValidatorCard } from "./ValidatorCard";
import { formatXNT, formatTimeRemaining } from "@/lib/format";
import { ChartSettingsProvider } from "@/hooks/useChartSettings";
import { SettingsDialog } from "./SettingsDialog";
import { Navigation } from "./Navigation";

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

export interface EpochReward {
  epoch: number;
  voteReward: number;
  reward: number;
  commission: number;
  selfStakeReward?: number;
  date?: string;
  activeStake?: number;
  postBalance?: number;
}

interface ValidatorData {
  voteAddress: string;
  totalRewards: number;
  epochCount: number;
  averageReward: number;
  currentEpoch: number;
  activatedStake: number;
  commission: number,
  epochRewards: EpochReward[];
  status: 'active' | 'delinquent' | 'unknown';
  name?: string;
  avatar?: string;
  selfStakeAddresses?: string[];
  selfStakeAmount?: number;
}

interface ValidatorLiveData {
  blocksProduced: number;
  skippedSlots: number;
}

interface ValidatorSuggestion {
  votePubkey: string;
  name: string;
  iconUrl?: string;
}

export const ValidatorDashboard = () => {
  const [voteAddress, setVoteAddress] = useState("");
  const [validators, setValidators] = useState<ValidatorData[]>([]);
  const [liveData, setLiveData] = useState<Record<string, ValidatorLiveData>>({});
  const [loading, setLoading] = useState(false);
  const [monitoredAddresses, setMonitoredAddresses] = useState<string[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [openAccordions, setOpenAccordions] = useState<string[]>([]);
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<ValidatorSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [validatorsCacheLoaded, setValidatorsCacheLoaded] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const [epochProgress, setEpochProgress] = useState({ slotIndex: 0, slotsInEpoch: 0, progressPercent: 0, slotTime: 0});

  // Load validators cache on mount (always refresh)
  useEffect(() => {
    const loadValidatorsCache = async () => {
      try {
        const response = await fetch('https://api.xen.network/v1/x1/validators?network=mainnet&limit=5000');
        if (response.ok) {
          const validators = await response.json();
          const validatorCache = validators.map((v: any) => ({
            votePubkey: v.votePubkey,
            nodePubkey: v.nodePubkey,
            name: v.name,
            iconUrl: v.iconUrl,
          }));
          await saveValidators(validatorCache);
        }
      } catch (error) {
        console.error("Failed to load validators cache", error);
      }
      
      setValidatorsCacheLoaded(true);
    };
    
    loadValidatorsCache();
  }, []);

  // Load accordion state from localStorage
  useEffect(() => {
    const savedAccordionState = localStorage.getItem("accordionState");
    if (savedAccordionState) {
      try {
        setOpenAccordions(JSON.parse(savedAccordionState));
      } catch (error) {
        console.error("Error loading accordion state:", error);
      }
    }
  }, []);

  // Save accordion state to localStorage
  useEffect(() => {
    if (openAccordions.length > 0 || validators.length > 0) {
      localStorage.setItem("accordionState", JSON.stringify(openAccordions));
    }
  }, [openAccordions]);

  // Load validator data from localStorage on mount
  useEffect(() => {
    const loadValidators = async () => {
      const cachedData = localStorage.getItem("validatorCache");
      
      if (cachedData) {
        try {
          const cache = JSON.parse(cachedData) as {
            epoch: number;
            validators: ValidatorData[];
            addresses: string[];
          };
          
          // Fetch shared data ONCE
          const epochInfo = await x1Client.getEpochInfo();
          const currentEpoch = epochInfo.epoch;
          const perfSamples = await x1Client.getRecentPerformanceSamples();
          const sample = perfSamples[0];
          const slotTime = sample?.samplePeriodSecs / sample?.numSlots;

          // Update epoch progress
          setEpochProgress({
            slotIndex: epochInfo.slotIndex,
            slotsInEpoch: epochInfo.slotsInEpoch,
            progressPercent: (epochInfo.slotIndex / epochInfo.slotsInEpoch) * 100,
            slotTime: slotTime
          });
          
          setMonitoredAddresses(cache.addresses);
          
          const needsRefresh = cache.validators.some((validator) => 
            !validator.epochRewards?.some((reward) => 
              reward.selfStakeReward !== undefined && 
              reward.date !== undefined && 
              reward.activeStake !== undefined &&
              reward.postBalance !== undefined
            )
          );
          
          if (needsRefresh) {
            toast.info("Updating validator data with missing fields...");
            
            const voteAccounts = await x1Client.getVoteAccounts();
            const blockProduction = null;
            
            for (const address of cache.addresses) {
              await fetchValidatorData(address, cache.addresses, false, {
                epochInfo,
                perfSamples,
                slotTime,
                voteAccounts,
                blockProduction,
                currentEpoch
              }, true);
            }
          } else if (cache.epoch === currentEpoch) {
            // Use cached reward data, but always refresh validator status from RPC
            setValidators(cache.validators);
            
            const voteAccounts = await x1Client.getVoteAccounts();
            const allAccounts = [...voteAccounts.current, ...voteAccounts.delinquent];

            setValidators((prevValidators) =>
                prevValidators.map((validator) => {
                  const account = allAccounts.find(
                      (acc) => acc.votePubkey === validator.voteAddress
                  );

                  if (account) {
                    const activatedStake = account?.activatedStake ? account?.activatedStake / 1e9 : 0;
                    
                    return {
                      ...validator,
                      status: voteAccounts.current.some(v => v.votePubkey === validator.voteAddress)
                          ? 'active'
                          : 'delinquent',
                      activatedStake,
                      commission: account.commission
                    }
                  }

                  return validator;
                })
            );

          } else {
            // Epoch changed, fetch only new epochs
            toast.info(`Epoch changed (${cache.epoch} → ${currentEpoch}), fetching new data...`);
            
            const voteAccounts = await x1Client.getVoteAccounts();
            const blockProduction = null;
            
            for (const address of cache.addresses) {
              await fetchValidatorData(address, cache.addresses, false, {
                epochInfo,
                perfSamples,
                slotTime,
                voteAccounts,
                blockProduction,
                currentEpoch
              });
            }
          }
        } catch (error) {
          console.error("Error loading validators from localStorage:", error);
          toast.error("Error loading saved validators");
        }
      }
      setInitialLoading(false);
    };
    
    loadValidators();
  }, []);

  // Save validator data and epoch to localStorage
  useEffect(() => {
    if (validators.length > 0 && monitoredAddresses.length > 0) {
      const cache = {
        epoch: validators[0]?.currentEpoch || 0,
        validators: validators,
        addresses: monitoredAddresses,
      };
      localStorage.setItem("validatorCache", JSON.stringify(cache));
    } else {
      localStorage.removeItem("validatorCache");
    }
  }, [validators, monitoredAddresses]);

  const fetchValidatorData = async (
    address: string, 
    addressOrder?: string[], 
    skipRewardsFetch: boolean = false,
    sharedData?: {
      epochInfo: any;
      perfSamples: any;
      slotTime: number;
      voteAccounts: any;
      blockProduction: any;
      currentEpoch: number;
    },
    forceRefresh: boolean = false
  ) => {
    try {
      // Use shared data if provided, otherwise fetch
      let epochInfo, currentEpoch, perfSamples, slotTime, voteAccounts, blockProduction;
      
      if (sharedData) {
        ({ epochInfo, currentEpoch, perfSamples, slotTime, voteAccounts, blockProduction } = sharedData);
      } else {
        epochInfo = await x1Client.getEpochInfo();
        currentEpoch = epochInfo.epoch;
        perfSamples = await x1Client.getRecentPerformanceSamples();
        const sample = perfSamples[0];
        slotTime = sample?.samplePeriodSecs / sample?.numSlots;
        voteAccounts = await x1Client.getVoteAccounts();
        
        setEpochProgress({
          slotIndex: epochInfo.slotIndex,
          slotsInEpoch: epochInfo.slotsInEpoch,
          progressPercent: (epochInfo.slotIndex / epochInfo.slotsInEpoch) * 100,
          slotTime: slotTime
        });
      }
      
      const activeValidator = voteAccounts.current?.find((v: any) => v.votePubkey === address);
      const delinquentValidator = voteAccounts.delinquent?.find((v: any) => v.votePubkey === address);
      
      const validatorInfo = activeValidator || delinquentValidator;
      const status = activeValidator ? 'active' : delinquentValidator ? 'delinquent' : 'unknown';
      const activatedStake = validatorInfo?.activatedStake ? validatorInfo.activatedStake / 1e9 : 0;
      
      // Fetch validator name and avatar from API
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
        // Silently ignore errors fetching validator metadata
        console.log("Could not fetch validator metadata");
      }
      
      // Load cache from validatorCache - find existing data for this validator
      const validatorCacheStr = localStorage.getItem("validatorCache");
      const validatorCache = validatorCacheStr ? JSON.parse(validatorCacheStr) : null;
      const cachedValidator = validatorCache?.validators?.find((v: ValidatorData) => v.voteAddress === address);
      
      // Get self-stake addresses for this validator
      let selfStakeAddresses = cachedValidator?.selfStakeAddresses;
      let selfStakeAmount = cachedValidator?.selfStakeAmount || 0;
      
      if ((!skipRewardsFetch || forceRefresh || !selfStakeAddresses) && validatorInfo?.nodePubkey) {
        toast.info(`Fetching self-stake accounts for ${address.slice(0, 8)}...`);
        selfStakeAddresses = await x1Client.getStakeAccountsForVote(address, validatorInfo.nodePubkey);
        
        // Fetch stake account balances
        if (selfStakeAddresses.length > 0) {
          try {
            const accountsInfo = await x1Client.getMultipleAccounts(selfStakeAddresses);
            selfStakeAmount = accountsInfo.value
              .filter((acc: any) => acc !== null)
              .reduce((sum: number, acc: any) => sum + (acc.lamports || 0), 0) / 1e9; // Convert lamports to XNT
          } catch (error) {
            console.error("Failed to fetch stake account balances:", error);
          }
        }
      }
      
      // Determine which epochs to fetch
      const epochsToFetch = 400;
      const epochNumbers = Array.from({ length: epochsToFetch }, (_, i) => currentEpoch - i).filter(e => e >= 0);
      
      // Check cache for existing data
      const epochRewards: EpochReward[] = [];
      const epochsToQuery: number[] = [];
      
      if (skipRewardsFetch && cachedValidator && !forceRefresh) {
        // Use ALL cached data without fetching anything
        for (const epoch of epochNumbers) {
          const cachedReward = cachedValidator.epochRewards?.find((r: EpochReward) => r.epoch === epoch);
          if (cachedReward) {
            epochRewards.push(cachedReward);
          }
        }
      } else if (forceRefresh) {
        // Force refresh - fetch ALL epochs
        epochsToQuery.push(...epochNumbers);
      } else {
        // Normal flow - check which epochs are missing or need selfStakeReward update
        for (const epoch of epochNumbers) {
          const cachedReward = cachedValidator?.epochRewards?.find((r: EpochReward) => r.epoch === epoch);
          if (cachedReward && cachedReward.selfStakeReward !== undefined) {
            // Use cached data only if it has selfStakeReward
            epochRewards.push(cachedReward);
          } else {
            // Need to fetch this epoch (missing or incomplete)
            epochsToQuery.push(epoch);
          }
        }
      }
      
      if (epochsToQuery.length > 0) {
        const epochTimestampCache = getEpochTimestampCache();
        const epochsMeta = await fetch("https://api.xen.network/v1/x1/epochs").then(res => res.json());
        const epochSlotMap = new Map(epochsMeta.map(e => [e.epoch, e.endSlot]));

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

        const batchRequests = epochsToQuery.map(epoch => ({
          method: "getInflationReward",
          params: [[address], { epoch }],
        }));

        let selfStakeBatchRequests = [];
        if (selfStakeAddresses?.length > 0) {
          selfStakeBatchRequests = epochsToQuery.map(epoch => ({
            method: "getInflationReward",
            params: [selfStakeAddresses, { epoch }],
          }));
        }

        const epochsNeedingTimestamp = epochsToQuery.filter(epoch => 
          !epochTimestampCache.has(epoch) && epochSlotMap.has(epoch)
        );

        const timeRequests = epochsNeedingTimestamp.map(epoch => ({
          method: "getBlockTime",
          params: [epochSlotMap.get(epoch)],
        }));

        const allRequests = [...batchRequests, ...selfStakeBatchRequests, ...timeRequests];
        const batchResults = await x1Client.batchCall(allRequests);

        const validatorResults = batchResults.slice(0, epochsToQuery.length);
        const selfStakeResults = batchResults.slice(epochsToQuery.length, 2 * epochsToQuery.length);
        const timeResults = batchResults.slice(2 * epochsToQuery.length);

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

            const timePart = `${hours}:${minutes}`;

            epochTimeMap.set(epoch, `${datePart} ${timePart}`);
          }
        }

        saveEpochTimestampCache(epochTimeMap);

        for (let i = 0; i < epochsToQuery.length; i++) {
          const epoch = epochsToQuery[i];
          const result = validatorResults[i];

          if (result?.[0]?.amount) {
            let selfStakeReward = 0;
            if (Array.isArray(selfStakeResults[i])) {
              selfStakeReward = selfStakeResults[i]
                  .filter(r => r && r.amount)
                  .reduce((sum, r) => sum + r.amount / 1e9, 0);
            }

            const voteReward = result[0].amount / 1e9;
            const epochActiveStake = stakeHistoryMap.get(epoch) || 0;
            const rewardData = {
              epoch,
              voteReward,
              reward: voteReward + selfStakeReward,
              commission: result[0].commission || 10,
              selfStakeReward,
              date: epochTimeMap.get(epoch) || undefined,
              activeStake: epochActiveStake,
              postBalance: result[0].postBalance ? result[0].postBalance / 1e9 : undefined,
            };

            epochRewards.push(rewardData);
          }
        }
      }


      // Sort rewards by epoch (descending)
      epochRewards.sort((a, b) => b.epoch - a.epoch);
      
      // If no rewards found during force refresh, use cached data as fallback
      if (epochRewards.length === 0) {
        if (forceRefresh && cachedValidator?.epochRewards) {
          epochRewards.push(...cachedValidator.epochRewards);
          toast.info("Using cached data - some historical data may not be available");
        } else {
          toast.error("No rewards found for this validator address");
          return;
        }
      }
      
      const totalRewards = epochRewards.reduce((sum, r) => sum + r.reward, 0);
      const averageReward = totalRewards / epochRewards.length;
      
      const newValidator: ValidatorData = {
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
        selfStakeAddresses,
        selfStakeAmount,
      };

      
      setMonitoredAddresses(prev => {
        const newAddresses = prev.includes(address) ? prev : [...prev, address];

        setValidators(prevValidators => {
          const filtered = prevValidators.filter(v => v.voteAddress !== address);
          const updatedValidators = [...filtered, newValidator];

          // Sort according to updated monitoredAddresses
          const sorted = updatedValidators.sort((a, b) => {
            const indexA = newAddresses.indexOf(a.voteAddress);
            const indexB = newAddresses.indexOf(b.voteAddress);
            return indexA - indexB;
          });

          // Set default accordion state for new validators
          const isNewValidator = !prevValidators.some(v => v.voteAddress === address);
          if (isNewValidator && dashboardConfig.DEFAULT_ACCORDION_EXPANDED) {
            const validatorIndex = sorted.findIndex(v => v.voteAddress === address);
            if (validatorIndex !== -1) {
              setOpenAccordions(prevOpen => {
                const accordionValue = `validator-${validatorIndex}`;
                if (!prevOpen.includes(accordionValue)) {
                  return [...prevOpen, accordionValue];
                }
                return prevOpen;
              });
            }
          }

          return sorted;
        });

        return newAddresses;
      });

    } catch (error) {
      console.error("Error fetching validator data:", error);
      toast.error("Error fetching validator data");
    }
  };

  const handleSearch = async (addressToAdd?: string) => {
    const address = addressToAdd || voteAddress;
    if (!address.trim()) {
      toast.error("Please enter a validator vote address");
      return;
    }

    if (validators.some(v => v.voteAddress === address)) {
      toast.error("This validator has already been added");
      return;
    }

    setLoading(true);
    const toastId = toast.loading("Fetching validator data...");
    try {
      await fetchValidatorData(address);
      setVoteAddress("");
      toast.success("Validator added successfully", { id: toastId });
    } catch (error) {
      toast.error("Error fetching validator data", { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  // Update live data (block production) and epoch progress every 10 seconds
  const updateLiveData = async () => {
    if (validators.length === 0) return;
    
    try {
      // Fetch shared data ONCE
      const epochInfo = await x1Client.getEpochInfo();
      const currentEpoch = epochInfo.epoch;
      const perfSamples = await x1Client.getRecentPerformanceSamples();
      const sample = perfSamples[0];
      const slotTime = sample?.samplePeriodSecs / sample?.numSlots;
      
      // Update epoch progress
      setEpochProgress({
        slotIndex: epochInfo.slotIndex,
        slotsInEpoch: epochInfo.slotsInEpoch,
        progressPercent: (epochInfo.slotIndex / epochInfo.slotsInEpoch) * 100,
        slotTime: slotTime
      });
      
      const blockProduction = await x1Client.getBlockProduction(currentEpoch);
      const voteAccounts = await x1Client.getVoteAccounts();
      const allAccounts = [...voteAccounts.current, ...voteAccounts.delinquent];
      
      const newLiveData: Record<string, ValidatorLiveData> = {};
      
      for (const validator of validators) {
        const account = allAccounts.find((acc: any) => acc.votePubkey === validator.voteAddress);
        if (account && account.nodePubkey) {
          const validatorBlockData = blockProduction?.value?.byIdentity?.[account.nodePubkey];
          const blocksProduced = validatorBlockData ? validatorBlockData[0] : 0;
          const skippedSlots = validatorBlockData ? blocksProduced - validatorBlockData[1] : 0;

          newLiveData[validator.voteAddress] = { blocksProduced, skippedSlots };
        }
      }

      setLiveData(newLiveData);
    } catch (error) {
      console.error("Failed to update live data:", error);
    }
  };

  // Update live data every 10 seconds (but NOT on initial mount - data is already loaded)
  useEffect(() => {
    if (validators.length > 0 && !initialLoading) {
      // const interval = setInterval(updateLiveData, 10000);
      // return () => clearInterval(interval);
    }
  }, [validators, initialLoading]);

  const removeValidator = (voteAddress: string) => {
    const validatorIndex = validators.findIndex(v => v.voteAddress === voteAddress);
    if (validatorIndex !== -1) {
      // Remove from accordion state
      setOpenAccordions(prev => prev.filter(v => v !== `validator-${validatorIndex}`));
    }
    setValidators(validators.filter(v => v.voteAddress !== voteAddress));
    setMonitoredAddresses(prev => prev.filter(addr => addr !== voteAddress));
    toast.success("Validator removed");
  };

  const refreshAllValidators = async () => {
    if (monitoredAddresses.length === 0) {
      toast.error("No validators to refresh");
      return;
    }

    setRefreshing(true);
    const toastId = toast.loading("Refreshing validator data...");
    
    try {
      // Force refresh - fetch ALL data from scratch
      for (const address of monitoredAddresses) {
        await fetchValidatorData(address, monitoredAddresses, false, undefined, true);
      }
      
      toast.success("All validators refreshed successfully", { id: toastId });
    } catch (error) {
      toast.error("Error refreshing validators", { id: toastId });
    } finally {
      setRefreshing(false);
    }
  };

  const copyToClipboard = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      toast.success("Address copied to clipboard");
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (error) {
      toast.error("Failed to copy address");
    }
  };

  const copyCardAsImage = async () => {
    const node = document.getElementById('total-rewards');
    if (!node){
      return
    }

    try {
      const dataUrl = await htmlToImage.toPng(node);

      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);

      toast.success("Image copied to clipboard");
    } catch (err) {
      toast.error("Image copying failed");
    }
  };

  // Search validator suggestions from IndexedDB
  const fetchValidatorSuggestions = async (query: string) => {
    if (!dashboardConfig.USE_AUTOCOMPLETE || query.length < 3) {
      setSuggestions([]);
      setAutocompleteOpen(false);
      return;
    }

    if (!validatorsCacheLoaded) {
      return;
    }

    setLoadingSuggestions(true);
    try {
      const results = await searchValidators(query);
      setSuggestions(results);
      setAutocompleteOpen(results.length > 0);
    } catch (error) {
      console.error("Error searching validators:", error);
      setSuggestions([]);
      setAutocompleteOpen(false);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleInputChange = (value: string) => {
    setVoteAddress(value);
    setSelectedSuggestionIndex(-1); // Reset selection on input change
    if (dashboardConfig.USE_AUTOCOMPLETE) {
      fetchValidatorSuggestions(value);
    }
  };

  const selectSuggestion = (suggestion: ValidatorSuggestion) => {
    setVoteAddress(suggestion.votePubkey);
    setAutocompleteOpen(false);
    setSuggestions([]);
    setSelectedSuggestionIndex(-1);
    // Automatically add the validator
    handleSearch(suggestion.votePubkey);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!autocompleteOpen || suggestions.length === 0) {
      if (e.key === "Enter") {
        handleSearch();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedSuggestionIndex(prev => {
          const newIndex = prev < suggestions.length - 1 ? prev + 1 : 0;
          // Scroll into view after state update
          setTimeout(() => {
            const element = document.querySelector(`[data-suggestion-index="${newIndex}"]`);
            element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 0);
          return newIndex;
        });
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedSuggestionIndex(prev => {
          const newIndex = prev > 0 ? prev - 1 : suggestions.length - 1;
          // Scroll into view after state update
          setTimeout(() => {
            const element = document.querySelector(`[data-suggestion-index="${newIndex}"]`);
            element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 0);
          return newIndex;
        });
        break;
      case "Enter":
        e.preventDefault();
        if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length) {
          selectSuggestion(suggestions[selectedSuggestionIndex]);
        } else {
          handleSearch();
        }
        break;
      case "Escape":
        setAutocompleteOpen(false);
        setSelectedSuggestionIndex(-1);
        break;
    }
  };

  const totalCombinedRewards = validators.reduce((sum, v) => sum + v.totalRewards, 0);
  const totalCombinedEpochs = validators.reduce((sum, v) => sum + v.epochCount, 0);
  const averageCombinedReward = validators.length > 0 ? totalCombinedRewards / validators.length : 0;

  return (
    <ChartSettingsProvider>
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky-disabled top-0 z-10 border-b bg-card">
        <div className="container mx-auto px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-gradient-primary flex items-center justify-center flex-shrink-0">
                <Coins className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold truncate">X1 Validator Dashboard</h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Monitor your validator rewards</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/*<a*/}
              {/*    href="https://x1validators.xyz"*/}
              {/*    target="_blank"*/}
              {/*    rel="noopener noreferrer"*/}
              {/*    className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-medium transition-all duration-200 border border-primary/20 hover:border-primary/40 h-9 sm:h-10"*/}
              {/*    onClick={() => {*/}
              {/*      if (typeof window !== "undefined" && (window as any).gtag) {*/}
              {/*        (window as any).gtag("event", "click_x1validators_link", {*/}
              {/*          event_category: "engagement",*/}
              {/*          event_label: "header__click_x1validators_link",*/}
              {/*          value: "https://x1validators.xyz",*/}
              {/*        });*/}
              {/*      }*/}
              {/*    }}*/}
              {/*>*/}
              {/*  <span className="text-xs sm:text-sm hidden md:block">Check Your Validators</span>*/}
              {/*  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">*/}
              {/*    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />*/}
              {/*  </svg>*/}
              {/*</a>*/}
              <Navigation />
              {validators.length > 0 && (
                  <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 sm:h-10 sm:w-10"
                      onClick={refreshAllValidators}
                      disabled={refreshing}
                      title="Refresh all validators"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                  </Button>
              )}
              <SettingsDialog />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 sm:py-8 space-y-6">
        {/* Search Section */}
        <Card className="border-2">
          <CardHeader>
            <CardTitle>Add Validator</CardTitle>
            <CardDescription>
              Enter a validator vote address to add it to the monitoring list
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboardConfig.USE_AUTOCOMPLETE ? (
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Input
                    ref={inputRef}
                    placeholder="Enter validator vote address or name..."
                    value={voteAddress}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <Popover 
                    open={autocompleteOpen && voteAddress.length >= 3} 
                    onOpenChange={(open) => {
                      // Only allow opening if we have 3+ characters and suggestions
                      if (open && voteAddress.length >= 3 && suggestions.length > 0) {
                        setAutocompleteOpen(true);
                      } else if (!open) {
                        setAutocompleteOpen(false);
                      }
                    }}
                  >
                    <PopoverTrigger asChild>
                      <div className="absolute inset-0 pointer-events-none" />
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[var(--radix-popover-trigger-width)] p-0 z-50"
                      align="start"
                      sideOffset={4}
                      onOpenAutoFocus={(e) => {
                        // Prevent stealing focus from input
                        e.preventDefault();
                      }}
                    >
                      <Command>
                        <CommandList>
                          {loadingSuggestions ? (
                            <div className="py-6 text-center text-sm">Loading...</div>
                          ) : (
                            <CommandGroup>
                              {suggestions.map((suggestion, index) => (
                                <CommandItem
                                  key={suggestion.votePubkey}
                                  data-suggestion-index={index}
                                  onSelect={() => selectSuggestion(suggestion)}
                                  className={`flex items-center gap-3 py-3 cursor-pointer ${
                                      index === selectedSuggestionIndex ? 'bg-border' : ''
                                  }`}
                                >
                                  <Avatar className="h-8 w-8">
                                    <AvatarImage src={suggestion.iconUrl} alt={suggestion.name} />
                                    <AvatarFallback>
                                      <User className="h-4 w-4" />
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{suggestion.name}</div>
                                    <div className="text-xs text-muted-foreground truncate">
                                      {suggestion.votePubkey.slice(0, 12)}...{suggestion.votePubkey.slice(-4)}
                                    </div>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <Button 
                  onClick={() => handleSearch()} 
                  disabled={loading}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {loading ? "Adding..." : "Add"}
                </Button>
              </div>
            ) : (
              <div className="flex gap-3">
                <Input
                  placeholder="Enter validator vote address..."
                  value={voteAddress}
                  onChange={(e) => setVoteAddress(e.target.value)}
                  className="flex-1"
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <Button 
                  onClick={() => handleSearch()} 
                  disabled={loading}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {loading ? "Adding..." : "Add"}
                </Button>
              </div>
            )}
            
            {validators.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {validators.map((validator) => (
                  <Badge
                    key={validator.voteAddress}
                    variant="secondary"
                    className="gap-2 text-xs pr-1 pl-1"
                  >
                    <span className="max-w-[200px] truncate flex gap-2">
                      <Avatar className="h-4 w-4 hidden sm:flex">
                        <AvatarImage src={validator.avatar} alt={validator.name || validator.voteAddress} />
                          <AvatarFallback>
                            <User className="h-4 w-4" />
                          </AvatarFallback>
                      </Avatar>
                      {validator.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0 hover:bg-accent"
                      onClick={() => removeValidator(validator.voteAddress)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats Cards */}
        {validators.length > 0 && (
          <>
            {/* Combined Stats */}
            <div className="grid gap-4 md:grid-cols-4">
              <div className="relative">
                <Card className="border-2" id='total-rewards'>
                  <CardHeader className="pb-3">
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                          <div className="flex items-center gap-2 cursor-help">
                            <Coins className="h-5 w-5 text-primary"/>
                            <CardTitle className="text-base">Total Rewards</CardTitle>
                            <TooltipTrigger asChild>
                              <CircleAlert className="h-[.8rem] w-[.8rem] text-muted-foreground"/>
                            </TooltipTrigger>
                          </div>
                        <TooltipContent>
                          <div className="space-y-1 text-xs">
                            <p className="font-semibold pt-2 mt-3">Total Breakdown</p>
                            <p className="text-muted-foreground">Vote Reward: {formatXNT(validators.reduce((sum, v) => sum + v.epochRewards.reduce((s, r) => s + r.voteReward, 0), 0))} XNT</p>
                            <p className="text-muted-foreground">Self-Stake Reward: {formatXNT(validators.reduce((sum, v) => sum + v.epochRewards.reduce((s, r) => s + (r.selfStakeReward || 0), 0), 0))} XNT</p>
                            <p className="font-semibold pt-1 border-t text-muted-foreground">Total: {formatXNT(totalCombinedRewards)} XNT</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold bg-gradient-to-r from-green-500 to-blue-500 bg-clip-text text-transparent">{formatXNT(totalCombinedRewards)}</p>
                    <p className="text-xs text-muted-foreground mt-1">XNT earned across all validators</p>
                  </CardContent>
                </Card>
                  <div
                      onClick={copyCardAsImage}
                      title="Share Image"
                      className="h-5 w-5 flex-shrink-0 flex items-center justify-center rounded-md
               hover:bg-muted hover:text-primary cursor-pointer transition-colors absolute top-3 right-3"
                  >
                    <Copy className="h-3 w-3"/>
                  </div>
              </div>

              <Card className="border-2">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-success"/>
                    <CardTitle className="text-base">Average Reward</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{formatXNT(averageCombinedReward)}</p>
                  <p className="text-xs text-muted-foreground mt-1">XNT per validator ({validators.length} monitored)</p>
                </CardContent>
              </Card>

              <Card className="border-2">
                <CardHeader className="pb-3">
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <div className="flex items-center gap-2 cursor-help">
                        <Coins className="h-5 w-5 text-accent"/>
                        <CardTitle className="text-base">Last Epoch</CardTitle>
                        <TooltipTrigger asChild>
                          <CircleAlert className="h-[.8rem] w-[.8rem] text-muted-foreground"/>
                        </TooltipTrigger>
                      </div>
                      <TooltipContent>
                        <div className="space-y-1 text-xs">
                          {(() => {
                            const lastEpochNumber = Math.max(...validators.map(v => v.epochRewards[0]?.epoch || 0));
                            const lastEpochVoteReward = validators.reduce((sum, v) => {
                              const lastEpoch = v.epochRewards.find(r => r.epoch === lastEpochNumber);
                              return sum + (lastEpoch?.voteReward || 0);
                            }, 0);
                            const lastEpochSelfStakeReward = validators.reduce((sum, v) => {
                              const lastEpoch = v.epochRewards.find(r => r.epoch === lastEpochNumber);
                              return sum + (lastEpoch?.selfStakeReward || 0);
                            }, 0);
                            const lastEpochTotal = lastEpochVoteReward + lastEpochSelfStakeReward;

                            return (
                              <>
                                <p className="font-semibold">Epoch {lastEpochNumber} Breakdown</p>
                                <p className="text-muted-foreground">Vote Reward: {formatXNT(lastEpochVoteReward)} XNT</p>
                                <p className="text-muted-foreground">Self-Stake Reward: {formatXNT(lastEpochSelfStakeReward)} XNT</p>
                                <p className="font-semibold pt-1 border-t text-muted-foreground">Total: {formatXNT(lastEpochTotal)} XNT</p>
                              </>
                            );
                          })()}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const lastEpochNumber = Math.max(...validators.map(v => v.epochRewards[0]?.epoch || 0));
                    const lastEpochTotal = validators.reduce((sum, v) => {
                      const lastEpoch = v.epochRewards.find(r => r.epoch === lastEpochNumber);
                      return sum + (lastEpoch?.voteReward || 0) + (lastEpoch?.selfStakeReward || 0);
                    }, 0);
                    
                    const previousEpochNumber = lastEpochNumber - 1;
                    const previousEpochTotal = validators.reduce((sum, v) => {
                      const prevEpoch = v.epochRewards.find(r => r.epoch === previousEpochNumber);
                      return sum + (prevEpoch?.voteReward || 0) + (prevEpoch?.selfStakeReward || 0);
                    }, 0);

                    const percentChange = previousEpochTotal > 0 
                      ? ((lastEpochTotal - previousEpochTotal) / previousEpochTotal) * 100 
                      : 0;

                    return (
                      <>
                        <p className="text-2xl sm:text-3xl font-bold">{formatXNT(lastEpochTotal)}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <p className="text-xs text-muted-foreground">Earned change</p>
                          {percentChange !== 0 && (
                            <span className={`flex items-center text-xs font-medium ${
                              percentChange > 0 ? 'text-green-500' : 'text-red-500'
                            }`}>
                              {percentChange > 0 ? (
                                <TrendingUp className="h-3 w-3 mr-0.5" />
                              ) : (
                                <TrendingDown className="h-3 w-3 mr-0.5" />
                              )}
                              {Math.abs(percentChange).toFixed(2)}%
                            </span>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>

              <Card className="border-2 relative">
                <CardHeader className="pb-3">
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <div className="flex items-center gap-2 cursor-help">
                        <Calendar className="h-5 w-5 text-primary" />
                        <CardTitle className="text-base">Current Epoch</CardTitle>
                        <TooltipTrigger asChild>
                          <CircleAlert className="h-[.8rem] w-[.8rem] text-muted-foreground"/>
                        </TooltipTrigger>
                      </div>
                      <TooltipContent>
                        <div className="space-y-1 text-xs">
                          <p className="font-semibold">Epoch Progress Details</p>
                          <p className="text-muted-foreground">Slot: {epochProgress.slotIndex.toLocaleString()} / {epochProgress.slotsInEpoch.toLocaleString()}</p>
                          <p className="text-muted-foreground">Remaining: {(epochProgress.slotsInEpoch - epochProgress.slotIndex).toLocaleString()} slots</p>
                          <p className="text-muted-foreground">Slot time: {(epochProgress.slotTime).toFixed(3)} ms</p>
                          <p className="font-semibold pt-1 border-t text-muted-foreground">
                            End of epoch: {new Date(
                              Date.now() +
                              (epochProgress.slotsInEpoch - epochProgress.slotIndex) *
                              epochProgress.slotTime * 1000
                          ).toLocaleTimeString(navigator.language, {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{validators[0]?.currentEpoch || 0}</p>
                  <div className="mt-1 space-y-2">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground flex items-center gap-1">
                          Epoch Progress
                        </span>
                        <span className="font-medium">
                          ~{formatTimeRemaining(epochProgress.slotsInEpoch - epochProgress.slotIndex, epochProgress.slotTime)}
                        </span>
                      </div>
                      <Progress value={epochProgress.progressPercent} className="absolute w-auto left-6 right-6 h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Combined Chart */}
            {dashboardConfig.SHOW_COMBINED_CHART && validators.length > 1 && (
              <CombinedRewardsChart 
                validators={validators.map(v => ({
                  voteAddress: v.voteAddress,
                  name: v.name,
                  avatar: v.avatar,
                  epochRewards: v.epochRewards
                }))}
              />
            )}

            {/* Per Validator Stats */}
            {dashboardConfig.USE_ACCORDION && validators.length > 1 ? (
              <Accordion 
                type="multiple" 
                className="space-y-4"
                value={openAccordions}
                onValueChange={setOpenAccordions}
              >
                {validators.map((validator, index) => (
                  <ValidatorCard
                    key={validator.voteAddress}
                    {...validator}
                    blocksProduced={liveData[validator.voteAddress]?.blocksProduced || 0}
                    skippedSlots={liveData[validator.voteAddress]?.skippedSlots || 0}
                    isCopied={copiedAddress === validator.voteAddress}
                    onCopy={() => copyToClipboard(validator.voteAddress)}
                    onRemove={() => removeValidator(validator.voteAddress)}
                    showRemoveButton={dashboardConfig.ALLOW_REMOVE_VALIDATOR}
                    useAccordion={true}
                    accordionValue={`validator-${index}`}
                  />
                ))}
              </Accordion>
            ) : (
              validators.map((validator) => (
                <ValidatorCard
                  key={validator.voteAddress}
                  {...validator}
                  blocksProduced={liveData[validator.voteAddress]?.blocksProduced || 0}
                  skippedSlots={liveData[validator.voteAddress]?.skippedSlots || 0}
                  isCopied={copiedAddress === validator.voteAddress}
                  onCopy={() => copyToClipboard(validator.voteAddress)}
                  onRemove={() => removeValidator(validator.voteAddress)}
                  showRemoveButton={dashboardConfig.ALLOW_REMOVE_VALIDATOR}
                />
              ))
            )}
          </>
        )}

        {/* Empty State or Loading */}
        {validators.length === 0 && !loading && (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-16">
              {initialLoading ? (
                <>
                  <div className="h-16 w-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                  <h3 className="text-xl font-semibold mb-2">Loading validators...</h3>
                  <p className="text-muted-foreground text-center max-w-md">
                    Fetching data from the network
                  </p>
                </>
              ) : (
                <>
                  <Search className="h-16 w-16 text-muted-foreground mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No Validators</h3>
                  <p className="text-muted-foreground text-center max-w-md">
                    Add a validator vote address above to start monitoring rewards and statistics
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
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
    </div>
    </ChartSettingsProvider>
  );
};
