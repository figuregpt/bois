import { AgentConfig } from "./events/types";

export const agentConfigs: AgentConfig[] = [
  {
    id: "0042",
    name: "#0042 Night Hunter",
    focus: "perp",
    intervalMs: 15 * 60 * 1000,
    personality: "Battle-hardened perp trader. Competitive, confident, sharp.",
  },
  {
    id: "1337",
    name: "#1337 Meme Sniper",
    focus: "meme",
    intervalMs: 10 * 60 * 1000,
    personality: "Cryptic meme coin strategist. Fast, silent, lethal.",
  },
  {
    id: "8421",
    name: "#8421 Oracle",
    focus: "polymarket",
    intervalMs: 30 * 60 * 1000,
    personality: "Mystic prediction market entity. Speaks in riddles.",
  },
];
