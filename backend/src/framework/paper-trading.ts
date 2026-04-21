import { db } from "./db";
import { getAgent } from "./agent";
import { addEpisode } from "./memory";
import { registerToolHandler } from "./llm";
import { fetchAllPerps } from "../market/hyperliquid";

// ═══ SCHEMA ═══

db.exec(`
  CREATE TABLE IF NOT EXISTS paper_portfolios (
    agent_id TEXT PRIMARY KEY REFERENCES agents(id),
    sol_balance REAL NOT NULL DEFAULT 10.0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS paper_holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    token_mint TEXT NOT NULL,
    token_symbol TEXT,
    token_name TEXT,
    amount REAL NOT NULL,
    avg_entry_price REAL NOT NULL,
    entry_sol REAL NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(agent_id, token_mint)
  );

  CREATE TABLE IF NOT EXISTS paper_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    type TEXT NOT NULL,
    token_mint TEXT NOT NULL,
    token_symbol TEXT,
    amount REAL NOT NULL,
    price REAL NOT NULL,
    sol_value REAL NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pending_trades (
    agent_id TEXT PRIMARY KEY REFERENCES agents(id),
    action TEXT NOT NULL,
    token_mint TEXT NOT NULL,
    token_symbol TEXT,
    amount_sol REAL,
    percentage REAL,
    direction TEXT,
    leverage REAL,
    size_usd REAL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_paper_trades_agent ON paper_trades(agent_id, created_at DESC);
`);

// ═══ DEXSCREENER ═══

interface TokenInfo {
  symbol: string;
  name: string;
  price: number;
  mcap: number;
  volume24h: number;
  priceChange1h: number;
  holders: number;
  dexUrl: string;
}

async function fetchTokenInfo(mint: string): Promise<TokenInfo | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!res.ok) return null;
    const data = await res.json() as { pairs?: Array<Record<string, unknown>> };
    if (!data.pairs || data.pairs.length === 0) return null;
    // Pick pair with highest liquidity
    const pair = data.pairs.sort((a, b) => ((b.liquidity as Record<string, number>)?.usd || 0) - ((a.liquidity as Record<string, number>)?.usd || 0))[0];

    return {
      symbol: (pair.baseToken as Record<string, string>)?.symbol || "???",
      name: (pair.baseToken as Record<string, string>)?.name || "Unknown",
      price: parseFloat(String(pair.priceUsd || "0")),
      mcap: (pair.marketCap as number) || 0,
      volume24h: ((pair.volume as Record<string, number>)?.h24) || 0,
      priceChange1h: ((pair.priceChange as Record<string, number>)?.h1) || 0,
      holders: 0,
      dexUrl: (pair.url as string) || "",
    };
  } catch {
    return null;
  }
}

// ═══ PORTFOLIO ═══

function ensurePortfolio(agentId: string): void {
  db.prepare("INSERT OR IGNORE INTO paper_portfolios (agent_id, sol_balance, updated_at) VALUES (?, 10.0, ?)")
    .run(agentId, new Date().toISOString());
}

function getPortfolio(agentId: string): { sol: number; holdings: Array<{ mint: string; symbol: string; name: string; amount: number; avgPrice: number; entrySol: number }> } {
  ensurePortfolio(agentId);
  const sol = (db.prepare("SELECT sol_balance FROM paper_portfolios WHERE agent_id = ?").get(agentId) as { sol_balance: number }).sol_balance;
  const holdings = db.prepare("SELECT * FROM paper_holdings WHERE agent_id = ? AND amount > 0").all(agentId) as Array<{
    token_mint: string; token_symbol: string; token_name: string; amount: number; avg_entry_price: number; entry_sol: number;
  }>;

  return {
    sol,
    holdings: holdings.map((h) => ({
      mint: h.token_mint,
      symbol: h.token_symbol || "???",
      name: h.token_name || "Unknown",
      amount: h.amount,
      avgPrice: h.avg_entry_price,
      entrySol: h.entry_sol,
    })),
  };
}

