const API_URL = "https://api.hyperliquid.xyz";

interface AssetCtx {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string;
  oraclePx: string;
  markPx: string;
  midPx?: string;
  impactPxs?: string[];
}

interface MetaAndCtx {
  meta: { universe: { name: string; szDecimals: number }[] };
  assetCtxs: AssetCtx[];
}

// Track prices + history for RSI calculation
let cachedPrices: Record<string, number> = {};
let cachedVolume: Record<string, number> = {};
let cachedFunding: Record<string, number> = {};
let priceHistory: Record<string, number[]> = {};
let lastFetch = 0;

// Symbols we care about
const TRACKED = ["SOL", "ETH", "BTC", "BONK", "WIF", "JUP", "DOGE", "AVAX"];

export async function fetchHyperliquidData(): Promise<{
  prices: Record<string, number>;
  volume24h: Record<string, number>;
  fundingRates: Record<string, number>;
}> {
  try {
    const res = await fetch(`${API_URL}/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
    });
    if (!res.ok) throw new Error(`Hyperliquid ${res.status}`);
    const data = (await res.json()) as [MetaAndCtx["meta"], AssetCtx[]];

    const meta = data[0];
    const ctxs = data[1];

    const prices: Record<string, number> = {};
    const volume: Record<string, number> = {};
    const funding: Record<string, number> = {};

    for (let i = 0; i < meta.universe.length; i++) {
      const name = meta.universe[i].name;
      if (!TRACKED.includes(name)) continue;
      const ctx = ctxs[i];
      if (!ctx) continue;

      const price = parseFloat(ctx.markPx || ctx.oraclePx || "0");
      if (price > 0) {
        prices[name] = price;
        volume[name] = parseFloat(ctx.dayNtlVlm || "0");
        funding[name] = parseFloat(ctx.funding || "0");

        // Track price history for RSI (keep last 14 ticks)
        if (!priceHistory[name]) priceHistory[name] = [];
        priceHistory[name].push(price);
        if (priceHistory[name].length > 14) priceHistory[name].shift();
      }
    }

    cachedPrices = prices;
    cachedVolume = volume;
    cachedFunding = funding;
    lastFetch = Date.now();
    console.log(`[Hyperliquid] Prices: SOL $${prices.SOL?.toFixed(2)}, ETH $${prices.ETH?.toFixed(0)}, BTC $${prices.BTC?.toFixed(0)}`);
    return { prices, volume24h: volume, fundingRates: funding };
  } catch (err) {
    console.error("[Hyperliquid] Error:", err);
    return { prices: cachedPrices, volume24h: cachedVolume, fundingRates: cachedFunding };
  }
}

// Simple RSI calculation from price history
export function calculateRSI(): Record<string, number> {
  const rsi: Record<string, number> = {};
  for (const [symbol, history] of Object.entries(priceHistory)) {
    if (history.length < 3) {
      rsi[symbol] = 50; // neutral if not enough data
      continue;
    }
    let gains = 0;
    let losses = 0;
    for (let i = 1; i < history.length; i++) {
      const change = history[i] - history[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const periods = history.length - 1;
    const avgGain = gains / periods;
    const avgLoss = losses / periods;
    if (avgLoss === 0) {
      rsi[symbol] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi[symbol] = 100 - 100 / (1 + rs);
    }
  }
  return rsi;
}

export function getCachedPrices(): Record<string, number> {
  return cachedPrices;
}

export function getCachedVolume(): Record<string, number> {
  return cachedVolume;
}

export function getCachedFunding(): Record<string, number> {
  return cachedFunding;
}

export function getLastFetchTime(): number {
  return lastFetch;
}

export function getTradeUrl(symbol: string): string {
  return `https://app.hyperliquid.xyz/trade/${symbol}`;
}

// ═══ ALL PERPS (for terminal page) ═══

export interface HyperliquidPerp {
  symbol: string;
  markPx: number;
  oraclePx: number;
  prevDayPx: number;
  dayNtlVlm: number;
  funding: number;
  openInterest: number;
  change24h: number;
  tradeUrl: string;
}

let cachedAllPerps: HyperliquidPerp[] = [];
let allPerpsLastFetch = 0;

export async function fetchAllPerps(): Promise<HyperliquidPerp[]> {
  if (Date.now() - allPerpsLastFetch < 30_000 && cachedAllPerps.length > 0) {
    return cachedAllPerps;
  }
  try {
    const res = await fetch(`${API_URL}/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
    });
    if (!res.ok) throw new Error(`Hyperliquid ${res.status}`);
    const data = (await res.json()) as [MetaAndCtx["meta"], AssetCtx[]];
    const meta = data[0];
    const ctxs = data[1];

    const perps: HyperliquidPerp[] = [];
    for (let i = 0; i < meta.universe.length; i++) {
      const name = meta.universe[i].name;
      const ctx = ctxs[i];
      if (!ctx) continue;
      const markPx = parseFloat(ctx.markPx || "0");
      const prevDayPx = parseFloat(ctx.prevDayPx || "0");
      if (markPx <= 0) continue;

      perps.push({
        symbol: name,
        markPx,
        oraclePx: parseFloat(ctx.oraclePx || "0"),
        prevDayPx,
        dayNtlVlm: parseFloat(ctx.dayNtlVlm || "0"),
        funding: parseFloat(ctx.funding || "0"),
        openInterest: parseFloat(ctx.openInterest || "0"),
        change24h: prevDayPx > 0 ? ((markPx - prevDayPx) / prevDayPx) * 100 : 0,
        tradeUrl: `https://app.hyperliquid.xyz/trade/${name}`,
      });
    }

    cachedAllPerps = perps;
    allPerpsLastFetch = Date.now();
    return perps;
  } catch (err) {
    console.error("[Hyperliquid] fetchAllPerps error:", err);
    return cachedAllPerps;
  }
}
