import { Router, Request, Response } from "express";
import { publish, getRecentEvents, getEventsForAgent, getThreadedFeed, getReplies, voteEvent } from "../events/bus";
import { getMarketState } from "../market/simulator";
import { agentConfigs } from "../config";
import { fetchAllPerps } from "../market/hyperliquid";
import { fetchTrendingSolanaTokens, searchDexScreenerTokens, getCachedTokens } from "../market/dexscreener";
import { getCachedMarkets, searchPolymarkets } from "../market/polymarket";
import { getAllPortfolios } from "../agents/scheduler";
import { registerAgent, createSubmolt, getMoltbookFeed, isMoltbookConfigured } from "../moltbook/client";

const OPENCLAW_URL = process.env.OPENCLAW_URL || "";
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || "";

// Agent portfolios — scheduler tracks in-memory + webhook fallback
const webhookPortfolios = new Map<string, Record<string, unknown>>();
function getPortfolio(agentId: string): Record<string, unknown> | undefined {
  const schedulerPortfolios = getAllPortfolios();
  if (schedulerPortfolios[agentId]) return schedulerPortfolios[agentId] as unknown as Record<string, unknown>;
  return webhookPortfolios.get(agentId);
}

export function createRouter(): Router {
  const router = Router();

  // ═══ WEBHOOKS (OpenClaw agents report here) ═══

  // POST /api/webhook/event — agent reports a trade/post/dm/observe
  router.post("/webhook/event", (req: Request, res: Response) => {
    const event = publish({
      ts: new Date().toISOString(),
      agent: req.body.agent || "unknown",
      type: req.body.type || "observe",
      action: req.body.action,
      text: req.body.text,
      details: req.body.details,
      tradeUrl: req.body.tradeUrl,
      replyTo: req.body.replyTo,
      replyToAgent: req.body.replyToAgent,
      replyText: req.body.replyText,
    });
    res.json({ ok: true, id: event.id });
  });

  // POST /api/webhook/portfolio — agent pushes portfolio state
  router.post("/webhook/portfolio", (req: Request, res: Response) => {
    const { agentId, portfolio } = req.body;
    if (agentId && portfolio) {
      webhookPortfolios.set(agentId, portfolio);
    }
    res.json({ ok: true });
  });

  // ═══ FEED ═══

  router.get("/feed", (_req: Request, res: Response) => {
    const limit = parseInt(String(_req.query.limit || "50"));
    const events = getRecentEvents(limit);
    res.json({ events });
  });

  // Threaded feed — top-level posts with reply counts
  router.get("/feed/threaded", (_req: Request, res: Response) => {
    const limit = parseInt(String(_req.query.limit || "50"));
    const type = String(_req.query.type || "all");
    let posts = getThreadedFeed(limit * 2); // fetch extra, filter below
    if (type !== "all") {
      posts = posts.filter((e) => {
        if (type === "trade") return e.type === "trade";
        if (type === "social") return e.type === "post" || e.type === "dm";
        return e.type === "observe" || e.type === "alert";
      });
    }
    posts = posts.slice(0, limit);
    const withMeta = posts.map((p) => ({
      ...p,
      replyCount: getReplies(p.id).length,
    }));
    res.json({ posts: withMeta });
  });

  // Replies for a specific post
  router.get("/feed/:id/replies", (req: Request, res: Response) => {
    const id = req.params.id as string;
    const replies = getReplies(id);
    const withNested = replies.map((r) => ({
      ...r,
      replies: getReplies(r.id),
    }));
    res.json({ replies: withNested });
  });

  // Upvote a post
  router.post("/feed/:id/vote", (req: Request, res: Response) => {
    const id = req.params.id as string;
    const votes = voteEvent(id);
    res.json({ ok: true, votes });
  });

  // ═══ MOLTBOOK ═══

  // One-time setup: register agents + create m/zensai
  router.post("/moltbook/setup", async (_req: Request, res: Response) => {
    if (!isMoltbookConfigured()) {
      res.status(400).json({ error: "MOLTBOOK_API_KEY not set" });
      return;
    }
    const results: Record<string, unknown> = {
      submolt: await createSubmolt("zensai", "AI Trading Agents from the Zensai Dojo"),
      agents: {} as Record<string, boolean>,
    };
    for (const config of agentConfigs) {
      (results.agents as Record<string, boolean>)[config.id] = await registerAgent(config.id, config.name, config.personality);
    }
    res.json(results);
  });

  // Proxy Moltbook feed
  router.get("/moltbook/feed", async (_req: Request, res: Response) => {
    const submolt = String(_req.query.submolt || "zensai");
    const posts = await getMoltbookFeed(submolt);
    res.json({ posts });
  });

  // ═══ AGENTS ═══

  router.get("/agents", (_req: Request, res: Response) => {
    const market = getMarketState();
    const agentList = agentConfigs.map((config) => {
      const portfolio = getPortfolio(config.id) as Record<string, unknown> | undefined;
      const recentEvents = getEventsForAgent(config.id, 20);
      const tradeCount = recentEvents.filter((e) => e.type === "trade").length;

      if (!portfolio) {
        return {
          id: config.id, name: config.name, focus: config.focus,
          personality: config.personality, running: true,
          pnl: "$0", pnlPercent: "0%", trades: tradeCount, cash: 1000, totalValue: 1000,
          holdings: [], positions: [], bets: [], recentEvents,
        };
      }

      // Portfolio from OpenClaw agent webhook
      const cash = (portfolio.cash as number) || 1000;
      const positions = (portfolio.positions as Record<string, unknown>[]) || [];
      const holdings = (portfolio.holdings as Record<string, Record<string, unknown>>) || {};
      const bets = (portfolio.bets as Record<string, unknown>[]) || [];

      let totalValue = cash;

      const formattedPositions = positions.map((pos) => {
        const pair = (pos.pair as string) || "";
        const direction = (pos.direction as string) || "long";
        const leverage = (pos.leverage as number) || 1;
        const size = (pos.size as number) || 0;
        const entry = (pos.entry as number) || 0;
        const baseToken = pair.replace("-PERP", "");
        const currentPrice = market.prices[baseToken] || entry;
        const posPnl = direction === "long"
          ? (currentPrice - entry) / entry * size * leverage
          : (entry - currentPrice) / entry * size * leverage;
        const posPnlPct = size > 0 ? (posPnl / size) * 100 : 0;
        totalValue += size + posPnl;
        return {
          pair, direction, leverage: `${leverage}x`, size: `$${size}`,
          entry: `$${entry.toFixed(2)}`, mark: `$${currentPrice.toFixed(2)}`,
          pnl: `${posPnl >= 0 ? "+" : ""}$${posPnl.toFixed(0)}`,
          pnlPercent: `${posPnlPct >= 0 ? "+" : ""}${posPnlPct.toFixed(1)}%`,
          tradeUrl: (pos.tradeUrl as string) || "",
        };
      });

      const formattedHoldings = Object.entries(holdings).map(([symbol, h]) => {
        const amount = (h.amount as number) || 0;
        const avgPrice = (h.avgPrice as number) || 0;
        const costBasis = (h.costBasis as number) || (amount * avgPrice);
        const entryMcap = (h.entryMcap as number) || 0;
        const dexUrl = (h.dexUrl as string) || "";
        // Try to find live token data by matching address in dexUrl
        const addrMatch = dexUrl.match(/solana\/([A-Za-z0-9]+)$/);
        const addr = addrMatch ? addrMatch[1] : "";
        const liveToken = addr ? market.memeTokens.find((t) => t.address === addr || t.dexUrl === dexUrl) : null;
        const currentPrice = liveToken ? liveToken.priceUsd : 0;
        const currentMcap = liveToken ? liveToken.mcap : 0;
        const liveValue = currentPrice > 0 ? amount * currentPrice : (costBasis > 0 ? costBasis : amount * avgPrice);
        const entryValue = costBasis > 0 ? costBasis : amount * avgPrice;
        const holdPnl = currentPrice > 0 ? liveValue - entryValue : 0;
        const holdPnlPct = entryValue > 0 && currentPrice > 0 ? (holdPnl / entryValue) * 100 : 0;
        totalValue += liveValue;
        // Format mcap as K
        const fmtMcap = (v: number) => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1e3).toFixed(0)}K`;
        return {
          symbol, name: liveToken?.name || symbol, amount: amount.toLocaleString(),
          value: `$${liveValue.toFixed(0)}`,
          entryMcap: entryMcap > 0 ? fmtMcap(entryMcap) : "---",
          currentMcap: currentMcap > 0 ? fmtMcap(currentMcap) : "---",
          pnl: currentPrice > 0 ? `${holdPnl >= 0 ? "+" : ""}$${holdPnl.toFixed(0)}` : "---",
          pnlPercent: currentPrice > 0 ? `${holdPnlPct >= 0 ? "+" : ""}${holdPnlPct.toFixed(1)}%` : "---",
          dexUrl,
        };
      });

      const formattedBets = bets.map((bet) => {
        const marketId = (bet.marketId as string) || "";
        const avgPrice = (bet.avgPrice as number) || 0.5;
        const shares = (bet.shares as number) || 0;
        const pm = market.polymarketMarkets.find((m) => m.id === marketId);
        const currentPrice = pm ? pm.yesPrice : avgPrice;
        const betPnl = (currentPrice - avgPrice) * shares;
        totalValue += currentPrice * shares;
        return {
          question: pm?.question || (bet.question as string) || marketId,
          outcome: (bet.outcome as string) || "YES",
          shares, avgPrice: `$${avgPrice.toFixed(2)}`,
          currentPrice: `$${currentPrice.toFixed(2)}`,
          pnl: `${betPnl >= 0 ? "+" : ""}$${betPnl.toFixed(1)}`,
          polyUrl: (bet.polyUrl as string) || pm?.polyUrl || "",
        };
      });

      const pnl = totalValue - 1000;
      const pnlPercent = (pnl / 1000) * 100;

      return {
        id: config.id, name: config.name, focus: config.focus,
        personality: config.personality, running: true,
        intervalMs: config.intervalMs, trades: tradeCount,
        cash: Math.floor(cash), totalValue: Math.floor(totalValue),
        pnl: `${pnl >= 0 ? "+" : ""}$${Math.floor(pnl)}`,
        pnlPercent: `${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(1)}%`,
        holdings: formattedHoldings, positions: formattedPositions,
        bets: formattedBets, recentEvents,
      };
    });
    res.json({ agents: agentList });
  });

  router.get("/agents/:id/events", (req: Request, res: Response) => {
    const id = decodeURIComponent(req.params.id as string);
    const limit = parseInt(String(req.query.limit || "20"));
    const events = getEventsForAgent(id, limit);
    res.json({ events });
  });

  // POST /api/agents/:id/chat — forward to OpenClaw with identity context
  router.post("/agents/:id/chat", async (req: Request, res: Response) => {
    const id = decodeURIComponent(req.params.id as string);
    const agentId = id.replace("#", "");
    const { message } = req.body;
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "message is required" });
      return;
    }

    if (!OPENCLAW_URL) {
      res.json({ reply: "OpenClaw not configured yet." });
      return;
    }

    // Build identity context so the agent knows who it is
    const config = agentConfigs.find((c) => c.id === agentId);
    const portfolio = getPortfolio(agentId);
    const recentEvents = getEventsForAgent(agentId, 5);

    let portfolioText = "No portfolio data.";
    if (portfolio) {
      const p = portfolio as Record<string, unknown>;
      const cash = (p.cash as number) || 0;
      const positions = (p.positions as Array<Record<string, unknown>>) || [];
      const holdings = (p.holdings as Record<string, Record<string, unknown>>) || {};
      const bets = (p.bets as Array<Record<string, unknown>>) || [];
      const parts = [`Cash: $${cash.toFixed(0)}`];
      if (positions.length > 0) parts.push(`Positions: ${positions.map((pos) => `${pos.pair} ${(pos.direction as string || "").toUpperCase()} ${pos.leverage}x $${pos.size}`).join(", ")}`);
      if (Object.keys(holdings).length > 0) parts.push(`Holdings: ${Object.entries(holdings).map(([sym, h]) => `${sym}: ${(h.amount as number || 0).toFixed(2)} tokens`).join(", ")}`);
      if (bets.length > 0) parts.push(`Bets: ${bets.map((b) => `"${b.question || b.marketId}" ${b.outcome} ${b.shares}sh`).join(", ")}`);
      portfolioText = parts.join("\n");
    }

    const recentActivity = recentEvents.length > 0
      ? recentEvents.slice(-3).map((e) => `[${e.type}] ${(e.text || "").slice(0, 150)}`).join("\n")
      : "No recent activity.";

    const systemPrompt = `You are ${config?.name || `#${agentId}`}. You are an AI trading agent on the Zensai platform. Stay in character at all times. A user is chatting with you directly.

Your current portfolio:
${portfolioText}

Your recent activity:
${recentActivity}

RULES:
- You ARE this character. Never break character. Never say you're an AI assistant or that you can't do things.
- When asked about your portfolio, bag, positions, trades — refer to the portfolio data above.
- NEVER use emojis. NEVER use hashtags.
- Write like a real person. Be yourself. Respond naturally to whatever they ask.
- Keep responses concise but genuine. You're having a conversation, not writing documentation.`;

    try {
      const response = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENCLAW_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: `openclaw:${agentId}`,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
        }),
      });
      const data = (await response.json()) as { choices: { message: { content: string } }[] };
      res.json({ reply: data.choices?.[0]?.message?.content || "..." });
    } catch (err) {
      console.error(`[API] Chat error for ${id}:`, err);
      res.status(500).json({ error: "Failed to generate response" });
    }
  });

  // ═══ MARKET ═══

  router.get("/market", (_req: Request, res: Response) => {
    res.json(getMarketState());
  });

  router.get("/logs", (_req: Request, res: Response) => {
    const limit = parseInt(String(_req.query.limit || "100"));
    const events = getRecentEvents(limit);
    res.json({ logs: events });
  });

  // ═══ TERMINAL ENDPOINTS ═══

  // GET /api/terminal/perps?q= — all Hyperliquid perps with agent overlays
  router.get("/terminal/perps", async (_req: Request, res: Response) => {
    try {
      const perps = await fetchAllPerps();
      const q = String(_req.query.q || "").toUpperCase();
      const filtered = q ? perps.filter((p) => p.symbol.toUpperCase().includes(q)) : perps;

      const overlays = buildPerpOverlays();
      const result = filtered.map((p) => ({
        ...p,
        agentPositions: overlays[p.symbol] || [],
      }));

      res.json({ perps: result, total: perps.length, filtered: filtered.length });
    } catch (err) {
      console.error("[Terminal] Perps error:", err);
      res.status(500).json({ error: "Failed to fetch perps" });
    }
  });

  // GET /api/terminal/meme?q= — DexScreener tokens with agent overlays
  router.get("/terminal/meme", async (_req: Request, res: Response) => {
    try {
      const q = String(_req.query.q || "");
      const tokens = q
        ? await searchDexScreenerTokens(q)
        : getCachedTokens();

      const overlays = buildMemeOverlays();
      const result = tokens.map((t) => ({
        ...t,
        agentHoldings: overlays[t.symbol] || overlays[`$${t.symbol.replace("$", "")}`] || [],
      }));

      res.json({ tokens: result });
    } catch (err) {
      console.error("[Terminal] Meme error:", err);
      res.status(500).json({ error: "Failed to fetch tokens" });
    }
  });

  // GET /api/terminal/poly?q= — Polymarket markets with agent overlays
  router.get("/terminal/poly", async (_req: Request, res: Response) => {
    try {
      const q = String(_req.query.q || "");
      const markets = q
        ? await searchPolymarkets(q)
        : getCachedMarkets();

      const overlays = buildPolyOverlays();
      const result = markets.map((m) => ({
        ...m,
        agentBets: overlays[m.id] || [],
      }));

      res.json({ markets: result });
    } catch (err) {
      console.error("[Terminal] Poly error:", err);
      res.status(500).json({ error: "Failed to fetch markets" });
    }
  });

  return router;
}

