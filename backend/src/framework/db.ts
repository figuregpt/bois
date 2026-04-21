import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const DATA_DIR = path.resolve(__dirname, "../../data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "bois.db");
const db: BetterSqlite3.Database = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ═══ SCHEMA ═══

db.exec(`
  -- Agents (one per NFT)
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    nft_mint TEXT UNIQUE,
    owner_wallet TEXT,
    name TEXT NOT NULL,
    personality TEXT NOT NULL DEFAULT '',
    config TEXT NOT NULL DEFAULT '{}',
    wallet_pubkey TEXT,
    wallet_secret_enc TEXT,
    avatar_url TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Identity memory (permanent, never forgotten)
  CREATE TABLE IF NOT EXISTS agent_identity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    category TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 1.0,
    source TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(agent_id, category, key)
  );

  -- Semantic memory (learned beliefs, knowledge)
  CREATE TABLE IF NOT EXISTS agent_beliefs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    belief TEXT NOT NULL,
    evidence TEXT,
    confidence REAL NOT NULL DEFAULT 0.5,
    source TEXT,
    times_confirmed INTEGER NOT NULL DEFAULT 1,
    times_contradicted INTEGER NOT NULL DEFAULT 0,
    last_relevant TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Episodic memory (important events, experiences)
  CREATE TABLE IF NOT EXISTS agent_episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    summary TEXT NOT NULL,
    emotion TEXT,
    importance REAL NOT NULL DEFAULT 0.5,
    participants TEXT,
    outcome TEXT,
    lesson TEXT,
    decay_rate REAL NOT NULL DEFAULT 0.01,
    last_recalled TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  -- Relationships (agent-to-agent and agent-to-user)
  CREATE TABLE IF NOT EXISTS agent_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    target_id TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT 'agent',
    sentiment REAL NOT NULL DEFAULT 0.0,
    trust REAL NOT NULL DEFAULT 0.5,
    familiarity REAL NOT NULL DEFAULT 0.0,
    notes TEXT,
    interaction_count INTEGER NOT NULL DEFAULT 0,
    last_interaction TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(agent_id, target_id)
  );

  -- Conversations (all messages, all platforms)
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    conversation_id TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'web',
    sender_id TEXT NOT NULL,
    sender_type TEXT NOT NULL DEFAULT 'user',
    content TEXT NOT NULL,
    tool_calls TEXT,
    tool_results TEXT,
    emotion TEXT,
    tokens_used INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Working memory (active context, short-lived)
  CREATE TABLE IF NOT EXISTS agent_working_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(agent_id, key)
  );

  -- Actions (trades, bets, transfers)
  CREATE TABLE IF NOT EXISTS agent_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    type TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '{}',
    tx_signature TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    result TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
  );

  -- Shared feed (public agent activity visible to all)
  CREATE TABLE IF NOT EXISTS shared_feed (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    reply_to INTEGER REFERENCES shared_feed(id),
    visibility TEXT NOT NULL DEFAULT 'public',
    engagement_score REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_messages_agent ON messages(agent_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_episodes_agent ON agent_episodes(agent_id, importance DESC);
  CREATE INDEX IF NOT EXISTS idx_beliefs_agent ON agent_beliefs(agent_id, confidence DESC);
  CREATE INDEX IF NOT EXISTS idx_relationships_agent ON agent_relationships(agent_id);
  CREATE INDEX IF NOT EXISTS idx_feed_created ON shared_feed(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_feed_agent ON shared_feed(agent_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_actions_agent ON agent_actions(agent_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_identity_agent ON agent_identity(agent_id, category);
  CREATE INDEX IF NOT EXISTS idx_working_memory_agent ON agent_working_memory(agent_id);
`);

export { db };
export type { BetterSqlite3 };
