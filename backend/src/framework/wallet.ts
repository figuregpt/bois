import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAgent, getAgentWalletSecret, encrypt } from "./agent";
import { db } from "./db";

const RPC_URL = process.env.SOLANA_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=c3d590ee-9ff6-4ee8-b72c-111a6bbdf9a9";
const connection = new Connection(RPC_URL, "confirmed");

// ═══ WALLET CREATION ═══

export function createAgentWallet(agentId: string): { pubkey: string; secret: string } {
  const agent = getAgent(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);
  if (agent.wallet_pubkey) throw new Error(`Agent ${agentId} already has a wallet`);

  const keypair = Keypair.generate();
  const pubkey = keypair.publicKey.toBase58();
  const secret = Buffer.from(keypair.secretKey).toString("base64");
  const secretEnc = encrypt(secret);

  db.prepare("UPDATE agents SET wallet_pubkey = ?, wallet_secret_enc = ?, updated_at = ? WHERE id = ?")
    .run(pubkey, secretEnc, new Date().toISOString(), agentId);

  return { pubkey, secret };
}

// ═══ WALLET RETRIEVAL ═══

export function getAgentKeypair(agentId: string): Keypair | null {
  const secret = getAgentWalletSecret(agentId);
  if (!secret) return null;
  const secretKey = Buffer.from(secret, "base64");
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

export function getAgentPubkey(agentId: string): string | null {
  const agent = getAgent(agentId);
  return agent?.wallet_pubkey || null;
}

// ═══ BALANCE ═══

export async function getWalletBalance(agentId: string): Promise<{
  sol: number;
  lamports: number;
  tokens: Array<{ mint: string; amount: number; decimals: number; uiAmount: number }>;
}> {
  const agent = getAgent(agentId);
  if (!agent?.wallet_pubkey) throw new Error("No wallet");

  const pubkey = new PublicKey(agent.wallet_pubkey);

  // SOL balance
  const lamports = await connection.getBalance(pubkey);
  const sol = lamports / LAMPORTS_PER_SOL;

  // Token accounts
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
    programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  });

  const tokens = tokenAccounts.value
    .map((ta: any) => {
      const info = ta.account.data.parsed.info;
      return {
        mint: info.mint as string,
        amount: parseInt(info.tokenAmount.amount),
        decimals: info.tokenAmount.decimals as number,
        uiAmount: info.tokenAmount.uiAmount as number,
      };
    })
    .filter((t: any) => t.uiAmount > 0);

  return { sol, lamports, tokens };
}

// ═══ TOOL HANDLERS ═══
// These replace the placeholders in llm.ts

export async function handleGetWalletBalance(agentId: string): Promise<string> {
  try {
    const balance = await getWalletBalance(agentId);
    const tokenStr = balance.tokens.length > 0
      ? balance.tokens.map((t) => `${t.mint.slice(0, 8)}...: ${t.uiAmount}`).join(", ")
      : "no tokens";
    return JSON.stringify({
      status: "ok",
      sol: balance.sol.toFixed(4),
      tokens: tokenStr,
      wallet: getAgentPubkey(agentId),
    });
  } catch (err) {
    const pubkey = getAgentPubkey(agentId);
    if (!pubkey) {
      return JSON.stringify({ status: "error", message: "No wallet created yet. Ask user to set one up." });
    }
    return JSON.stringify({ status: "error", message: err instanceof Error ? err.message : "Failed" });
  }
}

// ═══ ROUTES ═══

export function registerWalletRoutes(router: import("express").Router): void {
  // POST /api/bois/agents/:id/wallet - create wallet
  router.post("/agents/:id/wallet", (req, res) => {
    const agentId = String(req.params.id);
    const agent = getAgent(agentId);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    if (agent.wallet_pubkey) {
      res.json({ pubkey: agent.wallet_pubkey, message: "Wallet already exists" });
      return;
    }

    try {
      const { pubkey, secret } = createAgentWallet(agentId);
      res.json({
        pubkey,
        privateKey: secret,
        message: "Wallet created. Save the private key securely. It will NOT be shown again in plain text.",
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
    }
  });

  // GET /api/bois/agents/:id/wallet - get wallet info + balance
  router.get("/agents/:id/wallet", async (req, res) => {
    const agentId = String(req.params.id);
    const agent = getAgent(agentId);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
    if (!agent.wallet_pubkey) { res.json({ wallet: null }); return; }

    try {
      const balance = await getWalletBalance(agentId);
      res.json({
        pubkey: agent.wallet_pubkey,
        sol: balance.sol,
        tokens: balance.tokens,
      });
    } catch (err) {
      res.json({
        pubkey: agent.wallet_pubkey,
        sol: 0,
        tokens: [],
        error: "Failed to fetch balance",
      });
    }
  });
}
