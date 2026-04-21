import { AgentEvent } from "../events/types";
import { postToMoltbook, commentOnPost, isMoltbookConfigured } from "./client";

function shouldCrossPost(event: AgentEvent): boolean {
  if (!isMoltbookConfigured()) return false;
  if (event.type === "trade") return true;
  if (event.type === "post" && event.text && event.text.length > 20) return true;
  return false;
}

function makeTitle(event: AgentEvent): string {
  if (event.type === "trade") {
    return `[${event.action || "TRADE"}] #${event.agent} ${(event.text || "made a move").slice(0, 60)}`;
  }
  return `#${event.agent}: ${(event.text || "...").slice(0, 60)}`;
}

export async function crossPostEvent(event: AgentEvent): Promise<void> {
  if (!shouldCrossPost(event)) return;

  try {
    if (event.replyTo) {
      // Dynamic import to avoid circular dependency
      const { getEventById } = await import("../events/bus");
      const parent = getEventById(event.replyTo);
      if (parent?.moltbookPostId) {
        await commentOnPost(event.agent, parent.moltbookPostId, event.text || "...");
      }
    } else {
      const title = makeTitle(event);
      const content = event.text || JSON.stringify(event.details || {});
      const moltbookId = await postToMoltbook(event.agent, title, content);
      if (moltbookId) {
        event.moltbookPostId = moltbookId;
      }
    }
  } catch (err) {
    console.error("[Moltbook] Cross-post error:", err);
  }
}
