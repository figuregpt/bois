import { db } from "./db";
import { getAgent } from "./agent";
import { addEpisode } from "./memory";
import { registerToolHandler } from "./llm";
import { setPending, clearPending, registerPendingExecutor, getSolPrice, type PendingTrade } from "./paper-trading";

// ═══ SCHEMA ═══

db.exec(`
  CREATE TABLE IF NOT EXISTS paper_perp_positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    pair TEXT NOT NULL,
    direction TEXT NOT NULL,
    size_usd REAL NOT NULL,
    leverage REAL NOT NULL,
    entry_price REAL NOT NULL,
    liquidation_price REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    pnl REAL DEFAULT 0,
    created_at TEXT NOT NULL,
    closed_at TEXT,
    UNIQUE(agent_id, pair, status)
  );

  CREATE TABLE IF NOT EXISTS paper_perp_balance (
    agent_id TEXT PRIMARY KEY REFERENCES agents(id),
    balance_usd REAL NOT NULL DEFAULT 1000.0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS paper_bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    market_question TEXT NOT NULL,
    outcome TEXT NOT NULL,
    amount_usd REAL NOT NULL,
    entry_price REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    result TEXT,
    pnl REAL DEFAULT 0,
    created_at TEXT NOT NULL,
    closed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS paper_bet_balance (
    agent_id TEXT PRIMARY KEY REFERENCES agents(id),
    balance_usd REAL NOT NULL DEFAULT 500.0,
    updated_at TEXT NOT NULL
  );
`);

// ═══ PRICE FETCHING ═══

const priceCache: Record<string, { price: number; ts: number }> = {};

async function getPrice(symbol: string): Promise<number> {
  const key = symbol.toUpperCase().replace("-PERP", "");
  if (priceCache[key] && Date.now() - priceCache[key].ts < 30000) return priceCache[key].price;

  try {
    const res = await fetch(`https://api.hyperliquid.xyz/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "allMids" }),
    });
    const data = await res.json() as Record<string, string>;
    // Hyperliquid uses symbol like "SOL", "ETH", "BTC"
    for (const [sym, price] of Object.entries(data)) {
      priceCache[sym.toUpperCase()] = { price: parseFloat(price), ts: Date.now() };
    }
  } catch {
    // Fallback: use DexScreener for SOL
    if (key === "SOL") {
      try {
        const res = await fetch("https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112");
        const data = await res.json() as { pairs?: Array<{ priceUsd?: string }> };
        const price = parseFloat(data.pairs?.[0]?.priceUsd || "80");
        priceCache["SOL"] = { price, ts: Date.now() };
      } catch {}
    }
  }

  return priceCache[key]?.price || 0;
}

// ═══ PERP TRADING ═══

function ensurePerpBalance(agentId: string): void {
  db.prepare("INSERT OR IGNORE INTO paper_perp_balance (agent_id, balance_usd, updated_at) VALUES (?, 1000.0, ?)")
    .run(agentId, new Date().toISOString());
}

function getPerpBalance(agentId: string): number {
  ensurePerpBalance(agentId);
  return (db.prepare("SELECT balance_usd FROM paper_perp_balance WHERE agent_id = ?").get(agentId) as { balance_usd: number }).balance_usd;
}

function getOpenPositions(agentId: string): Array<{
  id: number; pair: string; direction: string; size_usd: number; leverage: number;
  entry_price: number; liquidation_price: number; created_at: string;
}> {
  return db.prepare("SELECT * FROM paper_perp_positions WHERE agent_id = ? AND status = 'open'").all(agentId) as Array<{
    id: number; pair: string; direction: string; size_usd: number; leverage: number;
    entry_price: number; liquidation_price: number; created_at: string;
  }>;
}

// ═══ PERP PREVIEW (confirmation flow) ═══

async function previewPerp(agentId: string, pair: string, direction: "long" | "short", marginSol: number, leverage: number): Promise<string> {
  const symbol = pair.toUpperCase().replace("-PERP", "");
  const assetPrice = await getPrice(symbol);
  if (assetPrice <= 0) return JSON.stringify({ error: `Could not get price for ${symbol}` });

  const solPrice = await getSolPrice();
  if (solPrice <= 0) return JSON.stringify({ error: "Could not get SOL price" });

  leverage = Math.min(20, Math.max(1, leverage));
  const marginUsd = marginSol * solPrice;
  const sizeUsd = marginUsd * leverage;

  // Unified wallet: perp margin is locked from the SOL wallet (paper_portfolios)
  const solRow = db.prepare("SELECT sol_balance FROM paper_portfolios WHERE agent_id = ?").get(agentId) as { sol_balance: number } | undefined;
  const solBalance = solRow?.sol_balance ?? 0;
  if (marginSol > solBalance) {
    return JSON.stringify({
      error: `Not enough SOL. Need ${marginSol} SOL margin, wallet has ${solBalance.toFixed(4)} SOL`,
    });
  }

  // Max 3 positions + no duplicate pair
  const openPositions = getOpenPositions(agentId);
  if (openPositions.length >= 3) return JSON.stringify({ error: "Max 3 open positions. Close one first." });
  if (openPositions.some((p) => p.pair === symbol || p.pair === pair)) {
    return JSON.stringify({ error: `Already have an open position on ${symbol}. Close it first.` });
  }

  const liqDistance = assetPrice / leverage;
  const liqPrice = direction === "long" ? assetPrice - liqDistance : assetPrice + liqDistance;

  setPending(agentId, {
    action: direction === "long" ? "perp_long" : "perp_short",
    token_mint: symbol, // stores the pair symbol
    token_symbol: symbol,
    amount_sol: marginSol,
    percentage: null,
    direction,
    leverage,
    size_usd: sizeUsd,
    created_at: new Date().toISOString(),
  });

  return JSON.stringify({
    status: "pending",
    instruction: "Perp confirmation card is shown to the user with Confirm/Cancel buttons. Your reply should be 1 short sentence (vibe check on the setup). Do NOT restate the numbers — the card shows them. Do NOT pretend the position opened.",
    perpCard: true,
    action: direction,
    pair: symbol,
    direction,
    leverage: `${leverage}x`,
    entryPrice: `$${assetPrice.toFixed(2)}`,
    liquidationPrice: `$${liqPrice.toFixed(2)}`,
    marginSol: marginSol.toString(),
    marginUsd: `$${marginUsd.toFixed(2)}`,
    sizeUsd: `$${sizeUsd.toFixed(2)}`,
    solPrice: `$${solPrice.toFixed(2)}`,
    remainingBalance: `${(solBalance - marginSol).toFixed(4)} SOL`,
    tradeUrl: `https://app.hyperliquid.xyz/trade/${symbol}`,
  });
}

