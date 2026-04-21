import { Router, Request, Response } from "express";
import { chat } from "./llm";
import {
  createAgent,
  getAgent,
  getAllAgents,
  getAgentCount,
  updatePersonality,
  updateConfig,
  setIdentity,
  getIdentity,
  getRelationships,
  AgentConfig,
} from "./agent";
import { getRecentMessages, getBeliefs, recallEpisodes, buildMemoryContext } from "./memory";
import { db } from "./db";
import { registerWalletRoutes } from "./wallet";
import { registerPaperTradingTools, registerPaperTradingRoutes } from "./paper-trading";
import { registerSocialRoutes, startSocialScheduler } from "./social";
import { startTelegramBot } from "./telegram";
import { registerTradingPlatformTools, registerTradingPlatformRoutes } from "./perp-trading";
import { registerChartAnalysisTools, registerChartRoutes } from "./chart-analysis";

export function createFrameworkRouter(): Router {
  const router = Router();

  // ═══ CHAT ═══

  // POST /api/bois/chat - main chat endpoint
  router.post("/chat", async (req: Request, res: Response) => {
    const { agentId, message, conversationId, senderId, platform } = req.body;

    if (!agentId || !message) {
      res.status(400).json({ error: "agentId and message are required" });
      return;
    }

    const agent = getAgent(agentId);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const convId = conversationId || `${agentId}-${senderId || "anon"}-${platform || "web"}`;
    const sender = senderId || "anonymous";

    try {
      const result = await chat(agentId, convId, message, sender, platform || "web");
      res.json({
        reply: result.reply,
        agentId,
        agentName: agent.name,
        conversationId: convId,
        toolCalls: result.tool_calls_made,
        tokensUsed: result.tokens_used,
      });
    } catch (err) {
      console.error(`[Chat] Error for ${agentId}:`, err);
      res.status(500).json({ error: "Chat failed" });
    }
  });

  // ═══ AGENTS CRUD ═══

  // POST /api/bois/agents - create agent
  router.post("/agents", (req: Request, res: Response) => {
    const { id, name, personality, config, nft_mint, owner_wallet, avatar_url } = req.body;

    if (!id || !name) {
      res.status(400).json({ error: "id and name are required" });
      return;
    }

    // Check if already exists
    if (getAgent(id)) {
      res.status(409).json({ error: "Agent already exists" });
      return;
    }

    try {
      const agent = createAgent({
        id,
        name,
        personality: personality || "",
        config,
        nft_mint,
        owner_wallet,
        avatar_url,
      });

      res.json({ ok: true, agent: sanitizeAgent(agent) });
    } catch (err) {
      res.status(500).json({ error: "Failed to create agent" });
    }
  });

  // GET /api/bois/agents - list all agents
  router.get("/agents", (_req: Request, res: Response) => {
    const agents = getAllAgents();
    res.json({
      count: agents.length,
      agents: agents.map(sanitizeAgent),
    });
  });

  // GET /api/bois/agents/:id - get single agent
  router.get("/agents/:id", (req: Request, res: Response) => {
    const agent = getAgent(String(req.params.id));
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const identity = getIdentity(agent.id);
    const relationships = getRelationships(agent.id);
    const beliefs = getBeliefs(agent.id, 10);
    const episodes = recallEpisodes(agent.id, 5);

    res.json({
      ...sanitizeAgent(agent),
      identity,
      relationships: relationships.map(r => ({
        targetId: r.target_id,
        targetType: r.target_type,
        sentiment: r.sentiment,
        trust: r.trust,
        familiarity: r.familiarity,
        notes: r.notes,
        interactions: r.interaction_count,
      })),
      beliefs: beliefs.map(b => ({
        belief: b.belief,
        confidence: b.confidence,
        confirmed: b.times_confirmed,
        contradicted: b.times_contradicted,
      })),
      episodes: episodes.map(e => ({
        summary: e.summary,
        emotion: e.emotion,
        importance: e.importance,
        lesson: e.lesson,
        created_at: e.created_at,
      })),
    });
  });

  // PATCH /api/bois/agents/:id/personality - update personality
  router.patch("/agents/:id/personality", (req: Request, res: Response) => {
    const { personality } = req.body;
    if (!personality) {
      res.status(400).json({ error: "personality is required" });
      return;
    }
    const agent = getAgent(String(req.params.id));
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    updatePersonality(agent.id, personality);
    res.json({ ok: true });
  });

  // PATCH /api/bois/agents/:id/config - update config
  router.patch("/agents/:id/config", (req: Request, res: Response) => {
    const { config } = req.body;
    if (!config) {
      res.status(400).json({ error: "config is required" });
      return;
    }
    const agent = getAgent(String(req.params.id));
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    updateConfig(agent.id, config);
    res.json({ ok: true });
  });

  // POST /api/bois/agents/:id/identity - set identity memory
  router.post("/agents/:id/identity", (req: Request, res: Response) => {
    const { category, key, value } = req.body;
    if (!category || !key || !value) {
      res.status(400).json({ error: "category, key, value required" });
      return;
    }
    const agent = getAgent(String(req.params.id));
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    setIdentity(agent.id, category, key, value);
    res.json({ ok: true });
  });

  // ═══ CONVERSATION HISTORY ═══

  // GET /api/bois/agents/:id/messages - get conversation history
  router.get("/agents/:id/messages", (req: Request, res: Response) => {
    const agentId = String(req.params.id);
    const conversationId = String(req.query.conversationId ?? "");
    const limit = Math.min(100, parseInt(String(req.query.limit ?? "30")));

    if (!conversationId) {
      res.status(400).json({ error: "conversationId query param required" });
      return;
    }

    const messages = getRecentMessages(agentId, conversationId, limit);
    res.json({ messages });
  });

  // ═══ MEMORY INSPECTION ═══

  // GET /api/bois/agents/:id/memory - full memory state
  router.get("/agents/:id/memory", (req: Request, res: Response) => {
    const agentId = String(req.params.id);
    const agent = getAgent(agentId);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    const convId = String(req.query.conversationId ?? `${agentId}-inspect`);
    const ctx = buildMemoryContext(agentId, convId);

    res.json({
      identity: ctx.identity,
      relationships: ctx.relationships,
      beliefs: ctx.beliefs.map(b => ({ belief: b.belief, confidence: b.confidence })),
      episodes: ctx.episodes.map(e => ({ summary: e.summary, importance: e.importance, emotion: e.emotion })),
      working: ctx.working,
      mood: ctx.mood,
      recentMessages: ctx.recentMessages.length,
    });
  });

  // ═══ STATS ═══

  // GET /api/bois/stats - framework stats
  router.get("/stats", (_req: Request, res: Response) => {
    const agentCount = getAgentCount();
    const messageCount = (db.prepare("SELECT COUNT(*) as c FROM messages").get() as { c: number }).c;
    const episodeCount = (db.prepare("SELECT COUNT(*) as c FROM agent_episodes").get() as { c: number }).c;
    const beliefCount = (db.prepare("SELECT COUNT(*) as c FROM agent_beliefs").get() as { c: number }).c;

    res.json({
      agents: agentCount,
      messages: messageCount,
      episodes: episodeCount,
      beliefs: beliefCount,
    });
  });

  // Register wallet routes
  registerWalletRoutes(router);

  // Register paper trading tools + routes
  registerPaperTradingTools();
  registerPaperTradingRoutes(router);

  // Register social routes + start scheduler
  registerSocialRoutes(router);
  // Social scheduler disabled by default — burns LLM quota in background, starve user chats.
  // Enable with SOCIAL_SCHEDULER=1 when on a paid tier with headroom.
  if (process.env.SOCIAL_SCHEDULER === "1") startSocialScheduler();

  // Register trading platform tools + routes
  registerTradingPlatformTools();
  registerTradingPlatformRoutes(router);

  // Register chart analysis tools + routes
  registerChartAnalysisTools();
  registerChartRoutes(router);

  // Start Telegram bot
  startTelegramBot();

  return router;
}

// ═══ HELPERS ═══

function sanitizeAgent(agent: { id: string; name: string; personality: string; config: AgentConfig; wallet_pubkey: string | null; avatar_url: string | null; status: string; nft_mint: string | null; owner_wallet: string | null; created_at: string }) {
  return {
    id: agent.id,
    name: agent.name,
    personality: agent.personality.slice(0, 200),
    config: agent.config,
    walletPubkey: agent.wallet_pubkey,
    avatarUrl: agent.avatar_url,
    status: agent.status,
    nftMint: agent.nft_mint,
    ownerWallet: agent.owner_wallet,
    createdAt: agent.created_at,
  };
}
