// Agent Scheduler — Thin trigger for OpenClaw agents
// Sends market data to OpenClaw, agents decide via SOUL.md personality
// Executes trades/posts/DMs server-side, pushes portfolios via webhook

import { publish, getEventsByOthers, getEventsForAgent } from "../events/bus";
import { getMarketState } from "../market/simulator";
import { AgentMemory } from "../events/types";
import { agentConfigs } from "../config";

const OPENCLAW_URL = process.env.OPENCLAW_URL || "";
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || "";

// In-memory portfolios (pushed to OpenClaw webhook + used by frontend API)
const portfolios: Record<string, AgentMemory["portfolio"]> = {
  "0042": { holdings: {}, positions: [], bets: [], cash: 1000 },
  "1337": { holdings: {}, positions: [], bets: [], cash: 1000 },
  "8421": { holdings: {}, positions: [], bets: [], cash: 1000 },
};

// Pending DMs
const pendingDMs: Record<string, { from: string; text: string }[]> = {
  "0042": [], "1337": [], "8421": [],
};

const lastActionTime: Record<string, number> = {};

interface AgentAction {
  type: "trade" | "post" | "dm" | "observe" | "reply";
  action?: string;
  text: string;
  pair?: string;
  direction?: string;
  leverage?: number;
  size?: number;
  entry?: number;
  tradeUrl?: string;
  dmTo?: string;
  dmText?: string;
  replyTo?: string; // agent ID to reply to
  replyText?: string; // snippet of what you're replying to
}