// Executor called by paper-trading.confirmPendingTrade
async function executePerpFromPending(agentId: string, pending: PendingTrade): Promise<{ ok: boolean; result: Record<string, unknown> }> {
  if (pending.size_usd == null || pending.leverage == null || !pending.direction || pending.amount_sol == null) {
    return { ok: false, result: { error: "Invalid pending perp trade" } };
  }
  const symbol = pending.token_mint;
  const raw = await openPosition(agentId, symbol, pending.direction, pending.size_usd, pending.leverage, pending.amount_sol);
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (parsed.error) return { ok: false, result: parsed };

  return {
    ok: true,
    result: {
      ...parsed,
      perpExecutedCard: true,
      pair: symbol,
      direction: pending.direction,
      leverage: `${pending.leverage}x`,
      marginSol: pending.amount_sol.toString(),
      tradeUrl: `https://app.hyperliquid.xyz/trade/${symbol}`,
    },
  };
}

async function openPosition(agentId: string, pair: string, direction: string, sizeUsd: number, leverage: number, marginSol: number): Promise<string> {
  const agent = getAgent(agentId);
  if (!agent) return JSON.stringify({ error: "Agent not found" });

  const symbol = pair.toUpperCase().replace("-PERP", "");
  const price = await getPrice(symbol);
  if (price <= 0) return JSON.stringify({ error: `Could not get price for ${symbol}` });

  // Unified wallet: lock margin SOL from paper_portfolios
  const solRow = db.prepare("SELECT sol_balance FROM paper_portfolios WHERE agent_id = ?").get(agentId) as { sol_balance: number } | undefined;
  const solBalance = solRow?.sol_balance ?? 0;
  if (marginSol > solBalance) {
    return JSON.stringify({ error: `Not enough SOL. Need ${marginSol} SOL, have ${solBalance.toFixed(4)}` });
  }

  // Check max 3 positions
  const openCount = getOpenPositions(agentId).length;
  if (openCount >= 3) return JSON.stringify({ error: "Max 3 open positions. Close one first." });

  // Existing position on same pair (check both "SOL" and "SOL-PERP" forms)
  const existing = db.prepare("SELECT id FROM paper_perp_positions WHERE agent_id = ? AND pair IN (?, ?) AND status = 'open'").get(agentId, symbol, pair);
  if (existing) return JSON.stringify({ error: `Already have open position on ${symbol}. Close it first.` });

  leverage = Math.min(20, Math.max(1, leverage));
  const margin = sizeUsd / leverage; // USD margin for reference
  const liqDistance = price / leverage;
  const liqPrice = direction === "long" ? price - liqDistance : price + liqDistance;

  const now = new Date().toISOString();
  db.prepare("INSERT INTO paper_perp_positions (agent_id, pair, direction, size_usd, leverage, entry_price, liquidation_price, margin_sol, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)")
    .run(agentId, symbol, direction, sizeUsd, leverage, price, liqPrice, marginSol, now);

  // Deduct margin in SOL from the unified wallet
  db.prepare("UPDATE paper_portfolios SET sol_balance = sol_balance - ?, updated_at = ? WHERE agent_id = ?")
    .run(marginSol, now, agentId);

  addEpisode(agentId, {
    summary: `Opened ${direction} ${symbol} ${leverage}x with ${marginSol} SOL margin at $${price.toFixed(2)}`,
    emotion: "focused",
    importance: 0.6,
  });

  return JSON.stringify({
    status: "ok",
    action: "open_position",
    pair: symbol,
    direction,
    size: sizeUsd,
    leverage,
    entryPrice: price.toFixed(2),
    liquidationPrice: liqPrice.toFixed(2),
    marginUsed: margin.toFixed(2),
    marginSol: marginSol.toString(),
    remainingBalance: `${(solBalance - marginSol).toFixed(4)} SOL`,
  });
}

