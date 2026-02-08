// X1 Network RPC client for Node.js server
const RPC_URL = process.env.X1_RPC_URL || 'https://rpc.mainnet.x1.xyz';
const SINGLE_CALL_TIMEOUT_MS = 15_000;
const BATCH_CALL_TIMEOUT_MS = 30_000;

export interface EpochInfo {
  epoch: number;
  slotIndex: number;
  slotsInEpoch: number;
  absoluteSlot: number;
}

export class X1RpcClient {
  private rpcUrl: string;

  constructor(rpcUrl: string = RPC_URL) {
    this.rpcUrl = rpcUrl;
  }

  async call(method: string, params: any[] = []): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SINGLE_CALL_TIMEOUT_MS);

    try {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params,
        }),
        signal: controller.signal,
      });

      const data = await response.json() as any;

      if (data.error) {
        throw new Error(`RPC error (${method}): ${data.error.message}`);
      }

      return data.result;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async batchCall(requests: Array<{ method: string; params: any[] }>): Promise<any[]> {
    const BATCH_SIZE = 50;
    const allResults: any[] = [];

    for (let i = 0; i < requests.length; i += BATCH_SIZE) {
      const chunk = requests.slice(i, i + BATCH_SIZE);
      const chunkResults = await this.executeBatchChunk(chunk, i);
      allResults.push(...chunkResults);
    }

    return allResults;
  }

  private async executeBatchChunk(requests: Array<{ method: string; params: any[] }>, startIndex: number): Promise<any[]> {
    const body = requests.map((req, index) => ({
      jsonrpc: '2.0',
      id: startIndex + index + 1,
      method: req.method,
      params: req.params,
    }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BATCH_CALL_TIMEOUT_MS);

    try {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;

      if (Array.isArray(data)) {
        const sorted = data.sort((a: any, b: any) => a.id - b.id);
        return sorted.map((item: any) => {
          if (item.error) return null;
          return item.result;
        });
      }

      throw new Error('Invalid batch response format');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getEpochInfo(): Promise<EpochInfo> {
    return await this.call('getEpochInfo');
  }

  async getRecentPerformanceSamples(limit: number = 1): Promise<any[]> {
    return await this.call('getRecentPerformanceSamples', [limit]);
  }

  async getVoteAccounts(): Promise<{ current: any[]; delinquent: any[] }> {
    return await this.call('getVoteAccounts');
  }

  async getInflationReward(addresses: string[], epoch?: number): Promise<any> {
    const params = epoch !== undefined ? [addresses, { epoch }] : [addresses];
    return await this.call('getInflationReward', params);
  }

  async getBlockTime(slot: number): Promise<number | null> {
    return await this.call('getBlockTime', [slot]);
  }

  async getBlockProduction(epoch?: number): Promise<any> {
    const params: any = {};
    if (epoch !== undefined) params.epoch = epoch;
    return await this.call('getBlockProduction', [params]);
  }

  async getMultipleAccounts(pubkeys: string[]): Promise<any> {
    return await this.call('getMultipleAccounts', [pubkeys, { encoding: 'base64' }]);
  }

  async getProgramAccounts(programId: string, config?: any): Promise<any[]> {
    return await this.call('getProgramAccounts', [programId, config]);
  }

  async getStakeAccountsForVote(voteAddress: string, identityAddress?: string): Promise<string[]> {
    const STAKE_PROGRAM_ID = 'Stake11111111111111111111111111111111111111';

    try {
      // Get vote account info for withdrawer
      let voteWithdrawer: string | null = null;
      try {
        const voteAccountInfo = await this.call('getAccountInfo', [voteAddress, { encoding: 'jsonParsed' }]);
        if (voteAccountInfo?.value?.data?.parsed?.info?.authorizedWithdrawer) {
          voteWithdrawer = voteAccountInfo.value.data.parsed.info.authorizedWithdrawer;
        }
      } catch {
        // Silently fail
      }

      // Get all stake accounts delegated to voteAddress
      const accounts: any[] = await this.getProgramAccounts(STAKE_PROGRAM_ID, {
        encoding: 'jsonParsed',
        filters: [
          { memcmp: { offset: 124, bytes: voteAddress } }
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
      console.error('Failed to fetch stake accounts for vote:', err);
      return [];
    }
  }
}

export const x1Client = new X1RpcClient();