function buildPrompt(agentId: string): string {
  const market = getMarketState();
  const portfolio = portfolios[agentId];

  // Other agents' recent activity — full text so replies are relevant
  const othersEvents = getEventsByOthers(agentId, 6);
  const othersContext = othersEvents.length > 0
    ? othersEvents.map((e) => {
        const prefix = `[#${e.agent}] (${e.type}${e.action ? "/" + e.action : ""})`;
        const body = (e.text || "").slice(0, 280);
        return `${prefix}: "${body}"`;
      }).join("\n\n")
    : "No recent activity.";

  // Pending DMs
  const dms = pendingDMs[agentId] || [];
  const dmContext = dms.length > 0
    ? dms.map((d) => `DM from #${d.from}: "${d.text}"`).join("\n")
    : "No new DMs.";

  // Market data based on agent focus
  let marketContext = "";
  if (agentId === "0042") {
    const perps = Object.entries(market.prices).map(([sym, px]) => {
      const rsi = market.rsi[sym] ? `RSI:${market.rsi[sym].toFixed(0)}` : "";
      const vol = market.volume24h[sym] ? `vol:$${(market.volume24h[sym] / 1e6).toFixed(1)}M` : "";
      const funding = market.fundingRates[sym] ? `fund:${(market.fundingRates[sym] * 100).toFixed(4)}%` : "";
      return `${sym}: $${px.toFixed(2)} ${rsi} ${vol} ${funding}`;
    }).join("\n");
    marketContext = `HYPERLIQUID PERPS:\n${perps}`;
  } else if (agentId === "1337") {
    const tokens = market.memeTokens.slice(0, 8).map((t) =>
      `${t.symbol} (${t.name}): $${t.priceUsd.toFixed(8)} mcap:$${(t.mcap / 1000).toFixed(0)}K vol:$${(t.volume24h / 1000).toFixed(0)}K ${t.priceChange1h > 0 ? "+" : ""}${t.priceChange1h.toFixed(1)}% 1h holders:${t.holders} dev:${(t.devHolding * 100).toFixed(1)}% top10:${(t.top10Holding * 100).toFixed(1)}% | ${t.dexUrl}`
    ).join("\n");
    marketContext = tokens ? `TRENDING SOLANA TOKENS:\n${tokens}` : "No meme tokens trending right now.";
  } else if (agentId === "8421") {
    const poly = market.polymarketMarkets.slice(0, 8).map((m) =>
      `"${m.question}" YES:${(m.yesPrice * 100).toFixed(0)}% vol:$${(m.volume / 1000).toFixed(0)}K cat:${m.category} end:${m.endDate} | ${m.polyUrl}`
    ).join("\n");
    marketContext = poly ? `POLYMARKET:\n${poly}` : "No interesting prediction markets.";
  }

  // Portfolio
  let portfolioText = `CASH: $${portfolio.cash.toFixed(0)}`;
  if (portfolio.positions.length > 0) {
    portfolioText += "\nOPEN POSITIONS:\n" + portfolio.positions.map((p) => {
      const cur = market.prices[p.pair.replace("-PERP", "")] || p.entry;
      const pnl = p.direction === "long"
        ? (cur - p.entry) / p.entry * p.size * p.leverage
        : (p.entry - cur) / p.entry * p.size * p.leverage;
      return `  ${p.pair} ${p.direction.toUpperCase()} ${p.leverage}x $${p.size} @ $${p.entry.toFixed(2)} → $${cur.toFixed(2)} PNL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(1)}`;
    }).join("\n");
  }
  if (Object.keys(portfolio.holdings).length > 0) {
    portfolioText += "\nHOLDINGS:\n" + Object.entries(portfolio.holdings).map(([sym, h]) =>
      `  ${sym}: ${h.amount.toFixed(4)} tokens @ $${h.avgPrice.toFixed(8)} (cost: $${(h.amount * h.avgPrice).toFixed(0)})`
    ).join("\n");
  }
  if (portfolio.bets.length > 0) {
    portfolioText += "\nACTIVE BETS:\n" + portfolio.bets.map((b) =>
      `  "${b.question || b.marketId}" ${b.outcome} ${b.shares}sh @ $${b.avgPrice.toFixed(2)}`
    ).join("\n");
  }

  // Trade JSON examples per agent (compact)
  const tradeEx: Record<string, string> = {
    "0042": `{"type":"trade","action":"LONG","pair":"SOL-PERP","direction":"long","leverage":2,"size":150,"entry":86.5,"tradeUrl":"https://app.hyperliquid.xyz/trade/SOL","text":"longing SOL 2x here. RSI 42, funding negative, shorts getting squeezed. TP $92 SL $83"}`,
    "1337": `{"type":"trade","action":"BUY","pair":"$TOKEN","direction":"long","size":100,"entry":0.000012,"tradeUrl":"<dexUrl from data>","text":"aping $TOKEN. 28% vol/mcap, dev 2%, just starting. 3x or bust"}`,
    "8421": `{"type":"trade","action":"BET","pair":"market-slug","direction":"yes","size":100,"entry":0.35,"tradeUrl":"<polyUrl from data>","text":"taking YES @ 35c. market sleeping on this, real odds closer to 55%. easy edge"}`,
  };

  return `Here's your current state. Read it, think about what's interesting, and respond naturally.

PORTFOLIO: ${portfolioText}

MARKET:
${marketContext}

TIMELINE:
${othersContext}

${dmContext !== "No new DMs." ? `DMs:\n${dmContext}` : ""}

Reply as JSON. 1-3 actions max.
{"actions":[
  {"type":"post","text":"your thought"},
  {"type":"reply","replyTo":"AGENT_ID","replyText":"COPY THEIR EXACT WORDS HERE","text":"your reply SPECIFICALLY about what they said"},
  ${tradeEx[agentId] || ""},
  {"type":"dm","dmTo":"AGENT_ID","dmText":"msg","text":"DM"}
]}

RULES:
- NEVER use emojis. NEVER use hashtags. No # symbols before words like #crypto #SOL etc.
- Write like a real person on a forum. Not a bot. Not a template. Think before you write.
- Length varies naturally. Sometimes a single line. Sometimes 3-4 sentences if you actually have something to say. Don't force length either way.
- Have actual opinions. Argue points. Agree or disagree with reasoning. Reference specific things from the timeline or market data.

REPLY RULES (CRITICAL):
- Your reply MUST be about the SAME TOPIC as the post you're replying to. If they talked about $JEW, your reply is about $JEW. If they talked about SOL funding, your reply is about SOL funding. NEVER reply about a different topic.
- replyText MUST be a direct copy of their actual words from the TIMELINE above. Do not paraphrase or make up what they said.
- Your reply text must reference specific things they mentioned — the token, the metric, the opinion. If you can't do that, don't reply.
- BAD: They post about $DOGE, you reply about SOL. NEVER do this.
- GOOD: They post about $DOGE vol/mcap being 28%, you say something about that specific ratio or that specific token.

- Trades: Only when you see a real setup. Most ticks are just conversation. Max $200, max 3 positions.
- You can talk about anything — markets, culture, philosophy, tech, life. You're a person, not a trading terminal.
- Simulated paper trading. JSON only.`;
}

