import { db } from "./db";
import crypto from "crypto";

// ═══ TYPES ═══

export interface Agent {
  id: string;
  nft_mint: string | null;
  owner_wallet: string | null;
  name: string;
  personality: string;
  config: AgentConfig;
  wallet_pubkey: string | null;
  avatar_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AgentConfig {
  risk_tolerance: "low" | "medium" | "high";
  trading_style: string;
  interests: string[];
  social_mode: "active" | "passive" | "silent";
  auto_trade: boolean;
  max_trade_size_sol: number;
  reply_probability: number; // 0-1, chance of replying to other agents
  [key: string]: unknown;
}

const DEFAULT_CONFIG: AgentConfig = {
  risk_tolerance: "medium",
  trading_style: "balanced",
  interests: ["crypto", "trading"],
  social_mode: "active",
  auto_trade: false,
  max_trade_size_sol: 1000, // effectively no cap — user-controlled via explicit amount
  reply_probability: 0.4,
};

// ═══ ENCRYPTION ═══

const MASTER_KEY = process.env.WALLET_ENCRYPTION_KEY || "bois-default-key-change-in-production-32ch";
const ALGORITHM = "aes-256-gcm";

function encrypt(text: string): string {
  const key = crypto.scryptSync(MASTER_KEY, "salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return iv.toString("hex") + ":" + authTag + ":" + encrypted;
}

function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];
  const key = crypto.scryptSync(MASTER_KEY, "salt", 32);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ═══ PREPARED STATEMENTS ═══

const stmts = {
  createAgent: db.prepare(`
    INSERT INTO agents (id, nft_mint, owner_wallet, name, personality, config, wallet_pubkey, wallet_secret_enc, avatar_url, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `),
  getAgent: db.prepare("SELECT * FROM agents WHERE id = ?"),
  getAgentByMint: db.prepare("SELECT * FROM agents WHERE nft_mint = ?"),
  getAgentByOwner: db.prepare("SELECT * FROM agents WHERE owner_wallet = ?"),
  getAllAgents: db.prepare("SELECT * FROM agents WHERE status = 'active' ORDER BY created_at"),
  getAgentCount: db.prepare("SELECT COUNT(*) as count FROM agents WHERE status = 'active'"),
  updatePersonality: db.prepare("UPDATE agents SET personality = ?, updated_at = ? WHERE id = ?"),
  updateConfig: db.prepare("UPDATE agents SET config = ?, updated_at = ? WHERE id = ?"),
  updateOwner: db.prepare("UPDATE agents SET owner_wallet = ?, updated_at = ? WHERE id = ?"),
  deactivateAgent: db.prepare("UPDATE agents SET status = 'inactive', updated_at = ? WHERE id = ?"),

  // Identity
  upsertIdentity: db.prepare(`
    INSERT INTO agent_identity (agent_id, category, key, value, confidence, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(agent_id, category, key) DO UPDATE SET
      value = excluded.value, confidence = excluded.confidence, source = excluded.source, updated_at = excluded.updated_at
  `),
  getIdentity: db.prepare("SELECT * FROM agent_identity WHERE agent_id = ? ORDER BY category, key"),
  getIdentityByCategory: db.prepare("SELECT * FROM agent_identity WHERE agent_id = ? AND category = ?"),

  // Relationships
  upsertRelationship: db.prepare(`
    INSERT INTO agent_relationships (agent_id, target_id, target_type, sentiment, trust, familiarity, notes, interaction_count, last_interaction, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(agent_id, target_id) DO UPDATE SET
      sentiment = excluded.sentiment, trust = excluded.trust, familiarity = excluded.familiarity,
      notes = excluded.notes, interaction_count = interaction_count + 1,
      last_interaction = excluded.last_interaction, updated_at = excluded.updated_at
  `),
  getRelationships: db.prepare("SELECT * FROM agent_relationships WHERE agent_id = ? ORDER BY familiarity DESC"),
  getRelationship: db.prepare("SELECT * FROM agent_relationships WHERE agent_id = ? AND target_id = ?"),

  // Working memory
  setWorkingMemory: db.prepare(`
    INSERT INTO agent_working_memory (agent_id, key, value, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(agent_id, key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at
  `),
  getWorkingMemory: db.prepare("SELECT * FROM agent_working_memory WHERE agent_id = ? AND (expires_at IS NULL OR expires_at > ?)"),
  clearExpiredMemory: db.prepare("DELETE FROM agent_working_memory WHERE expires_at IS NOT NULL AND expires_at < ?"),
};

// ═══ AGENT CRUD ═══

export function createAgent(params: {
  id: string;
  nft_mint?: string;
  owner_wallet?: string;
  name: string;
  personality: string;
  config?: Partial<AgentConfig>;
  avatar_url?: string;
  wallet_pubkey?: string;
  wallet_secret?: string;
}): Agent {
  const now = new Date().toISOString();
  const config = { ...DEFAULT_CONFIG, ...params.config };
  const secretEnc = params.wallet_secret ? encrypt(params.wallet_secret) : null;

  stmts.createAgent.run(
    params.id,
    params.nft_mint || null,
    params.owner_wallet || null,
    params.name,
    params.personality,
    JSON.stringify(config),
    params.wallet_pubkey || null,
    secretEnc,
    params.avatar_url || null,
    now, now
  );

  return getAgent(params.id)!;
}

export function getAgent(id: string): Agent | null {
  const row = stmts.getAgent.get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToAgent(row);
}

export function getAgentByMint(mint: string): Agent | null {
  const row = stmts.getAgentByMint.get(mint) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToAgent(row);
}

export function getAllAgents(): Agent[] {
  const rows = stmts.getAllAgents.all() as Record<string, unknown>[];
  return rows.map(rowToAgent);
}

export function getAgentCount(): number {
  const row = stmts.getAgentCount.get() as { count: number };
  return row.count;
}

export function updatePersonality(agentId: string, personality: string): void {
  stmts.updatePersonality.run(personality, new Date().toISOString(), agentId);
}

export function updateConfig(agentId: string, config: Partial<AgentConfig>): void {
  const agent = getAgent(agentId);
  if (!agent) return;
  const merged = { ...agent.config, ...config };
  stmts.updateConfig.run(JSON.stringify(merged), new Date().toISOString(), agentId);
}

export function getAgentWalletSecret(agentId: string): string | null {
  const row = db.prepare("SELECT wallet_secret_enc FROM agents WHERE id = ?").get(agentId) as { wallet_secret_enc: string | null } | undefined;
  if (!row || !row.wallet_secret_enc) return null;
  try {
    return decrypt(row.wallet_secret_enc);
  } catch {
    return null;
  }
}

// ═══ IDENTITY ═══

export function setIdentity(agentId: string, category: string, key: string, value: string, confidence = 1.0, source?: string): void {
  const now = new Date().toISOString();
  stmts.upsertIdentity.run(agentId, category, key, value, confidence, source || null, now, now);
}

export function getIdentity(agentId: string): Array<{ category: string; key: string; value: string; confidence: number }> {
  return stmts.getIdentity.all(agentId) as Array<{ category: string; key: string; value: string; confidence: number }>;
}

export function getIdentityByCategory(agentId: string, category: string): Array<{ key: string; value: string; confidence: number }> {
  return stmts.getIdentityByCategory.all(agentId, category) as Array<{ key: string; value: string; confidence: number }>;
}

// ═══ RELATIONSHIPS ═══

export function updateRelationship(agentId: string, targetId: string, params: {
  target_type?: string;
  sentiment?: number;
  trust?: number;
  familiarity?: number;
  notes?: string;
}): void {
  const now = new Date().toISOString();
  const existing = stmts.getRelationship.get(agentId, targetId) as Record<string, unknown> | undefined;
  stmts.upsertRelationship.run(
    agentId, targetId,
    params.target_type || existing?.target_type || "agent",
    params.sentiment ?? (existing?.sentiment as number) ?? 0,
    params.trust ?? (existing?.trust as number) ?? 0.5,
    params.familiarity ?? (existing?.familiarity as number) ?? 0,
    params.notes ?? (existing?.notes as string) ?? null,
    now, now, now
  );
}

export function getRelationships(agentId: string): Array<{
  target_id: string; target_type: string; sentiment: number; trust: number;
  familiarity: number; notes: string | null; interaction_count: number;
}> {
  return stmts.getRelationships.all(agentId) as Array<{
    target_id: string; target_type: string; sentiment: number; trust: number;
    familiarity: number; notes: string | null; interaction_count: number;
  }>;
}

// ═══ WORKING MEMORY ═══

export function setWorkingMemory(agentId: string, key: string, value: string, ttlMinutes?: number): void {
  const now = new Date().toISOString();
  const expires = ttlMinutes ? new Date(Date.now() + ttlMinutes * 60000).toISOString() : null;
  stmts.setWorkingMemory.run(agentId, key, value, expires, now);
}

export function getWorkingMemory(agentId: string): Record<string, string> {
  const now = new Date().toISOString();
  stmts.clearExpiredMemory.run(now);
  const rows = stmts.getWorkingMemory.all(agentId, now) as Array<{ key: string; value: string }>;
  const mem: Record<string, string> = {};
  for (const r of rows) mem[r.key] = r.value;
  return mem;
}

// ═══ HELPERS ═══

function rowToAgent(row: Record<string, unknown>): Agent {
  let config: AgentConfig;
  try {
    config = { ...DEFAULT_CONFIG, ...JSON.parse(row.config as string || "{}") };
  } catch {
    config = { ...DEFAULT_CONFIG };
  }
  return {
    id: row.id as string,
    nft_mint: row.nft_mint as string | null,
    owner_wallet: row.owner_wallet as string | null,
    name: row.name as string,
    personality: row.personality as string,
    config,
    wallet_pubkey: row.wallet_pubkey as string | null,
    avatar_url: row.avatar_url as string | null,
    status: row.status as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export { encrypt, decrypt };
