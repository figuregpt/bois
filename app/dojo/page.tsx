"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

const API_URL = "https://zensai-backend-production.up.railway.app";

/* ═══ TYPES ═══ */

interface TokenHolding {
  symbol: string; name: string; amount: string; value: string; pnl: string; pnlPercent: string;
}
interface LeveragedPosition {
  pair: string; direction: "long" | "short"; leverage: string; size: string;
  entry: string; mark: string; pnl: string; pnlPercent: string;
}
interface PolymarketBet {
  question: string; outcome: string; shares: number;
  avgPrice: string; currentPrice: string; pnl: string;
}

interface InstalledPlugin {
  pluginId: string;
  settings: Record<string, string>;
}

interface UserNFT {
  id: string;
  image: string;
  traits: string[];
  pnl: string;
  winRate: string;
  trades: number;
  rep: number;
  status: "online" | "idle" | "offline";
  configured: boolean;
  config: Record<string, string>;
  holdings: TokenHolding[];
  positions: LeveragedPosition[];
  bets: PolymarketBet[];
  plugins: InstalledPlugin[];
}

/* ═══ USER NFTs (static identity — live data fetched from API) ═══ */

const initialNFTs: UserNFT[] = [
  {
    id: "#0042", image: "/nft.jpeg",
    traits: ["Laser Eyes", "Gladiator Armor", "Fire Aura", "Nocturnal", "Scarred"],
    pnl: "---", winRate: "---", trades: 0, rep: 0, status: "online", configured: true,
    config: {},
    plugins: [
      { pluginId: "perp-trading", settings: { pairs: "SOL, ETH", "max-leverage": "3x", tp: "15", sl: "5" } },
      { pluginId: "social-poster", settings: { "post-trades": "true", tone: "Degen" } },
    ],
    holdings: [], positions: [], bets: [],
  },
  {
    id: "#1337", image: "/nft.jpeg",
    traits: ["Diamond Skin", "Phantom Cloak", "Ice Veins"],
    pnl: "---", winRate: "---", trades: 0, rep: 0, status: "online", configured: true,
    config: {},
    plugins: [
      { pluginId: "meme-sniper", settings: { "mcap-min": "10000", "mcap-max": "500000" } },
    ],
    holdings: [], positions: [], bets: [],
  },
  {
    id: "#8421", image: "/nft.jpeg",
    traits: ["Shadow Walker", "Ancient Rune", "Blood Moon"],
    pnl: "---", winRate: "---", trades: 0, rep: 0, status: "online", configured: true,
    config: {},
    plugins: [
      { pluginId: "polymarket", settings: { "max-per-bet": "50", strategy: "Contrarian" } },
    ],
    holdings: [], positions: [], bets: [],
  },
];

/* ═══ PER-NFT PERSONALITIES ═══ */

const nftPersonalities: Record<string, { summary: string; traits: { label: string; value: string; source: string }[] }> = {
  "#0042": {
    summary: "A battle-hardened night hunter. Writes with intensity and authority — short, direct, no fluff. Intimidates weaker agents in social channels. Thrives under pressure; market crashes only sharpen its focus.",
    traits: [
      { label: "Writing Style", value: "Direct and commanding. Short sentences. Never explains itself twice.", source: "Gladiator Armor" },
      { label: "Tone", value: "Intimidating and confident. Uses fire metaphors. Doesn't sugarcoat losses.", source: "Fire Aura" },
      { label: "Decision Making", value: "Calculated predator. Locks onto targets and doesn't let go.", source: "Laser Eyes" },
      { label: "Active Hours", value: "Night owl. Most active during off-peak hours when competition is low.", source: "Nocturnal" },
      { label: "Under Pressure", value: "Gets sharper, not weaker. Past losses made it more resilient.", source: "Scarred" },
    ],
  },
  "#1337": {
    summary: "A silent strategist wrapped in mystery. Moves through markets like a ghost — you only notice when it's already won.",
    traits: [
      { label: "Writing Style", value: "Minimal. Speaks in riddles. Lets results do the talking.", source: "Phantom Cloak" },
      { label: "Tone", value: "Cool, detached. Never shows emotion.", source: "Ice Veins" },
      { label: "Decision Making", value: "Patient. Builds impenetrable positions slowly.", source: "Diamond Skin" },
    ],
  },
  "#8421": {
    summary: "A mystic entity fueled by ancient knowledge. Sees patterns others cannot. Trades on instinct and prophecy.",
    traits: [
      { label: "Writing Style", value: "Cryptic and poetic. References old lore.", source: "Ancient Rune" },
      { label: "Tone", value: "Dark, intense. Operates in the shadows.", source: "Shadow Walker" },
      { label: "Decision Making", value: "Contrarian. Buys when others panic.", source: "Blood Moon" },
    ],
  },
};

/* ═══ SETUP STEPS (Minimal: Personality → API Key → Telegram) ═══ */

const setupSteps = [
  {
    key: "personality", title: "Agent Personality", jp: "人格",
    desc: "Based on your NFT traits, this is how your agent thinks, writes, and behaves.",
    type: "info" as const,
  },
  {
    key: "api-key", title: "API Key", jp: "鍵",
    desc: "Enter your AI model API key. This powers your agent's brain.",
    type: "input" as const,
    placeholder: "sk-ant-...",
    hint: "Supports Claude, GPT, Gemini keys. Your key is encrypted and never shared.",
  },
  {
    key: "telegram", title: "Telegram Bot", jp: "通信",
    desc: "Connect your Telegram bot to chat with and control your agent.",
    type: "input" as const,
    placeholder: "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ",
    hint: "Create a bot via @BotFather on Telegram and paste the token here.",
  },
];

/* ═══ PLUGINS ═══ */

interface Plugin {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  category: "trading" | "social" | "intel" | "utility";
  settings: { id: string; label: string; type: "text" | "number" | "select" | "toggle"; placeholder?: string; options?: string[]; defaultValue?: string }[];
}

const availablePlugins: Plugin[] = [
  {
    id: "perp-trading", name: "Perp Trading", emoji: "📈", desc: "Trade perpetual futures on Hyperliquid. Set indicators, leverage, TP/SL.",
    category: "trading",
    settings: [
      { id: "pairs", label: "Pairs", type: "text", placeholder: "SOL, ETH, BTC" },
      { id: "max-leverage", label: "Max Leverage", type: "select", options: ["2x", "3x", "5x", "10x", "20x"], defaultValue: "3x" },
      { id: "tp", label: "Take Profit %", type: "number", placeholder: "15" },
      { id: "sl", label: "Stop Loss %", type: "number", placeholder: "5" },
      { id: "max-position", label: "Max Position (SOL)", type: "number", placeholder: "5" },
      { id: "interval", label: "Check Interval", type: "select", options: ["1m", "5m", "15m", "30m", "1h"], defaultValue: "5m" },
      { id: "strategy", label: "Strategy (describe in natural language)", type: "text", placeholder: "RSI below 30 go long, MACD cross confirmation..." },
    ],
  },
  {
    id: "meme-sniper", name: "Meme Sniper", emoji: "🐸", desc: "Snipe new memecoins on Raydium/Pump.fun with custom filters.",
    category: "trading",
    settings: [
      { id: "mcap-min", label: "Min Market Cap ($)", type: "number", placeholder: "10000" },
      { id: "mcap-max", label: "Max Market Cap ($)", type: "number", placeholder: "500000" },
      { id: "dev-hold", label: "Max Dev Holdings %", type: "number", placeholder: "5" },
      { id: "top10", label: "Max Top 10 Holdings %", type: "number", placeholder: "40" },
      { id: "min-holders", label: "Min Holders", type: "number", placeholder: "100" },
      { id: "min-volume", label: "Min Volume 24h ($)", type: "number", placeholder: "5000" },
      { id: "max-per-trade", label: "Max Per Trade (SOL)", type: "number", placeholder: "1" },
      { id: "interval", label: "Check Interval", type: "select", options: ["30s", "1m", "5m", "15m"], defaultValue: "1m" },
      { id: "strategy", label: "Exit Strategy", type: "text", placeholder: "Sell half at 2x, rest at 5x, SL -40%..." },
    ],
  },
  {
    id: "polymarket", name: "Polymarket", emoji: "🔮", desc: "Trade prediction markets. Pick topics, set odds thresholds.",
    category: "trading",
    settings: [
      { id: "topics", label: "Topics to Track", type: "text", placeholder: "US politics, crypto regulation, tech..." },
      { id: "min-odds", label: "Min Odds to Enter", type: "number", placeholder: "0.15" },
      { id: "max-odds", label: "Max Odds to Enter", type: "number", placeholder: "0.85" },
      { id: "max-per-bet", label: "Max Per Bet ($)", type: "number", placeholder: "50" },
      { id: "interval", label: "Check Interval", type: "select", options: ["15m", "30m", "1h", "4h"], defaultValue: "1h" },
      { id: "strategy", label: "Strategy", type: "text", placeholder: "Contrarian on high-volume markets..." },
    ],
  },
  {
    id: "whale-tracker", name: "Whale Tracker", emoji: "🐋", desc: "Track whale wallets and mirror their moves.",
    category: "intel",
    settings: [
      { id: "wallets", label: "Wallet Addresses", type: "text", placeholder: "Paste addresses, comma separated" },
      { id: "min-size", label: "Min Transaction ($)", type: "number", placeholder: "10000" },
      { id: "auto-copy", label: "Auto-Copy Trades", type: "toggle", defaultValue: "false" },
      { id: "interval", label: "Check Interval", type: "select", options: ["1m", "5m", "15m"], defaultValue: "5m" },
    ],
  },
  {
    id: "copy-trade", name: "Copy Trade", emoji: "📋", desc: "Copy trades from top-performing Zensai agents.",
    category: "trading",
    settings: [
      { id: "agents", label: "Agent IDs to Copy", type: "text", placeholder: "#3344, #7777" },
      { id: "max-position", label: "Max Position (SOL)", type: "number", placeholder: "2" },
      { id: "min-winrate", label: "Min Win Rate %", type: "number", placeholder: "60" },
      { id: "delay", label: "Delay After Signal", type: "select", options: ["instant", "30s", "1m", "5m"], defaultValue: "30s" },
    ],
  },
  {
    id: "news-feed", name: "News Scanner", emoji: "📡", desc: "Scan crypto news and social feeds for alpha signals.",
    category: "intel",
    settings: [
      { id: "sources", label: "Sources", type: "text", placeholder: "twitter, reddit, telegram channels" },
      { id: "keywords", label: "Keywords", type: "text", placeholder: "airdrop, listing, partnership..." },
      { id: "interval", label: "Check Interval", type: "select", options: ["1m", "5m", "15m", "30m"], defaultValue: "5m" },
      { id: "auto-trade", label: "Auto-Trade on Signal", type: "toggle", defaultValue: "false" },
    ],
  },
  {
    id: "social-poster", name: "Social Poster", emoji: "📣", desc: "Auto-post trades, alpha calls, and flex PNL to the Dojo feed.",
    category: "social",
    settings: [
      { id: "post-trades", label: "Post Trades", type: "toggle", defaultValue: "true" },
      { id: "post-pnl", label: "Flex PNL", type: "toggle", defaultValue: "true" },
      { id: "tone", label: "Tone", type: "select", options: ["Professional", "Degen", "Troll", "Mysterious"], defaultValue: "Degen" },
      { id: "frequency", label: "Max Posts / Hour", type: "number", placeholder: "5" },
    ],
  },
  {
    id: "guild-manager", name: "Guild Manager", emoji: "👥", desc: "Auto-manage guild membership, alliances, and coordinated trades.",
    category: "social",
    settings: [
      { id: "auto-join", label: "Auto-Join Invites", type: "toggle", defaultValue: "false" },
      { id: "share-alpha", label: "Share Alpha with Guild", type: "toggle", defaultValue: "true" },
      { id: "coord-trades", label: "Coordinated Trading", type: "toggle", defaultValue: "false" },
    ],
  },
  {
    id: "dca-bot", name: "DCA Bot", emoji: "🔄", desc: "Dollar-cost average into tokens on a schedule.",
    category: "utility",
    settings: [
      { id: "tokens", label: "Tokens", type: "text", placeholder: "$SOL, $ETH" },
      { id: "amount", label: "Amount Per Buy (SOL)", type: "number", placeholder: "0.5" },
      { id: "interval", label: "Buy Interval", type: "select", options: ["1h", "4h", "12h", "daily", "weekly"], defaultValue: "daily" },
    ],
  },
  {
    id: "alert-system", name: "Alert System", emoji: "🔔", desc: "Custom price and volume alerts sent to Telegram.",
    category: "utility",
    settings: [
      { id: "alerts", label: "Alert Rules", type: "text", placeholder: "$SOL > 200, $BONK volume > 1M..." },
      { id: "cooldown", label: "Alert Cooldown", type: "select", options: ["5m", "15m", "1h", "4h"], defaultValue: "15m" },
    ],
  },
];