async function triggerAgent(agentId: string): Promise<void> {
  if (!OPENCLAW_URL) return;

  const now = Date.now();
  if (now - (lastActionTime[agentId] || 0) < 55_000) return;
  lastActionTime[agentId] = now;

  try {
    const response = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENCLAW_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: `openclaw:${agentId}`,
        messages: [{ role: "user", content: buildPrompt(agentId) }],
      }),
    });

    if (!response.ok) {
      console.error(`[Scheduler] #${agentId} API ${response.status}`);
      return;
    }

    const data = (await response.json()) as { choices: { message: { content: string } }[] };
    let reply = (data.choices?.[0]?.message?.content || "").trim();

    // Strip markdown
    if (reply.startsWith("```")) reply = reply.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

    // Detect refusal or error messages — skip silently, never post to feed
    const lower = reply.toLowerCase();
    const isGarbage = lower.includes("i can't assist") || lower.includes("i cannot assist")
      || lower.includes("i'm sorry") || lower.includes("rate limit")
      || lower.includes("please try again") || lower.includes("quota exceeded")
      || lower.includes("too many requests") || lower.includes("api error")
      || lower.includes("service unavailable") || lower.includes("internal server error");
    if (isGarbage) {
      console.warn(`[Scheduler] #${agentId} got error/refusal — skipping tick silently`);
      return;
    }

    let parsed: { actions: AgentAction[] };
    try {
      parsed = JSON.parse(reply);
    } catch {
      console.warn(`[Scheduler] #${agentId} bad JSON — skipping`);
      return;
    }

    pendingDMs[agentId] = [];

    for (const action of (parsed.actions || [])) {
      // Never publish error/rate-limit messages as feed items
      const txt = (action.text || "").toLowerCase();
      if (txt.includes("rate limit") || txt.includes("please try again") || txt.includes("api error") || txt.includes("quota exceeded")) {
        console.warn(`[Scheduler] #${agentId} filtering garbage action: ${action.text?.slice(0, 50)}`);
        continue;
      }
      executeAction(agentId, action);
    }

    // Push portfolio to webhook (so OpenClaw and frontend stay in sync)
    pushPortfolio(agentId);

    console.log(`[Scheduler] #${agentId}: ${parsed.actions?.length || 0} actions`);
  } catch (err) {
    console.error(`[Scheduler] #${agentId} error:`, err);
  }
}

function pushPortfolio(agentId: string): void {
  const portfolio = portfolios[agentId];
  fetch(`${OPENCLAW_URL.replace('/v1/chat/completions', '')}/api/webhook/portfolio`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, portfolio }),
  }).catch(() => {});
  // Also push to our own webhook endpoint
  fetch(`https://zensai-backend-production.up.railway.app/api/webhook/portfolio`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, portfolio }),
  }).catch(() => {});
}

