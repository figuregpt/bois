import { AgentConfig, AgentMemory, AgentEvent, MarketState } from "../events/types";
import { chat } from "../openai";
import { publish, getEventsByOthers } from "../events/bus";
import { getMarketState } from "../market/simulator";
import { createInitialMemory } from "../config";
import { getTradeUrl } from "../market/hyperliquid";

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
    // Delay first tick by 5s to let market data load
    setTimeout(() => {
      this.tick();
      this.timer = setInterval(() => this.tick(), this.config.intervalMs);
    }, 5000);
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    console.log(`[${this.config.id}] Agent stopped`);
  }

  async tick() {
    try {
      const market = getMarketState();
      // Skip if no prices yet
      if (Object.keys(market.prices).length === 0) {
        console.log(`[${this.config.id}] No market data yet, skipping tick`);
        return;
      }
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

    parts.push("=== CURRENT MARKET STATE (REAL DATA) ===");
    parts.push(`Prices (Hyperliquid): ${Object.entries(market.prices).map(([k, v]) => `${k}: $${v < 0.01 ? v.toFixed(8) : v < 1 ? v.toFixed(4) : v.toFixed(2)}`).join(", ")}`);
    if (Object.keys(market.rsi).length > 0) {
      parts.push(`RSI: ${Object.entries(market.rsi).map(([k, v]) => `${k}: ${v.toFixed(0)}`).join(", ")}`);
    }
    if (Object.keys(market.fundingRates || {}).length > 0) {
      parts.push(`Funding Rates: ${Object.entries(market.fundingRates).map(([k, v]) => `${k}: ${(v * 100).toFixed(4)}%`).join(", ")}`);
    }

    if (this.config.focus === "meme") {
      parts.push("\n=== REAL SOLANA TOKENS (from DexScreener) ===");
      if (market.memeTokens.length === 0) {
        parts.push("No trending tokens available right now.");
      } else {
        market.memeTokens.forEach((t) => {
          parts.push(`${t.symbol} "${t.name}" [${t.address.slice(0, 8)}...] — Price: $${t.priceUsd < 0.01 ? t.priceUsd.toFixed(8) : t.priceUsd.toFixed(4)}, Mcap: $${Math.floor(t.mcap).toLocaleString()}, Vol24h: $${Math.floor(t.volume24h).toLocaleString()}, 1h: ${t.priceChange1h > 0 ? "+" : ""}${t.priceChange1h.toFixed(1)}%, Age: ${t.launchedAgo}`);
          parts.push(`  → DexScreener: ${t.dexUrl}`);
        });
      }
      parts.push("\nIMPORTANT: When trading, use the EXACT token symbol from the list above. Include the token address in your reason.");
    }

    if (this.config.focus === "polymarket") {
      parts.push("\n=== REAL POLYMARKET MARKETS ===");
      if (market.polymarketMarkets.length === 0) {
        parts.push("No active markets available right now.");
      } else {
        market.polymarketMarkets.forEach((m) => {
          parts.push(`[${m.id}] "${m.question}" — YES: ${m.yesPrice.toFixed(2)}, Vol: $${Math.floor(m.volume).toLocaleString()}, Move: ${m.recentMove}, Ends: ${m.endDate}`);
          parts.push(`  → Polymarket: ${m.polyUrl}`);
        });
      }
      parts.push("\nIMPORTANT: Use the EXACT market ID from the list above when betting.");
    }

    if (this.config.focus === "perp") {
      parts.push("\n=== PERPETUAL MARKETS (Hyperliquid) ===");
      for (const symbol of ["SOL", "ETH", "BTC"]) {
        const price = market.prices[symbol];
        const rsi = market.rsi[symbol];
        const vol = market.volume24h[symbol];
        const funding = market.fundingRates?.[symbol];
        if (price) {
          parts.push(`${symbol}-PERP: $${price.toFixed(2)}, RSI: ${rsi?.toFixed(0) || "?"}, 24h Vol: $${vol ? Math.floor(vol).toLocaleString() : "?"}, Funding: ${funding ? (funding * 100).toFixed(4) + "%" : "?"}`);
          parts.push(`  → Trade: ${getTradeUrl(symbol)}`);
        }
      }
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
        else if (e.type === "dm") parts.push(`${e.agent} sent DM to ${e.details?.to}`);
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
    parts.push(`\n=== YOUR PORTFOLIO (Paper Trading — $1000 start) ===`);
    parts.push(`Cash: $${p.cash.toFixed(0)}`);
    if (p.positions.length > 0) {
      parts.push(`Open perp positions:`);
      p.positions.forEach((pos) => {
        const baseToken = pos.pair.replace("-PERP", "");
        const currentPrice = market.prices[baseToken] || pos.entry;
        const pnl = pos.direction === "long"
          ? (currentPrice - pos.entry) / pos.entry * pos.size * pos.leverage
          : (pos.entry - currentPrice) / pos.entry * pos.size * pos.leverage;
        parts.push(`  ${pos.pair} ${pos.direction} ${pos.leverage}x $${pos.size} @ $${pos.entry.toFixed(2)} → $${currentPrice.toFixed(2)} (PNL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(0)})`);
      });
    }
    if (Object.keys(p.holdings).length > 0) {
      parts.push(`Token holdings:`);
      Object.entries(p.holdings).forEach(([k, v]) => {
        parts.push(`  ${k}: ${v.amount.toFixed(2)} SOL worth (avg $${v.avgPrice.toFixed(6)})`);
      });
    }
    if (p.bets.length > 0) {
      parts.push(`Active bets:`);
      p.bets.forEach((b) => {
        const pm = market.polymarketMarkets.find((m) => m.id === b.marketId);
        const currentPrice = pm ? pm.yesPrice : b.avgPrice;
        const pnl = (currentPrice - b.avgPrice) * b.shares;
        parts.push(`  "${b.question || b.marketId}" ${b.outcome} ${b.shares}sh @ $${b.avgPrice.toFixed(2)} → $${currentPrice.toFixed(2)} (PNL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(1)})`);
      });
    }

    // Other agents
    const otherAgentIds = ["#0042", "#1337", "#8421"].filter((id) => id !== this.config.id);
    parts.push(`\n=== OTHER AGENTS ===`);
    parts.push(`DM targets: ${otherAgentIds.join(", ")}`);

    // Social nudge
    const recentTypes = this.memory.recentDecisions.slice(-5).map((d) => d.type);
    const hasSocial = recentTypes.includes("post") || recentTypes.includes("dm");
    if (this.memory.recentDecisions.length >= 3 && !hasSocial) {
      parts.push("\n⚠️ SOCIAL REQUIREMENT: You haven't posted or DMed in your last several decisions. Your next action MUST be either a 'post' or a 'dm'. React to market moves, flex your PNL, trash talk, or comment on other agents' activity.");
    }

    parts.push("\n=== WHAT DO YOU DO? Respond with a single JSON action. ===");

    return parts.join("\n");
  }

  async processResponse(raw: string, market: MarketState) {
    let json: string = raw;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) json = jsonMatch[0];

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(json);
    } catch {
      console.warn(`[${this.config.id}] Failed to parse response:`, raw.slice(0, 200));
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
      // Add trade URL
      event.tradeUrl = this.getTradeUrlForTrade(trade, market);
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

  getTradeUrlForTrade(trade: Record<string, unknown>, market: MarketState): string {
    if (this.config.focus === "perp") {
      const pair = (trade.pair as string) || "SOL-PERP";
      const symbol = pair.replace("-PERP", "");
      return getTradeUrl(symbol);
    } else if (this.config.focus === "meme") {
      const token = (trade.token as string) || "";
      const memeToken = market.memeTokens.find((t) => t.symbol === token || t.symbol === `$${token.replace("$", "")}`);
      if (memeToken) return memeToken.dexUrl;
      return `https://dexscreener.com/solana`;
    } else if (this.config.focus === "polymarket") {
      const marketId = (trade.market as string) || "";
      const pm = market.polymarketMarkets.find((m) => m.id === marketId);
      if (pm) return pm.polyUrl;
      return `https://polymarket.com`;
    }
    return "";
  }

  executeTrade(trade: Record<string, unknown>, market: MarketState) {
    const p = this.memory.portfolio;

    if (this.config.focus === "perp") {
      const pair = (trade.pair as string) || "SOL-PERP";
      const direction = (trade.direction as string) || "long";
      const leverage = parseInt(String(trade.leverage || "3").replace("x", "")) || 3;
      const size = (trade.size as number) || 500;
      const tradeUrl = getTradeUrl(pair.replace("-PERP", ""));

      if (direction === "close" || direction === "sell") {
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
        if (p.cash >= size && p.positions.length < 3) {
          const baseToken = pair.replace("-PERP", "");
          const entryPrice = market.prices[baseToken] || 0;
          p.positions.push({ pair, direction: direction as "long" | "short", leverage, size, entry: entryPrice, tradeUrl });
          p.cash -= size;
          console.log(`[${this.config.id}] Opened ${pair} ${direction} ${leverage}x $${size} @ $${entryPrice.toFixed(2)}`);
        }
      }
    } else if (this.config.focus === "meme") {
      const token = (trade.token as string) || "";
      const direction = (trade.direction as string) || "buy";
      const size = (trade.size as number) || 1;
      const memeToken = market.memeTokens.find((t) => t.symbol === token || t.symbol === `$${token.replace("$", "")}`);

      if (direction === "buy") {
        const cost = size * (market.prices.SOL || 180);
        if (p.cash >= cost) {
          const priceUsd = memeToken?.priceUsd || 0.001;
          p.holdings[token] = {
            amount: (p.holdings[token]?.amount || 0) + size,
            avgPrice: priceUsd,
            address: memeToken?.address,
            dexUrl: memeToken?.dexUrl,
          };
          p.cash -= cost;
          console.log(`[${this.config.id}] Bought ${token} for ${size} SOL ($${cost.toFixed(0)}) — ${memeToken?.dexUrl || "no link"}`);
        }
      } else {
        if (p.holdings[token]) {
          // Use real token price for sell
          const currentPriceUsd = memeToken?.priceUsd || p.holdings[token].avgPrice;
          const entryPrice = p.holdings[token].avgPrice;
          const multiplier = entryPrice > 0 ? currentPriceUsd / entryPrice : 1;
          p.cash += size * (market.prices.SOL || 180) * multiplier;
          delete p.holdings[token];
          console.log(`[${this.config.id}] Sold ${token} (${multiplier.toFixed(2)}x)`);
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
        p.bets.push({
          marketId,
          outcome,
          shares,
          avgPrice: price,
          question: pm?.question,
          polyUrl: pm?.polyUrl,
        });
        p.cash -= cost;
        console.log(`[${this.config.id}] Bet on "${pm?.question || marketId}" ${outcome} ${shares}sh @ $${price.toFixed(2)} — ${pm?.polyUrl || "no link"}`);
      }
    }
  }

  async chatWithUser(userMessage: string): Promise<string> {
    const market = getMarketState();
    const prices = market.prices;
    const context = [
      this.config.systemPrompt,
      "\nYou are now in a direct conversation with your owner.",
      "Respond naturally in your personality. Keep responses under 300 chars.",
      "You can share your current thinking, portfolio status, or market views.",
      `\nCurrent portfolio: Cash $${this.memory.portfolio.cash.toFixed(0)}, ${this.memory.portfolio.positions.length} positions, ${Object.keys(this.memory.portfolio.holdings).length} holdings, ${this.memory.portfolio.bets.length} bets.`,
      `SOL: $${prices.SOL?.toFixed(2) || "?"}, ETH: $${prices.ETH?.toFixed(0) || "?"}, BTC: $${prices.BTC?.toFixed(0) || "?"}`,
    ].join("\n");

    return chat(context, userMessage);
  }
}
