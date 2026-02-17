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
}

export interface WalletBalance {
  address: string;
  solBalance: number;
  tokens: TokenBalance[];
  accountType: WalletAccountType;
}

// Program IDs for account type detection
const VOTE_PROGRAM_ID = "Vote111111111111111111111111111111111111111";
const STAKE_PROGRAM_ID = "Stake11111111111111111111111111111111111111";

// Token Program IDs
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

// Metaplex Token Metadata Program
const METAPLEX_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

// Cache for token metadata to avoid repeated RPC calls
const metadataCache: Map<string, { symbol: string; name: string; logoURI?: string }> = new Map();

function detectAccountTypeFromOwner(owner: string | undefined): WalletAccountType {
  if (owner === VOTE_PROGRAM_ID) return "vote";
  if (owner === STAKE_PROGRAM_ID) return "stake";
  return "wallet";
}

export async function getWalletBalance(address: string): Promise<WalletBalance> {
  try {
    // Get account info (balance + owner/type), and token accounts in parallel
    const [accountInfo, tokenAccountsLegacy, tokenAccounts2022] = await Promise.all([
      x1Client.call("getAccountInfo", [address, { encoding: "jsonParsed" }]),
      fetchTokenAccounts(address, TOKEN_PROGRAM_ID),
      fetchTokenAccounts(address, TOKEN_2022_PROGRAM_ID),
    ]);
    // Extract balance and account type from single getAccountInfo call
    const lamports = accountInfo?.value?.lamports ?? 0;
    const solBalance = lamports / 1e9;
    const accountType = detectAccountTypeFromOwner(accountInfo?.value?.owner);

    const allTokenAccounts = [...tokenAccountsLegacy, ...tokenAccounts2022];
    
    // Get unique mints for metadata fetching
    const mints = allTokenAccounts
      .map(acc => acc.account?.data?.parsed?.info?.mint)
      .filter((mint): mint is string => !!mint);
    
    // Fetch metadata
    await fetchTokenMetadataBatch(mints);

    const tokens: TokenBalance[] = [];

    for (const account of allTokenAccounts) {
      const info = account.account?.data?.parsed?.info;
      if (info) {
        const mint = info.mint;
        const tokenAmount = info.tokenAmount;
        
        if (tokenAmount && tokenAmount.uiAmount > 0) {
          const metadata = metadataCache.get(mint);
          
          tokens.push({
            mint,
            amount: parseInt(tokenAmount.amount),
            decimals: tokenAmount.decimals,
            uiAmount: tokenAmount.uiAmount,
            symbol: metadata?.symbol || truncateAddress(mint),
            name: metadata?.name || "Unknown Token",
            logoURI: metadata?.logoURI,
          });
        }
      }
    }

    // Sort tokens by uiAmount (highest first)
    tokens.sort((a, b) => b.uiAmount - a.uiAmount);

    return {
      address,
      solBalance,
      tokens,
      accountType,
    };
  } catch (error) {
    console.error("Failed to get wallet balance:", error);
    return {
      address,
      solBalance: 0,
      tokens: [],
      accountType: "wallet",
    };
  }
}

async function fetchTokenAccounts(owner: string, programId: string): Promise<any[]> {
  try {
    const result = await x1Client.call("getTokenAccountsByOwner", [
      owner,
      { programId },
      { encoding: "jsonParsed" }
    ]);
    return result?.value || [];
  } catch (error) {
    console.error(`Failed to fetch token accounts for program ${programId}:`, error);
    return [];
  }
}

// Derive Metaplex metadata PDA address
function getMetadataPDA(mint: string): string {
  // This is a simplified approach - we'll use the RPC to fetch the account directly
  // The actual PDA derivation requires the proper seeds: ["metadata", metaplex_program_id, mint]
  // For now, we'll try to fetch metadata using getProgramAccounts
  return mint;
}

async function fetchTokenMetadataBatch(mints: string[]): Promise<void> {
  const unknownMints = mints.filter(mint => !metadataCache.has(mint));
  
  if (unknownMints.length === 0) return;

  // Try to fetch metadata for each mint
  // Using Promise.allSettled to handle individual failures gracefully
  await Promise.allSettled(
    unknownMints.map(async (mint) => {
      try {
        // Try to get token metadata from Metaplex
        const metadata = await fetchMetaplexMetadata(mint);
        if (metadata) {
          metadataCache.set(mint, metadata);
        }
      } catch (error) {
        // Silently fail for individual tokens
        console.debug(`Failed to fetch metadata for ${mint}`);
      }
    })
  );
}

