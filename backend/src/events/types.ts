export interface AgentEvent {
  ts: string;
  agent: string;
  type: "trade" | "post" | "observe" | "dm" | "alert";
  action?: string;
  text?: string;
  details?: Record<string, unknown>;
  market?: Record<string, number>;
}

export interface MarketState {
  prices: Record<string, number>;
  rsi: Record<string, number>;
  volume24h: Record<string, number>;
  events: string[];
  memeTokens: MemeToken[];
  polymarketMarkets: PolyMarket[];
}

export interface MemeToken {
  symbol: string;
  name: string;
  mcap: number;
  volume24h: number;
  holders: number;
  devHolding: number;
  top10Holding: number;
  priceChange1h: number;
  launchedAgo: string;
}

export interface PolyMarket {
  id: string;
  question: string;
  category: string;
  yesPrice: number;
  volume: number;
  endDate: string;
  recentMove: string;
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
    holdings: Record<string, { amount: number; avgPrice: number }>;
    positions: { pair: string; direction: "long" | "short"; leverage: number; size: number; entry: number }[];
    bets: { marketId: string; outcome: string; shares: number; avgPrice: number }[];
    cash: number;
  };
}
