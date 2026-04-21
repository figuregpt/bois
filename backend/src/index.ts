import express from "express";
import cors from "cors";
import { startMarketFeeds, stopMarketFeeds } from "./market/simulator";
import { startAgentScheduler, stopAgentScheduler } from "./agents/scheduler";
import { createRouter } from "./api/routes";
import { createHodlRouter } from "./hodl/routes";
import { createMarketplaceRouter } from "./marketplace/routes";
import { createFrameworkRouter } from "./framework/routes";

const PORT = parseInt(process.env.PORT || "4000");
const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "zensai-backend", mode: "openclaw" });
});

// Mount API
app.use("/api", createRouter());
app.use("/api/hodl", createHodlRouter());
app.use("/api/marketplace", createMarketplaceRouter());
app.use("/api/bois", createFrameworkRouter());

// Site auth
const SITE_PASSWORD = process.env.SITE_PASSWORD || "13boisbeingbois07";
const SITE_AUTH_TOKEN = process.env.SITE_AUTH_TOKEN || "bois-early-access-7f3a2b9c4d8e";

app.post("/api/auth/verify", (req, res) => {
  const { password } = req.body;
  if (password === SITE_PASSWORD) {
    res.json({ ok: true, token: SITE_AUTH_TOKEN });
  } else {
    res.status(401).json({ ok: false });
  }
});

app.get("/api/auth/status", (req, res) => {
  const token = (req.headers["x-auth-token"] as string) || "";
  if (token && token === SITE_AUTH_TOKEN) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`[Server] Zensai backend running on port ${PORT}`);

  // Start real market data feeds
  startMarketFeeds().then(() => {
    console.log("[Market] Real market feeds initialized");
  }).catch((err) => {
    console.error("[Market] Failed to start feeds:", err);
  });

  // Start scheduler — sends market data to OpenClaw agents, they decide via SOUL.md
  startAgentScheduler();

  console.log("[Server] OpenClaw agents triggered by scheduler with market data");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[Server] SIGTERM received, shutting down...");
  stopMarketFeeds();
  stopAgentScheduler();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[Server] SIGINT received, shutting down...");
  stopMarketFeeds();
  stopAgentScheduler();
  process.exit(0);
});
