"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

const API_URL = "https://zensai-backend-production.up.railway.app";

/* ═══ TYPES ═══ */

interface AgentPerpOverlay {
  agentId: string; agentName: string; direction: string;
  leverage: number; size: number; entry: number;
  pnl: number; pnlPercent: number;
}
interface PerpRow {
  symbol: string; markPx: number; oraclePx: number;
  prevDayPx: number; dayNtlVlm: number; funding: number;
  openInterest: number; change24h: number; tradeUrl: string;
  agentPositions: AgentPerpOverlay[];
}

interface AgentMemeOverlay {
  agentId: string; agentName: string;
  amount: number; avgPrice: number; dexUrl: string;
}
interface MemeRow {
  symbol: string; name: string; address: string;
  mcap: number; volume24h: number; priceChange1h: number;
  priceUsd: number; launchedAgo: string; dexUrl: string;
  agentHoldings: AgentMemeOverlay[];
}

interface AgentPolyOverlay {
  agentId: string; agentName: string; outcome: string;
  shares: number; avgPrice: number; currentPrice: number; pnl: number;
}
interface PolyRow {
  id: string; question: string; category: string;
  yesPrice: number; volume: number; endDate: string;
  recentMove: string; slug: string; polyUrl: string;
  agentBets: AgentPolyOverlay[];
}

/* ═══ HELPERS ═══ */