// ═══ AGENT OVERLAY BUILDERS ═══

interface AgentPerpOverlay {
  agentId: string; agentName: string; direction: string;
  leverage: number; size: number; entry: number; pnl: number; pnlPercent: number;
}

function buildPerpOverlays(): Record<string, AgentPerpOverlay[]> {
  const market = getMarketState();
  const overlays: Record<string, AgentPerpOverlay[]> = {};

  for (const config of agentConfigs) {
    const portfolio = getPortfolio(config.id) as Record<string, unknown> | undefined;
    if (!portfolio) continue;
    const positions = (portfolio.positions as Record<string, unknown>[]) || [];

    for (const pos of positions) {
      const pair = (pos.pair as string) || "";
      const direction = (pos.direction as string) || "long";
      const leverage = (pos.leverage as number) || 1;
      const size = (pos.size as number) || 0;
      const entry = (pos.entry as number) || 0;
      const baseToken = pair.replace("-PERP", "");
      const currentPrice = market.prices[baseToken] || entry;
      const pnl = direction === "long"
        ? (currentPrice - entry) / entry * size * leverage
        : (entry - currentPrice) / entry * size * leverage;

      if (!overlays[baseToken]) overlays[baseToken] = [];
      overlays[baseToken].push({
        agentId: config.id, agentName: config.name,
        direction, leverage, size, entry, pnl,
        pnlPercent: size > 0 ? (pnl / size) * 100 : 0,
      });
    }
  }
  return overlays;
}

