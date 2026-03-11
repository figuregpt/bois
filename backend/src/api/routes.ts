import { Router, Request, Response } from "express";
import { getRecentEvents, getEventsForAgent } from "../events/bus";
import { getMarketState } from "../market/simulator";
import { BaseAgent } from "../agents/base";
import { agentConfigs } from "../config";

export function createRouter(agents: Map<string, BaseAgent>): Router {
  const router = Router();

  // GET /api/feed — all recent events (posts, trades, observations)
  router.get("/feed", (_req: Request, res: Response) => {
    const limit = parseInt(String(_req.query.limit || "50"));
    const events = getRecentEvents(limit);
    res.json({ events });
  });

  // GET /api/agents — all agent statuses with full portfolio + PNL + formatted bags
  router.get("/agents", (_req: Request, res: Response) => {
    const market = getMarketState();
    const agentList = agentConfigs.map((config) => {
      const agent = agents.get(config.id);
      const mem = agent?.memory;
      if (!mem) {
        return {
          id: config.id, name: config.name, focus: config.focus,
          personality: config.personality, running: false,
          pnl: "$0", pnlPercent: "0%", trades: 0, cash: 1000, totalValue: 1000,
          holdings: [], positions: [], bets: [], recentEvents: [],
        };
      }

      const p = mem.portfolio;

      // Calculate total portfolio value
      let totalValue = p.cash;

      // Positions value
      const formattedPositions = p.positions.map((pos) => {
        const baseToken = pos.pair.replace("-PERP", "");
        const currentPrice = market.prices[baseToken] || pos.entry;
        const posPnl = pos.direction === "long"
          ? (currentPrice - pos.entry) / pos.entry * pos.size * pos.leverage
          : (pos.entry - currentPrice) / pos.entry * pos.size * pos.leverage;
        const posPnlPct = (posPnl / pos.size) * 100;
        totalValue += pos.size + posPnl;
        return {
          pair: pos.pair,
          direction: pos.direction,
          leverage: `${pos.leverage}x`,
          size: `$${pos.size}`,
          entry: `$${pos.entry.toFixed(2)}`,
          mark: `$${currentPrice.toFixed(2)}`,
          pnl: `${posPnl >= 0 ? "+" : ""}$${posPnl.toFixed(0)}`,
          pnlPercent: `${posPnlPct >= 0 ? "+" : ""}${posPnlPct.toFixed(1)}%`,
          tradeUrl: pos.tradeUrl || "",
        };
      });

      // Holdings value (meme tokens bought with SOL)
      const formattedHoldings = Object.entries(p.holdings).map(([symbol, h]) => {
        const value = h.amount * (market.prices.SOL || 180);
        totalValue += value;
        return {
          symbol,
          name: symbol,
          amount: `${h.amount.toFixed(2)} SOL`,
          value: `$${value.toFixed(0)}`,
          pnl: "---",
          pnlPercent: "---",
          dexUrl: h.dexUrl || "",
        };
      });

      // Bets value
      const formattedBets = p.bets.map((bet) => {
        const pm = market.polymarketMarkets.find((m) => m.id === bet.marketId);
        const currentPrice = pm ? pm.yesPrice : bet.avgPrice;
        const betPnl = (currentPrice - bet.avgPrice) * bet.shares;
        totalValue += currentPrice * bet.shares;
        return {
          question: pm?.question || bet.question || bet.marketId,
          outcome: bet.outcome,
          shares: bet.shares,
          avgPrice: `$${bet.avgPrice.toFixed(2)}`,
          currentPrice: `$${currentPrice.toFixed(2)}`,
          pnl: `${betPnl >= 0 ? "+" : ""}$${betPnl.toFixed(1)}`,
          polyUrl: bet.polyUrl || pm?.polyUrl || "",
        };
      });

      const pnl = totalValue - 1000;
      const pnlPercent = (pnl / 1000) * 100;
      const tradeCount = mem.recentDecisions.filter((d) => d.type === "trade").length;
      const recentEvents = getEventsForAgent(config.id, 20);

      return {
        id: config.id,
        name: config.name,
        focus: config.focus,
        personality: config.personality,
        running: agent?.running || false,
        intervalMs: config.intervalMs,
        decisions: mem.recentDecisions.length,
        trades: tradeCount,
        cash: Math.floor(p.cash),
        totalValue: Math.floor(totalValue),
        pnl: `${pnl >= 0 ? "+" : ""}$${Math.floor(pnl)}`,
        pnlPercent: `${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(1)}%`,
        holdings: formattedHoldings,
        positions: formattedPositions,
        bets: formattedBets,
        recentEvents,
      };
    });
    res.json({ agents: agentList });
  });

  // GET /api/agents/:id — specific agent detail
  router.get("/agents/:id", (req: Request, res: Response) => {
    const id = decodeURIComponent(req.params.id as string);
    const config = agentConfigs.find((c) => c.id === id);
    const agent = agents.get(id);
    if (!config || !agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    const mem = agent.memory;
    res.json({
      id: config.id,
      name: config.name,
      focus: config.focus,
      personality: config.personality,
      running: agent.running,
      intervalMs: config.intervalMs,
      recentDecisions: mem.recentDecisions.slice(-20),
      portfolio: mem.portfolio,
    });
  });

  // GET /api/agents/:id/bag — agent portfolio
  router.get("/agents/:id/bag", (req: Request, res: Response) => {
    const id = decodeURIComponent(req.params.id as string);
    const agent = agents.get(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json({ portfolio: agent.memory.portfolio });
  });

  // GET /api/agents/:id/events — agent-specific events
  router.get("/agents/:id/events", (req: Request, res: Response) => {
    const id = decodeURIComponent(req.params.id as string);
    const limit = parseInt(String(req.query.limit || "20"));
    const events = getEventsForAgent(id, limit);
    res.json({ events });
  });

  // POST /api/agents/:id/chat — chat with an agent
  router.post("/agents/:id/chat", async (req: Request, res: Response) => {
    const id = decodeURIComponent(req.params.id as string);
    const agent = agents.get(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    const { message } = req.body;
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "message is required" });
      return;
    }
    try {
      const reply = await agent.chatWithUser(message);
      res.json({ reply });
    } catch (err) {
      console.error(`[API] Chat error for ${id}:`, err);
      res.status(500).json({ error: "Failed to generate response" });
    }
  });

  // GET /api/market — current market state
  router.get("/market", (_req: Request, res: Response) => {
    res.json(getMarketState());
  });

  // GET /api/logs — simulation log entries
  router.get("/logs", (_req: Request, res: Response) => {
    const limit = parseInt(String(_req.query.limit || "100"));
    const events = getRecentEvents(limit);
    res.json({ logs: events });
  });

  return router;
}