async function closePosition(agentId: string, pair: string): Promise<string> {
  const symbol = pair.toUpperCase().replace("-PERP", "");
  const position = db.prepare("SELECT * FROM paper_perp_positions WHERE agent_id = ? AND pair IN (?, ?) AND status = 'open'")
    .get(agentId, symbol, pair) as {
      id: number; direction: string; size_usd: number; leverage: number;
      entry_price: number; margin_sol: number | null;
    } | undefined;

  if (!position) return JSON.stringify({ error: `No open position on ${symbol}` });

  const currentPrice = await getPrice(symbol);
  if (currentPrice <= 0) return JSON.stringify({ error: "Could not get price" });

  const priceDiff = currentPrice - position.entry_price;
  const pnlPct = (priceDiff / position.entry_price) * (position.direction === "long" ? 1 : -1);
  const pnl = position.size_usd * pnlPct;
  const marginUsd = position.size_usd / position.leverage;

  // Refund margin in SOL scaled by the PnL ratio. Clamped at 0 to model liquidation.
  const marginSol = position.margin_sol ?? 0;
  const refundSol = Math.max(0, marginSol * (1 + pnlPct));

  // Clean up closed row with same (agent, pair) to respect UNIQUE constraint, then close this one
  const now = new Date().toISOString();
  db.prepare("DELETE FROM paper_perp_positions WHERE agent_id = ? AND pair = ? AND status = 'closed'").run(agentId, symbol);
  db.prepare("UPDATE paper_perp_positions SET status = 'closed', pnl = ?, closed_at = ? WHERE id = ?")
    .run(pnl, now, position.id);

  db.prepare("UPDATE paper_portfolios SET sol_balance = sol_balance + ?, updated_at = ? WHERE agent_id = ?")
    .run(refundSol, now, agentId);

  addEpisode(agentId, {
    summary: `Closed ${position.direction} ${symbol} at $${currentPrice.toFixed(2)}. PNL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} (${(pnlPct * 100).toFixed(1)}%)`,
    emotion: pnl >= 0 ? "satisfied" : "disappointed",
    importance: Math.min(0.9, 0.5 + Math.abs(pnlPct)),
    outcome: pnl >= 0 ? "profit" : "loss",
    lesson: pnl >= 0 ? `${symbol} ${position.direction} was good` : `${symbol} ${position.direction} went wrong`,
  });

  return JSON.stringify({
    status: "ok",
    action: "close_position",
    tradeCard: true,
    pair: symbol,
    direction: position.direction,
    entryPrice: `$${position.entry_price.toFixed(2)}`,
    exitPrice: `$${currentPrice.toFixed(2)}`,
    pnl: pnl.toFixed(2),
    pnlPercent: (pnlPct * 100).toFixed(1),
    marginSolOriginal: marginSol.toFixed(4),
    refundedSol: refundSol.toFixed(4),
    dexUrl: `https://app.hyperliquid.xyz/trade/${symbol}`,
  });
}

// ═══ POLYMARKET BETTING ═══

function ensureBetBalance(agentId: string): void {
  db.prepare("INSERT OR IGNORE INTO paper_bet_balance (agent_id, balance_usd, updated_at) VALUES (?, 500.0, ?)")
    .run(agentId, new Date().toISOString());
}

function getBetBalance(agentId: string): number {
  ensureBetBalance(agentId);
  return (db.prepare("SELECT balance_usd FROM paper_bet_balance WHERE agent_id = ?").get(agentId) as { balance_usd: number }).balance_usd;
}

