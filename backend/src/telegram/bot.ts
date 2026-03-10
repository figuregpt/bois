import { Bot } from "grammy";
import { agentConfigs } from "../config";
import { BaseAgent } from "../agents/base";
import { getEventsForAgent } from "../events/bus";

const bots: Bot[] = [];

export function startTelegramBots(agents: Map<string, BaseAgent>) {
  const botTokens: Record<string, string | undefined> = {
    "#0042": process.env.TELEGRAM_BOT_0042,
    "#1337": process.env.TELEGRAM_BOT_1337,
    "#8421": process.env.TELEGRAM_BOT_8421,
  };

  for (const config of agentConfigs) {
    const token = botTokens[config.id];
    if (!token) {
      console.log(`[Telegram] No token for ${config.id}, skipping bot`);
      continue;
    }

    const agent = agents.get(config.id);
    if (!agent) continue;

    const bot = new Bot(token);

    bot.command("start", (ctx) => {
      ctx.reply(
        `Welcome. I am ${config.name} — ${config.personality}.\n\nCommands:\n/status — My current state\n/portfolio — My holdings\n/trades — Recent trades\n/strategy — My approach\n\nOr just talk to me.`,
      );
    });

    bot.command("status", (ctx) => {
      const mem = agent.memory;
      const lastDecision = mem.recentDecisions[mem.recentDecisions.length - 1];
      const status = agent.running ? "Active" : "Idle";
      ctx.reply(
        `[${config.id}] ${config.personality}\nStatus: ${status}\nFocus: ${config.focus}\nDecisions made: ${mem.recentDecisions.length}\nLast action: ${lastDecision ? `${lastDecision.type} — ${lastDecision.text || lastDecision.action || "observe"}` : "None yet"}`,
      );
    });

    bot.command("portfolio", (ctx) => {
      const p = agent.memory.portfolio;
      const lines: string[] = [`Cash: $${p.cash.toFixed(0)}`];

      if (p.positions.length > 0) {
        lines.push("\nPerp Positions:");
        p.positions.forEach((pos) => {
          lines.push(`  ${pos.pair} ${pos.direction} ${pos.leverage}x — $${pos.size} @ ${pos.entry}`);
        });
      }

      if (Object.keys(p.holdings).length > 0) {
        lines.push("\nToken Holdings:");
        Object.entries(p.holdings).forEach(([token, h]) => {
          lines.push(`  ${token}: ${h.amount} (avg $${h.avgPrice.toFixed(4)})`);
        });
      }

      if (p.bets.length > 0) {
        lines.push("\nPolymarket Bets:");
        p.bets.forEach((b) => {
          lines.push(`  ${b.marketId} ${b.outcome} — ${b.shares}sh @ ${b.avgPrice}`);
        });
      }

      ctx.reply(lines.join("\n") || "Empty portfolio.");
    });

    bot.command("trades", (ctx) => {
      const events = getEventsForAgent(config.id, 10);
      const trades = events.filter((e) => e.type === "trade");
      if (trades.length === 0) {
        ctx.reply("No trades yet.");
        return;
      }
      const lines = trades.map(
        (t) => `[${t.ts.slice(11, 19)}] ${t.action} — ${JSON.stringify(t.details)}`,
      );
      ctx.reply(`Recent trades:\n${lines.join("\n")}`);
    });

    bot.command("strategy", (ctx) => {
      const strategies: Record<string, string> = {
        "#0042": "Perp futures. Long on RSI < 30 + MACD cross. Short on RSI > 70. Max 3x leverage. TP 15%, SL 5%. Max 3 positions.",
        "#1337": "Meme sniper. Filter: mcap 10K-500K, dev <5%, top10 <40%, holders >100. Entry on filter pass. Sell half at 2x, rest at 5x. SL -40%.",
        "#8421": "Polymarket contrarian. Entry when odds <0.30 or >0.80 on high volume. Max $50/bet. Buy fear, sell greed.",
      };
      ctx.reply(strategies[config.id] || "No strategy defined.");
    });

    // Free-form chat
    bot.on("message:text", async (ctx) => {
      const userMsg = ctx.message.text;
      try {
        const reply = await agent.chatWithUser(userMsg);
        ctx.reply(reply);
      } catch (err) {
        console.error(`[Telegram ${config.id}] Error:`, err);
        ctx.reply("...");
      }
    });

    bot.start();
    bots.push(bot);
    console.log(`[Telegram] Bot started for ${config.id} (${config.personality})`);
  }
}

export function stopTelegramBots() {
  bots.forEach((bot) => bot.stop());
  console.log("[Telegram] All bots stopped");
}
