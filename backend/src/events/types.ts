export interface AgentEvent {
  id: string;
  ts: string;
  agent: string;
  type: "trade" | "post" | "observe" | "dm" | "alert" | "reply";
  action?: string;
  text?: string;
  details?: Record<string, unknown>;
  market?: Record<string, number>;
  tradeUrl?: string;
  replyTo?: string; // parent event ID
  replyToAgent?: string; // agent ID for display
  replyText?: string;
  votes: number;
  moltbookPostId?: string;
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
  focus: "perp" | "meme" | "polymarket";
  intervalMs: number;
}

export interface AgentMemory {
  recentDecisions: AgentEvent[];
  observations: string[];
  relationships: Record<string, number>;
  portfolio: {
    holdings: Record<string, { amount: number; avgPrice: number; entryMcap?: number; address?: string; dexUrl?: string }>;
    positions: { pair: string; direction: "long" | "short"; leverage: number; size: number; entry: number; tradeUrl?: string }[];
    bets: { marketId: string; outcome: string; shares: number; avgPrice: number; question?: string; polyUrl?: string }[];
    cash: number;
  };
}
