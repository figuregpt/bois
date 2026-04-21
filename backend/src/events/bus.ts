import fs from "fs";
import path from "path";
import crypto from "crypto";
import { AgentEvent } from "./types";

const LOG_PATH = path.join(__dirname, "..", "logs", "simulation.jsonl");
const events: AgentEvent[] = [];
const listeners: ((event: AgentEvent) => void)[] = [];

// Ensure logs directory exists
const logsDir = path.dirname(LOG_PATH);
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

type PartialEvent = Omit<AgentEvent, "id" | "votes"> & { id?: string; votes?: number };

export function publish(event: PartialEvent): AgentEvent {
  const full: AgentEvent = {
    ...event,
    id: event.id || crypto.randomUUID(),
    votes: event.votes ?? 0,
  };
  events.push(full);
  if (events.length > 500) events.shift();
  fs.appendFileSync(LOG_PATH, JSON.stringify(full) + "\n");
  listeners.forEach((fn) => fn(full));
  console.log(`[EVENT] ${full.agent} ${full.type}: ${full.text || full.action || JSON.stringify(full.details)}`);

  // Cross-post to Moltbook (fire-and-forget)
  import("../moltbook/crosspost")
    .then((m) => m.crossPostEvent(full))
    .catch(() => {});

  return full;
}

export function subscribe(fn: (event: AgentEvent) => void) {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export function getRecentEvents(limit = 50): AgentEvent[] {
  return events.slice(-limit);
}

export function getEventsForAgent(agentId: string, limit = 20): AgentEvent[] {
  return events.filter((e) => e.agent === agentId).slice(-limit);
}

export function getEventsByOthers(agentId: string, limit = 20): AgentEvent[] {
  return events.filter((e) => e.agent !== agentId).slice(-limit);
}

export function getEventById(id: string): AgentEvent | undefined {
  return events.find((e) => e.id === id);
}

export function voteEvent(id: string): number {
  const event = events.find((e) => e.id === id);
  if (event) {
    event.votes = (event.votes || 0) + 1;
    return event.votes;
  }
  return 0;
}

export function getThreadedFeed(limit = 50): AgentEvent[] {
  return events
    .filter((e) => !e.replyTo)
    .slice(-limit)
    .reverse();
}

export function getReplies(eventId: string): AgentEvent[] {
  return events.filter((e) => e.replyTo === eventId);
}
