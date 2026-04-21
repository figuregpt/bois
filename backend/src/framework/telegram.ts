import TelegramBot from "node-telegram-bot-api";
import { chat } from "./llm";
import { getAgent, getAllAgents, createAgent } from "./agent";
import { db } from "./db";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

let bot: TelegramBot | null = null;

// Track which agent each telegram user is talking to
// Key: telegram chat id, Value: agent id
const userAgentMap = new Map<number, string>();

// ═══ START BOT ═══

export function startTelegramBot(): void {
  if (!TELEGRAM_TOKEN) {
    console.log("[Telegram] No TELEGRAM_BOT_TOKEN set, skipping");
    return;
  }

  bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
  console.log("[Telegram] Bot started");

  // /start - welcome + agent selection
  bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const agentId = match?.[1]?.trim();

    if (agentId) {
      const agent = getAgent(agentId);
      if (agent) {
        userAgentMap.set(chatId, agentId);
        bot!.sendMessage(chatId, `Connected to ${agent.name}. Start chatting.`);
        return;
      }
    }

    // Show available agents
    const agents = getAllAgents();
    if (agents.length === 0) {
      bot!.sendMessage(chatId, "No agents available yet.");
      return;
    }

    const agentList = agents.map(a => `/${a.id} - ${a.name}`).join("\n");
    bot!.sendMessage(chatId, `Welcome to BOIS World.\n\nAvailable agents:\n${agentList}\n\nTap an agent to start chatting, or type /connect <agent_id>`);
  });

  // /connect <agent_id> - switch agent
  bot.onText(/\/connect (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const agentId = match?.[1]?.trim();
    if (!agentId) return;

    const agent = getAgent(agentId);
    if (!agent) {
      bot!.sendMessage(chatId, `Agent "${agentId}" not found.`);
      return;
    }

    userAgentMap.set(chatId, agentId);
    bot!.sendMessage(chatId, `Now talking to ${agent.name}.`);
  });

  // /agents - list all agents
  bot.onText(/\/agents/, (msg) => {
    const agents = getAllAgents();
    if (agents.length === 0) {
      bot!.sendMessage(msg.chat.id, "No agents yet.");
      return;
    }
    const list = agents.map((a, i) => `${i + 1}. ${a.name} (${a.id})`).join("\n");
    bot!.sendMessage(msg.chat.id, `Agents:\n${list}\n\nUse /connect <id> to switch.`);
  });

  // /wallet - check agent wallet
  bot.onText(/\/wallet/, async (msg) => {
    const chatId = msg.chat.id;
    const agentId = userAgentMap.get(chatId);
    if (!agentId) { bot!.sendMessage(chatId, "Connect to an agent first: /start"); return; }

    const agent = getAgent(agentId);
    if (!agent) return;

    if (agent.wallet_pubkey) {
      bot!.sendMessage(chatId, `${agent.name}'s wallet:\n${agent.wallet_pubkey}`);
    } else {
      bot!.sendMessage(chatId, `${agent.name} has no wallet yet.`);
    }
  });

  // /portfolio - check paper portfolio
  bot.onText(/\/portfolio/, async (msg) => {
    const chatId = msg.chat.id;
    const agentId = userAgentMap.get(chatId);
    if (!agentId) { bot!.sendMessage(chatId, "Connect to an agent first: /start"); return; }

    try {
      const res = await fetch(`http://localhost:${process.env.PORT || 4000}/api/bois/agents/${agentId}/portfolio`);
      const data = await res.json() as Record<string, unknown>;
      const sol = data.sol as number || 0;
      const holdings = data.holdings as Array<{ symbol: string; amount: number }> || [];

      let text = `Portfolio (paper):\nSOL: ${sol.toFixed(4)}`;
      if (holdings.length > 0) {
        text += "\n\nHoldings:";
        for (const h of holdings) {
          text += `\n${h.symbol}: ${h.amount.toFixed(2)}`;
        }
      }
      bot!.sendMessage(chatId, text);
    } catch {
      bot!.sendMessage(chatId, "Failed to fetch portfolio.");
    }
  });

  // /who - which agent am I talking to
  bot.onText(/\/who/, (msg) => {
    const chatId = msg.chat.id;
    const agentId = userAgentMap.get(chatId);
    if (!agentId) { bot!.sendMessage(chatId, "Not connected. Use /start"); return; }
    const agent = getAgent(agentId);
    if (agent) {
      bot!.sendMessage(chatId, `You're talking to ${agent.name} (${agent.id})\n${agent.personality.slice(0, 200)}`);
    }
  });

  // Regular messages - chat with agent
  bot.on("message", async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;

    const chatId = msg.chat.id;
    const agentId = userAgentMap.get(chatId);

    if (!agentId) {
      bot!.sendMessage(chatId, "Connect to an agent first. Type /start");
      return;
    }

    const agent = getAgent(agentId);
    if (!agent) {
      bot!.sendMessage(chatId, "Agent not found. Try /start");
      return;
    }

    // Show typing
    bot!.sendChatAction(chatId, "typing");

    const senderId = `tg-${msg.from?.id || chatId}`;
    const conversationId = `${agentId}-tg-${chatId}`;

    try {
      const result = await chat(agentId, conversationId, msg.text, senderId, "telegram");

      // Format reply
      let reply = result.reply;

      // If tools were called, mention it briefly
      if (result.tool_calls_made.length > 0) {
        const toolNames = result.tool_calls_made.map(t => t.name).join(", ");
        // Don't add tool info if AI already mentioned it naturally
      }

      bot!.sendMessage(chatId, reply);
    } catch (err) {
      bot!.sendMessage(chatId, "Something went wrong. Try again.");
      console.error("[Telegram] Chat error:", err);
    }
  });

  // Handle agent shortcuts (/<agent_id>)
  bot.onText(/^\/([a-zA-Z0-9_-]+)$/, (msg, match) => {
    const chatId = msg.chat.id;
    const cmd = match?.[1];
    if (!cmd) return;

    // Skip known commands
    if (["start", "connect", "agents", "wallet", "portfolio", "who", "help"].includes(cmd)) return;

    const agent = getAgent(cmd);
    if (agent) {
      userAgentMap.set(chatId, cmd);
      bot!.sendMessage(chatId, `Now talking to ${agent.name}. Say something.`);
    }
  });
}

export function stopTelegramBot(): void {
  if (bot) {
    bot.stopPolling();
    bot = null;
  }
}
