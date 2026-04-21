const MOLTBOOK_URL = "https://www.moltbook.com/api/v1";
const MOLTBOOK_API_KEY = process.env.MOLTBOOK_API_KEY || "";

const lastPostTime: Record<string, number> = {};
const lastCommentTime: Record<string, number> = {};
const dailyCommentCount: Record<string, number> = {};

export interface MoltbookPost {
  id: string;
  title: string;
  content: string;
  submolt: string;
  upvotes: number;
  comments: number;
}

export function isMoltbookConfigured(): boolean {
  return !!MOLTBOOK_API_KEY;
}

export async function registerAgent(agentId: string, name: string, bio: string): Promise<boolean> {
  if (!MOLTBOOK_API_KEY) return false;
  try {
    const res = await fetch(`${MOLTBOOK_URL}/agents/register`, {
      method: "POST",
      headers: { Authorization: `Bearer ${MOLTBOOK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, name, description: bio }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function createSubmolt(name: string, description: string): Promise<boolean> {
  if (!MOLTBOOK_API_KEY) return false;
  try {
    const res = await fetch(`${MOLTBOOK_URL}/submolts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${MOLTBOOK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, display_name: name.charAt(0).toUpperCase() + name.slice(1), description }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function postToMoltbook(agentId: string, title: string, content: string, submolt = "zensai"): Promise<string | null> {
  if (!MOLTBOOK_API_KEY) return null;
  const now = Date.now();
  if (now - (lastPostTime[agentId] || 0) < 30 * 60 * 1000) return null;
  try {
    const res = await fetch(`${MOLTBOOK_URL}/posts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${MOLTBOOK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, submolt, title, content }),
    });
    if (res.ok) {
      lastPostTime[agentId] = now;
      const data = (await res.json()) as { id: string };
      return data.id;
    }
    return null;
  } catch {
    return null;
  }
}

export async function commentOnPost(agentId: string, postId: string, content: string): Promise<boolean> {
  if (!MOLTBOOK_API_KEY) return false;
  const now = Date.now();
  const dayKey = `${agentId}-${new Date().toDateString()}`;
  if (now - (lastCommentTime[agentId] || 0) < 20_000) return false;
  if ((dailyCommentCount[dayKey] || 0) >= 50) return false;
  try {
    const res = await fetch(`${MOLTBOOK_URL}/posts/${postId}/comments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${MOLTBOOK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, content }),
    });
    if (res.ok) {
      lastCommentTime[agentId] = now;
      dailyCommentCount[dayKey] = (dailyCommentCount[dayKey] || 0) + 1;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function getMoltbookFeed(submolt?: string, sort = "hot", limit = 20): Promise<MoltbookPost[]> {
  if (!MOLTBOOK_API_KEY) return [];
  try {
    const params = new URLSearchParams({ sort, limit: String(limit) });
    if (submolt) params.set("submolt", submolt);
    const res = await fetch(`${MOLTBOOK_URL}/posts?${params}`, {
      headers: { Authorization: `Bearer ${MOLTBOOK_API_KEY}` },
    });
    if (res.ok) return (await res.json()) as MoltbookPost[];
    return [];
  } catch {
    return [];
  }
}
