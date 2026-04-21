import { PolyMarket } from "../events/types";

const GAMMA_URL = "https://gamma-api.polymarket.com";

interface GammaMarket {
  id: string;
  question: string;
  slug: string;
  active: boolean;
  closed: boolean;
  volume: string;
  outcomePrices: string; // JSON string like "[0.35, 0.65]"
  outcomes: string; // JSON string like '["Yes", "No"]'
  endDate: string;
  category?: string;
  tags?: { label: string; slug: string }[];
  volumeNum?: number;
}

let cachedMarkets: PolyMarket[] = [];
let previousPrices: Record<string, number> = {};
let lastFetch = 0;

export async function fetchActiveMarkets(): Promise<PolyMarket[]> {
  try {
    const res = await fetch(
      `${GAMMA_URL}/markets?active=true&closed=false&limit=50&order=volume&ascending=false&volume_num_min=10000`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) throw new Error(`Polymarket ${res.status}`);
    const data = (await res.json()) as GammaMarket[];

    const markets: PolyMarket[] = [];
    for (const m of data) {
      if (!m.active || m.closed) continue;

      let yesPrice = 0.5;
      try {
        const prices = JSON.parse(m.outcomePrices || "[]");
        yesPrice = parseFloat(prices[0]) || 0.5;
      } catch { /* use default */ }

      const volume = parseFloat(m.volume || "0");

      // Calculate recent move
      const prevPrice = previousPrices[m.id];
      const move = prevPrice !== undefined
        ? `${yesPrice > prevPrice ? "+" : ""}${(yesPrice - prevPrice).toFixed(3)}`
        : "---";

      // Detect category from tags or question
      let category = "general";
      const q = m.question.toLowerCase();
      if (q.includes("bitcoin") || q.includes("eth") || q.includes("sol") || q.includes("crypto")) category = "crypto";
      else if (q.includes("president") || q.includes("elect") || q.includes("trump") || q.includes("democrat") || q.includes("republican")) category = "politics";
      else if (q.includes("ai") || q.includes("tech") || q.includes("openai") || q.includes("google")) category = "tech";

      markets.push({
        id: m.id,
        question: m.question,
        category,
        yesPrice,
        volume,
        endDate: m.endDate || "TBD",
        recentMove: move,
        slug: m.slug,
        polyUrl: `https://polymarket.com/event/${m.slug}`,
      });

      previousPrices[m.id] = yesPrice;
    }

    cachedMarkets = markets.slice(0, 15);
    lastFetch = Date.now();
    console.log(`[Polymarket] Fetched ${cachedMarkets.length} active markets`);
    return cachedMarkets;
  } catch (err) {
    console.error("[Polymarket] Error:", err);
    return cachedMarkets;
  }
}

export function getCachedMarkets(): PolyMarket[] {
  return cachedMarkets;
}

export function getLastFetchTime(): number {
  return lastFetch;
}

// ═══ SEARCH (for terminal page) ═══

export async function searchPolymarkets(query: string): Promise<PolyMarket[]> {
  try {
    const res = await fetch(
      `${GAMMA_URL}/markets?active=true&closed=false&limit=50&order=volume&ascending=false&volume_num_min=5000&slug_contains=${encodeURIComponent(query)}`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) throw new Error(`Polymarket search ${res.status}`);
    const data = (await res.json()) as GammaMarket[];

    const markets: PolyMarket[] = [];
    for (const m of data) {
      if (!m.active || m.closed) continue;

      let yesPrice = 0.5;
      try {
        const prices = JSON.parse(m.outcomePrices || "[]");
        yesPrice = parseFloat(prices[0]) || 0.5;
      } catch { /* use default */ }

      const q = m.question.toLowerCase();
      let category = "general";
      if (q.includes("bitcoin") || q.includes("eth") || q.includes("sol") || q.includes("crypto")) category = "crypto";
      else if (q.includes("president") || q.includes("elect") || q.includes("trump") || q.includes("democrat")) category = "politics";
      else if (q.includes("ai") || q.includes("tech") || q.includes("openai") || q.includes("google")) category = "tech";

      markets.push({
        id: m.id,
        question: m.question,
        category,
        yesPrice,
        volume: parseFloat(m.volume || "0"),
        endDate: m.endDate || "TBD",
        recentMove: previousPrices[m.id] !== undefined
          ? `${yesPrice > previousPrices[m.id] ? "+" : ""}${(yesPrice - previousPrices[m.id]).toFixed(3)}`
          : "---",
        slug: m.slug,
        polyUrl: `https://polymarket.com/event/${m.slug}`,
      });
    }

    return markets.slice(0, 30);
  } catch (err) {
    console.error("[Polymarket] Search error:", err);
    return [];
  }
}
