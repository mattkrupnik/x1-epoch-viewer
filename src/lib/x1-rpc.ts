// X1 Network RPC utilities
// Route all RPC calls through the backend proxy to avoid CORS issues
const API_URL = import.meta.env.VITE_API_URL || '';
const RPC_URL = `${API_URL}/api/rpc`;

export interface EpochInfo {
  epoch: number;
  slotIndex: number;
  slotsInEpoch: number;
}

export interface ValidatorReward {
  epoch: number;
  amount: number;
  commission: number;
}

export class X1RpcClient {
  private rpcUrl: string;

  constructor(rpcUrl: string = RPC_URL) {
    this.rpcUrl = rpcUrl;
  }

  async call(method: string, params: any[] = []) {
    try {
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params,
        }),
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message);
      }

      return data.result;
    } catch (error) {
      console.error(`RPC call failed for ${method}:`, error);
      throw error;
    }
  }

  async batchCall(requests: Array<{ method: string; params: any[] }>) {
    // Chunk requests into smaller batches to avoid 413 Content Too Large error
    const BATCH_SIZE = 50;
    const allResults: any[] = [];
    
    for (let i = 0; i < requests.length; i += BATCH_SIZE) {
      const chunk = requests.slice(i, i + BATCH_SIZE);
      const chunkResults = await this.executeBatchChunk(chunk, i);
      allResults.push(...chunkResults);
    }
    
    return allResults;
  }

  private async executeBatchChunk(requests: Array<{ method: string; params: any[] }>, startIndex: number) {
    try {
      const body = requests.map((req, index) => ({
        jsonrpc: "2.0",
        id: startIndex + index + 1,
        method: req.method,
        params: req.params,
      }));

      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (Array.isArray(data)) {
        // Sort by id to ensure correct order
        const sorted = data.sort((a, b) => a.id - b.id);
        return sorted.map(item => {
          if (item.error) {
            // Silently return null for errors (e.g., historical data not available)
            // Common errors: -32004 (block not available), -32018 (rewards not found)
            return null;
          }
          return item.result;
        });
      }

      throw new Error("Invalid batch response format");
    } catch (error) {
      console.error(`Batch RPC chunk failed:`, error);
      throw error;
    }
  }

  async getEpochInfo(): Promise<EpochInfo> {
    return await this.call("getEpochInfo");
  }

  async getRecentPerformanceSamples(): Promise<EpochInfo> {
    return await this.call("getRecentPerformanceSamples",[1]);
  }

  async getVoteAccounts(voteAddress?: string) {
    const result = await this.call("getVoteAccounts");
    
    if (voteAddress) {
      // Filter for specific validator
      const allValidators = [...result.current, ...result.delinquent];
      return allValidators.find((v: any) => v.votePubkey === voteAddress);
    }
    
    return result;
  }

  async getInflationReward(addresses: string[], epoch?: number) {
    const params = epoch ? [addresses, { epoch }] : [addresses];
    return await this.call("getInflationReward", params);
  }

  async getBlockProduction(epoch?: number) {
    const params: any = {};
    if (epoch !== undefined) {
      params.epoch = epoch;
    }
    return await this.call("getBlockProduction", [params]);
  }

  async getProgramAccounts(programId: string, config?: any) {
    return await this.call("getProgramAccounts", [programId, config]);
  }

  async getAccountInfo(pubkey: string) {
    return await this.call("getAccountInfo", [pubkey, { encoding: "base64" }]);
  }

  async getMultipleAccounts(pubkeys: string[]) {
    return await this.call("getMultipleAccounts", [pubkeys, { encoding: "base64" }]);
  }

  async getStakeAccountsForVote(voteAddress: string, identityAddress?: string) {
    const STAKE_PROGRAM_ID = "Stake11111111111111111111111111111111111111";

    try {
      // Pobierz vote account info aby uzyskać vote withdrawer
      let voteWithdrawer: string | null = null;
      try {
        const voteAccountInfo = await this.call("getAccountInfo", [voteAddress, { encoding: "jsonParsed" }]);
        if (voteAccountInfo?.value?.data?.parsed?.info?.authorizedWithdrawer) {
          voteWithdrawer = voteAccountInfo.value.data.parsed.info.authorizedWithdrawer;
        }
      } catch (err) {
        // Silently fail if vote account info is not available
      }

      // Pobierz wszystkie stake accounts zdelegowane do voteAddress
      const accounts: any[] = await this.getProgramAccounts(STAKE_PROGRAM_ID, {
        encoding: "jsonParsed",
        filters: [
          {
            memcmp: { offset: 124, bytes: voteAddress }
          }
        ]
      });

      const identityBase58 = identityAddress ?? null;

      const selfStakeAccounts = accounts.filter((acc: any) => {
        const info = acc.account?.data?.parsed?.info;
        
        const staker = info?.meta?.authorized?.staker ?? null;
        const withdrawer = info?.meta?.authorized?.withdrawer ?? null;

        if (!identityBase58 && !voteWithdrawer) return true;

        return (
          staker === identityBase58 || 
          staker === voteAddress || 
          withdrawer === identityBase58 ||
          (voteWithdrawer && withdrawer === voteWithdrawer)
        );
      });

      return selfStakeAccounts.map((acc: any) => acc.pubkey);

    } catch (err) {
      console.error("Failed to fetch stake accounts for vote:", err);
      return [];
    }
  }

}

export const x1Client = new X1RpcClient();