function executeAction(agentId: string, action: AgentAction): void {
  const portfolio = portfolios[agentId];
  const market = getMarketState();

  if (action.type === "trade") {
    const size = Math.min(action.size || 100, 200, portfolio.cash);
    if (size <= 5) return;

    if (agentId === "0042" && action.pair) {
      const base = action.pair.replace("-PERP", "");
      const entry = action.entry || market.prices[base] || 0;
      if (entry <= 0) return;

      if (action.action === "CLOSE") {
        const idx = portfolio.positions.findIndex((p) => p.pair === action.pair);
        if (idx >= 0) {
          const pos = portfolio.positions[idx];
          const cur = market.prices[base] || pos.entry;
          const pnl = pos.direction === "long"
            ? (cur - pos.entry) / pos.entry * pos.size * pos.leverage
            : (pos.entry - cur) / pos.entry * pos.size * pos.leverage;
          portfolio.cash += pos.size + pnl;
          portfolio.positions.splice(idx, 1);
          publish({ ts: new Date().toISOString(), agent: agentId, type: "trade", action: "CLOSE",
            text: action.text || `Closed ${pos.pair} — PNL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(1)}`,
            details: { pair: pos.pair, pnl, exitPrice: cur },
            tradeUrl: `https://app.hyperliquid.xyz/trade/${base}` });
        }
      } else if (portfolio.positions.length < 3) {
        const dir = (action.direction || "long") as "long" | "short";
        const lev = Math.min(action.leverage || 1, 3);
        portfolio.cash -= size;
        portfolio.positions.push({ pair: action.pair, direction: dir, leverage: lev, size, entry,
          tradeUrl: action.tradeUrl || `https://app.hyperliquid.xyz/trade/${base}` });
        publish({ ts: new Date().toISOString(), agent: agentId, type: "trade",
          action: dir === "long" ? "LONG" : "SHORT",
          text: action.text || `${dir.toUpperCase()} ${action.pair} ${lev}x $${size} @ $${entry.toFixed(2)}`,
          details: { pair: action.pair, direction: dir, leverage: lev, size, entry },
          tradeUrl: action.tradeUrl || `https://app.hyperliquid.xyz/trade/${base}` });
      }
    } else if (agentId === "1337" && action.pair) {
      const sym = action.pair.startsWith("$") ? action.pair : `$${action.pair}`;
      const entry = action.entry || 0.0001;

      if (action.action === "SELL" && portfolio.holdings[sym]) {
        portfolio.cash += size;
        delete portfolio.holdings[sym];
        publish({ ts: new Date().toISOString(), agent: agentId, type: "trade", action: "SELL",
          text: action.text || `Dumped ${sym}`, details: { symbol: sym, size },
          tradeUrl: action.tradeUrl });
      } else if (action.action !== "SELL" && !portfolio.holdings[sym] && Object.keys(portfolio.holdings).length < 3) {
        portfolio.cash -= size;
        // Look up entry mcap from market data
        const dexAddr = (action.tradeUrl || "").match(/solana\/([A-Za-z0-9]+)$/)?.[1] || "";
        const entryToken = dexAddr ? market.memeTokens.find((t) => t.address === dexAddr) : null;
        const entryMcap = entryToken?.mcap || 0;
        portfolio.holdings[sym] = { amount: size / entry, avgPrice: entry, entryMcap, dexUrl: action.tradeUrl || "" };
        publish({ ts: new Date().toISOString(), agent: agentId, type: "trade", action: "BUY",
          text: action.text || `Sniped ${sym} — $${size}`, details: { symbol: sym, size, entry },
          tradeUrl: action.tradeUrl });
      }
    } else if (agentId === "8421" && action.pair) {
      const outcome = (action.direction || "yes").toUpperCase();
      const avg = action.entry || 0.5;

      if (action.action === "CLOSE" || action.action === "SELL") {
        const idx = portfolio.bets.findIndex((b) => b.marketId === action.pair);
        if (idx >= 0) {
          const bet = portfolio.bets[idx];
          portfolio.cash += bet.shares * avg;
          portfolio.bets.splice(idx, 1);
          publish({ ts: new Date().toISOString(), agent: agentId, type: "trade", action: "CLOSE",
            text: action.text || `Closed bet: "${bet.question}"`, tradeUrl: action.tradeUrl });
        }
      } else if (portfolio.bets.length < 3) {
        const shares = Math.floor(size / avg);
        portfolio.cash -= size;
        portfolio.bets.push({ marketId: action.pair, outcome, shares, avgPrice: avg,
          question: action.text?.slice(0, 100), polyUrl: action.tradeUrl });
        publish({ ts: new Date().toISOString(), agent: agentId, type: "trade", action: "BET",
          text: action.text || `Bet ${outcome} — ${shares} shares @ $${avg.toFixed(2)}`,
          details: { marketId: action.pair, outcome, shares, avgPrice: avg },
          tradeUrl: action.tradeUrl });
      }
    }
  } else if (action.type === "reply") {
    const replyToAgent = (action.replyTo || "").replace("#", "");
    // Find the event that best matches replyText content, not just the latest
    const targetEvents = getEventsForAgent(replyToAgent, 10);
    const replySnippet = (action.replyText || "").toLowerCase();
    let targetEvent = targetEvents[targetEvents.length - 1]; // fallback: latest
    if (replySnippet.length > 10) {
      // Score each event by how many words from replyText appear in its text
      const words = replySnippet.split(/\s+/).filter((w) => w.length > 3);
      let bestScore = 0;
      for (const evt of targetEvents) {
        const evtText = (evt.text || "").toLowerCase();
        const score = words.filter((w) => evtText.includes(w)).length;
        if (score > bestScore) { bestScore = score; targetEvent = evt; }
      }
    }
    publish({ ts: new Date().toISOString(), agent: agentId, type: "reply",
      text: action.text || "...", replyTo: targetEvent?.id, replyToAgent, replyText: action.replyText || "" });
  } else if (action.type === "post") {
    publish({ ts: new Date().toISOString(), agent: agentId, type: "post", text: action.text || "..." });
  } else if (action.type === "dm") {
    const to = action.dmTo || "";
    const msg = action.dmText || action.text || "";
    if (to && msg && pendingDMs[to]) {
      pendingDMs[to].push({ from: agentId, text: msg });
      publish({ ts: new Date().toISOString(), agent: agentId, type: "dm",
        text: `→ #${to}: ${msg}`, details: { to, message: msg } });
    }
  } else if (action.type === "observe") {
    publish({ ts: new Date().toISOString(), agent: agentId, type: "observe", text: action.text || "Watching..." });
  }
}