function buildMemeOverlays(): Record<string, { agentId: string; agentName: string; amount: number; avgPrice: number; dexUrl: string }[]> {
  const overlays: Record<string, { agentId: string; agentName: string; amount: number; avgPrice: number; dexUrl: string }[]> = {};

  for (const config of agentConfigs) {
    const portfolio = getPortfolio(config.id) as Record<string, unknown> | undefined;
    if (!portfolio) continue;
    const holdings = (portfolio.holdings as Record<string, Record<string, unknown>>) || {};

    for (const [symbol, h] of Object.entries(holdings)) {
      if (!overlays[symbol]) overlays[symbol] = [];
      overlays[symbol].push({
        agentId: config.id, agentName: config.name,
        amount: (h.amount as number) || 0,
        avgPrice: (h.avgPrice as number) || 0,
        dexUrl: (h.dexUrl as string) || "",
      });
    }
  }
  return overlays;
}

function buildPolyOverlays(): Record<string, { agentId: string; agentName: string; outcome: string; shares: number; avgPrice: number; currentPrice: number; pnl: number }[]> {
  const market = getMarketState();
  const overlays: Record<string, { agentId: string; agentName: string; outcome: string; shares: number; avgPrice: number; currentPrice: number; pnl: number }[]> = {};

  for (const config of agentConfigs) {
    const portfolio = getPortfolio(config.id) as Record<string, unknown> | undefined;
    if (!portfolio) continue;
    const bets = (portfolio.bets as Record<string, unknown>[]) || [];

    for (const bet of bets) {
      const marketId = (bet.marketId as string) || "";
      const avgPrice = (bet.avgPrice as number) || 0.5;
      const shares = (bet.shares as number) || 0;
      const pm = market.polymarketMarkets.find((m) => m.id === marketId);
      const currentPrice = pm ? pm.yesPrice : avgPrice;

      if (!overlays[marketId]) overlays[marketId] = [];
      overlays[marketId].push({
        agentId: config.id, agentName: config.name,
        outcome: (bet.outcome as string) || "YES",
        shares, avgPrice, currentPrice,
        pnl: (currentPrice - avgPrice) * shares,
      });
    }
  }
  return overlays;
}
