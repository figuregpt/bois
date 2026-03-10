import fs from "fs";
import path from "path";
import { AgentEvent } from "./types";

const LOG_PATH = path.join(__dirname, "..", "logs", "simulation.jsonl");
const events: AgentEvent[] = [];
const listeners: ((event: AgentEvent) => void)[] = [];

// Ensure logs directory exists
const logsDir = path.dirname(LOG_PATH);
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

export function publish(event: AgentEvent) {
  events.push(event);
  // Keep last 500 in memory
  if (events.length > 500) events.shift();
  // Append to file
  fs.appendFileSync(LOG_PATH, JSON.stringify(event) + "\n");
  // Notify listeners
  listeners.forEach((fn) => fn(event));
  console.log(`[EVENT] ${event.agent} ${event.type}: ${event.text || event.action || JSON.stringify(event.details)}`);
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
