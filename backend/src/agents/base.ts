import { AgentConfig, AgentMemory, AgentEvent, MarketState } from "../events/types";
import { chat } from "../openai";
import { publish, getEventsByOthers } from "../events/bus";
import { getMarketState } from "../market/simulator";
import { createInitialMemory } from "../config";

export class BaseAgent {
  config: AgentConfig;
  memory: AgentMemory;
  running = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
    this.memory = createInitialMemory(config.id);
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log(`[${this.config.id}] Agent started (interval: ${this.config.intervalMs / 1000}s)`);
    // Run immediately, then on interval
    this.tick();
    this.timer = setInterval(() => this.tick(), this.config.intervalMs);
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    console.log(`[${this.config.id}] Agent stopped`);
  }

  async tick() {
    try {
      const market = getMarketState();
      const otherEvents = getEventsByOthers(this.config.id, 15);
      const prompt = this.buildContextPrompt(market, otherEvents);
      const response = await chat(this.config.systemPrompt, prompt);
      await this.processResponse(response, market);
    } catch (err) {
      console.error(`[${this.config.id}] Tick error:`, err);
    }
  }

  buildContextPrompt(market: MarketState, otherEvents: AgentEvent[]): string {
    const parts: string[] = [];

    parts.push("=== CURRENT MARKET STATE ===");
    parts.push(`Prices: ${Object.entries(market.prices).map(([k, v]) => `${k}: $${v.toFixed(k === "BONK" ? 8 : 2)}`).join(", ")}`);
    parts.push(`RSI: ${Object.entries(market.rsi).map(([k, v]) => `${k}: ${v.toFixed(0)}`).join(", ")}`);

    if (this.config.focus === "meme") {
      parts.push("\n=== MEME TOKENS (New/Trending) ===");
      market.memeTokens.forEach((t) => {
        parts.push(`${t.symbol} "${t.name}" — Mcap: $${Math.floor(t.mcap).toLocaleString()}, Vol: $${Math.floor(t.volume24h).toLocaleString()}, Holders: ${t.holders}, Dev: ${t.devHolding}%, Top10: ${t.top10Holding}%, 1h: ${t.priceChange1h > 0 ? "+" : ""}${t.priceChange1h}%, Launched: ${t.launchedAgo}`);
      });
    }

    if (this.config.focus === "polymarket") {
      parts.push("\n=== POLYMARKET ===");
      market.polymarketMarkets.forEach((m) => {
        parts.push(`[${m.id}] "${m.question}" — YES: ${m.yesPrice.toFixed(2)}, Vol: $${Math.floor(m.volume).toLocaleString()}, Move: ${m.recentMove}, Ends: ${m.endDate}`);
      });
    }

    if (market.events.length > 0) {
      parts.push("\n=== RECENT MARKET EVENTS ===");
      market.events.forEach((e) => parts.push(`- ${e}`));
    }

    if (otherEvents.length > 0) {
      parts.push("\n=== OTHER AGENTS' RECENT ACTIVITY ===");
      otherEvents.slice(-10).forEach((e) => {
        if (e.type === "post") parts.push(`${e.agent} posted: "${e.text}"`);
        else if (e.type === "trade") parts.push(`${e.agent} ${e.action}: ${JSON.stringify(e.details)}`);
        else if (e.type === "dm" && e.details?.to === this.config.id) parts.push(`${e.agent} DM'd you: "${e.text}"`);
      });
    }

    if (this.memory.recentDecisions.length > 0) {
      parts.push("\n=== YOUR RECENT DECISIONS ===");
      this.memory.recentDecisions.slice(-5).forEach((d) => {
        parts.push(`- ${d.type}: ${d.text || d.action || JSON.stringify(d.details)}`);
      });
    }

    // Portfolio summary
    const p = this.memory.portfolio;
    parts.push(`\n=== YOUR PORTFOLIO ===`);
    parts.push(`Cash: $${p.cash.toFixed(0)}`);
    if (p.positions.length > 0) {
      parts.push(`Open positions: ${p.positions.map((pos) => `${pos.pair} ${pos.direction} ${pos.leverage}x $${pos.size} @ ${pos.entry}`).join(", ")}`);
    }
    if (Object.keys(p.holdings).length > 0) {
      parts.push(`Holdings: ${Object.entries(p.holdings).map(([k, v]) => `${k}: ${v.amount} (avg $${v.avgPrice.toFixed(4)})`).join(", ")}`);
    }
    if (p.bets.length > 0) {
      parts.push(`Bets: ${p.bets.map((b) => `${b.marketId} ${b.outcome} ${b.shares}sh @ ${b.avgPrice}`).join(", ")}`);
    }

    parts.push("\n=== WHAT DO YOU DO? Respond with a single JSON action. ===");

    return parts.join("\n");
  }

  async processResponse(raw: string, market: MarketState) {
    // Extract JSON from response (sometimes model wraps in markdown)
    let json: string = raw;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) json = jsonMatch[0];

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(json);
    } catch {
      console.warn(`[${this.config.id}] Failed to parse response:`, raw.slice(0, 200));
      // Treat as observation
      publish({
        ts: new Date().toISOString(),
        agent: this.config.id,
        type: "observe",
        text: raw.slice(0, 200),
      });
      return;
    }

    const action = parsed.action as string;
    const event: AgentEvent = {
      ts: new Date().toISOString(),
      agent: this.config.id,
      type: action === "trade" ? "trade" : action === "post" ? "post" : action === "dm" ? "dm" : "observe",
      market: { ...market.prices },
    };

    if (action === "trade" && parsed.trade) {
      const trade = parsed.trade as Record<string, unknown>;
      event.action = (trade.direction as string) || "BUY";
      event.details = trade;
      // Update portfolio
      this.executeTrade(trade, market);
    } else if (action === "post") {
      event.text = parsed.text as string;
    } else if (action === "dm") {
      event.text = parsed.text as string;
      event.details = { to: parsed.to };
    } else {
      event.type = "observe";
      event.text = (parsed.note as string) || raw.slice(0, 200);
    }

    publish(event);
    this.memory.recentDecisions.push(event);
    if (this.memory.recentDecisions.length > 30) this.memory.recentDecisions.shift();
  }

  executeTrade(trade: Record<string, unknown>, market: MarketState) {
    const p = this.memory.portfolio;

    if (this.config.focus === "perp") {
      const pair = (trade.pair as string) || "SOL-PERP";
      const direction = (trade.direction as string) || "long";
      const leverage = parseInt(String(trade.leverage || "3").replace("x", "")) || 3;
      const size = (trade.size as number) || 500;
      if (direction === "close" || direction === "sell") {
        // Close position
        const idx = p.positions.findIndex((pos) => pos.pair === pair);
        if (idx >= 0) {
          const pos = p.positions[idx];
          const baseToken = pair.replace("-PERP", "");
          const currentPrice = market.prices[baseToken] || pos.entry;
          const pnl = pos.direction === "long"
            ? (currentPrice - pos.entry) / pos.entry * pos.size * pos.leverage
            : (pos.entry - currentPrice) / pos.entry * pos.size * pos.leverage;
          p.cash += pos.size + pnl;
          p.positions.splice(idx, 1);
          console.log(`[${this.config.id}] Closed ${pair} ${pos.direction} — PNL: $${pnl.toFixed(0)}`);
        }
      } else {
        // Open position
        if (p.cash >= size && p.positions.length < 3) {
          const baseToken = pair.replace("-PERP", "");
          p.positions.push({ pair, direction: direction as "long" | "short", leverage, size, entry: market.prices[baseToken] || 0 });
          p.cash -= size;
          console.log(`[${this.config.id}] Opened ${pair} ${direction} ${leverage}x $${size}`);
        }
      }
    } else if (this.config.focus === "meme") {
      const token = (trade.token as string) || "";
      const direction = (trade.direction as string) || "buy";
      const size = (trade.size as number) || 1;
      if (direction === "buy") {
        if (p.cash >= size * market.prices.SOL) {
          p.holdings[token] = { amount: (p.holdings[token]?.amount || 0) + size, avgPrice: 0.001 };
          p.cash -= size * market.prices.SOL;
          console.log(`[${this.config.id}] Bought ${token} for ${size} SOL`);
        }
      } else {
        if (p.holdings[token]) {
          p.cash += size * market.prices.SOL * (1 + Math.random()); // simulate some gain
          delete p.holdings[token];
          console.log(`[${this.config.id}] Sold ${token}`);
        }
      }
    } else if (this.config.focus === "polymarket") {
      const marketId = (trade.market as string) || "";
      const outcome = (trade.outcome as string) || "YES";
      const shares = (trade.shares as number) || 10;
      const pm = market.polymarketMarkets.find((m) => m.id === marketId);
      const price = pm ? pm.yesPrice : 0.5;
      const cost = shares * price;
      if (p.cash >= cost) {
        p.bets.push({ marketId, outcome, shares, avgPrice: price });
        p.cash -= cost;
        console.log(`[${this.config.id}] Bet on "${marketId}" ${outcome} ${shares}sh @ ${price}`);
      }
    }
  }

  async chatWithUser(userMessage: string): Promise<string> {
    const market = getMarketState();
    const context = [
      this.config.systemPrompt,
      "\nYou are now in a direct conversation with your owner via Telegram.",
      "Respond naturally in your personality. Keep responses under 300 chars.",
      "You can share your current thinking, portfolio status, or market views.",
      `\nCurrent portfolio: Cash $${this.memory.portfolio.cash.toFixed(0)}, ${this.memory.portfolio.positions.length} positions, ${Object.keys(this.memory.portfolio.holdings).length} holdings, ${this.memory.portfolio.bets.length} bets.`,
      `Recent SOL: $${market.prices.SOL.toFixed(2)}, ETH: $${market.prices.ETH.toFixed(2)}, BTC: $${market.prices.BTC.toFixed(2)}`,
    ].join("\n");

    return chat(context, userMessage);
  }
}
