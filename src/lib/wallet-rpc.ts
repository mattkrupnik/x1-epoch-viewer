// Wallet RPC utilities for fetching token balances
import { x1Client } from "./x1-rpc";

export type WalletAccountType = "vote" | "stake" | "wallet";

export interface TokenBalance {
  mint: string;
  amount: number;
  decimals: number;
  uiAmount: number;
  symbol?: string;
  name?: string;
  logoURI?: string;
  price?: number;
  change24h?: number;
  valueUsd?: number;
}

export interface WalletBalance {
  address: string;
  solBalance: number;
  tokens: TokenBalance[];
  accountType: WalletAccountType;
  nativeLogo?: string;
  nativePrice?: number;
  nativeChange24h?: number;
}

// Program IDs for account type detection
const VOTE_PROGRAM_ID = "Vote111111111111111111111111111111111111111";
const STAKE_PROGRAM_ID = "Stake11111111111111111111111111111111111111";

// Token Program IDs (fallback path)
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const API_URL = import.meta.env.VITE_API_URL || '';

// Native XNT mint address as used by xDEX wallet API
const NATIVE_XNT_MINT = "111111111111111111111111111111111111111111";

interface XdexToken {
  mint: string;
  amount: number;
  decimals: number;
  ui_amount: number;
  symbol: string;
  name: string;
  imageUrl?: string;
  is_lp_token: boolean;
  isUnknown: boolean;
  price: number | null;
  change_24h: number | null;
  volume_usd: number;
}

function detectAccountTypeFromOwner(owner: string | undefined): WalletAccountType {
  if (owner === VOTE_PROGRAM_ID) return "vote";
  if (owner === STAKE_PROGRAM_ID) return "stake";
  return "wallet";
}

async function fetchXdexWalletTokens(address: string): Promise<XdexToken[] | null> {
  try {
    const res = await fetch(`${API_URL}/api/wallet-tokens?address=${encodeURIComponent(address)}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { success: boolean; data?: { tokens?: XdexToken[] } };
    return json?.data?.tokens ?? null;
  } catch {
    return null;
  }
}

export async function getWalletBalance(address: string): Promise<WalletBalance> {
  try {
    const [accountInfo, xdexTokens] = await Promise.all([
      x1Client.call("getAccountInfo", [address, { encoding: "jsonParsed" }]),
      fetchXdexWalletTokens(address),
    ]);

    const accountType = detectAccountTypeFromOwner(accountInfo?.value?.owner);

    // xDEX path — primary
    if (xdexTokens) {
      const nativeEntry = xdexTokens.find(t => t.mint === NATIVE_XNT_MINT);
      const solBalance = nativeEntry?.ui_amount ?? (accountInfo?.value?.lamports ?? 0) / 1e9;

      const tokens: TokenBalance[] = xdexTokens
        .filter(t => t.mint !== NATIVE_XNT_MINT && t.ui_amount > 0)
        .map(t => ({
          mint: t.mint,
          amount: t.amount,
          decimals: t.decimals,
          uiAmount: t.ui_amount,
          symbol: t.symbol,
          name: t.name,
          logoURI: t.imageUrl,
          price: t.price ?? undefined,
          change24h: t.change_24h ?? undefined,
          valueUsd: t.price != null ? t.ui_amount * t.price : undefined,
        }))
        .sort((a, b) => {
          const aHasPrice = a.price != null;
          const bHasPrice = b.price != null;
          if (aHasPrice !== bHasPrice) return aHasPrice ? -1 : 1;
          return aHasPrice
            ? (b.valueUsd ?? 0) - (a.valueUsd ?? 0)
            : b.uiAmount - a.uiAmount;
        });

      return {
        address,
        solBalance,
        tokens,
        accountType,
        nativeLogo: nativeEntry?.imageUrl,
        nativePrice: nativeEntry?.price ?? undefined,
        nativeChange24h: nativeEntry?.change_24h ?? undefined,
      };
    }

    // Fallback — xDEX unavailable, use RPC directly
    const [tokenAccountsLegacy, tokenAccounts2022] = await Promise.all([
      fetchTokenAccounts(address, TOKEN_PROGRAM_ID),
      fetchTokenAccounts(address, TOKEN_2022_PROGRAM_ID),
    ]);

    const lamports = accountInfo?.value?.lamports ?? 0;
    const solBalance = lamports / 1e9;
    const allTokenAccounts = [...tokenAccountsLegacy, ...tokenAccounts2022];
    const tokens: TokenBalance[] = [];

    for (const account of allTokenAccounts) {
      const info = account.account?.data?.parsed?.info;
      if (info) {
        const tokenAmount = info.tokenAmount;
        if (tokenAmount && tokenAmount.uiAmount > 0) {
          tokens.push({
            mint: info.mint,
            amount: parseInt(tokenAmount.amount),
            decimals: tokenAmount.decimals,
            uiAmount: tokenAmount.uiAmount,
            symbol: truncateAddress(info.mint),
            name: "Unknown Token",
          });
        }
      }
    }

    tokens.sort((a, b) => b.uiAmount - a.uiAmount);
    return { address, solBalance, tokens, accountType };
  } catch (error) {
    console.error("Failed to get wallet balance:", error);
    return { address, solBalance: 0, tokens: [], accountType: "wallet" };
  }
}

async function fetchTokenAccounts(owner: string, programId: string): Promise<unknown[]> {
  try {
    const result = await x1Client.call("getTokenAccountsByOwner", [
      owner,
      { programId },
      { encoding: "jsonParsed" },
    ]);
    return (result?.value as unknown[]) || [];
  } catch {
    return [];
  }
}

export async function getMultipleWalletBalances(addresses: string[]): Promise<WalletBalance[]> {
  return Promise.all(addresses.map(getWalletBalance));
}

function truncateAddress(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
