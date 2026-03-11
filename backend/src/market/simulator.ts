import { MarketState } from "../events/types";
import { fetchTrendingSolanaTokens, getCachedTokens } from "./dexscreener";
import { fetchActiveMarkets, getCachedMarkets } from "./polymarket";
import { fetchHyperliquidData, calculateRSI, getCachedPrices, getCachedVolume, getCachedFunding } from "./hyperliquid";

const marketEvents: string[] = [];
let previousPrices: Record<string, number> = {};

// Fetch intervals
let hlTimer: ReturnType<typeof setInterval> | null = null;
let dexTimer: ReturnType<typeof setInterval> | null = null;
let polyTimer: ReturnType<typeof setInterval> | null = null;

export async function startMarketFeeds(): Promise<void> {
  console.log("[Market] Starting real market data feeds...");

  // Initial fetches
  await Promise.all([
    fetchHyperliquidData(),
    fetchTrendingSolanaTokens(),
    fetchActiveMarkets(),
  ]);

  previousPrices = { ...getCachedPrices() };

  // Hyperliquid prices every 30 seconds
  hlTimer = setInterval(async () => {
    const oldPrices = { ...getCachedPrices() };
    await fetchHyperliquidData();
    const newPrices = getCachedPrices();

    // Generate events from price movements
    for (const [symbol, newPrice] of Object.entries(newPrices)) {
      const oldPrice = oldPrices[symbol];
      if (!oldPrice) continue;
      const changePercent = ((newPrice - oldPrice) / oldPrice) * 100;
      if (Math.abs(changePercent) > 1) {
        addEvent(`${symbol} ${changePercent > 0 ? "+" : ""}${changePercent.toFixed(1)}% in last tick ($${newPrice.toFixed(2)})`);
      }
    }

    // RSI-based events
    const rsi = calculateRSI();
    for (const [symbol, value] of Object.entries(rsi)) {
      if (value < 30) addEvent(`${symbol} RSI at ${value.toFixed(0)} — oversold signal`);
      else if (value > 70) addEvent(`${symbol} RSI at ${value.toFixed(0)} — overbought signal`);
    }
  }, 30_000);

  // DexScreener tokens every 60 seconds
  dexTimer = setInterval(async () => {
    await fetchTrendingSolanaTokens();
  }, 60_000);

  // Polymarket every 5 minutes
  polyTimer = setInterval(async () => {
    await fetchActiveMarkets();
  }, 5 * 60_000);

  console.log("[Market] All feeds started: HL/30s, DexScreener/60s, Polymarket/5m");
}

export function stopMarketFeeds(): void {
  if (hlTimer) clearInterval(hlTimer);
  if (dexTimer) clearInterval(dexTimer);
  if (polyTimer) clearInterval(polyTimer);
}

function addEvent(event: string): void {
  marketEvents.push(event);
  if (marketEvents.length > 30) marketEvents.shift();
}

// Keep tick() for backwards compat — now it's a no-op since feeds auto-update
export function tick(): void {
  // Real data fetched by intervals above
}

export function getMarketState(): MarketState {
  const prices = getCachedPrices();
  const volume24h = getCachedVolume();
  const fundingRates = getCachedFunding();
  const rsi = calculateRSI();
  const memeTokens = getCachedTokens();
  const polymarketMarkets = getCachedMarkets();

  return {
    prices: { ...prices },
    rsi: { ...rsi },
    volume24h: { ...volume24h },
    fundingRates: { ...fundingRates },
    events: [...marketEvents].slice(-10),
    memeTokens: memeTokens.map((t) => ({ ...t })),
    polymarketMarkets: polymarketMarkets.map((m) => ({ ...m })),
  };
}