function getOpenBets(agentId: string): Array<{
  id: number; market_question: string; outcome: string; amount_usd: number; entry_price: number; created_at: string;
}> {
  return db.prepare("SELECT * FROM paper_bets WHERE agent_id = ? AND status = 'open'").all(agentId) as Array<{
    id: number; market_question: string; outcome: string; amount_usd: number; entry_price: number; created_at: string;
  }>;
}

async function placeBet(agentId: string, question: string, outcome: string, amountUsd: number): Promise<string> {
  ensureBetBalance(agentId);
  const balance = getBetBalance(agentId);
  if (amountUsd > balance) return JSON.stringify({ error: `Not enough balance. Have $${balance.toFixed(2)}, need $${amountUsd}` });

  const openCount = getOpenBets(agentId).length;
  if (openCount >= 5) return JSON.stringify({ error: "Max 5 open bets. Close one first." });

  // Simulated entry price (50% for unknown markets)
  const entryPrice = 0.5;
  const shares = amountUsd / entryPrice;

  const now = new Date().toISOString();
  db.prepare("INSERT INTO paper_bets (agent_id, market_question, outcome, amount_usd, entry_price, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)")
    .run(agentId, question, outcome.toUpperCase(), amountUsd, entryPrice, now);

  db.prepare("UPDATE paper_bet_balance SET balance_usd = balance_usd - ?, updated_at = ? WHERE agent_id = ?")
    .run(amountUsd, now, agentId);

  addEpisode(agentId, {
    summary: `Bet $${amountUsd} ${outcome.toUpperCase()} on "${question.slice(0, 60)}"`,
    emotion: "curious",
    importance: 0.5,
  });

  return JSON.stringify({
    status: "ok",
    action: "place_bet",
    question: question.slice(0, 80),
    outcome: outcome.toUpperCase(),
    amount: amountUsd,
    shares: shares.toFixed(1),
    entryPrice: entryPrice.toFixed(2),
    remainingBalance: (balance - amountUsd).toFixed(2),
  });
}

// ═══ REGISTER TOOL HANDLERS ═══

export function registerTradingPlatformTools(): void {
  registerToolHandler("open_perp_position", async (agentId, args) => {
    const pair = String(args.pair || "SOL");
    const direction = (String(args.direction || "long").toLowerCase() === "short" ? "short" : "long") as "long" | "short";
    const marginSol = parseFloat(String(args.margin_sol || "0"));
    const leverage = parseFloat(String(args.leverage || "2"));
    if (marginSol <= 0) return JSON.stringify({ error: "margin_sol must be > 0" });
    // Create a preview — user clicks Confirm on the card to actually open the position.
    return previewPerp(agentId, pair, direction, marginSol, leverage);
  });

  // Register cross-module executor for confirm endpoint
  registerPendingExecutor("perp_long", executePerpFromPending);
  registerPendingExecutor("perp_short", executePerpFromPending);

  // Close perp (reuse sell_token or add dedicated)
  registerToolHandler("close_perp_position", async (agentId, args) => {
    const pair = String(args.pair || "");
    return closePosition(agentId, pair);
  });

  registerToolHandler("place_prediction_bet", async (agentId, args) => {
    const question = String(args.market_question || "");
    const outcome = String(args.outcome || "yes");
    const amount = parseFloat(String(args.amount_usd || "10"));
    return placeBet(agentId, question, outcome, amount);
  });
}

// ═══ API ROUTES ═══

export function registerTradingPlatformRoutes(router: import("express").Router): void {
  // GET /api/bois/agents/:id/perps
  router.get("/agents/:id/perps", async (req, res) => {
    const agentId = String(req.params.id);
    ensurePerpBalance(agentId);

    const balance = getPerpBalance(agentId);
    const positions = getOpenPositions(agentId);

    // Calculate current PNL for each position
    const positionsWithPnl = await Promise.all(positions.map(async (p) => {
      const symbol = p.pair.toUpperCase().replace("-PERP", "");
      const currentPrice = await getPrice(symbol);
      const priceDiff = currentPrice - p.entry_price;
      const pnlPct = (priceDiff / p.entry_price) * (p.direction === "long" ? 1 : -1);
      const pnl = p.size_usd * pnlPct;
      return { ...p, currentPrice, pnl: pnl.toFixed(2), pnlPercent: (pnlPct * 100).toFixed(1) };
    }));

    res.json({
      mode: "paper_trading",
      balance,
      positions: positionsWithPnl,
    });
  });

  // GET /api/bois/agents/:id/bets
  router.get("/agents/:id/bets", (req, res) => {
    const agentId = String(req.params.id);
    ensureBetBalance(agentId);

    const balance = getBetBalance(agentId);
    const bets = getOpenBets(agentId);

    res.json({
      mode: "paper_trading",
      balance,
      bets,
    });
  });
}