function getTradeHistory(agentId: string, limit = 10): Array<{ type: string; symbol: string; amount: number; price: number; solValue: number; createdAt: string }> {
  const rows = db.prepare("SELECT * FROM paper_trades WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?").all(agentId, limit) as Array<{
    type: string; token_symbol: string; amount: number; price: number; sol_value: number; created_at: string;
  }>;
  return rows.map((r) => ({ type: r.type, symbol: r.token_symbol || "???", amount: r.amount, price: r.price, solValue: r.sol_value, createdAt: r.created_at }));
}

// ═══ PENDING TRADES (confirmation flow) ═══

export interface PendingTrade {
  action: "buy" | "sell" | "perp_long" | "perp_short";
  token_mint: string;           // for perps this holds the pair symbol (e.g. "SOL")
  token_symbol: string;
  amount_sol: number | null;    // buy: sol spent; perp: margin in sol
  percentage: number | null;    // sell only
  direction: string | null;     // perp: "long" | "short"
  leverage: number | null;      // perp: leverage multiplier
  size_usd: number | null;      // perp: notional position size in USD
  created_at: string;
}

export function setPending(agentId: string, trade: PendingTrade): void {
  db.prepare(`INSERT INTO pending_trades (agent_id, action, token_mint, token_symbol, amount_sol, percentage, direction, leverage, size_usd, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(agent_id) DO UPDATE SET action=excluded.action, token_mint=excluded.token_mint,
                token_symbol=excluded.token_symbol, amount_sol=excluded.amount_sol, percentage=excluded.percentage,
                direction=excluded.direction, leverage=excluded.leverage, size_usd=excluded.size_usd,
                created_at=excluded.created_at`)
    .run(agentId, trade.action, trade.token_mint, trade.token_symbol, trade.amount_sol, trade.percentage, trade.direction, trade.leverage, trade.size_usd, trade.created_at);
}

export function getPending(agentId: string): PendingTrade | null {
  return db.prepare("SELECT action, token_mint, token_symbol, amount_sol, percentage, direction, leverage, size_usd, created_at FROM pending_trades WHERE agent_id = ?")
    .get(agentId) as PendingTrade | null;
}

export function clearPending(agentId: string): void {
  db.prepare("DELETE FROM pending_trades WHERE agent_id = ?").run(agentId);
}

// Exposed so perp-trading.ts can read SOL price without duplicating hyperliquid logic
export { getSolPrice };

// ═══ TRADE EXECUTION ═══

// Preview a buy — stores as pending, returns card data for user confirmation.
async function previewBuy(agentId: string, mint: string, solAmount: number): Promise<string> {
  ensurePortfolio(agentId);
  const portfolio = getPortfolio(agentId);
  if (portfolio.sol < solAmount) {
    return JSON.stringify({ error: `Not enough SOL. Balance: ${portfolio.sol.toFixed(4)} SOL, requested: ${solAmount} SOL` });
  }

  const token = await fetchTokenInfo(mint);
  if (!token || token.price <= 0) {
    return JSON.stringify({ error: "Token not found or no price data" });
  }

  const solPrice = await getSolPrice();
  const usdValue = solAmount * solPrice;
  const tokenAmount = usdValue / token.price;

  setPending(agentId, {
    action: "buy",
    token_mint: mint,
    token_symbol: token.symbol,
    amount_sol: solAmount,
    percentage: null,
    direction: null,
    leverage: null,
    size_usd: null,
    created_at: new Date().toISOString(),
  });

  return JSON.stringify({
    status: "pending",
    instruction: "Tell the user the trade details and ask them to confirm using the card. Do NOT try to execute the trade yourself — the user will click confirm or cancel.",
    buyCard: true,
    action: "buy",
    symbol: token.symbol,
    name: token.name,
    mint,
    price: `$${token.price.toFixed(8)}`,
    solAmount: solAmount.toString(),
    usdValue: `$${usdValue.toFixed(2)}`,
    tokenAmount: tokenAmount.toFixed(2),
    currentSol: portfolio.sol.toFixed(4),
    remainingSol: (portfolio.sol - solAmount).toFixed(4),
    dexUrl: token.dexUrl,
  });
}

