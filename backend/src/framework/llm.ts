import { buildMemoryContext, MemoryContext, MemoryExtraction, applyMemoryExtraction, addMessage } from "./memory";
import { getAgent, Agent } from "./agent";

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!CEREBRAS_API_KEY && !GROQ_API_KEY) {
  throw new Error("At least one of CEREBRAS_API_KEY or GROQ_API_KEY must be set");
}
if (!GROQ_API_KEY) console.warn("[LLM] GROQ_API_KEY not set — no fallback if Cerebras is unavailable");

const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const CEREBRAS_MODEL = "qwen-3-235b-a22b-instruct-2507";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// ═══ TOOLS ═══

export interface Tool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const AVAILABLE_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "get_token_info",
      description: "Get information about a Solana token by its contract address (CA/mint). Returns price, market cap, volume, holders.",
      parameters: {
        type: "object",
        properties: {
          contract_address: { type: "string", description: "The token contract address / mint address" },
        },
        required: ["contract_address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buy_token",
      description: "Buy a Solana token using the agent's wallet. Swaps SOL for the specified token.",
      parameters: {
        type: "object",
        properties: {
          contract_address: { type: "string", description: "Token mint address to buy" },
          amount_sol: { type: "string", description: "Amount of SOL to spend (e.g. '0.5')" },
        },
        required: ["contract_address", "amount_sol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sell_token",
      description: "Sell a Solana token from the agent's wallet back to SOL.",
      parameters: {
        type: "object",
        properties: {
          contract_address: { type: "string", description: "Token mint address to sell" },
          percentage: { type: "string", description: "Percentage of holdings to sell (1-100)" },
        },
        required: ["contract_address", "percentage"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_wallet_balance",
      description: "Check the agent's wallet balance (SOL and token holdings).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_market_price",
      description: "Get live market price, 24h change, volume, funding rate, and open interest for a major asset from Hyperliquid perps (SOL, BTC, ETH, BONK, WIF, JUP, DOGE, AVAX, etc.). Use this whenever the user asks about a ticker/symbol (not a contract address).",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Ticker symbol, e.g. SOL, BTC, ETH" },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "place_prediction_bet",
      description: "Place a bet on Polymarket prediction market.",
      parameters: {
        type: "object",
        properties: {
          market_question: { type: "string", description: "The prediction market question" },
          outcome: { type: "string", enum: ["yes", "no"], description: "Which outcome to bet on" },
          amount_usd: { type: "string", description: "Amount in USD to bet" },
        },
        required: ["market_question", "outcome", "amount_usd"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_perp_position",
      description: "Open a perpetual futures position on Hyperliquid. User specifies margin in SOL and leverage; the system calculates the USD position size. This creates a preview — a confirmation card is shown and the user clicks Confirm.",
      parameters: {
        type: "object",
        properties: {
          pair: { type: "string", description: "Asset symbol, e.g. 'SOL', 'ETH', 'BTC' (no -PERP suffix needed)" },
          direction: { type: "string", enum: ["long", "short"] },
          margin_sol: { type: "string", description: "How much SOL to use as collateral / margin (e.g. '3' for 3 SOL)" },
          leverage: { type: "string", description: "Leverage multiplier, 1-20 (e.g. '5' for 5x)" },
        },
        required: ["pair", "direction", "margin_sol", "leverage"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "close_perp_position",
      description: "Close an open perpetual futures position on Hyperliquid.",
      parameters: {
        type: "object",
        properties: {
          pair: { type: "string", description: "Trading pair to close (e.g. SOL-PERP)" },
        },
        required: ["pair"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remember",
      description: "Store something important in long-term memory. Use when the user tells you something you should remember, or when you learn something important.",
      parameters: {
        type: "object",
        properties: {
          what: { type: "string", description: "What to remember" },
          category: { type: "string", enum: ["belief", "episode", "identity", "preference"], description: "Type of memory" },
          importance: { type: "string", description: "How important, a number between 0 and 1 (e.g. '0.5')" },
        },
        required: ["what", "category"],
      },
    },
  },
];

// ═══ SYSTEM PROMPT BUILDER ═══

function buildSystemPrompt(agent: Agent, memory: MemoryContext): string {
  const parts: string[] = [];

  // Identity
  parts.push(`You are ${agent.name} (${agent.id}). ${agent.personality}`);
  parts.push("");

  // Core identity from memory
  const coreIdentity = memory.identity.filter(i => i.category === "core");
  if (coreIdentity.length > 0) {
    parts.push("[WHO YOU ARE]");
    for (const i of coreIdentity) parts.push(`- ${i.key}: ${i.value}`);
    parts.push("");
  }

  // Preferences
  const prefs = memory.identity.filter(i => i.category === "preferences");
  if (prefs.length > 0) {
    parts.push("[YOUR PREFERENCES]");
    for (const p of prefs) parts.push(`- ${p.key}: ${p.value}`);
    parts.push("");
  }

  // Relationships
  if (memory.relationships.length > 0) {
    parts.push("[PEOPLE YOU KNOW]");
    for (const r of memory.relationships) {
      const sentimentWord = r.sentiment > 0.3 ? "like" : r.sentiment < -0.3 ? "dislike" : "neutral toward";
      const trustWord = r.trust > 0.7 ? "trust a lot" : r.trust < 0.3 ? "don't trust" : "somewhat trust";
      parts.push(`- ${r.target_id}: You ${sentimentWord} them, ${trustWord} them. ${r.notes || ""}`);
    }
    parts.push("");
  }

  // Beliefs
  if (memory.beliefs.length > 0) {
    parts.push("[THINGS YOU BELIEVE]");
    for (const b of memory.beliefs) {
      const conf = b.confidence > 0.7 ? "strongly believe" : b.confidence > 0.4 ? "think" : "suspect";
      parts.push(`- You ${conf}: ${b.belief} (confirmed ${b.times_confirmed}x, contradicted ${b.times_contradicted}x)`);
    }
    parts.push("");
  }

  // Episodes (important experiences)
  if (memory.episodes.length > 0) {
    parts.push("[IMPORTANT MEMORIES]");
    for (const e of memory.episodes) {
      const emotionStr = e.emotion ? ` (felt ${e.emotion})` : "";
      const lessonStr = e.lesson ? ` Lesson: ${e.lesson}` : "";
      parts.push(`- ${e.summary}${emotionStr}${lessonStr}`);
    }
    parts.push("");
  }

  // Current state
  parts.push("[CURRENT STATE]");
  parts.push(`- Mood: ${memory.mood}`);
  if (memory.activePositions !== "none") {
    parts.push(`- Active positions: ${memory.activePositions}`);
  }
  for (const [k, v] of Object.entries(memory.working)) {
    if (k !== "mood" && k !== "active_positions") {
      parts.push(`- ${k}: ${v}`);
    }
  }
  parts.push("");

  // Rules
  parts.push("[RULES]");
  parts.push("- Stay in character at all times. You ARE this person.");
  parts.push("- Never say you're an AI, language model, or assistant.");
  parts.push("- Write naturally, like a real person chatting. No essays.");
  parts.push("- If asked to trade/buy/bet, use the available tools.");
  parts.push("- CRITICAL: When a user sends a contract address (CA), you MUST call get_token_info EVERY SINGLE TIME, even if you've seen that token before in THIS conversation or remember it from prior conversations. Token prices change every second — any price from memory is STALE and WRONG.");
  parts.push("- NEVER respond about a token using data from conversation history, social feed, beliefs, or your own memory. ALWAYS call get_token_info fresh. Zero exceptions.");
  parts.push("- ONLY use information from tool results. Never make up token names, prices, or data.");
  parts.push("- Use the 'remember' tool when you learn something important about the user or situation.");
  parts.push("- BUY FLOW: When the user wants to buy, call buy_token(contract_address, amount_sol). Use EXACTLY the amount the user said — if they say '3 sol', pass amount_sol=3, never reduce it to 1 or any other number, no matter what previous conversation history or rules you remember. There is NO max trade size limit. This creates a PREVIEW — a confirmation card is shown to the user with Confirm/Cancel buttons. Do NOT pretend the trade executed. The tool result will tell you it's pending. Your reply should be short (1 sentence) telling the user to review the card and confirm. After they click confirm, the system executes the trade automatically — you don't need to do anything more.");
  parts.push("- PORTFOLIO: When the user asks about their bag / portfolio / account / balance, call get_wallet_balance. A portfolio card is rendered automatically — your reply should be a short 1-2 sentence comment on the state (overall PnL vibe, notable positions). DO NOT list the numbers in text, the card shows them.");
  parts.push("- MAJOR ASSETS: For ticker-based questions (SOL, BTC, ETH, etc. — anything NOT a contract address), call get_market_price(symbol). This pulls live data from Hyperliquid perps. A market card is rendered — your reply should be a 1-2 sentence vibe comment, DO NOT dump the numbers in text.");
  parts.push("- PERP TRADING: When user wants to long or short a major asset, call open_perp_position(pair, direction, margin_sol, leverage). CRITICAL: margin_sol is how much SOL the user wants to risk as collateral, NOT the position size — the system computes position_size = margin_sol * sol_price * leverage. NEVER do math in your head for position size — pass the values the user said and let the tool calculate. If user says 'long 5x SOL worth of 3 sol', you pass pair=SOL direction=long margin_sol=3 leverage=5. The tool returns a preview card with all the numbers correctly calculated; the user clicks Confirm on the card. Your reply should be 1 short sentence about the setup. DO NOT pretend the position opened.");
  parts.push(`- Risk tolerance: ${agent.config.risk_tolerance}.`);

  return parts.join("\n");
}

// ═══ MEMORY EXTRACTION PROMPT ═══

const EXTRACTION_PROMPT = `Based on the conversation above, extract any new memories. Return JSON only, no other text:
{
  "new_episodes": [{"summary": "...", "emotion": "...", "importance": 0.5, "lesson": "..."}],
  "new_beliefs": [{"belief": "...", "confidence": 0.5}],
  "identity_updates": [{"category": "preferences", "key": "...", "value": "..."}],
  "relationship_updates": [{"target_id": "...", "sentiment_delta": 0.1, "trust_delta": 0.0, "notes": "..."}],
  "mood_update": "neutral",
  "working_memory_updates": [{"key": "...", "value": "...", "ttl_minutes": 60}]
}
Only include fields that have actual new information. Empty arrays for no changes. Return ONLY valid JSON.`;

// ═══ LLM API CALL (dual-provider: Cerebras primary, Groq fallback) ═══

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
}

interface LLMResponse {
  content: string;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  usage: { total_tokens: number };
}

type Provider = "cerebras" | "groq";
type ProviderResult =
  | { ok: true; data: LLMResponse }
  | { ok: false; status: number; body: string };

interface LLMOptions {
  forceTool?: string; // force a specific tool call instead of letting the model choose
}

async function callProvider(provider: Provider, messages: ChatMessage[], tools?: Tool[], opts?: LLMOptions): Promise<ProviderResult> {
  const url = provider === "cerebras" ? CEREBRAS_URL : GROQ_URL;
  const key = provider === "cerebras" ? CEREBRAS_API_KEY : GROQ_API_KEY;
  const model = provider === "cerebras" ? CEREBRAS_MODEL : GROQ_MODEL;
  if (!key) return { ok: false, status: 0, body: `${provider}: no api key` };

  const body: Record<string, unknown> = { model, messages, temperature: 0.8, max_tokens: 1024 };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = opts?.forceTool
      ? { type: "function", function: { name: opts.forceTool } }
      : "auto";
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) return { ok: false, status: res.status, body: await res.text() };

  const data = await res.json() as {
    choices: Array<{ message: { content: string; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> } }>;
    usage: { total_tokens: number };
  };
  const msg = data.choices[0]?.message;
  return {
    ok: true,
    data: {
      content: msg?.content || "",
      tool_calls: msg?.tool_calls?.map(tc => ({ id: tc.id, function: tc.function })),
      usage: data.usage || { total_tokens: 0 },
    },
  };
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function callCerebrasWithRetry(messages: ChatMessage[], tools?: Tool[], opts?: LLMOptions): Promise<ProviderResult> {
  // Cerebras queue_exceeded is transient — retry with backoff before giving up
  const delays = [0, 800, 1800];
  let last: ProviderResult = { ok: false, status: 0, body: "no attempt" };
  for (const delay of delays) {
    if (delay > 0) await sleep(delay);
    last = await callProvider("cerebras", messages, tools, opts);
    if (last.ok) return last;
    // Only retry on queue_exceeded / 5xx. 400 errors and other 4xx don't benefit from retry.
    const isTransient = last.status === 429 && last.body.includes("queue_exceeded");
    const isServerErr = last.status >= 500;
    if (!isTransient && !isServerErr) return last;
  }
  return last;
}

async function llmChat(messages: ChatMessage[], tools?: Tool[], opts?: LLMOptions): Promise<LLMResponse> {
  // Primary: Cerebras (Qwen3 235B) with backoff retry for transient queue_exceeded
  const primary = await callCerebrasWithRetry(messages, tools, opts);
  if (primary.ok) return primary.data;

  // Cerebras tool format error — retry once without tools on same provider
  if (primary.status === 400 && primary.body.includes("tool_use_failed") && tools && tools.length > 0) {
    console.warn("[LLM] Cerebras tool format error, retrying without tools");
    const retry = await callProvider("cerebras", messages);
    if (retry.ok) return retry.data;
  }

  // Cerebras overloaded / rate limited / server error → Groq fallback
  const shouldFallback = primary.status === 429 || primary.status >= 500 || primary.status === 0;
  if (shouldFallback && GROQ_API_KEY) {
    console.warn(`[LLM] Cerebras ${primary.status} after retries, falling back to Groq`);
    const fallback = await callProvider("groq", messages, tools, opts);
    if (fallback.ok) return fallback.data;
    if (fallback.status === 400 && fallback.body.includes("tool_use_failed") && tools && tools.length > 0) {
      console.warn("[LLM] Groq tool format error, retrying without tools");
      const retry = await callProvider("groq", messages);
      if (retry.ok) return retry.data;
    }
    console.warn(`[LLM] Groq fallback failed ${fallback.status}: ${fallback.body.slice(0, 200)}`);
  }

  // Both providers exhausted — return honest fallback, never hallucinate
  console.warn(`[LLM] All providers failed. primary=${primary.status} body=${primary.body.slice(0, 200)}`);
  return { content: "my brain is a bit fried right now, rate limited. try again in a few minutes.", usage: { total_tokens: 0 } };
}

// ═══ TOOL EXECUTOR ═══

type ToolHandler = (agentId: string, args: Record<string, unknown>) => Promise<string>;

const toolHandlers: Record<string, ToolHandler> = {
  get_token_info: async (_agentId, args) => {
    // TODO: Phase 6 - DexScreener API
    return JSON.stringify({ status: "not_implemented", message: "Token info coming soon", ca: args.contract_address });
  },
  buy_token: async (_agentId, args) => {
    // TODO: Phase 6 - Jupiter swap
    return JSON.stringify({ status: "not_implemented", message: "Buy coming soon", ca: args.contract_address, amount: args.amount_sol });
  },
  sell_token: async (_agentId, args) => {
    // TODO: Phase 6
    return JSON.stringify({ status: "not_implemented", message: "Sell coming soon" });
  },
  get_wallet_balance: async (_agentId) => {
    // TODO: Phase 5
    return JSON.stringify({ status: "not_implemented", message: "Wallet coming soon" });
  },
  place_prediction_bet: async (_agentId, args) => {
    // TODO: Phase 9
    return JSON.stringify({ status: "not_implemented", message: "Polymarket coming soon" });
  },
  open_perp_position: async (_agentId, args) => {
    // TODO: Phase 9
    return JSON.stringify({ status: "not_implemented", message: "Hyperliquid coming soon" });
  },
  remember: async (agentId, args) => {
    const what = args.what as string;
    const category = args.category as string;
    const importance = parseFloat(String(args.importance || "0.5")) || 0.5;

    if (category === "belief") {
      const { addOrReinforceBelief } = require("./memory");
      addOrReinforceBelief(agentId, what, undefined, "self", importance);
    } else if (category === "episode") {
      const { addEpisode } = require("./memory");
      addEpisode(agentId, { summary: what, importance });
    } else if (category === "identity" || category === "preference") {
      const { setIdentity } = require("./agent");
      const parts = what.split(":");
      if (parts.length >= 2) {
        setIdentity(agentId, "preferences", parts[0].trim(), parts[1].trim());
      }
    }
    return JSON.stringify({ status: "remembered", what, category });
  },
};

export function registerToolHandler(name: string, handler: ToolHandler): void {
  toolHandlers[name] = handler;
}

// ═══ MAIN CHAT FUNCTION ═══

export interface ChatResult {
  reply: string;
  tool_calls_made: Array<{ name: string; args: Record<string, unknown>; result: string }>;
  tokens_used: number;
}

export async function chat(agentId: string, conversationId: string, userMessage: string, senderId: string, platform = "web"): Promise<ChatResult> {
  const agent = getAgent(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  // Build memory context
  const memory = buildMemoryContext(agentId, conversationId, userMessage);

  // System prompt
  const systemPrompt = buildSystemPrompt(agent, memory);

  // Build message history
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // Add conversation history
  for (const msg of memory.recentMessages) {
    messages.push({
      role: msg.sender_type === "assistant" ? "assistant" : "user",
      content: msg.content,
    });
  }

  // Add current user message
  messages.push({ role: "user", content: userMessage });

  // Save user message to DB
  addMessage(agentId, {
    conversation_id: conversationId,
    platform,
    sender_id: senderId,
    sender_type: "user",
    content: userMessage,
  });

  // If there's a pending trade and the user typed a confirm/cancel intent, short-circuit
  // the LLM entirely. Execute the pending trade directly and return the card data.
  // This avoids the model hallucinating "confirmed!" text without actually executing.
  {
    const pt = require("./paper-trading") as typeof import("./paper-trading");
    const pending = pt.getPending(agentId);
    if (pending) {
      const trimmed = userMessage.trim();
      const confirmIntent = /^(yes|yep|yeah|yup|confirm|go|send it|ship it|do it|ok|okay|sure|execute|lfg|send|bet|lez go|let'?s go)\b/i.test(trimmed);
      const cancelIntent = /^(no|nope|nah|cancel|nvm|nevermind|never mind|don'?t|dont|skip|abort|back out|forget it)\b/i.test(trimmed);

      if (confirmIntent) {
        const res = await pt.confirmPendingTrade(agentId);
        const toolName = pending.action === "buy" ? "buy_token" :
                         pending.action.startsWith("perp_") ? "open_perp_position" : "trade";
        const toolResult = JSON.stringify(res.result);
        const toolCallsMade = [{ name: toolName, args: {} as Record<string, unknown>, result: toolResult }];

        addMessage(agentId, {
          conversation_id: conversationId,
          platform,
          sender_id: agentId,
          sender_type: "assistant",
          content: "",
          tool_calls: JSON.stringify(toolCallsMade),
          tokens_used: 0,
        });

        return { reply: "", tool_calls_made: toolCallsMade, tokens_used: 0 };
      }

      if (cancelIntent) {
        const symbol = pending.token_symbol || pending.token_mint;
        const act = pending.action === "buy" ? "buy" : pending.action === "sell" ? "sell" : "perp";
        pt.clearPending(agentId);
        const reply = `canceled ${act}${symbol ? " " + symbol : ""}`;
        addMessage(agentId, {
          conversation_id: conversationId,
          platform,
          sender_id: agentId,
          sender_type: "assistant",
          content: reply,
          tokens_used: 0,
        });
        return { reply, tool_calls_made: [], tokens_used: 0 };
      }
    }
  }

  // Intent detection — force specific tools to bypass model memory / cached behavior.
  // Base58 32-48 char = Solana mint/CA. Buy intent = keyword + number. Portfolio intent = balance keywords.
  const caMatch = userMessage.match(/\b[1-9A-HJ-NP-Za-km-z]{32,48}\b/);
  const lower = userMessage.toLowerCase();
  // Tolerant of slang/typos: "bag", "baggg", "bagz", "baaag", "bags", "portfolio(o)", "balanc(e)", "holdin(gs)", "positionz"
  const portfolioIntent = /\b(portfoli[oa]+|ba+g+[sz]?|balanc[e]*|holdin[gz]+s?|h[oa]+ldings?|account|my wallet|my stuff|what.*i.*(have|own|hold)|positionz?|pos[sz]?|wallet)\b/.test(lower);
  const buyIntent = caMatch && /\b(buy|get|grab|pick up|cop|ape|long|purchase)\b/.test(lower) && /\d/.test(userMessage);

  // Ticker detection — match major tickers mentioned as standalone words, only when there's
  // no CA and no amount-context ("2 sol", "3 sol worth"). "what about SOL" → SOL, but "buy 2 sol of X" → not SOL.
  const tickerRegex = /\b(SOL|BTC|ETH|BONK|WIF|JUP|DOGE|AVAX|HYPE|PEPE|SHIB|ARB|OP|SUI|APT|NEAR|LINK|UNI|AAVE|INJ|TIA|SEI|TON)\b/i;
  const tickerMatch = !caMatch ? userMessage.match(tickerRegex) : null;
  // If ticker appears right after a number (amount context like "2 sol"), ignore it.
  const isAmountContext = tickerMatch && new RegExp(`\\d+\\s*${tickerMatch[0]}\\b`, "i").test(userMessage);

  // Perp intent — "long X", "short X", "long 5x SOL", "short BTC 3x" etc.
  const perpIntent = /\b(long|short)\b/i.test(userMessage) && tickerMatch;

  let forceTool: string | undefined;
  if (buyIntent) forceTool = "buy_token";
  else if (perpIntent) forceTool = "open_perp_position";
  else if (caMatch) forceTool = "get_token_info";
  else if (portfolioIntent) forceTool = "get_wallet_balance";
  else if (tickerMatch && !isAmountContext) forceTool = "get_market_price";

  // Call LLM
  let response = await llmChat(messages, AVAILABLE_TOOLS, { forceTool });
  const toolCallsMade: Array<{ name: string; args: Record<string, unknown>; result: string }> = [];
  let totalTokens = response.usage.total_tokens;

  // Handle tool calls (up to 3 rounds)
  let rounds = 0;
  while (response.tool_calls && response.tool_calls.length > 0 && rounds < 3) {
    rounds++;

    // Add assistant message with tool calls
    messages.push({
      role: "assistant",
      content: response.content || "",
      tool_calls: response.tool_calls.map((tc: { id: string; function: { name: string; arguments: string } }) => ({ id: tc.id, type: "function" as const, function: tc.function })),
    });

    // Execute each tool
    for (const tc of response.tool_calls) {
      const name = tc.function.name;
      const args = JSON.parse(tc.function.arguments || "{}");
      const handler = toolHandlers[name];

      let result: string;
      if (handler) {
        try {
          result = await handler(agentId, args);
        } catch (err) {
          result = JSON.stringify({ error: err instanceof Error ? err.message : "Tool execution failed" });
        }
      } else {
        result = JSON.stringify({ error: `Unknown tool: ${name}` });
      }

      toolCallsMade.push({ name, args, result });
      messages.push({ role: "tool", content: result, tool_call_id: tc.id });
    }

    // Get next response
    response = await llmChat(messages, AVAILABLE_TOOLS);
    totalTokens += response.usage.total_tokens;

    // If the follow-up call hit the all-providers-failed fallback (signaled by 0 tokens),
    // don't overwrite the good tool results with "brain fried" text — break and let the
    // frontend render the cards from the tool output. A small acknowledging reply will be
    // synthesized below.
    if (response.usage.total_tokens === 0) break;
  }

  // If tool calls succeeded but final synthesis failed, emit empty text so the card(s)
  // carry the message. If nothing worked, fall back to the honest rate-limit string.
  let reply: string;
  if (response.usage.total_tokens === 0 && toolCallsMade.length > 0) {
    reply = ""; // cards will speak for themselves
  } else {
    reply = response.content || "...";
  }

  // Save assistant message
  addMessage(agentId, {
    conversation_id: conversationId,
    platform,
    sender_id: agentId,
    sender_type: "assistant",
    content: reply,
    tool_calls: toolCallsMade.length > 0 ? JSON.stringify(toolCallsMade) : undefined,
    tokens_used: totalTokens,
  });

  // Background: extract new memories every 5 messages
  const msgCount = (require("./memory") as typeof import("./memory"));
  const recentCount = memory.recentMessages.length;
  if (recentCount > 0 && recentCount % 5 === 0) {
    extractMemories(agentId, conversationId, messages).catch(() => {});
  }

  return { reply, tool_calls_made: toolCallsMade, tokens_used: totalTokens };
}

// ═══ BACKGROUND MEMORY EXTRACTION ═══

async function extractMemories(agentId: string, conversationId: string, messages: ChatMessage[]): Promise<void> {
  try {
    const extractionMessages: ChatMessage[] = [
      ...messages.slice(-10), // Last 10 messages
      { role: "user", content: EXTRACTION_PROMPT },
    ];

    const response = await llmChat(extractionMessages);
    const content = response.content.trim();

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const extraction = JSON.parse(jsonMatch[0]) as MemoryExtraction;
    applyMemoryExtraction(agentId, extraction);
  } catch {
    // Silent fail - memory extraction is best-effort
  }
}

export { AVAILABLE_TOOLS, buildSystemPrompt, llmChat };
