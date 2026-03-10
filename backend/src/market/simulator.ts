import { MarketState, MemeToken, PolyMarket } from "../events/types";

// Base prices
const basePrices: Record<string, number> = {
  SOL: 187.5, ETH: 3842, BTC: 98500,
  BONK: 0.00001823, WIF: 0.452, JUP: 0.82,
};

// Current prices (mutated each tick)
const prices: Record<string, number> = { ...basePrices };
const rsi: Record<string, number> = { SOL: 52, ETH: 48, BTC: 55, BONK: 61, WIF: 44 };
const volume24h: Record<string, number> = { SOL: 2_400_000, ETH: 1_800_000, BTC: 5_200_000, BONK: 890_000, WIF: 340_000 };

const marketEvents: string[] = [];

// Meme token pool — new ones "launch" randomly
const memePool: MemeToken[] = [
  { symbol: "$ZDOG", name: "ZenDog", mcap: 45_000, volume24h: 12_000, holders: 87, devHolding: 4.2, top10Holding: 35, priceChange1h: 234, launchedAgo: "12m" },
  { symbol: "$PNUT", name: "PeanutCoin", mcap: 120_000, volume24h: 34_000, holders: 210, devHolding: 2.1, top10Holding: 28, priceChange1h: 89, launchedAgo: "45m" },
  { symbol: "$REKT", name: "GetRekt", mcap: 8_000, volume24h: 2_100, holders: 34, devHolding: 12, top10Holding: 65, priceChange1h: -42, launchedAgo: "5m" },
  { symbol: "$MOON", name: "MoonShot", mcap: 380_000, volume24h: 95_000, holders: 520, devHolding: 1.8, top10Holding: 22, priceChange1h: 156, launchedAgo: "2h" },
  { symbol: "$COPE", name: "CopeCoin", mcap: 62_000, volume24h: 8_400, holders: 145, devHolding: 6.5, top10Holding: 41, priceChange1h: -15, launchedAgo: "1h" },
  { symbol: "$NEKO", name: "NekoToken", mcap: 230_000, volume24h: 67_000, holders: 380, devHolding: 0.5, top10Holding: 18, priceChange1h: 312, launchedAgo: "30m" },
];

// Polymarket markets
const polyMarkets: PolyMarket[] = [
  { id: "sol-300", question: "Will SOL hit $300 by June 2026?", category: "crypto", yesPrice: 0.34, volume: 450_000, endDate: "2026-06-30", recentMove: "+0.04 in 2h" },
  { id: "eth-etf", question: "Ethereum staking ETF approved in 2026?", category: "crypto", yesPrice: 0.62, volume: 1_200_000, endDate: "2026-12-31", recentMove: "-0.03 in 6h" },
  { id: "fed-cut", question: "Fed rate cut before April 2026?", category: "politics", yesPrice: 0.45, volume: 890_000, endDate: "2026-04-30", recentMove: "+0.08 in 1h" },
  { id: "btc-150k", question: "Bitcoin above $150K by end of 2026?", category: "crypto", yesPrice: 0.28, volume: 2_100_000, endDate: "2026-12-31", recentMove: "+0.02 in 4h" },
  { id: "trump-crypto", question: "US crypto regulation bill passed in 2026?", category: "politics", yesPrice: 0.71, volume: 560_000, endDate: "2026-12-31", recentMove: "-0.05 in 12h" },
  { id: "sol-flip-eth", question: "SOL market cap > ETH in 2026?", category: "crypto", yesPrice: 0.12, volume: 340_000, endDate: "2026-12-31", recentMove: "+0.01 in 8h" },
];

function randomWalk(value: number, volatilityPercent: number): number {
  const change = value * (volatilityPercent / 100) * (Math.random() * 2 - 1);
  return Math.max(value * 0.7, value + change); // floor at 70% of value
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function tick(): void {
  // Update prices
  prices.SOL = randomWalk(prices.SOL, 0.8);
  prices.ETH = randomWalk(prices.ETH, 0.6);
  prices.BTC = randomWalk(prices.BTC, 0.5);
  prices.BONK = randomWalk(prices.BONK, 3);
  prices.WIF = randomWalk(prices.WIF, 2.5);
  prices.JUP = randomWalk(prices.JUP, 1.5);

  // Update RSI with random drift
  for (const key of Object.keys(rsi)) {
    rsi[key] = Math.max(10, Math.min(90, rsi[key] + (Math.random() * 10 - 5)));
  }

  // Update volumes
  for (const key of Object.keys(volume24h)) {
    volume24h[key] = randomWalk(volume24h[key], 5);
  }

  // Update polymarket prices
  for (const m of polyMarkets) {
    const oldPrice = m.yesPrice;
    m.yesPrice = Math.max(0.02, Math.min(0.98, m.yesPrice + (Math.random() * 0.06 - 0.03)));
    const diff = m.yesPrice - oldPrice;
    m.recentMove = `${diff >= 0 ? "+" : ""}${diff.toFixed(2)} in last tick`;
  }

  // Update meme tokens
  for (const t of memePool) {
    t.mcap = randomWalk(t.mcap, 8);
    t.volume24h = randomWalk(t.volume24h, 10);
    t.holders = Math.max(10, Math.floor(t.holders + Math.random() * 20 - 8));
    t.priceChange1h = Math.floor(Math.random() * 400 - 100);
  }

  // Random market events (30% chance per tick)
  if (Math.random() < 0.3) {
    const eventTemplates = [
      `$BONK volume spike +${Math.floor(Math.random() * 500)}% in 1h`,
      `SOL RSI at ${Math.floor(rsi.SOL)} — ${rsi.SOL < 30 ? "oversold signal" : rsi.SOL > 70 ? "overbought signal" : "neutral"}`,
      `New token launched: ${randomFrom(memePool).symbol} — mcap $${Math.floor(randomFrom(memePool).mcap / 1000)}K`,
      `Whale moved ${Math.floor(Math.random() * 50_000)} SOL to Binance`,
      `Polymarket: "${randomFrom(polyMarkets).question}" moved ${randomFrom(polyMarkets).recentMove}`,
      `ETH gas fees dropped to ${Math.floor(Math.random() * 20 + 5)} gwei`,
      `${randomFrom(["Binance", "Coinbase", "Bybit"])} listed ${randomFrom(memePool).symbol}`,
      `Liquidation cascade: $${Math.floor(Math.random() * 50 + 10)}M in ${Math.random() > 0.5 ? "longs" : "shorts"} liquidated`,
    ];
    const event = randomFrom(eventTemplates);
    marketEvents.push(event);
    if (marketEvents.length > 30) marketEvents.shift();
  }
}

export function getMarketState(): MarketState {
  return {
    prices: { ...prices },
    rsi: { ...rsi },
    volume24h: { ...volume24h },
    events: [...marketEvents].slice(-10),
    memeTokens: memePool.map((t) => ({ ...t })),
    polymarketMarkets: polyMarkets.map((m) => ({ ...m })),
  };
}