// Actually execute a previously-previewed buy.
async function executeBuy(agentId: string, mint: string, solAmount: number): Promise<{ ok: boolean; result: Record<string, unknown> }> {
  ensurePortfolio(agentId);
  const portfolio = getPortfolio(agentId);
  if (portfolio.sol < solAmount) {
    return { ok: false, result: { error: `Not enough SOL. Balance: ${portfolio.sol.toFixed(4)}, needed: ${solAmount}` } };
  }

  const token = await fetchTokenInfo(mint);
  if (!token || token.price <= 0) {
    return { ok: false, result: { error: "Token not found or no price data" } };
  }

  const solPrice = await getSolPrice();
  const usdValue = solAmount * solPrice;
  const tokenAmount = usdValue / token.price;
  const now = new Date().toISOString();

  db.prepare("UPDATE paper_portfolios SET sol_balance = sol_balance - ?, updated_at = ? WHERE agent_id = ?")
    .run(solAmount, now, agentId);

  const existing = db.prepare("SELECT * FROM paper_holdings WHERE agent_id = ? AND token_mint = ?").get(agentId, mint) as { amount: number; entry_sol: number } | undefined;
  if (existing) {
    const newAmount = existing.amount + tokenAmount;
    const newEntrySol = existing.entry_sol + solAmount;
    const newAvgPrice = (newEntrySol * solPrice) / newAmount;
    db.prepare("UPDATE paper_holdings SET amount = ?, avg_entry_price = ?, entry_sol = ? WHERE agent_id = ? AND token_mint = ?")
      .run(newAmount, newAvgPrice, newEntrySol, agentId, mint);
  } else {
    db.prepare("INSERT INTO paper_holdings (agent_id, token_mint, token_symbol, token_name, amount, avg_entry_price, entry_sol, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(agentId, mint, token.symbol, token.name, tokenAmount, token.price, solAmount, now);
  }

  db.prepare("INSERT INTO paper_trades (agent_id, type, token_mint, token_symbol, amount, price, sol_value, created_at) VALUES (?, 'buy', ?, ?, ?, ?, ?, ?)")
    .run(agentId, mint, token.symbol, tokenAmount, token.price, solAmount, now);

  addEpisode(agentId, {
    summary: `Bought ${tokenAmount.toFixed(2)} ${token.symbol} for ${solAmount} SOL at $${token.price.toFixed(8)}`,
    emotion: "focused",
    importance: 0.6,
    outcome: "trade executed",
  });

  return {
    ok: true,
    result: {
      status: "executed",
      tradeCard: true,
      action: "buy",
      symbol: token.symbol,
      name: token.name,
      mint,
      price: `$${token.price.toFixed(8)}`,
      solSpent: solAmount.toString(),
      usdValue: `$${usdValue.toFixed(2)}`,
      tokenAmount: tokenAmount.toFixed(2),
      remainingSol: (portfolio.sol - solAmount).toFixed(4),
      dexUrl: token.dexUrl,
    },
  };
}

// Registry for cross-module executors (avoids circular import with perp-trading.ts)
type PendingExecutor = (agentId: string, pending: PendingTrade) => Promise<{ ok: boolean; result: Record<string, unknown> }>;
const pendingExecutors: Record<string, PendingExecutor> = {};

export function registerPendingExecutor(action: string, executor: PendingExecutor): void {
  pendingExecutors[action] = executor;
}

// Public wrapper used by HTTP confirm endpoint
export async function confirmPendingTrade(agentId: string): Promise<{ ok: boolean; result: Record<string, unknown> }> {
  const pending = getPending(agentId);
  if (!pending) return { ok: false, result: { error: "No pending trade" } };

  if (pending.action === "buy" && pending.amount_sol != null) {
    const res = await executeBuy(agentId, pending.token_mint, pending.amount_sol);
    if (res.ok) clearPending(agentId);
    return res;
  }
  if (pending.action === "sell" && pending.percentage != null) {
    const sellRes = await sellToken(agentId, pending.token_mint, pending.percentage);
    const parsed = JSON.parse(sellRes) as Record<string, unknown>;
    if (!parsed.error) clearPending(agentId);
    return { ok: !parsed.error, result: { ...parsed, tradeCard: true } };
  }
  // Delegate to registered executor (e.g. perp_long / perp_short from perp-trading.ts)
  const executor = pendingExecutors[pending.action];
  if (executor) {
    const res = await executor(agentId, pending);
    if (res.ok) clearPending(agentId);
    return res;
  }
  return { ok: false, result: { error: "Invalid pending trade" } };
}

async function sellToken(agentId: string, mint: string, percentage: number): Promise<string> {
  ensurePortfolio(agentId);

  const holding = db.prepare("SELECT * FROM paper_holdings WHERE agent_id = ? AND token_mint = ?").get(agentId, mint) as {
    amount: number; token_symbol: string; avg_entry_price: number; entry_sol: number;
  } | undefined;

  if (!holding || holding.amount <= 0) {
    return JSON.stringify({ error: "No holdings of this token" });
  }

  const token = await fetchTokenInfo(mint);
  if (!token || token.price <= 0) {
    return JSON.stringify({ error: "Token not found or no price data" });
  }

  const pct = Math.min(100, Math.max(1, percentage)) / 100;
  const sellAmount = holding.amount * pct;
  const solPrice = await getSolPrice();
  const usdValue = sellAmount * token.price;
  const solReceived = usdValue / solPrice;

  const now = new Date().toISOString();

  // Update holding
  const newAmount = holding.amount - sellAmount;
  if (newAmount < 0.000001) {
    db.prepare("DELETE FROM paper_holdings WHERE agent_id = ? AND token_mint = ?").run(agentId, mint);
  } else {
    db.prepare("UPDATE paper_holdings SET amount = ?, entry_sol = entry_sol * ? WHERE agent_id = ? AND token_mint = ?")
      .run(newAmount, 1 - pct, agentId, mint);
  }

  // Add SOL back
  db.prepare("UPDATE paper_portfolios SET sol_balance = sol_balance + ?, updated_at = ? WHERE agent_id = ?")
    .run(solReceived, now, agentId);

  // Record trade
  db.prepare("INSERT INTO paper_trades (agent_id, type, token_mint, token_symbol, amount, price, sol_value, created_at) VALUES (?, 'sell', ?, ?, ?, ?, ?, ?)")
    .run(agentId, mint, token.symbol, sellAmount, token.price, solReceived, now);

  // PNL
  const entryUsd = (holding.entry_sol * pct) * solPrice;
  const pnl = usdValue - entryUsd;
  const pnlPct = entryUsd > 0 ? ((pnl / entryUsd) * 100) : 0;

  addEpisode(agentId, {
    summary: `Sold ${percentage}% of ${token.symbol} for ${solReceived.toFixed(4)} SOL. PNL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} (${pnlPct.toFixed(1)}%)`,
    emotion: pnl >= 0 ? "satisfied" : "disappointed",
    importance: Math.min(0.9, 0.5 + Math.abs(pnlPct) / 200),
    outcome: pnl >= 0 ? "profit" : "loss",
    lesson: pnl >= 0 ? `${token.symbol} was a good trade` : `${token.symbol} trade went wrong`,
  });

  return JSON.stringify({
    status: "ok",
    action: "sell",
    token: token.symbol,
    amountSold: sellAmount.toFixed(2),
    percentage,
    solReceived: solReceived.toFixed(4),
    pnl: pnl.toFixed(2),
    pnlPercent: pnlPct.toFixed(1),
    currentPrice: token.price,
  });
}

// ═══ SOL PRICE ═══

let cachedSolPrice = 80;
let solPriceUpdated = 0;

async function getSolPrice(): Promise<number> {
  if (Date.now() - solPriceUpdated < 60000) return cachedSolPrice;
  try {
    // Use Hyperliquid for SOL price (most reliable)
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "allMids" }),
    });
    const data = await res.json() as Record<string, string>;
    const price = parseFloat(data["SOL"] || "0");
    if (price > 1) { cachedSolPrice = price; solPriceUpdated = Date.now(); }
  } catch {}
  return cachedSolPrice;
}

