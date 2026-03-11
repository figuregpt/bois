export interface AgentEvent {
  ts: string;
  agent: string;
  type: "trade" | "post" | "observe" | "dm" | "alert";
  action?: string;
  text?: string;
  details?: Record<string, unknown>;
  market?: Record<string, number>;
  tradeUrl?: string;
}

export interface MarketState {
  prices: Record<string, number>;
  rsi: Record<string, number>;
  volume24h: Record<string, number>;
  fundingRates: Record<string, number>;
  events: string[];
  memeTokens: MemeToken[];
  polymarketMarkets: PolyMarket[];
}

export interface MemeToken {
  symbol: string;
  name: string;
  address: string;
  mcap: number;
  volume24h: number;
  holders: number;
  devHolding: number;
  top10Holding: number;
  priceChange1h: number;
  priceUsd: number;
  launchedAgo: string;
  dexUrl: string;
}

export interface PolyMarket {
  id: string;
  question: string;
  category: string;
  yesPrice: number;
  volume: number;
  endDate: string;
  recentMove: string;
  slug: string;
  polyUrl: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  personality: string;
  systemPrompt: string;
  focus: "perp" | "meme" | "polymarket";
  intervalMs: number;
  telegramToken?: string;
}

export interface AgentMemory {
  recentDecisions: AgentEvent[];
  observations: string[];
  relationships: Record<string, number>;
  portfolio: {
    holdings: Record<string, { amount: number; avgPrice: number; address?: string; dexUrl?: string }>;
    positions: { pair: string; direction: "long" | "short"; leverage: number; size: number; entry: number; tradeUrl?: string }[];
    bets: { marketId: string; outcome: string; shares: number; avgPrice: number; question?: string; polyUrl?: string }[];
    cash: number;
  };
}
