import { db } from "./db";

// ═══ TYPES ═══

export interface Episode {
  id: number;
  agent_id: string;
  summary: string;
  emotion: string | null;
  importance: number;
  participants: string[];
  outcome: string | null;
  lesson: string | null;
  decay_rate: number;
  last_recalled: string;
  created_at: string;
}

export interface Belief {
  id: number;
  agent_id: string;
  belief: string;
  evidence: string | null;
  confidence: number;
  source: string | null;
  times_confirmed: number;
  times_contradicted: number;
  last_relevant: string;
  created_at: string;
}

export interface MemoryContext {
  identity: Array<{ category: string; key: string; value: string }>;
  relationships: Array<{ target_id: string; sentiment: number; trust: number; familiarity: number; notes: string | null }>;
  beliefs: Belief[];
  episodes: Episode[];
  working: Record<string, string>;
  recentMessages: Array<{ sender_type: string; sender_id: string; content: string; created_at: string }>;
  mood: string;
  activePositions: string;
}

// ═══ PREPARED STATEMENTS ═══

const stmts = {
  // Episodes
  addEpisode: db.prepare(`
    INSERT INTO agent_episodes (agent_id, summary, emotion, importance, participants, outcome, lesson, decay_rate, last_recalled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getEpisodes: db.prepare(`
    SELECT * FROM agent_episodes WHERE agent_id = ?
    ORDER BY (importance * (1.0 - decay_rate * (julianday('now') - julianday(last_recalled)))) DESC
    LIMIT ?
  `),
  getRecentEpisodes: db.prepare(`
    SELECT * FROM agent_episodes WHERE agent_id = ? AND created_at > ?
    ORDER BY importance DESC LIMIT ?
  `),
  recallEpisode: db.prepare("UPDATE agent_episodes SET last_recalled = ? WHERE id = ?"),
  getEpisodesByParticipant: db.prepare(`
    SELECT * FROM agent_episodes WHERE agent_id = ? AND participants LIKE ?
    ORDER BY created_at DESC LIMIT ?
  `),
  decayEpisodes: db.prepare(`
    DELETE FROM agent_episodes WHERE agent_id = ?
    AND importance * (1.0 - decay_rate * (julianday('now') - julianday(last_recalled))) < 0.05
    AND importance < 0.3
  `),

  // Beliefs
  addBelief: db.prepare(`
    INSERT INTO agent_beliefs (agent_id, belief, evidence, confidence, source, times_confirmed, times_contradicted, last_relevant, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, ?)
  `),
  getBeliefs: db.prepare("SELECT * FROM agent_beliefs WHERE agent_id = ? ORDER BY confidence DESC LIMIT ?"),
  getRelevantBeliefs: db.prepare("SELECT * FROM agent_beliefs WHERE agent_id = ? AND belief LIKE ? ORDER BY confidence DESC LIMIT ?"),
  confirmBelief: db.prepare(`
    UPDATE agent_beliefs SET times_confirmed = times_confirmed + 1,
    confidence = MIN(1.0, confidence + 0.05), last_relevant = ?, updated_at = ?
    WHERE id = ?
  `),
  contradictBelief: db.prepare(`
    UPDATE agent_beliefs SET times_contradicted = times_contradicted + 1,
    confidence = MAX(0.0, confidence - 0.1), last_relevant = ?, updated_at = ?
    WHERE id = ?
  `),
  findSimilarBelief: db.prepare("SELECT * FROM agent_beliefs WHERE agent_id = ? AND belief LIKE ? LIMIT 1"),

  // Messages
  addMessage: db.prepare(`
    INSERT INTO messages (agent_id, conversation_id, platform, sender_id, sender_type, content, tool_calls, tool_results, emotion, tokens_used, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getRecentMessages: db.prepare(`
    SELECT sender_type, sender_id, content, tool_calls, emotion, created_at
    FROM messages WHERE agent_id = ? AND conversation_id = ?
    ORDER BY created_at DESC LIMIT ?
  `),
  getMessageCount: db.prepare("SELECT COUNT(*) as count FROM messages WHERE agent_id = ?"),
  getMessagesWithUser: db.prepare(`
    SELECT sender_type, sender_id, content, emotion, created_at
    FROM messages WHERE agent_id = ? AND (sender_id = ? OR sender_type = 'assistant')
    AND conversation_id = ?
    ORDER BY created_at DESC LIMIT ?
  `),
  getConversationSummaryData: db.prepare(`
    SELECT content, sender_type, emotion FROM messages
    WHERE agent_id = ? AND conversation_id = ?
    ORDER BY created_at DESC LIMIT ?
  `),
};

// ═══ EPISODE MEMORY ═══

export function addEpisode(agentId: string, params: {
  summary: string;
  emotion?: string;
  importance?: number;
  participants?: string[];
  outcome?: string;
  lesson?: string;
  decay_rate?: number;
}): number {
  const now = new Date().toISOString();
  const result = stmts.addEpisode.run(
    agentId,
    params.summary,
    params.emotion || null,
    params.importance ?? 0.5,
    JSON.stringify(params.participants || []),
    params.outcome || null,
    params.lesson || null,
    params.decay_rate ?? 0.01,
    now, now
  );
  return result.lastInsertRowid as number;
}

export function recallEpisodes(agentId: string, limit = 10): Episode[] {
  const rows = stmts.getEpisodes.all(agentId, limit) as Array<Record<string, unknown>>;
  const now = new Date().toISOString();
  // Mark as recalled (strengthens memory)
  for (const row of rows) {
    stmts.recallEpisode.run(now, row.id);
  }
  return rows.map(rowToEpisode);
}

export function getRecentEpisodes(agentId: string, hoursBack = 24, limit = 5): Episode[] {
  const since = new Date(Date.now() - hoursBack * 3600000).toISOString();
  return (stmts.getRecentEpisodes.all(agentId, since, limit) as Array<Record<string, unknown>>).map(rowToEpisode);
}

export function getEpisodesAbout(agentId: string, participantId: string, limit = 5): Episode[] {
  return (stmts.getEpisodesByParticipant.all(agentId, `%${participantId}%`, limit) as Array<Record<string, unknown>>).map(rowToEpisode);
}

export function decayOldEpisodes(agentId: string): number {
  const result = stmts.decayEpisodes.run(agentId);
  return result.changes;
}

// ═══ BELIEF MEMORY ═══

export function addOrReinforceBelief(agentId: string, belief: string, evidence?: string, source?: string, confidence = 0.5): void {
  const now = new Date().toISOString();
  // Check if similar belief exists
  const keywords = belief.split(/\s+/).filter(w => w.length > 4).slice(0, 3);
  for (const kw of keywords) {
    const existing = stmts.findSimilarBelief.get(agentId, `%${kw}%`) as Record<string, unknown> | undefined;
    if (existing) {
      // Reinforce existing belief
      stmts.confirmBelief.run(now, now, existing.id);
      return;
    }
  }
  // New belief
  stmts.addBelief.run(agentId, belief, evidence || null, confidence, source || null, now, now, now);
}

export function contradictBelief(beliefId: number): void {
  const now = new Date().toISOString();
  stmts.contradictBelief.run(now, now, beliefId);
}

export function getBeliefs(agentId: string, limit = 15): Belief[] {
  return (stmts.getBeliefs.all(agentId, limit) as Array<Record<string, unknown>>).map(rowToBelief);
}

export function getRelevantBeliefs(agentId: string, topic: string, limit = 5): Belief[] {
  const keywords = topic.split(/\s+/).filter(w => w.length > 3).slice(0, 5);
  const all: Belief[] = [];
  for (const kw of keywords) {
    const rows = stmts.getRelevantBeliefs.all(agentId, `%${kw}%`, limit) as Array<Record<string, unknown>>;
    all.push(...rows.map(rowToBelief));
  }
  // Deduplicate and sort by confidence
  const seen = new Set<number>();
  return all.filter(b => { if (seen.has(b.id)) return false; seen.add(b.id); return true; })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}

// ═══ MESSAGE MEMORY ═══

export function addMessage(agentId: string, params: {
  conversation_id: string;
  platform?: string;
  sender_id: string;
  sender_type: "user" | "assistant" | "agent" | "system";
  content: string;
  tool_calls?: string;
  tool_results?: string;
  emotion?: string;
  tokens_used?: number;
}): void {
  stmts.addMessage.run(
    agentId,
    params.conversation_id,
    params.platform || "web",
    params.sender_id,
    params.sender_type,
    params.content,
    params.tool_calls || null,
    params.tool_results || null,
    params.emotion || null,
    params.tokens_used || 0,
    new Date().toISOString()
  );
}

export function getRecentMessages(agentId: string, conversationId: string, limit = 30): Array<{
  sender_type: string; sender_id: string; content: string; tool_calls: string | null; emotion: string | null; created_at: string;
}> {
  const rows = stmts.getRecentMessages.all(agentId, conversationId, limit) as Array<Record<string, unknown>>;
  return rows.reverse().map(r => ({
    sender_type: r.sender_type as string,
    sender_id: r.sender_id as string,
    content: r.content as string,
    tool_calls: (r.tool_calls as string | null) ?? null,
    emotion: r.emotion as string | null,
    created_at: r.created_at as string,
  }));
}

// ═══ FULL MEMORY CONTEXT ═══
// This is what gets sent to the AI with each message

export function buildMemoryContext(agentId: string, conversationId: string, userMessage?: string): MemoryContext {
  // Identity (permanent)
  const identity = db.prepare("SELECT category, key, value FROM agent_identity WHERE agent_id = ?")
    .all(agentId) as Array<{ category: string; key: string; value: string }>;

  // Relationships (top 10 by familiarity)
  const relationships = db.prepare(
    "SELECT target_id, sentiment, trust, familiarity, notes FROM agent_relationships WHERE agent_id = ? ORDER BY familiarity DESC LIMIT 10"
  ).all(agentId) as Array<{ target_id: string; sentiment: number; trust: number; familiarity: number; notes: string | null }>;

  // Beliefs (top 10 by confidence, plus topic-relevant if user sent message)
  let beliefs: Belief[] = getBeliefs(agentId, 10);
  if (userMessage) {
    const relevant = getRelevantBeliefs(agentId, userMessage, 5);
    const beliefIds = new Set(beliefs.map(b => b.id));
    for (const b of relevant) {
      if (!beliefIds.has(b.id)) beliefs.push(b);
    }
  }

  // Episodes (most important, with decay)
  const episodes = recallEpisodes(agentId, 8);

  // If talking to someone specific, get episodes about them
  // (handled by caller if needed)

  // Working memory (active context)
  const workingRows = db.prepare(
    "SELECT key, value FROM agent_working_memory WHERE agent_id = ? AND (expires_at IS NULL OR expires_at > ?)"
  ).all(agentId, new Date().toISOString()) as Array<{ key: string; value: string }>;
  const working: Record<string, string> = {};
  for (const r of workingRows) working[r.key] = r.value;

  // Recent messages
  const recentMessages = getRecentMessages(agentId, conversationId, 30);

  // Mood (from working memory or last message emotion)
  const mood = working.mood || "neutral";

  // Active positions (from working memory)
  const activePositions = working.active_positions || "none";

  return {
    identity,
    relationships,
    beliefs,
    episodes,
    working,
    recentMessages,
    mood,
    activePositions,
  };
}

// ═══ MEMORY EXTRACTION ═══
// Called after AI responds - extracts new memories from the conversation

export interface MemoryExtraction {
  new_episodes: Array<{ summary: string; emotion?: string; importance: number; participants?: string[]; lesson?: string }>;
  new_beliefs: Array<{ belief: string; evidence?: string; confidence: number }>;
  identity_updates: Array<{ category: string; key: string; value: string }>;
  relationship_updates: Array<{ target_id: string; sentiment_delta: number; trust_delta: number; notes?: string }>;
  mood_update: string | null;
  working_memory_updates: Array<{ key: string; value: string; ttl_minutes?: number }>;
}

export function applyMemoryExtraction(agentId: string, extraction: MemoryExtraction): void {
  // Episodes
  for (const ep of extraction.new_episodes) {
    addEpisode(agentId, ep);
  }

  // Beliefs
  for (const b of extraction.new_beliefs) {
    addOrReinforceBelief(agentId, b.belief, b.evidence, undefined, b.confidence);
  }

  // Identity
  const { setIdentity } = require("./agent");
  for (const id of extraction.identity_updates) {
    setIdentity(agentId, id.category, id.key, id.value);
  }

  // Relationships
  const { updateRelationship, getRelationships: getAgentRelationships } = require("./agent");
  for (const rel of extraction.relationship_updates) {
    const existing = db.prepare("SELECT sentiment, trust FROM agent_relationships WHERE agent_id = ? AND target_id = ?")
      .get(agentId, rel.target_id) as { sentiment: number; trust: number } | undefined;
    updateRelationship(agentId, rel.target_id, {
      sentiment: Math.max(-1, Math.min(1, (existing?.sentiment || 0) + rel.sentiment_delta)),
      trust: Math.max(0, Math.min(1, (existing?.trust || 0.5) + rel.trust_delta)),
      notes: rel.notes,
    });
  }

  // Mood
  if (extraction.mood_update) {
    const { setWorkingMemory } = require("./agent");
    setWorkingMemory(agentId, "mood", extraction.mood_update, 120); // 2 hour TTL
  }

  // Working memory
  const { setWorkingMemory: setWM } = require("./agent");
  for (const wm of extraction.working_memory_updates) {
    setWM(agentId, wm.key, wm.value, wm.ttl_minutes);
  }

  // Periodic cleanup
  decayOldEpisodes(agentId);
}

// ═══ HELPERS ═══

function rowToEpisode(row: Record<string, unknown>): Episode {
  let participants: string[] = [];
  try { participants = JSON.parse(row.participants as string || "[]"); } catch {}
  return {
    id: row.id as number,
    agent_id: row.agent_id as string,
    summary: row.summary as string,
    emotion: row.emotion as string | null,
    importance: row.importance as number,
    participants,
    outcome: row.outcome as string | null,
    lesson: row.lesson as string | null,
    decay_rate: row.decay_rate as number,
    last_recalled: row.last_recalled as string,
    created_at: row.created_at as string,
  };
}

function rowToBelief(row: Record<string, unknown>): Belief {
  return {
    id: row.id as number,
    agent_id: row.agent_id as string,
    belief: row.belief as string,
    evidence: row.evidence as string | null,
    confidence: row.confidence as number,
    source: row.source as string | null,
    times_confirmed: row.times_confirmed as number,
    times_contradicted: row.times_contradicted as number,
    last_relevant: row.last_relevant as string,
    created_at: row.created_at as string,
  };
}
