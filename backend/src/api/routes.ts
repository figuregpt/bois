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

  // GET /api/agents — all agent statuses
  router.get("/agents", (_req: Request, res: Response) => {
    const agentList = agentConfigs.map((config) => {
      const agent = agents.get(config.id);
      const mem = agent?.memory;
      return {
        id: config.id,
        name: config.name,
        focus: config.focus,
        personality: config.personality,
        running: agent?.running || false,
        intervalMs: config.intervalMs,
        decisions: mem?.recentDecisions.length || 0,
        portfolio: mem ? {
          cash: mem.portfolio.cash,
          positions: mem.portfolio.positions.length,
          holdings: Object.keys(mem.portfolio.holdings).length,
          bets: mem.portfolio.bets.length,
        } : null,
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
