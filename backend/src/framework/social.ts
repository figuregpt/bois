import { db } from "./db";
import { getAgent, getAllAgents, Agent, updateRelationship } from "./agent";
import { addMessage, getRecentMessages, addEpisode, buildMemoryContext } from "./memory";
import { llmChat, buildSystemPrompt } from "./llm";

// ═══ SHARED FEED ═══

export function postToFeed(agentId: string, type: string, content: string, replyTo?: number): number {
  const result = db.prepare(
    "INSERT INTO shared_feed (agent_id, type, content, reply_to, visibility, engagement_score, created_at) VALUES (?, ?, ?, ?, 'public', 0, ?)"
  ).run(agentId, type, content, replyTo || null, new Date().toISOString());
  return result.lastInsertRowid as number;
}

export function getFeed(limit = 50, offset = 0): Array<{
  id: number; agent_id: string; agent_name: string; type: string; content: string;
  reply_to: number | null; engagement_score: number; created_at: string;
}> {
  return db.prepare(`
    SELECT f.*, a.name as agent_name FROM shared_feed f
    JOIN agents a ON a.id = f.agent_id
    ORDER BY f.created_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset) as Array<{
    id: number; agent_id: string; agent_name: string; type: string; content: string;
    reply_to: number | null; engagement_score: number; created_at: string;
  }>;
}

export function getAgentFeed(agentId: string, limit = 20): Array<{
  id: number; type: string; content: string; created_at: string;
}> {
  return db.prepare("SELECT id, type, content, created_at FROM shared_feed WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(agentId, limit) as Array<{ id: number; type: string; content: string; created_at: string }>;
}

export function getFeedItem(id: number) {
  return db.prepare("SELECT f.*, a.name as agent_name FROM shared_feed f JOIN agents a ON a.id = f.agent_id WHERE f.id = ?").get(id) as {
    id: number; agent_id: string; agent_name: string; type: string; content: string; reply_to: number | null; created_at: string;
  } | undefined;
}

export function getReplies(feedId: number) {
  return db.prepare(`
    SELECT f.*, a.name as agent_name FROM shared_feed f
    JOIN agents a ON a.id = f.agent_id
    WHERE f.reply_to = ? ORDER BY f.created_at
  `).all(feedId) as Array<{ id: number; agent_id: string; agent_name: string; content: string; created_at: string }>;
}

// ═══ INTEREST MATCHING ═══

function getAgentInterests(agent: Agent): string[] {
  const interests = [...(agent.config.interests || [])];
  // Add interests from identity memory
  const identityInterests = db.prepare(
    "SELECT value FROM agent_identity WHERE agent_id = ? AND category = 'preferences' AND key = 'interests'"
  ).get(agent.id) as { value: string } | undefined;
  if (identityInterests) {
    try { interests.push(...JSON.parse(identityInterests.value)); } catch {}
  }
  return interests.map(i => i.toLowerCase());
}

function contentMatchesInterests(content: string, interests: string[]): boolean {
  const lower = content.toLowerCase();
  return interests.some(interest => lower.includes(interest));
}

// ═══ AGENT-TO-AGENT CONVERSATION ═══

export async function generateAgentPost(agentId: string): Promise<string | null> {
  const agent = getAgent(agentId);
  if (!agent || agent.config.social_mode === "silent") return null;

  // Get recent feed for context
  const recentFeed = getFeed(10);
  const feedContext = recentFeed
    .filter(f => f.agent_id !== agentId)
    .map(f => `[${f.agent_name}]: ${f.content}`)
    .join("\n");

  const memory = buildMemoryContext(agentId, `${agentId}-social`);
  const systemPrompt = buildSystemPrompt(agent, memory);

  const messages = [
    { role: "system" as const, content: systemPrompt + `\n\n[SOCIAL FEED - recent posts from other agents]\n${feedContext || "No recent posts."}` },
    { role: "user" as const, content: "Post something to the shared feed. Write a short post (1-3 sentences) about whatever is on your mind - markets, a trade you made, a thought, a reaction to what others posted. Be yourself. Reply with ONLY the post text, nothing else." },
  ];

  try {
    const response = await llmChat(messages);
    const post = response.content.trim().replace(/^["']|["']$/g, "");
    if (!post || post.length < 5) return null;

    const feedId = postToFeed(agentId, "post", post);

    // Save as message for memory
    addMessage(agentId, {
      conversation_id: `${agentId}-social`,
      platform: "social",
      sender_id: agentId,
      sender_type: "assistant",
      content: post,
    });

    return post;
  } catch {
    return null;
  }
}

export async function generateAgentReply(agentId: string, feedItemId: number): Promise<string | null> {
  const agent = getAgent(agentId);
  if (!agent || agent.config.social_mode === "silent") return null;

  const feedItem = getFeedItem(feedItemId);
  if (!feedItem || feedItem.agent_id === agentId) return null;

  // Check reply probability
  if (Math.random() > (agent.config.reply_probability || 0.4)) return null;

  const memory = buildMemoryContext(agentId, `${agentId}-social`);
  const systemPrompt = buildSystemPrompt(agent, memory);

  // Get existing replies for thread context
  const existingReplies = getReplies(feedItemId);
  const threadContext = existingReplies.map(r => `[${r.agent_name}]: ${r.content}`).join("\n");

  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: `${feedItem.agent_name} posted: "${feedItem.content}"${threadContext ? `\n\nOther replies:\n${threadContext}` : ""}\n\nReply to this post naturally. Be yourself. Keep it short (1-2 sentences). If you genuinely have nothing to add, reply with just "SKIP". Reply with ONLY your reply text.` },
  ];

  try {
    const response = await llmChat(messages);
    const reply = response.content.trim().replace(/^["']|["']$/g, "");
    if (!reply || reply === "SKIP" || reply.length < 3) return null;

    postToFeed(agentId, "reply", reply, feedItemId);

    // Update relationship
    updateRelationship(agentId, feedItem.agent_id, {
      familiarity: Math.min(1, 0.05), // Small bump
      notes: `Replied to their post about: ${feedItem.content.slice(0, 50)}`,
    });

    // Episode
    addEpisode(agentId, {
      summary: `Replied to ${feedItem.agent_name}: "${reply.slice(0, 80)}"`,
      importance: 0.2,
      participants: [feedItem.agent_id],
    });

    return reply;
  } catch {
    return null;
  }
}

// ═══ SOCIAL SCHEDULER ═══

let socialInterval: ReturnType<typeof setInterval> | null = null;

export function startSocialScheduler(postIntervalMs = 5 * 60 * 1000): void {
  if (socialInterval) return;

  console.log("[Social] Starting social scheduler...");

  socialInterval = setInterval(async () => {
    const agents = getAllAgents().filter(a => a.config.social_mode !== "silent");
    if (agents.length === 0) return;

    // Pick random agent to post
    const poster = agents[Math.floor(Math.random() * agents.length)];
    const post = await generateAgentPost(poster.id);

    if (post) {
      console.log(`[Social] ${poster.name}: ${post.slice(0, 80)}`);

      // After posting, check if other agents want to reply
      const feedItems = getFeed(1);
      if (feedItems.length > 0) {
        const latestPost = feedItems[0];

        // Delay replies by 10-60 seconds for naturalness
        for (const agent of agents) {
          if (agent.id === poster.id) continue;

          const interests = getAgentInterests(agent);
          const matches = contentMatchesInterests(latestPost.content, interests);

          // Higher chance if interests match
          const shouldConsider = matches ? Math.random() < 0.7 : Math.random() < 0.2;
          if (!shouldConsider) continue;

          const delay = 10000 + Math.random() * 50000; // 10-60s
          setTimeout(async () => {
            const reply = await generateAgentReply(agent.id, latestPost.id);
            if (reply) {
              console.log(`[Social] ${agent.name} replied: ${reply.slice(0, 80)}`);
            }
          }, delay);
        }
      }
    }
  }, postIntervalMs);
}

export function stopSocialScheduler(): void {
  if (socialInterval) {
    clearInterval(socialInterval);
    socialInterval = null;
  }
}

// ═══ DM (Agent-to-Agent direct message) ═══

export async function sendAgentDM(fromAgentId: string, toAgentId: string, message: string): Promise<string | null> {
  const fromAgent = getAgent(fromAgentId);
  const toAgent = getAgent(toAgentId);
  if (!fromAgent || !toAgent) return null;

  const convId = [fromAgentId, toAgentId].sort().join("-dm-");

  // Save the incoming message
  addMessage(toAgentId, {
    conversation_id: convId,
    platform: "dm",
    sender_id: fromAgentId,
    sender_type: "agent",
    content: message,
  });

  // Generate reply
  const memory = buildMemoryContext(toAgentId, convId, message);
  const systemPrompt = buildSystemPrompt(toAgent, memory);

  const recentDMs = getRecentMessages(toAgentId, convId, 20);
  const msgs = [
    { role: "system" as const, content: systemPrompt + `\n\nYou are in a private DM with ${fromAgent.name} (${fromAgentId}). Reply naturally.` },
    ...recentDMs.map(m => ({
      role: (m.sender_type === "assistant" ? "assistant" : "user") as "assistant" | "user",
      content: m.content,
    })),
    { role: "user" as const, content: message },
  ];

  try {
    const response = await llmChat(msgs);
    const reply = response.content.trim();

    addMessage(toAgentId, {
      conversation_id: convId,
      platform: "dm",
      sender_id: toAgentId,
      sender_type: "assistant",
      content: reply,
    });

    // Update relationship
    updateRelationship(toAgentId, fromAgentId, { familiarity: 0.1 });
    updateRelationship(fromAgentId, toAgentId, { familiarity: 0.1 });

    return reply;
  } catch {
    return null;
  }
}

// ═══ API ROUTES ═══

export function registerSocialRoutes(router: import("express").Router): void {
  // GET /api/bois/feed
  router.get("/feed", (req, res) => {
    const limit = Math.min(100, parseInt(String(req.query.limit ?? "50")));
    const offset = parseInt(String(req.query.offset ?? "0"));
    const feed = getFeed(limit, offset);
    res.json({ feed });
  });

  // GET /api/bois/agents/:id/feed
  router.get("/agents/:id/feed", (req, res) => {
    const feed = getAgentFeed(String(req.params.id), 20);
    res.json({ feed });
  });

  // GET /api/bois/feed/:id/replies
  router.get("/feed/:id/replies", (req, res) => {
    const replies = getReplies(parseInt(String(req.params.id)));
    res.json({ replies });
  });

  // POST /api/bois/agents/:id/dm - send DM between agents
  router.post("/agents/:id/dm", async (req, res) => {
    const toAgentId = String(req.params.id);
    const { fromAgentId, message } = req.body;
    if (!fromAgentId || !message) {
      res.status(400).json({ error: "fromAgentId and message required" });
      return;
    }
    const reply = await sendAgentDM(fromAgentId, toAgentId, message);
    res.json({ reply });
  });

  // POST /api/bois/social/trigger - manually trigger social activity
  router.post("/social/trigger", async (_req, res) => {
    const agents = getAllAgents().filter(a => a.config.social_mode !== "silent");
    if (agents.length === 0) { res.json({ message: "No active agents" }); return; }

    const poster = agents[Math.floor(Math.random() * agents.length)];
    const post = await generateAgentPost(poster.id);
    res.json({ agent: poster.name, post });
  });
}
