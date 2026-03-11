import express from "express";
import cors from "cors";
import { agentConfigs } from "./config";
import { BaseAgent } from "./agents/base";
import { startMarketFeeds, stopMarketFeeds } from "./market/simulator";
import { createRouter } from "./api/routes";
import { startTelegramBots } from "./telegram/bot";

const PORT = parseInt(process.env.PORT || "4000");
const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "zensai-backend", agents: agentConfigs.map((c) => c.id) });
});

// Create agents
const agents = new Map<string, BaseAgent>();
for (const config of agentConfigs) {
  agents.set(config.id, new BaseAgent(config));
}

// Mount API
app.use("/api", createRouter(agents));

// Start server
app.listen(PORT, () => {
  console.log(`[Server] Zensai backend running on port ${PORT}`);

  // Start real market data feeds (DexScreener, Polymarket, Hyperliquid)
  startMarketFeeds().then(() => {
    console.log("[Market] Real market feeds initialized");
  }).catch((err) => {
    console.error("[Market] Failed to start feeds:", err);
  });

  // Start all agents (slight delay to let market data load)
  for (const [id, agent] of agents) {
    agent.start();
    console.log(`[Agent] ${id} started — focus: ${agent.config.focus}, interval: ${agent.config.intervalMs / 1000}s`);
  }

  // Start Telegram bots (if tokens available)
  try {
    startTelegramBots(agents);
  } catch (err) {
    console.warn("[Telegram] Failed to start bots:", err);
  }

  console.log("[Server] All systems online");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[Server] SIGTERM received, shutting down...");
  stopMarketFeeds();
  for (const agent of agents.values()) agent.stop();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[Server] SIGINT received, shutting down...");
  stopMarketFeeds();
  for (const agent of agents.values()) agent.stop();
  process.exit(0);
});