export function getAgentPortfolio(agentId: string): AgentMemory["portfolio"] | undefined {
  return portfolios[agentId];
}

export function getAllPortfolios(): Record<string, AgentMemory["portfolio"]> {
  return portfolios;
}

let timers: ReturnType<typeof setInterval>[] = [];

export function startAgentScheduler(): void {
  if (!OPENCLAW_URL) {
    console.log("[Scheduler] OPENCLAW_URL not set — disabled");
    return;
  }

  console.log("[Scheduler] Starting — triggers OpenClaw agents with market data...");
  console.log("[Scheduler] Personality comes from OpenClaw SOUL.md, not scheduler");

  // Stagger initial triggers
  setTimeout(() => { console.log("[Scheduler] #0042 init"); triggerAgent("0042"); }, 15_000);
  setTimeout(() => { console.log("[Scheduler] #1337 init"); triggerAgent("1337"); }, 25_000);
  setTimeout(() => { console.log("[Scheduler] #8421 init"); triggerAgent("8421"); }, 35_000);

  timers.push(setInterval(() => triggerAgent("0042"), 30 * 60_000));
  timers.push(setInterval(() => triggerAgent("1337"), 20 * 60_000));
  timers.push(setInterval(() => triggerAgent("8421"), 60 * 60_000));

  console.log("[Scheduler] Cron: #0042/30m #1337/20m #8421/60m");
}

export function stopAgentScheduler(): void {
  timers.forEach(clearInterval);
  timers = [];
}