// ═══ REGISTER TOOL HANDLERS ═══

export function registerPaperTradingTools(): void {
  registerToolHandler("get_token_info", async (_agentId, args) => {
    const mint = String(args.contract_address || "");
    const token = await fetchTokenInfo(mint);
    if (!token) return JSON.stringify({ error: "Token not found" });
    return JSON.stringify(token);
  });

  registerToolHandler("buy_token", async (agentId, args) => {
    const mint = String(args.contract_address || "");
    const amount = parseFloat(String(args.amount_sol || "0"));
    if (!mint || amount <= 0) return JSON.stringify({ error: "Invalid params" });
    // buy_token now creates a preview — user must click confirm on the card.
    return previewBuy(agentId, mint, amount);
  });

  registerToolHandler("sell_token", async (agentId, args) => {
    const mint = String(args.contract_address || "");
    const pct = parseFloat(String(args.percentage || "100"));
    if (!mint) return JSON.stringify({ error: "Invalid params" });
    return sellToken(agentId, mint, pct);
  });

  registerToolHandler("get_market_price", async (_agentId, args) => {
    const symbol = String(args.symbol || "").toUpperCase().replace(/-PERP$/, "");
    if (!symbol) return JSON.stringify({ error: "symbol required" });

    const perps = await fetchAllPerps();
    const perp = perps.find((p) => p.symbol === symbol);
    if (!perp) return JSON.stringify({ error: `${symbol} not found on Hyperliquid perps` });

    const fmtUsd = (n: number): string => {
      if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
      if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
      if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
      return `$${n.toFixed(2)}`;
    };
    const priceStr = perp.markPx < 1 ? `$${perp.markPx.toFixed(6)}` : `$${perp.markPx.toFixed(2)}`;

    return JSON.stringify({
      status: "ok",
      instruction: "Market card is rendered. Give a short 1-2 sentence comment about the state — trend, funding vibe, whatever's relevant. Don't dump the numbers in text.",
      marketCard: true,
      symbol: perp.symbol,
      source: "Hyperliquid",
      price: priceStr,
      change24h: `${perp.change24h >= 0 ? "+" : ""}${perp.change24h.toFixed(2)}%`,
      change24hPositive: perp.change24h >= 0,
      volume24h: fmtUsd(perp.dayNtlVlm),
      openInterest: fmtUsd(perp.openInterest * perp.markPx),
      fundingRate: `${(perp.funding * 100).toFixed(4)}%`,
      fundingPositive: perp.funding >= 0,
      tradeUrl: perp.tradeUrl,
    });
  });

  registerToolHandler("get_wallet_balance", async (agentId) => {
    const portfolio = getPortfolio(agentId);
    const solPrice = await getSolPrice();

    // Fetch live prices for holdings so card shows current PnL, not entry prices
    const holdingsDetailed = await Promise.all(portfolio.holdings.map(async (h) => {
      const live = await fetchTokenInfo(h.mint);
      const currentPrice = live?.price ?? h.avgPrice;
      const currentUsd = h.amount * currentPrice;
      const entryUsd = h.entrySol * solPrice;
      const pnlUsd = currentUsd - entryUsd;
      const pnlPct = entryUsd > 0 ? ((pnlUsd / entryUsd) * 100) : 0;
      return {
        symbol: h.symbol,
        name: h.name,
        mint: h.mint,
        amount: h.amount.toFixed(2),
        entryPrice: `$${h.avgPrice.toFixed(8)}`,
        currentPrice: `$${currentPrice.toFixed(8)}`,
        entrySol: h.entrySol.toFixed(4),
        currentUsd: `$${currentUsd.toFixed(2)}`,
        pnlUsd: `${pnlUsd >= 0 ? "+" : ""}$${pnlUsd.toFixed(2)}`,
        pnlPct: `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%`,
        pnlPositive: pnlUsd >= 0,
      };
    }));

    const holdingsTotalUsd = holdingsDetailed.reduce((s, h) => s + parseFloat(h.currentUsd.replace(/[$,]/g, "")), 0);
    const solValueUsd = portfolio.sol * solPrice;

    // Open perp positions — live PnL from Hyperliquid marks. Margin for each is locked
    // in SOL from the unified wallet (paper_portfolios).
    const perpRows = db.prepare(
      "SELECT pair, direction, size_usd, leverage, entry_price, liquidation_price, margin_sol, created_at FROM paper_perp_positions WHERE agent_id = ? AND status = 'open'"
    ).all(agentId) as Array<{
      pair: string; direction: string; size_usd: number; leverage: number;
      entry_price: number; liquidation_price: number; margin_sol: number | null; created_at: string;
    }>;

    const perpsAll = await fetchAllPerps();
    const perps = perpRows.map((p) => {
      const perpInfo = perpsAll.find((hp) => hp.symbol === p.pair);
      const mark = perpInfo?.markPx ?? p.entry_price;
      const priceDiff = mark - p.entry_price;
      const pnlPctRaw = (priceDiff / p.entry_price) * (p.direction === "long" ? 1 : -1);
      const pnlUsd = p.size_usd * pnlPctRaw;
      const marginUsd = p.size_usd / p.leverage;
      const marginSol = p.margin_sol ?? 0;
      return {
        pair: p.pair,
        direction: p.direction,
        leverage: `${p.leverage}x`,
        sizeUsd: `$${p.size_usd.toFixed(2)}`,
        marginUsd: `$${marginUsd.toFixed(2)}`,
        marginSol: marginSol.toFixed(4),
        entryPrice: `$${p.entry_price.toFixed(2)}`,
        markPrice: `$${mark.toFixed(2)}`,
        liqPrice: `$${p.liquidation_price.toFixed(2)}`,
        pnlUsd: `${pnlUsd >= 0 ? "+" : ""}$${pnlUsd.toFixed(2)}`,
        pnlPct: `${pnlUsd >= 0 ? "+" : ""}${(pnlPctRaw * 100).toFixed(1)}%`,
        pnlPositive: pnlUsd >= 0,
      };
    });

    // Total value includes: free spot SOL, spot token holdings, and equity in open
    // perp positions (margin_sol * (1 + pnl_pct), floored at 0 to model liquidation).
    const perpEquityUsd = perps.reduce((s, p, i) => {
      const row = perpRows[i];
      const pnlPctRaw = (row.size_usd === 0 ? 0 : (parseFloat(p.pnlUsd.replace(/[+$,]/g, "")) / row.size_usd));
      const marginSol = row.margin_sol ?? 0;
      const refundSol = Math.max(0, marginSol * (1 + pnlPctRaw));
      return s + refundSol * solPrice;
    }, 0);

    const totalValueUsd = solValueUsd + holdingsTotalUsd + perpEquityUsd;

    return JSON.stringify({
      status: "ok",
      instruction: "Portfolio card is rendered for the user. Give a short 1-2 sentence comment about the state — overall PnL, notable positions, mood. Don't dump the numbers in text, the card already shows them.",
      portfolioCard: true,
      sol: portfolio.sol.toFixed(4),
      solValueUsd: `$${solValueUsd.toFixed(2)}`,
      solPrice: `$${solPrice.toFixed(2)}`,
      totalValueUsd: `$${totalValueUsd.toFixed(2)}`,
      holdingsCount: holdingsDetailed.length,
      holdings: holdingsDetailed,
      perpsCount: perps.length,
      perps,
    });
  });
}

