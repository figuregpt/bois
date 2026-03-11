import { MemeToken } from "../events/types";

const BASE_URL = "https://api.dexscreener.com";

interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { symbol: string };
  priceUsd: string;
  priceChange: { h1?: number; h24?: number };
  volume: { h24?: number };
  liquidity: { usd?: number };
  fdv: number;
  marketCap: number;
  info?: { websites?: { url: string }[] };
  pairCreatedAt?: number;
}

let cachedTokens: MemeToken[] = [];
let lastFetch = 0;

export async function fetchTrendingSolanaTokens(): Promise<MemeToken[]> {
  try {
    // Fetch trending tokens on Solana
    const res = await fetch(`${BASE_URL}/token-boosts/latest/v1`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`DexScreener ${res.status}`);
    const data = (await res.json()) as { url: string; chainId: string; tokenAddress: string; description?: string }[];

    // Filter Solana tokens
    const solanaTokens = data.filter((t) => t.chainId === "solana").slice(0, 15);
    if (solanaTokens.length === 0) return cachedTokens;

    // Fetch pair data for each token
    const addresses = solanaTokens.map((t) => t.tokenAddress).join(",");
    const pairsRes = await fetch(`${BASE_URL}/tokens/v1/solana/${addresses}`, {
      headers: { Accept: "application/json" },
    });

    if (!pairsRes.ok) throw new Error(`DexScreener pairs ${pairsRes.status}`);
    const pairs = (await pairsRes.json()) as DexPair[];

    // Dedupe by base token address, take highest volume pair
    const tokenMap = new Map<string, DexPair>();
    for (const pair of pairs) {
      if (pair.chainId !== "solana") continue;
      const addr = pair.baseToken.address;
      const existing = tokenMap.get(addr);
      if (!existing || (pair.volume?.h24 || 0) > (existing.volume?.h24 || 0)) {
        tokenMap.set(addr, pair);
      }
    }

    const memeTokens: MemeToken[] = [];
    for (const [addr, pair] of tokenMap) {
      const mcap = pair.marketCap || pair.fdv || 0;
      if (mcap < 5000 || mcap > 50_000_000) continue; // filter to meme range

      const createdAt = pair.pairCreatedAt || Date.now();
      const ageMs = Date.now() - createdAt;
      const ageMin = Math.floor(ageMs / 60000);
      const launchedAgo = ageMin < 60 ? `${ageMin}m` : ageMin < 1440 ? `${Math.floor(ageMin / 60)}h` : `${Math.floor(ageMin / 1440)}d`;

      memeTokens.push({
        symbol: `$${pair.baseToken.symbol}`,
        name: pair.baseToken.name,
        address: addr,
        mcap,
        volume24h: pair.volume?.h24 || 0,
        holders: 0, // DexScreener doesn't provide holder count directly
        devHolding: 0, // would need on-chain query
        top10Holding: 0,
        priceChange1h: pair.priceChange?.h1 || 0,
        priceUsd: parseFloat(pair.priceUsd || "0"),
        launchedAgo,
        dexUrl: `https://dexscreener.com/solana/${addr}`,
      });
    }

    // Sort by volume
    memeTokens.sort((a, b) => b.volume24h - a.volume24h);
    cachedTokens = memeTokens.slice(0, 10);
    lastFetch = Date.now();
    console.log(`[DexScreener] Fetched ${cachedTokens.length} Solana tokens`);
    return cachedTokens;
  } catch (err) {
    console.error("[DexScreener] Error:", err);
    return cachedTokens; // return cached on failure
  }
}

export function getCachedTokens(): MemeToken[] {
  return cachedTokens;
}

export function getLastFetchTime(): number {
  return lastFetch;
}
