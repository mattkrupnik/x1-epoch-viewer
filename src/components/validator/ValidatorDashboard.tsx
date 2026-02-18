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
import { Footer } from "@/components/shared/Footer";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CombinedRewardsChart } from "./CombinedRewardsChart";
import { toast } from "sonner";
import { x1Client } from "@/lib/x1-rpc";
import { api } from "@/lib/api";
import { ThemeSwitcher } from "@/components/shared/ThemeSwitcher";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { dashboardConfig } from "@/config/dashboard";
import * as htmlToImage from 'html-to-image';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList, CommandInput } from "@/components/ui/command";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ValidatorCard } from "./ValidatorCard";
import { formatXNT, formatTimeRemaining } from "@/lib/format";
import { ChartSettingsProvider } from "@/hooks/useChartSettings";
import { SettingsDialog } from "@/components/shared/SettingsDialog";
import { Navigation } from "@/components/shared/Navigation";

export type { EpochReward } from "@/types/validator";

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
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const [epochProgress, setEpochProgress] = useState({ epoch: 0, slotIndex: 0, slotsInEpoch: 0, progressPercent: 0, slotTime: 0});

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

  // Load validator data from API on mount
  useEffect(() => {
    const loadValidators = async () => {
      // Load monitored addresses from localStorage
      const savedAddresses = localStorage.getItem("monitoredAddresses");
      // Migration: also check old validatorCache format
      const oldCache = localStorage.getItem("validatorCache");

      let addresses: string[] = [];
      if (savedAddresses) {
        try {
          addresses = JSON.parse(savedAddresses);
        } catch {
          // Ignore parse error
        }
      } else if (oldCache) {
        // Migrate from old format
        try {
          const cache = JSON.parse(oldCache);
          addresses = cache.addresses || [];
          // Save in new format and clear old
          localStorage.setItem("monitoredAddresses", JSON.stringify(addresses));
          localStorage.removeItem("validatorCache");
          localStorage.removeItem("epochTimestampCache");
        } catch {
          // Ignore parse error
        }
      }

      if (addresses.length > 0) {
        setMonitoredAddresses(addresses);

        try {
          // Fetch epoch progress from backend API
          const epochInfo = await api.getEpochInfo();
          setEpochProgress({
            epoch: epochInfo.epoch,
            slotIndex: epochInfo.slotIndex,
            slotsInEpoch: epochInfo.slotsInEpoch,
            progressPercent: (epochInfo.slotIndex / epochInfo.slotsInEpoch) * 100,
            slotTime: epochInfo.slotTime,
          });

          // Load each validator from API
          const loadedValidators: ValidatorData[] = [];
          for (const address of addresses) {
            try {
              const data = await api.getValidator(address);
              if (data) {
                loadedValidators.push(data);
              }
            } catch (error) {
              console.error(`Failed to load validator ${address}:`, error);
            }
          }

          if (loadedValidators.length > 0) {
            setValidators(loadedValidators);
          }
        } catch (error) {
          console.error("Error loading validators from API:", error);
          toast.error("Error loading validators");
        }
      }
      setInitialLoading(false);
    };

    loadValidators();
  }, []);

  // Fetch epoch progress when validators appear but epoch data is missing
  useEffect(() => {
    if (validators.length === 0 || epochProgress.slotsInEpoch > 0) return;

    const fetchEpochProgress = async () => {
      try {
        const epochInfo = await api.getEpochInfo();
        setEpochProgress({
          epoch: epochInfo.epoch,
          slotIndex: epochInfo.slotIndex,
          slotsInEpoch: epochInfo.slotsInEpoch,
          progressPercent: (epochInfo.slotIndex / epochInfo.slotsInEpoch) * 100,
          slotTime: epochInfo.slotTime,
        });
      } catch (error) {
        console.error("Failed to fetch epoch progress:", error);
      }
    };

    fetchEpochProgress();
  }, [validators.length, epochProgress.slotsInEpoch]);

  // Save monitored addresses to localStorage
  useEffect(() => {
    if (monitoredAddresses.length > 0) {
      localStorage.setItem("monitoredAddresses", JSON.stringify(monitoredAddresses));
    } else {
      localStorage.removeItem("monitoredAddresses");
    }
  }, [monitoredAddresses]);

  // Fetch or add a validator via API
  const fetchValidatorFromAPI = async (address: string): Promise<ValidatorData | null> => {
    // Try to get from DB first
    let data = await api.getValidator(address);
    if (!data) {
      // Not in DB yet - add it (server will fetch from RPC)
      data = await api.addValidator(address);
    }
    return data;
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
      // Fetch validator data and epoch progress in parallel
      const needsEpochProgress = epochProgress.slotsInEpoch === 0;
      const [data, epochData] = await Promise.all([
        fetchValidatorFromAPI(address),
        needsEpochProgress ? api.getEpochInfo().catch(() => null) : null,
      ]);

      if (!data) {
        toast.error("Validator not found", { id: toastId });
        return;
      }

      // Set epoch progress before validators so it's ready when the UI renders
      if (epochData) {
        setEpochProgress({
          epoch: epochData.epoch,
          slotIndex: epochData.slotIndex,
          slotsInEpoch: epochData.slotsInEpoch,
          progressPercent: (epochData.slotIndex / epochData.slotsInEpoch) * 100,
          slotTime: epochData.slotTime,
        });
      }

      setMonitoredAddresses(prev => {
        const newAddresses = prev.includes(address) ? prev : [...prev, address];

        setValidators(prevValidators => {
          const filtered = prevValidators.filter(v => v.voteAddress !== address);
          const updatedValidators = [...filtered, data];

          const sorted = updatedValidators.sort((a, b) => {
            const indexA = newAddresses.indexOf(a.voteAddress);
            const indexB = newAddresses.indexOf(b.voteAddress);
            return indexA - indexB;
          });

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

      setVoteAddress("");
      toast.success("Validator added successfully", { id: toastId });
    } catch (error) {
      console.error("Error fetching validator data:", error);
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
      const epochInfo = await api.getEpochInfo();
      const currentEpoch = epochInfo.epoch;

      // Update epoch progress
      setEpochProgress({
        epoch: epochInfo.epoch,
        slotIndex: epochInfo.slotIndex,
        slotsInEpoch: epochInfo.slotsInEpoch,
        progressPercent: (epochInfo.slotIndex / epochInfo.slotsInEpoch) * 100,
        slotTime: epochInfo.slotTime,
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

  const removeValidator = async (voteAddress: string) => {
    const validatorIndex = validators.findIndex(v => v.voteAddress === voteAddress);
    if (validatorIndex !== -1) {
      setOpenAccordions(prev => prev.filter(v => v !== `validator-${validatorIndex}`));
    }
    setValidators(validators.filter(v => v.voteAddress !== voteAddress));
    setMonitoredAddresses(prev => prev.filter(addr => addr !== voteAddress));

    try {
      await api.deleteValidator(voteAddress);
    } catch (error) {
      console.error("Failed to delete validator from server:", error);
    }
    toast.success("Validator removed");
  };

  const refreshAllValidators = async () => {
    if (monitoredAddresses.length === 0) {
      toast.error("No validators to refresh");
      return;
    }

    setRefreshing(true);
    const toastId = toast.loading("Syncing validator data...");

    try {
      const refreshedValidators: ValidatorData[] = [];
      for (const address of monitoredAddresses) {
        try {
          const data = await api.resyncValidator(address);
          if (data) {
            refreshedValidators.push(data);
          }
        } catch (error) {
          console.error(`Failed to resync validator ${address}:`, error);
        }
      }

      if (refreshedValidators.length > 0) {
        setValidators(refreshedValidators);
      }

      toast.success("All validators synced successfully", { id: toastId });
    } catch (error) {
      toast.error("Error syncing validators", { id: toastId });
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

  // Search validator suggestions from API
  const fetchValidatorSuggestions = async (query: string) => {
    if (!dashboardConfig.USE_AUTOCOMPLETE || query.length < 2) {
      setSuggestions([]);
      setAutocompleteOpen(false);
      return;
    }

    setLoadingSuggestions(true);
    try {
      const results = await api.searchValidators(query);
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
    <div className="min-h-screen flex flex-col">
      <header className="sticky-disabled top-0 z-10 border-b bg-card/70 backdrop-blur-xl">
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
              <Navigation showNavigation={true} />
              {monitoredAddresses.length > 0 && (
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
        <Card>
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
                <Card id='total-rewards'>
                  <CardHeader className="pb-3">
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                          <div className="flex items-center gap-2 cursor-help">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Coins className="h-4 w-4 text-primary"/>
                            </div>
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

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center">
                      <TrendingUp className="h-4 w-4 text-success"/>
                    </div>
                    <CardTitle className="text-base">Average Reward</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{formatXNT(averageCombinedReward)}</p>
                  <p className="text-xs text-muted-foreground mt-1">XNT per validator ({validators.length} monitored)</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <div className="flex items-center gap-2 cursor-help">
                        <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
                          <Coins className="h-4 w-4 text-accent"/>
                        </div>
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

              <Card className="relative">
                <CardHeader className="pb-3">
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <div className="flex items-center gap-2 cursor-help">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Calendar className="h-4 w-4 text-primary" />
                        </div>
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
                  <p className="text-3xl font-bold">{epochProgress.epoch || validators[0]?.currentEpoch || 0}</p>
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

      <Footer />
    </div>
    </ChartSettingsProvider>
  );
};