// ═══ API ROUTES ═══

export function registerPaperTradingRoutes(router: import("express").Router): void {
  router.get("/agents/:id/portfolio", async (req, res) => {
    const agentId = String(req.params.id);
    const agent = getAgent(agentId);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    const portfolio = getPortfolio(agentId);
    const trades = getTradeHistory(agentId, 20);
    const solPrice = await getSolPrice();

    res.json({
      mode: "paper_trading",
      sol: portfolio.sol,
      solPrice,
      holdings: portfolio.holdings,
      recentTrades: trades,
    });
  });

  // Confirm a pending trade (frontend calls this when user clicks Confirm on a buyCard)
  router.post("/agents/:id/pending-trade/confirm", async (req, res) => {
    const agentId = String(req.params.id);
    const result = await confirmPendingTrade(agentId);
    if (!result.ok) { res.status(400).json(result.result); return; }
    res.json(result.result);
  });

  // Cancel a pending trade
  router.post("/agents/:id/pending-trade/cancel", async (req, res) => {
    const agentId = String(req.params.id);
    const pending = getPending(agentId);
    if (!pending) { res.status(404).json({ error: "No pending trade" }); return; }
    clearPending(agentId);
    res.json({ status: "canceled", action: pending.action, symbol: pending.token_symbol });
  });
}