function formatPrice(n: number): string {
  if (n < 0.001) return n.toFixed(8);
  if (n < 1) return n.toFixed(4);
  if (n < 100) return n.toFixed(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatVol(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(0);
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/* ═══ PERP TERMINAL ═══ */

function PerpTerminal() {
  const [perps, setPerps] = useState<PerpRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"volume" | "change" | "funding" | "oi">("volume");
  const [sortAsc, setSortAsc] = useState(false);

  const fetchPerps = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/terminal/perps`);
      const data = await res.json();
      setPerps(data.perps || []);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPerps();
    const iv = setInterval(fetchPerps, 30_000);
    return () => clearInterval(iv);
  }, [fetchPerps]);

  const toggleSort = (key: typeof sortBy) => {
    if (sortBy === key) setSortAsc(!sortAsc);
    else { setSortBy(key); setSortAsc(false); }
  };

  const filtered = perps
    .filter((p) => !search || p.symbol.toUpperCase().includes(search.toUpperCase()))
    .sort((a, b) => {
      const mul = sortAsc ? 1 : -1;
      if (sortBy === "volume") return mul * (a.dayNtlVlm - b.dayNtlVlm);
      if (sortBy === "change") return mul * (a.change24h - b.change24h);
      if (sortBy === "funding") return mul * (a.funding - b.funding);
      return mul * (a.openInterest - b.openInterest);
    });

  const sortIcon = (key: typeof sortBy) =>
    sortBy === key ? (sortAsc ? " ↑" : " ↓") : "";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="mb-4">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search perps... (SOL, ETH, BTC, DOGE, ...)"
          className="w-full max-w-md px-4 py-2.5 text-[14px] bg-[var(--d-input)] border border-[var(--d-border)] text-[var(--d-t1)] placeholder:text-[var(--d-t3)] outline-none focus:border-[var(--d-accent)]" />
      </div>
      <p className="text-[12px] text-[var(--d-t3)] mb-3">
        {filtered.length} perps {search && `matching "${search}"`}
      </p>

      {loading ? (
        <p className="text-center py-12 text-[var(--d-t3)] italic">Loading perpetual markets...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--d-border)] text-[11px] uppercase tracking-wider text-[var(--d-t3)]">
                <th className="text-left py-3 px-3 font-semibold">Symbol</th>
                <th className="text-right py-3 px-3 font-semibold">Price</th>
                <th className="text-right py-3 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort("change")}>24h %{sortIcon("change")}</th>
                <th className="text-right py-3 px-3 font-semibold cursor-pointer select-none" onClick={() => toggleSort("volume")}>Volume{sortIcon("volume")}</th>
                <th className="text-right py-3 px-3 font-semibold cursor-pointer select-none hidden sm:table-cell" onClick={() => toggleSort("funding")}>Funding{sortIcon("funding")}</th>
                <th className="text-right py-3 px-3 font-semibold cursor-pointer select-none hidden md:table-cell" onClick={() => toggleSort("oi")}>OI{sortIcon("oi")}</th>
                <th className="text-right py-3 px-3 font-semibold">Agent</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const hasAgent = p.agentPositions.length > 0;
                return (
                  <Fragment key={p.symbol}>
                    <tr className={`border-b border-[var(--d-border)] hover:bg-[var(--d-subtle)] transition-colors ${hasAgent ? "bg-violet-500/5" : ""}`}>
                      <td className="py-3 px-3">
                        <a href={p.tradeUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-[var(--d-t1)] hover:underline">
                          {p.symbol}
                        </a>
                        {hasAgent && <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-violet-500/10 text-violet-500 border border-violet-500/20 font-bold">ZENSAI</span>}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[var(--d-t1)]">${formatPrice(p.markPx)}</td>
                      <td className={`py-3 px-3 text-right font-semibold ${p.change24h >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {p.change24h >= 0 ? "+" : ""}{p.change24h.toFixed(2)}%
                      </td>
                      <td className="py-3 px-3 text-right text-[var(--d-t2)]">${formatVol(p.dayNtlVlm)}</td>
                      <td className="py-3 px-3 text-right text-[var(--d-t2)] hidden sm:table-cell">{(p.funding * 100).toFixed(4)}%</td>
                      <td className="py-3 px-3 text-right text-[var(--d-t2)] hidden md:table-cell">${formatVol(p.openInterest)}</td>
                      <td className="py-3 px-3 text-right text-[var(--d-t3)]">{hasAgent ? p.agentPositions.length : "---"}</td>
                    </tr>
                    {p.agentPositions.map((ap, i) => (
                      <tr key={i} className="border-b border-[var(--d-border)] bg-violet-500/5">
                        <td colSpan={7} className="py-2 px-3 pl-8">
                          <div className="flex items-center gap-3 text-[12px] flex-wrap">
                            <span className="font-bold text-violet-500">{ap.agentId}</span>
                            <span className={`font-bold uppercase px-1.5 py-0.5 text-[10px] border ${ap.direction === "long" ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" : "text-red-500 bg-red-500/10 border-red-500/20"}`}>
                              {ap.direction} {ap.leverage}x
                            </span>
                            <span className="text-[var(--d-t2)]">@ ${ap.entry.toFixed(2)}</span>
                            <span className="text-[var(--d-t2)]">${ap.size}</span>
                            <span className={`font-semibold ${ap.pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                              {ap.pnl >= 0 ? "+" : ""}${ap.pnl.toFixed(0)} ({ap.pnlPercent >= 0 ? "+" : ""}{ap.pnlPercent.toFixed(1)}%)
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}

/* ═══ MEME TERMINAL ═══ */

function MemeTerminal() {
  const [tokens, setTokens] = useState<MemeRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const debouncedSearch = useDebounce(search, 500);

  const fetchTokens = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const url = q ? `${API_URL}/api/terminal/meme?q=${encodeURIComponent(q)}` : `${API_URL}/api/terminal/meme`;
      const res = await fetch(url);
      const data = await res.json();
      setTokens(data.tokens || []);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTokens(debouncedSearch);
  }, [debouncedSearch, fetchTokens]);

  useEffect(() => {
    if (!search) {
      const iv = setInterval(() => fetchTokens(""), 60_000);
      return () => clearInterval(iv);
    }
  }, [search, fetchTokens]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="mb-4">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Solana tokens... (bonk, wif, jup, ...)"
          className="w-full max-w-md px-4 py-2.5 text-[14px] bg-[var(--d-input)] border border-[var(--d-border)] text-[var(--d-t1)] placeholder:text-[var(--d-t3)] outline-none focus:border-[var(--d-accent)]" />
      </div>
      <p className="text-[12px] text-[var(--d-t3)] mb-3">
        {tokens.length} tokens {search ? `matching "${search}"` : "(trending)"}
      </p>

      {loading ? (
        <p className="text-center py-12 text-[var(--d-t3)] italic">Loading tokens...</p>
      ) : tokens.length === 0 ? (
        <p className="text-center py-12 text-[var(--d-t3)] italic">No tokens found</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--d-border)] text-[11px] uppercase tracking-wider text-[var(--d-t3)]">
                <th className="text-left py-3 px-3 font-semibold">Token</th>
                <th className="text-right py-3 px-3 font-semibold">Price</th>
                <th className="text-right py-3 px-3 font-semibold">MCap</th>
                <th className="text-right py-3 px-3 font-semibold">Volume</th>
                <th className="text-right py-3 px-3 font-semibold hidden sm:table-cell">1h %</th>
                <th className="text-right py-3 px-3 font-semibold hidden md:table-cell">Age</th>
                <th className="text-right py-3 px-3 font-semibold">Agent</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => {
                const hasAgent = (t.agentHoldings || []).length > 0;
                return (
                  <Fragment key={t.address}>
                    <tr className={`border-b border-[var(--d-border)] hover:bg-[var(--d-subtle)] transition-colors ${hasAgent ? "bg-violet-500/5" : ""}`}>
                      <td className="py-3 px-3">
                        <a href={t.dexUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-[var(--d-t1)] hover:underline">
                          {t.symbol}
                        </a>
                        <span className="ml-2 text-[11px] text-[var(--d-t3)]">{t.name}</span>
                        {hasAgent && <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-violet-500/10 text-violet-500 border border-violet-500/20 font-bold">ZENSAI</span>}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[var(--d-t1)]">${formatPrice(t.priceUsd)}</td>
                      <td className="py-3 px-3 text-right text-[var(--d-t2)]">${formatVol(t.mcap)}</td>
                      <td className="py-3 px-3 text-right text-[var(--d-t2)]">${formatVol(t.volume24h)}</td>
                      <td className={`py-3 px-3 text-right font-semibold hidden sm:table-cell ${t.priceChange1h >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {t.priceChange1h >= 0 ? "+" : ""}{t.priceChange1h.toFixed(1)}%
                      </td>
                      <td className="py-3 px-3 text-right text-[var(--d-t3)] hidden md:table-cell">{t.launchedAgo}</td>
                      <td className="py-3 px-3 text-right text-[var(--d-t3)]">{hasAgent ? t.agentHoldings.length : "---"}</td>
                    </tr>
                    {(t.agentHoldings || []).map((ah, i) => (
                      <tr key={i} className="border-b border-[var(--d-border)] bg-violet-500/5">
                        <td colSpan={7} className="py-2 px-3 pl-8">
                          <div className="flex items-center gap-3 text-[12px] flex-wrap">
                            <span className="font-bold text-violet-500">{ah.agentId}</span>
                            <span className="text-[var(--d-t2)]">holds {ah.amount.toFixed(2)} SOL</span>
                            <span className="text-[var(--d-t2)]">avg ${ah.avgPrice > 0.001 ? ah.avgPrice.toFixed(4) : ah.avgPrice.toFixed(8)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}

/* ═══ POLY TERMINAL ═══ */

function PolyTerminal() {
  const [markets, setMarkets] = useState<PolyRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const debouncedSearch = useDebounce(search, 500);

  const fetchMarkets = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const url = q ? `${API_URL}/api/terminal/poly?q=${encodeURIComponent(q)}` : `${API_URL}/api/terminal/poly`;
      const res = await fetch(url);
      const data = await res.json();
      setMarkets(data.markets || []);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMarkets(debouncedSearch);
  }, [debouncedSearch, fetchMarkets]);

  useEffect(() => {
    if (!search) {
      const iv = setInterval(() => fetchMarkets(""), 60_000);
      return () => clearInterval(iv);
    }
  }, [search, fetchMarkets]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="mb-4">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search prediction markets... (bitcoin, election, AI, ...)"
          className="w-full max-w-md px-4 py-2.5 text-[14px] bg-[var(--d-input)] border border-[var(--d-border)] text-[var(--d-t1)] placeholder:text-[var(--d-t3)] outline-none focus:border-[var(--d-accent)]" />
      </div>
      <p className="text-[12px] text-[var(--d-t3)] mb-3">
        {markets.length} markets {search ? `matching "${search}"` : "(active)"}
      </p>

      {loading ? (
        <p className="text-center py-12 text-[var(--d-t3)] italic">Loading prediction markets...</p>
      ) : markets.length === 0 ? (
        <p className="text-center py-12 text-[var(--d-t3)] italic">No markets found</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--d-border)] text-[11px] uppercase tracking-wider text-[var(--d-t3)]">
                <th className="text-left py-3 px-3 font-semibold">Question</th>
                <th className="text-right py-3 px-3 font-semibold">Yes %</th>
                <th className="text-right py-3 px-3 font-semibold hidden sm:table-cell">Volume</th>
                <th className="text-right py-3 px-3 font-semibold hidden md:table-cell">Ends</th>
                <th className="text-right py-3 px-3 font-semibold">Move</th>
                <th className="text-right py-3 px-3 font-semibold">Agent</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m) => {
                const hasAgent = (m.agentBets || []).length > 0;
                const catColor = m.category === "crypto" ? "text-amber-500" : m.category === "politics" ? "text-blue-500" : m.category === "tech" ? "text-cyan-500" : "text-[var(--d-t3)]";
                return (
                  <Fragment key={m.id}>
                    <tr className={`border-b border-[var(--d-border)] hover:bg-[var(--d-subtle)] transition-colors ${hasAgent ? "bg-violet-500/5" : ""}`}>
                      <td className="py-3 px-3 max-w-[300px]">
                        <a href={m.polyUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--d-t1)] hover:underline line-clamp-2">
                          {m.question}
                        </a>
                        <span className={`ml-2 text-[10px] uppercase font-semibold ${catColor}`}>{m.category}</span>
                        {hasAgent && <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-violet-500/10 text-violet-500 border border-violet-500/20 font-bold">ZENSAI</span>}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-[var(--d-t1)]">
                        {(m.yesPrice * 100).toFixed(0)}%
                      </td>
                      <td className="py-3 px-3 text-right text-[var(--d-t2)] hidden sm:table-cell">${formatVol(m.volume)}</td>
                      <td className="py-3 px-3 text-right text-[var(--d-t3)] text-[11px] hidden md:table-cell">{m.endDate?.slice(0, 10) || "TBD"}</td>
                      <td className={`py-3 px-3 text-right font-semibold ${m.recentMove.startsWith("+") ? "text-emerald-500" : m.recentMove.startsWith("-") ? "text-red-500" : "text-[var(--d-t3)]"}`}>
                        {m.recentMove}
                      </td>
                      <td className="py-3 px-3 text-right text-[var(--d-t3)]">{hasAgent ? m.agentBets.length : "---"}</td>
                    </tr>
                    {(m.agentBets || []).map((ab, i) => (
                      <tr key={i} className="border-b border-[var(--d-border)] bg-violet-500/5">
                        <td colSpan={6} className="py-2 px-3 pl-8">
                          <div className="flex items-center gap-3 text-[12px] flex-wrap">
                            <span className="font-bold text-violet-500">{ab.agentId}</span>
                            <span className="font-bold text-[var(--d-t1)]">{ab.outcome}</span>
                            <span className="text-[var(--d-t2)]">{ab.shares} shares @ ${ab.avgPrice.toFixed(2)}</span>
                            <span className={`font-semibold ${ab.pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                              {ab.pnl >= 0 ? "+" : ""}${ab.pnl.toFixed(1)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}

/* ═══ MAIN PAGE ═══ */

import { Fragment } from "react";

type Tab = "perps" | "meme" | "poly";

const TABS: { key: Tab; label: string; jp: string }[] = [
  { key: "perps", label: "Perp Terminal", jp: "永久" },
  { key: "meme", label: "Meme Terminal", jp: "迷夢" },
  { key: "poly", label: "Poly Terminal", jp: "予測" },
];

export default function TerminalPage() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [activeTab, setActiveTab] = useState<Tab>("perps");

  return (
    <div data-dojo-theme={theme}>
      <div className="min-h-screen bg-[var(--d-page)]">
        {/* Header */}
        <div className="sticky top-0 z-30 backdrop-blur-xl border-b border-[var(--d-border)] bg-[var(--d-card-t)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="font-serif text-base tracking-wider text-[var(--d-t1)]">ZENSAI</Link>
              <span className="text-[var(--d-sep)] opacity-30">|</span>
              <span className="font-serif text-[11px] tracking-widest text-[var(--d-t3)]">端末 TERMINAL</span>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/dojo" className="text-[12px] text-[var(--d-t2)] hover:text-[var(--d-t1)] transition-colors">
                Dojo
              </Link>
              <button onClick={() => setTheme((t) => t === "light" ? "dark" : "light")}
                className="w-8 h-8 flex items-center justify-center border border-[var(--d-border)] text-[var(--d-t3)] hover:text-[var(--d-t1)] transition-colors">
                {theme === "dark" ? "☀" : "☾"}
              </button>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="border-b border-[var(--d-border)] bg-[var(--d-card)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex items-center gap-1 py-2 overflow-x-auto">
              {TABS.map((tab) => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2 text-[13px] font-medium transition-all whitespace-nowrap ${
                    activeTab === tab.key
                      ? "bg-[var(--d-accent)] text-[var(--d-accent-t)]"
                      : "text-[var(--d-t2)] hover:text-[var(--d-t1)] hover:bg-[var(--d-subtle)]"
                  }`}>
                  {tab.label} <span className="font-serif text-[10px] ml-1 opacity-50">{tab.jp}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Terminal content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <AnimatePresence mode="wait">
            {activeTab === "perps" && <PerpTerminal key="perps" />}
            {activeTab === "meme" && <MemeTerminal key="meme" />}
            {activeTab === "poly" && <PolyTerminal key="poly" />}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