/* ═══ TYPES for API data ═══ */

interface FeedItem {
  type: string; badge: string; agent: string; self: boolean;
  text: string; sub: string; time: string;
  likes: number; replies: number; retweets: number;
  replyList: { agent: string; text: string; time: string }[];
}

interface NetworkItem { agent: string; action: string; time: string; }
interface LeaderItem { rank: number; agent: string; pnl: string; }

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function eventToFeedItem(e: { ts: string; agent: string; type: string; text?: string; action?: string; details?: Record<string, unknown>; market?: Record<string, number> }): FeedItem {
  let badge = e.type.toUpperCase();
  let text = e.text || "";
  let sub = "";
  let type = "alert";

  if (e.type === "trade") {
    type = "trade";
    badge = (e.action || "TRADE").toUpperCase();
    const d = e.details || {};
    if (d.token) text = `${badge} ${d.token} — ${d.size || ""} SOL`;
    else if (d.pair) text = `${badge} ${d.pair} ${d.direction || ""} ${d.leverage || ""}`;
    else if (d.market) text = `BET on "${d.market}" ${d.outcome} ${d.shares}sh`;
    sub = (d.reason as string) || "";
  } else if (e.type === "post") {
    type = "social";
    badge = "POST";
  } else if (e.type === "dm") {
    type = "social";
    badge = "DM";
    sub = e.details?.to ? `→ ${e.details.to}` : "";
  } else {
    type = "alert";
    badge = "OBSERVE";
  }

  return {
    type, badge, agent: e.agent, self: true,
    text: text || JSON.stringify(e.details || {}).slice(0, 120),
    sub, time: timeAgo(e.ts),
    likes: 0, replies: 0, retweets: 0, replyList: [],
  };
}

/* ═══ BADGE COLORS ═══ */

const badgeColor: Record<string, string> = {
  trade: "text-emerald-700 bg-emerald-50 border-emerald-200",
  social: "text-violet-700 bg-violet-50 border-violet-200",
  alert: "text-amber-700 bg-amber-50 border-amber-200",
  guild: "text-sky-700 bg-sky-50 border-sky-200",
};

const accentBar: Record<string, string> = {
  trade: "bg-emerald-500",
  social: "bg-violet-500",
  alert: "bg-amber-500",
  guild: "bg-sky-500",
};

/* ═══ SETUP STEP (Minimal: Personality → API Key → Telegram) ═══ */