async function fetchMetaplexMetadata(mint: string): Promise<{ symbol: string; name: string; logoURI?: string } | null> {
  try {
    // First, try to get mint account info for Token-2022 tokens with extensions
    const mintInfo = await fetchMintAccountInfo(mint);
    if (mintInfo) {
      // If we have a URI from mint extensions, fetch metadata from it
      if (mintInfo.uri) {
        const jsonMetadata = await fetchJsonMetadata(mintInfo.uri);
        if (jsonMetadata) {
          return {
            name: jsonMetadata.name || mintInfo.name || "Unknown Token",
            symbol: jsonMetadata.symbol || mintInfo.symbol || truncateAddress(mint),
            logoURI: jsonMetadata.image || jsonMetadata.logoURI || undefined,
          };
        }
      }
      if (mintInfo.name || mintInfo.symbol) {
        return {
          name: mintInfo.name || "Unknown Token",
          symbol: mintInfo.symbol || truncateAddress(mint),
          logoURI: undefined,
        };
      }
    }

    // Try to find Metaplex metadata PDA
    const accountsBase64 = await x1Client.call("getProgramAccounts", [
      METAPLEX_PROGRAM_ID,
      {
        encoding: "base64",
        filters: [
          {
            memcmp: {
              offset: 33,
              bytes: mint
            }
          }
        ]
      }
    ]);

    if (accountsBase64 && accountsBase64.length > 0) {
      const base64Data = accountsBase64[0]?.account?.data?.[0];
      if (base64Data) {
        const metadata = parseMetaplexMetadata(base64Data);
        if (metadata) {
          // If we have a URI, fetch the JSON metadata
          if (metadata.logoURI && metadata.logoURI.startsWith('http')) {
            const jsonMetadata = await fetchJsonMetadata(metadata.logoURI);
            if (jsonMetadata) {
              return {
                name: jsonMetadata.name || metadata.name,
                symbol: jsonMetadata.symbol || metadata.symbol,
                logoURI: jsonMetadata.image || jsonMetadata.logoURI || undefined,
              };
            }
          }
          return metadata;
        }
      }
    }

    return null;
  } catch (error) {
    console.debug(`Failed to fetch Metaplex metadata for ${mint}:`, error);
    return null;
  }
}

async function fetchMintAccountInfo(mint: string): Promise<{ name?: string; symbol?: string; uri?: string } | null> {
  try {
    const result = await x1Client.call("getAccountInfo", [
      mint,
      { encoding: "jsonParsed" }
    ]);
    
    if (result?.value?.data?.parsed?.info) {
      const info = result.value.data.parsed.info;
      // Check for Token-2022 extensions
      const extensions = info.extensions || [];
      
      for (const ext of extensions) {
        if (ext.extension === "tokenMetadata") {
          const state = ext.state || {};
          return {
            name: state.name || undefined,
            symbol: state.symbol || undefined,
            uri: state.uri || undefined,
          };
        }
      }
    }
    
    return null;
  } catch (error) {
    console.debug(`Failed to fetch mint account info for ${mint}:`, error);
    return null;
  }
}

async function fetchJsonMetadata(uri: string): Promise<{ name?: string; symbol?: string; image?: string; logoURI?: string } | null> {
  try {
    // Handle IPFS URIs
    let fetchUrl = uri;
    if (uri.startsWith('ipfs://')) {
      fetchUrl = `https://ipfs.io/ipfs/${uri.slice(7)}`;
    }
    
    const response = await fetch(fetchUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.debug(`Failed to fetch JSON metadata from ${fetchUrl}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    return {
      name: data.name || undefined,
      symbol: data.symbol || undefined,
      image: data.image || undefined,
      logoURI: data.logoURI || undefined,
    };
  } catch (error) {
    console.debug(`Failed to fetch JSON metadata from ${uri}:`, error);
    return null;
  }
}

function parseMetaplexMetadata(base64Data: string): { symbol: string; name: string; logoURI?: string } | null {
  try {
    const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    // Metaplex metadata structure (simplified):
    // - 1 byte: key
    // - 32 bytes: update authority
    // - 32 bytes: mint
    // - 4 bytes: name length prefix + name (variable)
    // - 4 bytes: symbol length prefix + symbol (variable)
    // - 4 bytes: uri length prefix + uri (variable)
    
    let offset = 1 + 32 + 32; // Skip key, update authority, mint
    
    // Read name
    const nameLength = new DataView(buffer.buffer).getUint32(offset, true);
    offset += 4;
    const name = new TextDecoder().decode(buffer.slice(offset, offset + nameLength)).replace(/\0/g, '').trim();
    offset += nameLength;
    
    // Read symbol
    const symbolLength = new DataView(buffer.buffer).getUint32(offset, true);
    offset += 4;
    const symbol = new TextDecoder().decode(buffer.slice(offset, offset + symbolLength)).replace(/\0/g, '').trim();
    offset += symbolLength;
    
    // Read URI
    const uriLength = new DataView(buffer.buffer).getUint32(offset, true);
    offset += 4;
    const uri = new TextDecoder().decode(buffer.slice(offset, offset + uriLength)).replace(/\0/g, '').trim();
    
    if (name || symbol) {
      return {
        name: name || "Unknown Token",
        symbol: symbol || truncateAddress(""),
        logoURI: uri || undefined,
      };
    }
    
    return null;
  } catch (error) {
    console.debug("Failed to parse Metaplex metadata:", error);
    return null;
  }
}

export async function getMultipleWalletBalances(addresses: string[]): Promise<WalletBalance[]> {
  const results = await Promise.all(addresses.map(getWalletBalance));
  return results;
}

function truncateAddress(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