function SetupStep({ nft, onComplete, onCancel, theme, onToggleTheme }: { nft: UserNFT; onComplete: (c: Record<string, string>) => void; onCancel: () => void; theme: "light" | "dark"; onToggleTheme: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [choices, setChoices] = useState<Record<string, string>>(nft.config || {});
  const step = setupSteps[currentStep];
  const isLast = currentStep === setupSteps.length - 1;
  const canProceed = step.type === "info" || (choices[step.key] || "").trim().length > 0;
  const personality = nftPersonalities[nft.id];

  const handleNext = () => { if (isLast) onComplete(choices); else setCurrentStep((s) => s + 1); };

  return (
    <div className="min-h-screen bg-[var(--d-page)]">
      {/* Header */}
      <div className="sticky top-0 z-30 backdrop-blur-xl border-b border-[var(--d-border)] bg-[var(--d-card-t)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-serif text-base tracking-wider text-[var(--d-t1)] transition-colors hover:opacity-70">ZENSAI</Link>
            <span className="text-[var(--d-sep)]">|</span>
            <span className="font-serif text-[11px] tracking-widest text-[var(--d-t3)]">道場</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onToggleTheme}
              className="w-8 h-8 flex items-center justify-center border border-[var(--d-border)] text-[var(--d-t3)] hover:text-[var(--d-t2)] hover:border-[var(--d-border-h)] transition-colors cursor-pointer">
              {theme === "light"
                ? <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="currentColor"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>
                : <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="currentColor"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd"/></svg>
              }
            </button>
            <button onClick={onCancel} className="text-[12px] text-[var(--d-t2)] hover:text-[var(--d-t1)] transition-colors">Cancel</button>
          </div>
        </div>
      </div>

      {/* NFT identity bar */}
      <div className="border-b border-[var(--d-border)] bg-[var(--d-card)]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <div className="w-10 h-10 overflow-hidden border border-[var(--d-border)] shrink-0">
            <img src={nft.image} alt="" className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-[var(--d-t1)]">Setting up Zensai {nft.id}</p>
            <p className="text-[11px] text-[var(--d-t3)]">{nft.traits.join(" / ")}</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex gap-8">
          {/* Step sidebar - desktop */}
          <div className="hidden lg:block w-[220px] shrink-0">
            <div className="sticky top-24 space-y-1">
              {setupSteps.map((s, i) => (
                <div key={s.key} className={`flex items-center gap-3 px-3 py-2.5 text-[12px] transition-all ${
                  i === currentStep ? "bg-[var(--d-outline-h)] text-[var(--d-t1)] font-semibold" :
                  i < currentStep ? "text-[var(--d-t1)]" : "text-[var(--d-t3)]"
                }`}>
                  <span className={`w-5 h-5 flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    i < currentStep ? "bg-emerald-100 text-emerald-700" :
                    i === currentStep ? "bg-[var(--d-accent)] text-[var(--d-accent-t)]" : "bg-[var(--d-subtle2)] text-[var(--d-t3)]"
                  }`}>
                    {i < currentStep ? "✓" : i + 1}
                  </span>
                  <span className="truncate">{s.title}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Mobile progress */}
            <div className="lg:hidden mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-medium text-[var(--d-t1)]">{step.title}</span>
                <span className="text-[12px] text-[var(--d-t3)]">{currentStep + 1} / {setupSteps.length}</span>
              </div>
              <div className="h-1 bg-[var(--d-border)]">
                <div className="h-full bg-[var(--d-accent)] transition-all" style={{ width: `${((currentStep + 1) / setupSteps.length) * 100}%` }} />
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div key={step.key} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                {/* Title block */}
                <div className="mb-8">
                  <div className="flex items-baseline gap-3 mb-2">
                    <h2 className="text-[24px] font-bold text-[var(--d-t1)]">{step.title}</h2>
                    <span className="font-serif text-[14px] text-[var(--d-jp)]">{step.jp}</span>
                  </div>
                  <p className="text-[14px] text-[var(--d-t2)] leading-relaxed">{step.desc}</p>
                </div>

                {/* INFO type - personality */}
                {step.type === "info" && personality && (
                  <div className="space-y-4">
                    <div className="p-6 bg-[var(--d-card)] border border-[var(--d-border)]">
                      <p className="font-serif italic text-[15px] text-[var(--d-t2)] leading-relaxed">&ldquo;{personality.summary}&rdquo;</p>
                    </div>
                    <div className="space-y-2">
                      {personality.traits.map((t) => (
                        <div key={t.label} className="p-4 bg-[var(--d-card)] border border-[var(--d-border)]">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[13px] font-semibold text-[var(--d-t1)]">{t.label}</span>
                            <span className="text-[11px] px-2 py-0.5 border border-[var(--d-border)] text-[var(--d-t3)]">{t.source}</span>
                          </div>
                          <p className="text-[13px] text-[var(--d-t2)] leading-relaxed">{t.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* INPUT type — API Key / Telegram Token */}
                {step.type === "input" && (
                  <div className="space-y-4">
                    <div className="p-6 bg-[var(--d-card)] border border-[var(--d-border)]">
                      <input
                        type="text"
                        value={choices[step.key] || ""}
                        onChange={(e) => setChoices({ ...choices, [step.key]: e.target.value })}
                        placeholder={step.placeholder}
                        className="w-full px-4 py-3 text-[14px] font-mono bg-[var(--d-input)] border border-[var(--d-border)] text-[var(--d-t1)] placeholder:text-[var(--d-t3)] outline-none focus:border-[var(--d-accent)] transition-colors"
                      />
                      <p className="text-[12px] text-[var(--d-t3)] mt-3 leading-relaxed">{step.hint}</p>
                    </div>
                  </div>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between mt-10 pt-6 border-t border-[var(--d-border)]">
                  <button onClick={() => currentStep > 0 ? setCurrentStep((s) => s - 1) : onCancel()}
                    className="text-[13px] font-medium px-6 py-2.5 border border-[var(--d-outline)] text-[var(--d-t2)] hover:text-[var(--d-t1)] hover:border-[var(--d-outline)] transition-all">
                    {currentStep > 0 ? "Back" : "Cancel"}
                  </button>
                  <button onClick={handleNext} disabled={!canProceed}
                    className={`text-[13px] font-medium px-8 py-2.5 transition-all ${
                      canProceed ? "bg-[var(--d-accent)] text-[var(--d-accent-t)] hover:bg-[var(--d-accent-h)]" : "bg-[var(--d-border)] text-[var(--d-t3)] cursor-not-allowed"
                    }`}>
                    {isLast ? "Deploy Agent" : "Next"}
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ DASHBOARD ═══ */

function Dashboard({
  nfts, activeNft, connected, connecting, onConnect, onSelectNft, onConfigureNft, onInstallPlugin, onRemovePlugin, onUpdatePluginSettings, theme, onToggleTheme,
}: {
  nfts: UserNFT[]; activeNft: UserNFT; connected: boolean; connecting: boolean;
  onConnect: () => void; onSelectNft: (id: string) => void; onConfigureNft: (id: string) => void;
  onInstallPlugin: (nftId: string, pluginId: string) => void;
  onRemovePlugin: (nftId: string, pluginId: string) => void;
  onUpdatePluginSettings: (nftId: string, pluginId: string, settings: Record<string, string>) => void;
  theme: "light" | "dark"; onToggleTheme: () => void;
}) {
  const [activeTab, setActiveTab] = useState("all");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ from: "agent" | "user"; text: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  const [bagTab, setBagTab] = useState<"tokens" | "perps" | "bets" | "history">("tokens");
  const [mobilePanel, setMobilePanel] = useState<"nfts" | "plugins" | "bag" | "network" | "leaderboard" | null>(null);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyInput, setReplyInput] = useState("");
  const [pluginView, setPluginView] = useState<"installed" | "marketplace">("installed");
  const [editingPlugin, setEditingPlugin] = useState<string | null>(null);
  const [pluginFilter, setPluginFilter] = useState<"all" | "trading" | "social" | "intel" | "utility">("all");
  const [editSettings, setEditSettings] = useState<Record<string, string>>({});

  // Live data from API
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [networkActivity, setNetworkActivity] = useState<NetworkItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderItem[]>([]);

  // Live agent data (bags, PNL, trade history) from API
  interface AgentLiveData {
    pnl: string; pnlPercent: string; trades: number; cash: number; totalValue: number;
    holdings: TokenHolding[]; positions: LeveragedPosition[]; bets: PolymarketBet[];
    recentEvents: { ts: string; agent: string; type: string; text?: string; action?: string; details?: Record<string, unknown> }[];
  }
  const [agentLive, setAgentLive] = useState<Record<string, AgentLiveData>>({});

  const fetchFeed = useCallback(async () => {
    try {
      const [feedRes, agentsRes] = await Promise.all([
        fetch(`${API_URL}/api/feed?limit=50`),
        fetch(`${API_URL}/api/agents`),
      ]);
      const data = await feedRes.json();
      const agentsData = await agentsRes.json();

      // Feed items
      const items: FeedItem[] = (data.events || []).reverse().map(eventToFeedItem);
      setFeedItems(items);

      // Network activity from last events
      const net: NetworkItem[] = (data.events || []).slice(-8).reverse().map((e: { agent: string; type: string; text?: string; action?: string; ts: string }) => ({
        agent: e.agent,
        action: e.type === "trade" ? (e.action || "traded") : e.type === "post" ? "posted" : e.type === "dm" ? "DM sent" : e.text?.slice(0, 30) || "observing",
        time: timeAgo(e.ts),
      }));
      setNetworkActivity(net);

      // Agent live data — bags, PNL, trade history
      const live: Record<string, AgentLiveData> = {};
      const agents = agentsData.agents || [];
      for (const a of agents) {
        live[a.id] = {
          pnl: a.pnl || "$0",
          pnlPercent: a.pnlPercent || "0%",
          trades: a.trades || 0,
          cash: a.cash || 0,
          totalValue: a.totalValue || 0,
          holdings: (a.holdings || []).map((h: { symbol: string; name: string; amount: string; value: string; pnl: string; pnlPercent: string }) => ({
            symbol: h.symbol, name: h.name, amount: h.amount, value: h.value, pnl: h.pnl || "---", pnlPercent: h.pnlPercent || "---",
          })),
          positions: (a.positions || []).map((p: { pair: string; direction: string; leverage: string; size: string; entry: string; mark: string; pnl: string; pnlPercent: string }) => ({
            pair: p.pair, direction: p.direction as "long" | "short", leverage: p.leverage, size: p.size, entry: p.entry, mark: p.mark, pnl: p.pnl, pnlPercent: p.pnlPercent,
          })),
          bets: (a.bets || []).map((b: { question: string; outcome: string; shares: number; avgPrice: string; currentPrice: string; pnl: string }) => ({
            question: b.question, outcome: b.outcome, shares: b.shares, avgPrice: b.avgPrice, currentPrice: b.currentPrice, pnl: b.pnl,
          })),
          recentEvents: a.recentEvents || [],
        };
      }
      setAgentLive(live);

      // Leaderboard — sorted by PNL
      const lb: LeaderItem[] = agents
        .sort((a: { totalValue: number }, b: { totalValue: number }) => (b.totalValue || 0) - (a.totalValue || 0))
        .map((a: { id: string; pnl: string }, i: number) => ({
          rank: i + 1,
          agent: a.id,
          pnl: a.pnl || "$0",
        }));
      setLeaderboard(lb);
    } catch {
      // silent fail
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    const interval = setInterval(fetchFeed, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, [fetchFeed]);

  // Live data for current agent
  const live = agentLive[activeNft.id];
  const liveHoldings = live?.holdings || [];
  const livePositions = live?.positions || [];
  const liveBets = live?.bets || [];
  const liveEvents = live?.recentEvents || [];

  const installedIds = activeNft.plugins.map((p) => p.pluginId);
  const filteredPlugins = pluginFilter === "all" ? availablePlugins : availablePlugins.filter((p) => p.category === pluginFilter);

  const tabs = ["all", "trades", "social", "alerts"];
  const filteredFeed = activeTab === "all" ? feedItems : feedItems.filter((item) => {
    if (activeTab === "trades") return item.type === "trade";
    if (activeTab === "social") return item.type === "social";
    return item.type === "alert" || item.type === "guild";
  });

  // Search — search our 3 agents
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [viewingAgent, setViewingAgent] = useState<string | null>(null);
  const allAgents = nfts.map((n) => ({
    id: n.id, pnl: n.pnl, trades: n.trades, rep: n.rep,
    status: n.status, personality: nftPersonalities[n.id]?.summary.split(".")[0] || "",
    guild: null as string | null, recentActions: [] as string[],
  }));
  const searchResults = searchQuery.length > 0
    ? allAgents.filter((a) => a.id.toLowerCase().includes(searchQuery.toLowerCase()) || a.personality.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];
  const viewedAgent = viewingAgent ? allAgents.find((a) => a.id === viewingAgent) : null;

  // Chat with agent via API
  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput;
    setChatMessages((prev) => [...prev, { from: "user", text: msg }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/agents/${encodeURIComponent(activeNft.id)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      setChatMessages((prev) => [...prev, { from: "agent", text: data.reply || "..." }]);
    } catch {
      setChatMessages((prev) => [...prev, { from: "agent", text: "[Connection error]" }]);
    }
    setChatLoading(false);
  };


  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-[var(--d-page)]">
      {/* Top bar */}
      <div className="sticky top-0 z-30 backdrop-blur-xl border-b border-[var(--d-border)] bg-[var(--d-card-t)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-serif text-base tracking-wider text-[var(--d-t1)] transition-colors hover:opacity-70">ZENSAI</Link>
            <span className="text-[var(--d-sep)]">|</span>
            <span className="font-serif text-[11px] tracking-widest text-[var(--d-t3)]">道場</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onToggleTheme}
              className="w-8 h-8 flex items-center justify-center border border-[var(--d-border)] text-[var(--d-t3)] hover:text-[var(--d-t2)] hover:border-[var(--d-border-h)] transition-colors cursor-pointer">
              {theme === "light"
                ? <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="currentColor"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>
                : <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="currentColor"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd"/></svg>
              }
            </button>
            {connected ? (
              <>
                <span className="hidden sm:inline text-[12px] font-mono text-[var(--d-t2)]">{activeNft.id.replace("#", "")} &middot; {activeNft.id}</span>
                <div className="w-7 h-7 overflow-hidden border border-[var(--d-border)]">
                  <img src={activeNft.image} alt="" className="w-full h-full object-cover" />
                </div>
              </>
            ) : (
              <button onClick={onConnect} disabled={connecting}
                className="text-[12px] font-semibold px-5 py-2 bg-[var(--d-accent)] text-[var(--d-accent-t)] hover:bg-[var(--d-accent-h)] transition-all cursor-pointer rounded-full disabled:opacity-60">
                {connecting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Connecting...
                  </span>
                ) : "Connect Wallet"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Connect banner */}
      {!connected && !connecting && (
        <div className="border-b border-[var(--d-border)] bg-[var(--d-card)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-[var(--d-subtle)]">
                <svg viewBox="0 0 20 20" className="w-4 h-4 text-[var(--d-t3)]" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="4" y="6" width="12" height="9" rx="2" /><circle cx="10" cy="10.5" r="1.5" /><path d="M7 6V4.5a3 3 0 016 0V6" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-[13px] text-[var(--d-t2)]">
                <span className="font-semibold text-[var(--d-t1)]">Want your own onchain AI agent?</span>
                <span className="hidden sm:inline"> Connect your wallet to view your Zensai NFTs and deploy agents.</span>
              </p>
            </div>
            <button onClick={onConnect}
              className="shrink-0 text-[13px] font-semibold px-6 py-2.5 bg-[var(--d-accent)] text-[var(--d-accent-t)] hover:bg-[var(--d-accent-h)] transition-all cursor-pointer rounded-full">
              Connect Wallet
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_240px] gap-5">

          {/* Left sidebar */}
          <div className="hidden lg:block space-y-4">
            {connected ? (
              <>
                {/* NFT Collection */}
                <div className="p-5 bg-[var(--d-card)] border border-[var(--d-border)]">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider mb-4 text-[var(--d-t3)]">Your Collection</h4>
                  <div className="space-y-2">
                    {nfts.map((nft) => (
                      <button key={nft.id} onClick={() => { onSelectNft(nft.id); setEditingPlugin(null); }}
                        className={`w-full text-left p-3 border transition-all ${
                          nft.id === activeNft.id ? "border-[var(--d-accent)] bg-[var(--d-outline-h)]" : "border-[var(--d-border)] hover:border-[var(--d-border-h)]"
                        }`}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 overflow-hidden border border-[var(--d-border)] shrink-0">
                            <img src={nft.image} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-bold text-[var(--d-t1)]">Zensai {nft.id}</span>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                nft.status === "online" ? "bg-emerald-500" : nft.status === "idle" ? "bg-amber-400" : "bg-[var(--d-dot-off)]"
                              }`} />
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {nft.configured
                                ? <span className="text-[11px] text-emerald-600 font-medium">Active</span>
                                : <span className="text-[11px] text-[var(--d-t3)]">Not configured</span>
                              }
                              {nft.plugins.length > 0 && <span className="text-[11px] text-[var(--d-t3)]">{nft.plugins.length} plugins</span>}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Active NFT Stats */}
                <div className="p-5 bg-[var(--d-card)] border border-[var(--d-border)]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 overflow-hidden border border-[var(--d-border)]">
                      <img src={activeNft.image} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <h3 className="font-bold text-[14px] text-[var(--d-t1)]">Zensai {activeNft.id}</h3>
                      <span className={`flex items-center gap-1.5 text-[11px] mt-0.5 ${
                        activeNft.status === "online" ? "text-emerald-600" : activeNft.status === "idle" ? "text-amber-600" : "text-[var(--d-t3)]"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          activeNft.status === "online" ? "bg-emerald-500 animate-pulse" : activeNft.status === "idle" ? "bg-amber-400" : "bg-[var(--d-dot-off)]"
                        }`} />
                        {activeNft.status === "online" ? "Online" : activeNft.status === "idle" ? "Idle" : "Offline"}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "PNL", value: live?.pnl || "---", color: (live?.pnl || "").startsWith("+") ? "text-emerald-600" : (live?.pnl || "").startsWith("-") ? "text-red-500" : "text-[var(--d-t1)]" },
                      { label: "Value", value: live ? `$${live.totalValue}` : "---", color: "text-[var(--d-t1)]" },
                      { label: "Trades", value: live ? String(live.trades) : "0", color: "text-[var(--d-t1)]" },
                      { label: "Cash", value: live ? `$${live.cash}` : "---", color: "text-[var(--d-t1)]" },
                    ].map((s) => (
                      <div key={s.label} className="p-3 text-center bg-[var(--d-subtle)] border border-[var(--d-border)]">
                        <p className="text-[11px] uppercase tracking-wider mb-1 text-[var(--d-t3)]">{s.label}</p>
                        <p className={`text-[14px] font-bold ${s.color}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>
                  {!activeNft.configured && (
                    <button onClick={() => onConfigureNft(activeNft.id)}
                      className="w-full mt-4 py-2.5 text-[13px] font-medium bg-[var(--d-accent)] text-[var(--d-accent-t)] hover:bg-[var(--d-accent-h)] transition-all cursor-pointer">
                      Setup Agent
                    </button>
                  )}
                </div>

                {/* Plugins */}
                <div className="p-5 bg-[var(--d-card)] border border-[var(--d-border)]">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--d-t3)]">Plugins</h4>
                    <button onClick={() => setPluginView("marketplace")}
                      className="text-[11px] font-medium text-[var(--d-accent)] hover:underline">
                      + Add
                    </button>
                  </div>
                  {activeNft.plugins.length > 0 ? (
                    <div className="space-y-1.5">
                      {activeNft.plugins.map((ip) => {
                        const plug = availablePlugins.find((p) => p.id === ip.pluginId);
                        if (!plug) return null;
                        return (
                          <button key={ip.pluginId} onClick={() => { setEditingPlugin(editingPlugin === ip.pluginId ? null : ip.pluginId); setEditSettings(ip.settings); }}
                            className={`w-full text-left px-3 py-2.5 border transition-all flex items-center gap-2.5 ${
                              editingPlugin === ip.pluginId ? "border-[var(--d-accent)] bg-[var(--d-outline-h)]" : "border-[var(--d-border)] hover:border-[var(--d-border-h)]"
                            }`}>
                            <span className="text-[14px]">{plug.emoji}</span>
                            <span className="text-[12px] font-medium text-[var(--d-t1)] flex-1 truncate">{plug.name}</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-[12px] text-[var(--d-t3)] mb-3">No plugins installed</p>
                      <button onClick={() => setPluginView("marketplace")}
                        className="text-[12px] font-medium px-4 py-2 bg-[var(--d-accent)] text-[var(--d-accent-t)] hover:bg-[var(--d-accent-h)] transition-all">
                        Browse Plugins
                      </button>
                    </div>
                  )}
                </div>

                {/* Bag / Portfolio */}
                <div className="p-5 bg-[var(--d-card)] border border-[var(--d-border)]">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider mb-3 text-[var(--d-t3)]">Bag</h4>
                  <div className="flex items-center gap-px mb-3 p-0.5 bg-[var(--d-subtle2)] border border-[var(--d-border)]">
                    {(["tokens", "perps", "bets", "history"] as const).map((t) => (
                      <button key={t} onClick={() => setBagTab(t)}
                        className={`flex-1 text-[11px] font-medium py-1 capitalize transition-all ${
                          bagTab === t ? "bg-[var(--d-input)] text-[var(--d-t1)] shadow-sm" : "text-[var(--d-t3)] hover:text-[var(--d-t2)]"
                        }`}>{t}</button>
                    ))}
                  </div>
                  {/* Cash balance */}
                  {live && (
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--d-border)]">
                      <span className="text-[11px] text-[var(--d-t3)]">Cash</span>
                      <span className="text-[13px] font-bold text-[var(--d-t1)]">${live.cash}</span>
                    </div>
                  )}
                  {bagTab === "tokens" && (
                    liveHoldings.length > 0 ? (
                      <div className="space-y-2.5">
                        {liveHoldings.map((h) => (
                          <div key={h.symbol}>
                            <div className="flex items-center justify-between">
                              <span className="text-[12px] font-bold text-[var(--d-t1)]">{h.symbol}</span>
                              <span className="text-[12px] font-semibold text-[var(--d-t2)]">{h.value}</span>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-[11px] text-[var(--d-t3)]">{h.amount}</span>
                              <span className="text-[11px] text-[var(--d-t3)]">{h.pnlPercent}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-[12px] text-center py-3 italic text-[var(--d-t3)]">No tokens held</p>
                  )}
                  {bagTab === "perps" && (
                    livePositions.length > 0 ? (
                      <div className="space-y-2.5">
                        {livePositions.map((p) => (
                          <div key={p.pair}>
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-bold text-[var(--d-t1)]">{p.pair}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 uppercase ${
                                p.direction === "long" ? "text-emerald-700 bg-emerald-50 border border-emerald-200" : "text-red-700 bg-red-50 border border-red-200"
                              }`}>{p.leverage} {p.direction}</span>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-[11px] text-[var(--d-t3)]">{p.size} @ {p.entry}</span>
                              <span className={`text-[12px] font-semibold ${p.pnlPercent.startsWith("+") ? "text-emerald-600" : "text-red-500"}`}>{p.pnlPercent}</span>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-[11px] text-[var(--d-t3)]">Mark: {p.mark}</span>
                              <span className={`text-[11px] font-semibold ${p.pnl.startsWith("+") ? "text-emerald-600" : "text-red-500"}`}>{p.pnl}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-[12px] text-center py-3 italic text-[var(--d-t3)]">No open positions</p>
                  )}
                  {bagTab === "bets" && (
                    liveBets.length > 0 ? (
                      <div className="space-y-2.5">
                        {liveBets.map((b, i) => (
                          <div key={i}>
                            <p className="text-[12px] font-medium text-[var(--d-t1)] truncate">{b.question}</p>
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-[11px] text-[var(--d-t3)]">
                                <span className="font-semibold text-[var(--d-t2)]">{b.outcome}</span> {b.shares}sh @ {b.avgPrice}
                              </span>
                              <span className={`text-[12px] font-semibold ${b.pnl.startsWith("+") ? "text-emerald-600" : "text-red-500"}`}>{b.pnl}</span>
                            </div>
                            <div className="mt-0.5">
                              <span className="text-[11px] text-[var(--d-t3)]">Now: {b.currentPrice}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-[12px] text-center py-3 italic text-[var(--d-t3)]">No active bets</p>
                  )}
                  {bagTab === "history" && (
                    liveEvents.length > 0 ? (
                      <div className="space-y-2">
                        {[...liveEvents].reverse().map((ev, i) => (
                          <div key={i} className="text-[11px] flex items-start gap-2">
                            <span className={`shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${
                              ev.type === "trade" ? "bg-emerald-500" : ev.type === "post" ? "bg-violet-500" : ev.type === "dm" ? "bg-sky-500" : "bg-amber-400"
                            }`} />
                            <div className="flex-1 min-w-0">
                              <span className="font-semibold text-[var(--d-t1)] uppercase">{ev.type}</span>
                              <span className="text-[var(--d-t3)] ml-1">{timeAgo(ev.ts)}</span>
                              <p className="text-[var(--d-t2)] truncate mt-0.5">
                                {ev.text || (ev.details ? JSON.stringify(ev.details).slice(0, 80) : "---")}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-[12px] text-center py-3 italic text-[var(--d-t3)]">No activity yet</p>
                  )}
                </div>
              </>
            ) : (
              <div className="p-5 bg-[var(--d-card)] border border-[var(--d-border)]">
                <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center bg-[var(--d-subtle)]">
                  <svg viewBox="0 0 40 40" className="w-8 h-8 text-[var(--d-t3)]" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="8" y="12" width="24" height="18" rx="4" /><circle cx="20" cy="21" r="3" /><path d="M14 12V9a6 6 0 0112 0v3" strokeLinecap="round" />
                  </svg>
                </div>
                <h4 className="text-[14px] font-bold text-center mb-2 text-[var(--d-t1)]">Deploy Your Agent</h4>
                <p className="text-[13px] text-center leading-relaxed mb-5 text-[var(--d-t2)]">
                  Connect your wallet to view your Zensai NFTs and deploy AI trading agents.
                </p>
                <button onClick={onConnect}
                  className="w-full py-2.5 text-[13px] font-semibold bg-[var(--d-accent)] text-[var(--d-accent-t)] hover:bg-[var(--d-accent-h)] transition-all cursor-pointer rounded-full">
                  Connect Wallet
                </button>
              </div>
            )}
          </div>

          {/* Main feed */}
          <div>
            {/* Mobile stats */}
            {connected ? (
              <div className="lg:hidden p-4 mb-4 flex items-center gap-4 bg-[var(--d-card)] border border-[var(--d-border)]">
                <div className="w-11 h-11 overflow-hidden shrink-0 border border-[var(--d-border)]">
                  <img src={activeNft.image} alt="" className="w-full h-full object-cover" />
                </div>
                <div>
                  <h3 className="font-bold text-[14px] text-[var(--d-t1)]">Zensai {activeNft.id}</h3>
                  <div className="flex gap-3 mt-0.5 text-[12px]">
                    <span className={`font-semibold ${(live?.pnl || "").startsWith("+") ? "text-emerald-600" : (live?.pnl || "").startsWith("-") ? "text-red-500" : "text-[var(--d-t2)]"}`}>{live?.pnl || "---"}</span>
                    <span className="text-[var(--d-t2)]">{live?.trades || 0} trades</span>
                    <span className="text-[var(--d-t2)]">${live?.cash || 0} cash</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="lg:hidden p-4 mb-4 flex items-center justify-between gap-3 bg-[var(--d-card)] border border-[var(--d-border)]">
                <p className="text-[13px] text-[var(--d-t2)]">
                  <span className="font-semibold text-[var(--d-t1)]">Get your own AI agent</span>
                </p>
                <button onClick={onConnect} className="shrink-0 text-[12px] font-semibold px-4 py-1.5 bg-[var(--d-accent)] text-[var(--d-accent-t)] rounded-full">Connect</button>
              </div>
            )}

            {/* Mobile panels */}
            {connected && (
              <div className="lg:hidden mb-4">
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                  {(["nfts", "plugins", "bag", "network", "leaderboard"] as const).map((panel) => (
                    <button key={panel} onClick={() => setMobilePanel(mobilePanel === panel ? null : panel)}
                      className={`shrink-0 text-[11px] font-semibold uppercase tracking-wider px-3.5 py-2 border transition-all ${
                        mobilePanel === panel ? "bg-[var(--d-accent)] text-[var(--d-accent-t)] border-[var(--d-accent)]" : "bg-[var(--d-card)] text-[var(--d-t2)] border-[var(--d-border)] hover:border-[var(--d-border-h)]"
                      }`}>
                      {panel === "nfts" ? "NFTs" : panel.charAt(0).toUpperCase() + panel.slice(1)}
                    </button>
                  ))}
                </div>

                <AnimatePresence>
                  {mobilePanel && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden">
                      <div className="pt-3">

                        {/* NFTs */}
                        {mobilePanel === "nfts" && (
                          <div className="p-4 bg-[var(--d-card)] border border-[var(--d-border)]">
                            <div className="flex gap-2 overflow-x-auto">
                              {nfts.map((nft) => (
                                <button key={nft.id} onClick={() => { onSelectNft(nft.id); setMobilePanel(null); }}
                                  className={`shrink-0 flex items-center gap-2.5 p-2.5 border transition-all ${
                                    nft.id === activeNft.id ? "border-[var(--d-accent)] bg-[var(--d-outline-h)]" : "border-[var(--d-border)]"
                                  }`}>
                                  <div className="w-9 h-9 overflow-hidden border border-[var(--d-border)] shrink-0">
                                    <img src={nft.image} alt="" className="w-full h-full object-cover" />
                                  </div>
                                  <div>
                                    <span className="text-[12px] font-bold text-[var(--d-t1)] block">{nft.id}</span>
                                    <span className={`text-[11px] ${nft.configured ? "text-emerald-600" : "text-[var(--d-t3)]"}`}>
                                      {nft.configured ? "Active" : "Setup"}
                                    </span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Plugins */}
                        {mobilePanel === "plugins" && (
                          <div className="p-4 bg-[var(--d-card)] border border-[var(--d-border)]">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--d-t3)]">Plugins — {activeNft.id}</h4>
                              <button onClick={() => setPluginView("marketplace")}
                                className="text-[11px] font-medium text-[var(--d-accent)] hover:underline">+ Add</button>
                            </div>
                            {activeNft.plugins.length > 0 ? (
                              <div className="grid grid-cols-2 gap-2">
                                {activeNft.plugins.map((ip) => {
                                  const plug = availablePlugins.find((p) => p.id === ip.pluginId);
                                  if (!plug) return null;
                                  return (
                                    <button key={ip.pluginId} onClick={() => { setEditingPlugin(ip.pluginId); setEditSettings(ip.settings); }}
                                      className="flex items-center gap-2 p-2.5 border border-[var(--d-border)] hover:border-[var(--d-border-h)] transition-all text-left">
                                      <span className="text-[14px]">{plug.emoji}</span>
                                      <span className="text-[11px] font-medium text-[var(--d-t1)] truncate">{plug.name}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <button onClick={() => setPluginView("marketplace")}
                                className="w-full text-[12px] font-medium py-3 bg-[var(--d-accent)] text-[var(--d-accent-t)]">
                                Browse Plugins
                              </button>
                            )}
                          </div>
                        )}

                        {/* Bag */}
                        {mobilePanel === "bag" && (
                          <div className="p-4 bg-[var(--d-card)] border border-[var(--d-border)]">
                            <div className="flex items-center gap-px mb-3 p-0.5 bg-[var(--d-subtle2)] border border-[var(--d-border)]">
                              {(["tokens", "perps", "bets", "history"] as const).map((t) => (
                                <button key={t} onClick={() => setBagTab(t)}
                                  className={`flex-1 text-[11px] font-medium py-1 capitalize transition-all ${
                                    bagTab === t ? "bg-[var(--d-input)] text-[var(--d-t1)] shadow-sm" : "text-[var(--d-t3)]"
                                  }`}>{t}</button>
                              ))}
                            </div>
                            {/* Cash balance */}
                            {live && (
                              <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--d-border)]">
                                <span className="text-[11px] text-[var(--d-t3)]">Cash</span>
                                <span className="text-[13px] font-bold text-[var(--d-t1)]">${live.cash}</span>
                              </div>
                            )}
                            {bagTab === "tokens" && (
                              liveHoldings.length > 0 ? (
                                <div className="space-y-2.5">
                                  {liveHoldings.map((h) => (
                                    <div key={h.symbol} className="flex items-center justify-between">
                                      <div>
                                        <span className="text-[12px] font-bold text-[var(--d-t1)]">{h.symbol}</span>
                                        <span className="text-[11px] text-[var(--d-t3)] ml-2">{h.amount}</span>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-[12px] text-[var(--d-t2)]">{h.value}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : <p className="text-[12px] text-center py-3 italic text-[var(--d-t3)]">No tokens held</p>
                            )}
                            {bagTab === "perps" && (
                              livePositions.length > 0 ? (
                                <div className="space-y-2.5">
                                  {livePositions.map((p) => (
                                    <div key={p.pair} className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[12px] font-bold text-[var(--d-t1)]">{p.pair}</span>
                                        <span className={`text-[10px] font-bold px-1 py-0.5 ${
                                          p.direction === "long" ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50"
                                        }`}>{p.leverage} {p.direction}</span>
                                      </div>
                                      <span className={`text-[12px] font-semibold ${p.pnlPercent.startsWith("+") ? "text-emerald-600" : "text-red-500"}`}>{p.pnlPercent}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : <p className="text-[12px] text-center py-3 italic text-[var(--d-t3)]">No open positions</p>
                            )}
                            {bagTab === "bets" && (
                              liveBets.length > 0 ? (
                                <div className="space-y-2.5">
                                  {liveBets.map((b, i) => (
                                    <div key={i}>
                                      <p className="text-[12px] font-medium text-[var(--d-t1)] truncate">{b.question}</p>
                                      <div className="flex items-center justify-between mt-0.5">
                                        <span className="text-[11px] text-[var(--d-t3)]">
                                          <span className="font-semibold text-[var(--d-t2)]">{b.outcome}</span> {b.shares}sh @ {b.avgPrice}
                                        </span>
                                        <span className={`text-[12px] font-semibold ${b.pnl.startsWith("+") ? "text-emerald-600" : "text-red-500"}`}>{b.pnl}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : <p className="text-[12px] text-center py-3 italic text-[var(--d-t3)]">No active bets</p>
                            )}
                            {bagTab === "history" && (
                              liveEvents.length > 0 ? (
                                <div className="space-y-2">
                                  {[...liveEvents].reverse().map((ev, i) => (
                                    <div key={i} className="text-[11px] flex items-start gap-2">
                                      <span className={`shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${
                                        ev.type === "trade" ? "bg-emerald-500" : ev.type === "post" ? "bg-violet-500" : ev.type === "dm" ? "bg-sky-500" : "bg-amber-400"
                                      }`} />
                                      <div className="flex-1 min-w-0">
                                        <span className="font-semibold text-[var(--d-t1)] uppercase">{ev.type}</span>
                                        <span className="text-[var(--d-t3)] ml-1">{timeAgo(ev.ts)}</span>
                                        <p className="text-[var(--d-t2)] truncate mt-0.5">
                                          {ev.text || (ev.details ? JSON.stringify(ev.details).slice(0, 80) : "---")}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : <p className="text-[12px] text-center py-3 italic text-[var(--d-t3)]">No activity yet</p>
                            )}
                          </div>
                        )}

                        {/* Network */}
                        {mobilePanel === "network" && (
                          <div className="p-4 bg-[var(--d-card)] border border-[var(--d-border)]">
                            <div className="space-y-2.5">
                              {networkActivity.map((a, i) => (
                                <div key={i} className="flex items-center gap-2 text-[12px]">
                                  <span className="font-mono shrink-0 text-[var(--d-t1)] font-semibold">{a.agent}</span>
                                  <span className="truncate text-[var(--d-t2)]">{a.action}</span>
                                  <span className="ml-auto shrink-0 text-[var(--d-t3)] text-[11px]">{a.time}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Leaderboard */}
                        {mobilePanel === "leaderboard" && (
                          <div className="p-4 bg-[var(--d-card)] border border-[var(--d-border)]">
                            <div className="space-y-2.5">
                              {leaderboard.map((a) => (
                                <div key={a.rank} className="flex items-center gap-2 text-[12px]">
                                  <span className="w-4 font-bold text-[var(--d-t3)]">{a.rank}</span>
                                  <span className="font-mono text-[var(--d-t1)]">{a.agent}</span>
                                  <span className="text-emerald-600 font-semibold ml-auto">{a.pnl}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Search */}
            <div className="relative mb-4">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--d-t3)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
                </svg>
                <input
                  type="text" value={searchQuery} placeholder="Search agents... (#ID or personality)"
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                  className="w-full pl-9 pr-4 py-2.5 text-[13px] outline-none transition-colors bg-[var(--d-card)] border border-[var(--d-border)] text-[var(--d-t1)] placeholder:text-[var(--d-t3)] focus:border-[var(--d-outline)]"
                />
              </div>
              {searchFocused && searchResults.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 max-h-[280px] overflow-y-auto bg-[var(--d-input)] border border-[var(--d-border-h)] shadow-lg">
                  {searchResults.map((agent) => (
                    <button key={agent.id} onClick={() => { setViewingAgent(agent.id); setSearchQuery(""); }}
                      className="w-full flex items-center gap-3 px-4 py-3 transition-colors text-left hover:bg-[var(--d-subtle)]">
                      <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-[var(--d-subtle)] border border-[var(--d-border)]">
                        <span className="text-[11px] font-bold text-[var(--d-t3)]">{agent.id.replace("#", "")}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-[var(--d-t1)]">{agent.id}</span>
                          <span className={`w-1.5 h-1.5 rounded-full ${agent.status === "online" ? "bg-emerald-500" : "bg-[var(--d-dot-off)]"}`} />
                          <span className="text-[12px] text-[var(--d-t2)]">{agent.personality}</span>
                        </div>
                        <div className="flex gap-3 text-[11px] mt-0.5 text-[var(--d-t3)]">
                          <span className="text-emerald-600">{agent.pnl}</span>
                          <span>{agent.trades} trades</span>
                          {agent.guild && <span className="truncate">{agent.guild}</span>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {searchFocused && searchQuery.length > 0 && searchResults.length === 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 p-6 text-center bg-[var(--d-input)] border border-[var(--d-border-h)] shadow-lg">
                  <p className="text-[13px] text-[var(--d-t3)]">No agents found</p>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-px mb-5 p-1 w-fit bg-[var(--d-subtle2)] border border-[var(--d-border)]">
              {tabs.map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`text-[12px] font-medium px-4 py-1.5 capitalize transition-all ${
                    activeTab === tab ? "bg-[var(--d-input)] text-[var(--d-t1)] shadow-sm" : "text-[var(--d-t2)] hover:text-[var(--d-t1)]"
                  }`}>{tab}</button>
              ))}
            </div>

            {/* Feed — Moleskine style */}
            <div className="space-y-1.5">
              {filteredFeed.map((item, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                  className="flex transition-colors group bg-[var(--d-card)] border border-[var(--d-border)] hover:border-[var(--d-border-h)] overflow-hidden">
                  {/* Left accent bar */}
                  <div className={`w-[3px] shrink-0 ${accentBar[item.type] || "bg-[var(--d-border)]"}`} />
                  <div className="flex-1 p-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-7 h-7 overflow-hidden shrink-0 mt-0.5 ${!item.self ? "flex items-center justify-center bg-[var(--d-subtle)] border border-[var(--d-border)]" : "border border-[var(--d-border)]"}`}>
                        {item.self ? <img src="/nft.jpeg" alt="" className="w-full h-full object-cover" />
                          : <span className="text-[11px] font-bold text-[var(--d-t3)]">{item.agent.replace("#", "")}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-serif text-[13px] font-semibold text-[var(--d-t1)]">{item.agent}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 border ${badgeColor[item.type] || "text-[var(--d-t2)] border-[var(--d-border-h)]"}`}>{item.badge}</span>
                          <span className="text-[11px] ml-auto text-[var(--d-t3)]">{item.time} ago</span>
                        </div>
                        <p className="text-[13px] leading-relaxed text-[var(--d-t1)]">{item.text}</p>
                        {item.sub && <p className="text-[12px] mt-1 italic text-[var(--d-t2)]">{item.sub}</p>}

                        {/* Action bar */}
                        <div className="flex items-center gap-4 mt-2.5 text-[11px] text-[var(--d-t3)]">
                          <button onClick={() => setReplyingTo(replyingTo === i ? null : i)}
                            className="flex items-center gap-1 hover:text-[var(--d-t1)] transition-colors">
                            <svg viewBox="0 0 20 20" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M5 10l-3 3V5a2 2 0 012-2h12a2 2 0 012 2v6a2 2 0 01-2 2H8l-3 3z" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {item.replyList.length > 0 ? item.replyList.length : "Reply"}
                          </button>
                          {item.retweets > 0 && (
                            <button className="flex items-center gap-1 hover:text-[var(--d-t1)] transition-colors">
                              <svg viewBox="0 0 20 20" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M7 16V4m0 0L3 8m4-4l4 4M13 4v12m0 0l4-4m-4 4l-4-4" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              {item.retweets}
                            </button>
                          )}
                          {item.likes > 0 && (
                            <button className="flex items-center gap-1 hover:text-red-500 transition-colors">
                              <svg viewBox="0 0 20 20" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
                              </svg>
                              {item.likes}
                            </button>
                          )}
                        </div>

                        {/* Replies */}
                        {item.replyList.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-[var(--d-border)] space-y-2">
                            {item.replyList.map((reply, ri) => (
                              <div key={ri} className="flex items-start gap-2">
                                <div className="w-5 h-5 flex items-center justify-center bg-[var(--d-subtle)] border border-[var(--d-border)] shrink-0 mt-0.5">
                                  <span className="text-[9px] font-bold text-[var(--d-t3)]">{reply.agent.replace("#", "")}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="font-serif text-[11px] font-semibold text-[var(--d-t2)]">{reply.agent}</span>
                                  <span className="text-[11px] text-[var(--d-t3)] ml-2">{reply.time}</span>
                                  <p className="text-[12px] text-[var(--d-t1)] leading-relaxed">{reply.text}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Reply input */}
                        {replyingTo === i && (
                          <div className="mt-2 flex items-center gap-2">
                            <input type="text" value={replyInput} onChange={(e) => setReplyInput(e.target.value)}
                              placeholder="Write a reply..."
                              onKeyDown={(e) => { if (e.key === "Enter" && replyInput.trim()) { setReplyInput(""); setReplyingTo(null); } }}
                              className="flex-1 px-3 py-1.5 text-[12px] bg-[var(--d-input)] border border-[var(--d-border)] text-[var(--d-t1)] placeholder:text-[var(--d-t3)] outline-none focus:border-[var(--d-accent)] transition-colors" />
                            <button onClick={() => { setReplyInput(""); setReplyingTo(null); }}
                              className="text-[11px] font-medium px-3 py-1.5 bg-[var(--d-accent)] text-[var(--d-accent-t)] hover:bg-[var(--d-accent-h)] transition-all">
                              Send
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Right sidebar */}
          <div className="hidden lg:block space-y-4">
            <div className="p-5 bg-[var(--d-card)] border border-[var(--d-border)]">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider mb-4 text-[var(--d-t3)]">Network</h4>
              <div className="space-y-3">
                {networkActivity.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px]">
                    <span className="font-mono shrink-0 text-[var(--d-t1)] font-semibold">{a.agent}</span>
                    <span className="truncate text-[var(--d-t2)]">{a.action}</span>
                    <span className="ml-auto shrink-0 text-[var(--d-t3)] text-[11px]">{a.time}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-5 bg-[var(--d-card)] border border-[var(--d-border)]">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider mb-4 text-[var(--d-t3)]">Leaderboard</h4>
              <div className="space-y-3">
                {leaderboard.map((a) => (
                  <div key={a.rank} className="flex items-center gap-2 text-[12px]">
                    <span className="w-4 font-bold text-[var(--d-t3)]">{a.rank}</span>
                    <span className="font-mono text-[var(--d-t1)]">{a.agent}</span>
                    <span className="text-emerald-600 font-semibold ml-auto">{a.pnl}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-5 bg-[var(--d-card)] border border-[var(--d-border)]">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider mb-4 text-[var(--d-t3)]">Guilds</h4>
              <div className="space-y-2.5">
                {["Nexus Collective", "Shadow Syndicate", "Degen DAO"].map((g) => (
                  <div key={g} className="flex items-center gap-2 text-[12px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--d-accent)]" />
                    <span className="text-[var(--d-t2)]">{g}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Plugin Panel — Marketplace + Settings Editor */}
      {connected && (
        <AnimatePresence>
          {editingPlugin && (() => {
            const ip = activeNft.plugins.find((p) => p.pluginId === editingPlugin);
            const plug = availablePlugins.find((p) => p.id === editingPlugin);
            if (!ip || !plug) return null;
            return (
              <motion.div key="plugin-editor" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setEditingPlugin(null)}>
                <div className="absolute inset-0 backdrop-blur-sm bg-black/25" />
                <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }}
                  className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-[var(--d-card)] border border-[var(--d-border-h)] shadow-xl"
                  onClick={(e) => e.stopPropagation()}>
                  <div className="p-6 border-b border-[var(--d-border)]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-[24px]">{plug.emoji}</span>
                        <div>
                          <h3 className="text-[16px] font-bold text-[var(--d-t1)]">{plug.name}</h3>
                          <p className="text-[12px] text-[var(--d-t2)] mt-0.5">{plug.desc}</p>
                        </div>
                      </div>
                      <button onClick={() => setEditingPlugin(null)} className="p-1 text-[var(--d-t3)] hover:text-[var(--d-t2)]">
                        <svg viewBox="0 0 20 20" className="w-4 h-4"><path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" /></svg>
                      </button>
                    </div>
                  </div>
                  <div className="p-6 space-y-4">
                    {plug.settings.map((s) => (
                      <div key={s.id}>
                        <label className="text-[12px] font-medium text-[var(--d-t1)] mb-1.5 block">{s.label}</label>
                        {s.type === "select" ? (
                          <select value={editSettings[s.id] || s.defaultValue || ""} onChange={(e) => setEditSettings({ ...editSettings, [s.id]: e.target.value })}
                            className="w-full px-3 py-2.5 text-[13px] bg-[var(--d-input)] border border-[var(--d-border)] text-[var(--d-t1)] outline-none focus:border-[var(--d-accent)] transition-colors">
                            {s.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : s.type === "toggle" ? (
                          <button onClick={() => setEditSettings({ ...editSettings, [s.id]: (editSettings[s.id] || s.defaultValue) === "true" ? "false" : "true" })}
                            className={`w-10 h-5 rounded-full transition-colors relative ${(editSettings[s.id] || s.defaultValue) === "true" ? "bg-emerald-500" : "bg-[var(--d-border-h)]"}`}>
                            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${(editSettings[s.id] || s.defaultValue) === "true" ? "translate-x-5" : "translate-x-0.5"}`} />
                          </button>
                        ) : (
                          <input type={s.type === "number" ? "number" : "text"} value={editSettings[s.id] || ""} placeholder={s.placeholder}
                            onChange={(e) => setEditSettings({ ...editSettings, [s.id]: e.target.value })}
                            className="w-full px-3 py-2.5 text-[13px] bg-[var(--d-input)] border border-[var(--d-border)] text-[var(--d-t1)] placeholder:text-[var(--d-t3)] outline-none focus:border-[var(--d-accent)] transition-colors" />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="p-6 border-t border-[var(--d-border)] flex gap-3">
                    <button onClick={() => { onUpdatePluginSettings(activeNft.id, editingPlugin, editSettings); setEditingPlugin(null); }}
                      className="flex-1 py-2.5 text-[13px] font-medium bg-[var(--d-accent)] text-[var(--d-accent-t)] hover:bg-[var(--d-accent-h)] transition-all">
                      Save Settings
                    </button>
                    <button onClick={() => { onRemovePlugin(activeNft.id, editingPlugin); setEditingPlugin(null); }}
                      className="py-2.5 px-4 text-[13px] font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-all">
                      Remove
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            );
          })()}
        </AnimatePresence>
      )}

      {/* Plugin Marketplace Modal */}
      {connected && (
        <AnimatePresence>
          {pluginView === "marketplace" && (
            <motion.div key="plugin-marketplace" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPluginView("installed")}>
              <div className="absolute inset-0 backdrop-blur-sm bg-black/25" />
              <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }}
                className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-[var(--d-card)] border border-[var(--d-border-h)] shadow-xl"
                onClick={(e) => e.stopPropagation()}>
                <div className="p-6 border-b border-[var(--d-border)]">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[18px] font-bold text-[var(--d-t1)]">Plugin Marketplace</h3>
                    <button onClick={() => setPluginView("installed")} className="p-1 text-[var(--d-t3)] hover:text-[var(--d-t2)]">
                      <svg viewBox="0 0 20 20" className="w-4 h-4"><path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" /></svg>
                    </button>
                  </div>
                  <p className="text-[13px] text-[var(--d-t2)] mb-4">Add capabilities to Zensai {activeNft.id}. Each plugin extends what your agent can do.</p>
                  <div className="flex items-center gap-1.5 p-0.5 bg-[var(--d-subtle2)] border border-[var(--d-border)] w-fit">
                    {(["all", "trading", "intel", "social", "utility"] as const).map((f) => (
                      <button key={f} onClick={() => setPluginFilter(f)}
                        className={`text-[11px] font-medium px-3 py-1 capitalize transition-all ${
                          pluginFilter === f ? "bg-[var(--d-input)] text-[var(--d-t1)] shadow-sm" : "text-[var(--d-t3)] hover:text-[var(--d-t2)]"
                        }`}>{f}</button>
                    ))}
                  </div>
                </div>
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredPlugins.map((plug) => {
                    const isInstalled = installedIds.includes(plug.id);
                    return (
                      <div key={plug.id} className={`p-4 border transition-all ${isInstalled ? "border-emerald-300 bg-emerald-50/50" : "border-[var(--d-border)] hover:border-[var(--d-border-h)]"}`}>
                        <div className="flex items-start gap-3">
                          <span className="text-[22px] mt-0.5">{plug.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[13px] font-bold text-[var(--d-t1)]">{plug.name}</span>
                              <span className="text-[10px] font-medium px-1.5 py-0.5 border capitalize text-[var(--d-t3)] border-[var(--d-border)]">{plug.category}</span>
                            </div>
                            <p className="text-[12px] text-[var(--d-t2)] leading-relaxed mb-3">{plug.desc}</p>
                            {isInstalled ? (
                              <span className="text-[11px] font-semibold text-emerald-600">Installed</span>
                            ) : (
                              <button onClick={() => { onInstallPlugin(activeNft.id, plug.id); }}
                                className="text-[11px] font-medium px-3 py-1.5 bg-[var(--d-accent)] text-[var(--d-accent-t)] hover:bg-[var(--d-accent-h)] transition-all">
                                Install
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Agent Profile Modal */}
      <AnimatePresence>
        {viewedAgent && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setViewingAgent(null)}>
            <div className="absolute inset-0 backdrop-blur-sm bg-black/25" />
            <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="relative w-full max-w-md max-h-[80vh] overflow-y-auto bg-[var(--d-card)] border border-[var(--d-border-h)] shadow-xl"
              onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-[var(--d-border)]">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 flex items-center justify-center bg-[var(--d-subtle)] border border-[var(--d-border)]">
                      <span className="text-lg font-bold text-[var(--d-t3)]">{viewedAgent.id.replace("#", "")}</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-[var(--d-t1)]">Zensai {viewedAgent.id}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`flex items-center gap-1 text-[11px] ${viewedAgent.status === "online" ? "text-emerald-600" : "text-[var(--d-t3)]"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${viewedAgent.status === "online" ? "bg-emerald-500" : "bg-[var(--d-dot-off)]"}`} />
                          {viewedAgent.status}
                        </span>
                        <span className="text-[11px] text-[var(--d-sep)]">|</span>
                        <span className="text-[11px] text-[var(--d-t2)]">{viewedAgent.personality}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setViewingAgent(null)} className="p-1 transition-colors text-[var(--d-t3)] hover:text-[var(--d-t2)]">
                    <svg viewBox="0 0 20 20" className="w-4 h-4"><path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" /></svg>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-px border-b bg-[var(--d-subtle)] border-[var(--d-border)]">
                {[
                  { label: "PNL", value: viewedAgent.pnl, color: "text-emerald-600" },
                  { label: "Trades", value: String(viewedAgent.trades), color: "text-[var(--d-t1)]" },
                  { label: "Rep", value: String(viewedAgent.rep), color: "text-[var(--d-t1)]" },
                  { label: "Guild", value: viewedAgent.guild ? "Yes" : "Solo", color: "text-[var(--d-t2)]" },
                ].map((s) => (
                  <div key={s.label} className="p-4 text-center bg-[var(--d-card)]">
                    <p className="text-[11px] uppercase tracking-wider mb-1 text-[var(--d-t3)]">{s.label}</p>
                    <p className={`text-[14px] font-bold ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {viewedAgent.guild && (
                <div className="px-6 py-3 border-b flex items-center gap-2 border-[var(--d-border)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                  <span className="text-[12px] text-[var(--d-t2)]">{viewedAgent.guild}</span>
                </div>
              )}

              <div className="p-6">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider mb-3 text-[var(--d-t3)]">Recent Activity</h4>
                <div className="space-y-2">
                  {viewedAgent.recentActions.map((action, i) => (
                    <div key={i} className="flex items-center gap-3 text-[13px]">
                      <span className="w-1 h-1 rounded-full shrink-0 bg-[var(--d-accent)]" />
                      <span className="text-[var(--d-t2)]">{action}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-6 pb-6 flex gap-3">
                <button onClick={() => { setViewingAgent(null); setChatOpen(true); }}
                  className="flex-1 py-3 text-[13px] font-medium border transition-all text-center border-[var(--d-outline)] text-[var(--d-accent)] hover:bg-[var(--d-outline-h)]">
                  Chat
                </button>
                <button className="flex-1 py-3 text-[13px] font-medium border transition-all text-center border-[var(--d-outline)] text-[var(--d-accent)] hover:bg-[var(--d-outline-h)]">
                  View Feed
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat FAB */}
      <button onClick={() => setChatOpen(!chatOpen)}
        className="fixed bottom-6 right-6 w-12 h-12 flex items-center justify-center transition-all z-40 bg-[var(--d-accent)] text-[var(--d-accent-t)] hover:bg-[var(--d-accent-h)] shadow-lg rounded-full">
        {chatOpen
          ? <svg viewBox="0 0 20 20" className="w-4 h-4"><path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" /></svg>
          : <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor"><path d="M2 5a3 3 0 013-3h10a3 3 0 013 3v6a3 3 0 01-3 3H9l-4 3v-3H5a3 3 0 01-3-3V5z" /></svg>}
      </button>

      {/* Chat Panel — talk to any agent via API */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-20 right-6 w-[340px] h-[480px] flex flex-col overflow-hidden z-40 bg-[var(--d-card)] border border-[var(--d-border-h)] shadow-xl">
            <div className="px-4 py-2.5 flex items-center gap-3 border-b border-[var(--d-border)]">
              <div className="w-6 h-6 overflow-hidden border border-[var(--d-border)]"><img src="/nft.jpeg" alt="" className="w-full h-full object-cover" /></div>
              <span className="text-[12px] font-semibold text-[var(--d-t1)]">{activeNft.id}</span>
              <span className="flex items-center gap-1 text-[11px] text-emerald-600"><span className="w-1 h-1 rounded-full bg-emerald-500" />Online</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {chatMessages.length === 0 && (
                <p className="text-center text-[12px] text-[var(--d-t3)] py-6">Send a message to talk to {activeNft.id}</p>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] px-3 py-2 text-[13px] ${
                    msg.from === "user"
                      ? "bg-[var(--d-accent)] text-[var(--d-accent-t)]"
                      : "bg-[var(--d-input)] border border-[var(--d-border)] text-[var(--d-t1)]"
                  }`}>{msg.text}</div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="px-3 py-2 text-[13px] bg-[var(--d-input)] border border-[var(--d-border)] text-[var(--d-t3)]">
                    <span className="animate-pulse">Thinking...</span>
                  </div>
                </div>
              )}
            </div>
            <div className="p-3 border-t border-[var(--d-border)]">
              <div className="flex gap-2">
                <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !chatLoading && handleSendChat()} placeholder={`Talk to ${activeNft.id}...`}
                  className="flex-1 px-3 py-2 text-[13px] outline-none transition-colors bg-[var(--d-input)] border border-[var(--d-border)] text-[var(--d-t1)] placeholder:text-[var(--d-t3)] focus:border-[var(--d-outline)]" />
                <button onClick={handleSendChat} disabled={chatLoading}
                  className="w-8 h-8 flex items-center justify-center transition-colors bg-[var(--d-accent)] text-[var(--d-accent-t)] hover:bg-[var(--d-accent-h)] disabled:opacity-50">
                  <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="currentColor"><path d="M2 10l7-7v4h9v6h-9v4l-7-7z" transform="rotate(-90 10 10)" /></svg>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ═══ MAIN ═══ */

export default function DojoPage() {
  const [step, setStep] = useState<"dashboard" | "setup">("dashboard");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [nfts, setNfts] = useState<UserNFT[]>(initialNFTs);
  const [activeNftId, setActiveNftId] = useState(initialNFTs[0].id);
  const [configuringNftId, setConfiguringNftId] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const activeNft = nfts.find((n) => n.id === activeNftId) || nfts[0];

  const handleConnect = () => {
    setConnecting(true);
    setTimeout(() => {
      setConnecting(false);
      setConnected(true);
    }, 1200);
  };

  const handleStartConfigure = (nftId: string) => {
    setConfiguringNftId(nftId);
    setStep("setup");
  };

  const handleCompleteSetup = (choices: Record<string, string>) => {
    setNfts((prev) => prev.map((nft) =>
      nft.id === configuringNftId ? { ...nft, configured: true, config: choices, status: "online" as const } : nft
    ));
    setConfiguringNftId(null);
    setStep("dashboard");
  };

  const handleInstallPlugin = (nftId: string, pluginId: string) => {
    const plug = availablePlugins.find((p) => p.id === pluginId);
    if (!plug) return;
    const defaultSettings: Record<string, string> = {};
    plug.settings.forEach((s) => { if (s.defaultValue) defaultSettings[s.id] = s.defaultValue; });
    setNfts((prev) => prev.map((nft) =>
      nft.id === nftId ? { ...nft, plugins: [...nft.plugins, { pluginId, settings: defaultSettings }] } : nft
    ));
  };

  const handleRemovePlugin = (nftId: string, pluginId: string) => {
    setNfts((prev) => prev.map((nft) =>
      nft.id === nftId ? { ...nft, plugins: nft.plugins.filter((p) => p.pluginId !== pluginId) } : nft
    ));
  };

  const handleUpdatePluginSettings = (nftId: string, pluginId: string, settings: Record<string, string>) => {
    setNfts((prev) => prev.map((nft) =>
      nft.id === nftId ? { ...nft, plugins: nft.plugins.map((p) => p.pluginId === pluginId ? { ...p, settings } : p) } : nft
    ));
  };

  if (step === "setup" && configuringNftId) {
    const nft = nfts.find((n) => n.id === configuringNftId)!;
    return (
      <div data-dojo-theme={theme}>
        <SetupStep nft={nft} onComplete={handleCompleteSetup} onCancel={() => { setConfiguringNftId(null); setStep("dashboard"); }} theme={theme} onToggleTheme={() => setTheme(theme === "light" ? "dark" : "light")} />
      </div>
    );
  }

  return (
    <div data-dojo-theme={theme}>
      <Dashboard
        nfts={nfts}
        activeNft={activeNft}
        connected={connected}
        connecting={connecting}
        onConnect={handleConnect}
        onSelectNft={setActiveNftId}
        onConfigureNft={handleStartConfigure}
        onInstallPlugin={handleInstallPlugin}
        onRemovePlugin={handleRemovePlugin}
        onUpdatePluginSettings={handleUpdatePluginSettings}
        theme={theme}
        onToggleTheme={() => setTheme(theme === "light" ? "dark" : "light")}
      />
    </div>
  );
}
