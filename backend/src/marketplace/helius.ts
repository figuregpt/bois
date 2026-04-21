const HELIUS_API_KEY = "c3d590ee-9ff6-4ee8-b72c-111a6bbdf9a9";
const HELIUS_REST = `https://api.helius.xyz/v0`;
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const MAX_RPS = 15;
const MIN_INTERVAL_MS = Math.ceil(1000 / MAX_RPS);

// ═══ RATE LIMITER ═══

let lastRequestTime = 0;
const requestQueue: Array<{
  execute: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}> = [];
let processing = false;

async function processQueue() {
  if (processing) return;
  processing = true;

  while (requestQueue.length > 0) {
    const item = requestQueue.shift()!;
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < MIN_INTERVAL_MS) {
      await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
    }
    lastRequestTime = Date.now();
    try {
      const result = await item.execute();
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    }
  }

  processing = false;
}

function rateLimited<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    requestQueue.push({
      execute: fn as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    processQueue();
  });
}

// ═══ NFT METADATA CACHE ═══

const metadataCache = new Map<string, { name: string; image: string }>();

// ═══ TYPES ═══

export interface NormalizedEvent {
  type: "NFT_SALE" | "NFT_LISTING" | "NFT_CANCEL_LISTING";
  source: string;
  amountLamports: number;
  buyer: string;
  seller: string;
  nftMint: string;
  signature: string;
  timestamp: number;
}

interface HeliusWebhookTransaction {
  type: string;
  source: string;
  signature: string;
  timestamp: number;
  events?: {
    nft?: {
      amount?: number;
      buyer?: string;
      seller?: string;
      nfts?: Array<{ mint: string; tokenStandard?: string }>;
    };
  };
  nativeTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
}

interface HeliusNftEvent {
  type: string;
  source: string;
  amount: number;
  buyer: string;
  seller: string;
  nfts: Array<{ mint: string; tokenStandard?: string }>;
  signature: string;
  timestamp: number;
}

// ═══ WEBHOOK MANAGEMENT ═══

export async function createWebhook(
  collectionAddress: string,
  webhookUrl: string
): Promise<string> {
  const response = await rateLimited(() =>
    fetch(`${HELIUS_REST}/webhooks?api-key=${HELIUS_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webhookURL: webhookUrl,
        transactionTypes: ["NFT_SALE", "NFT_LISTING", "NFT_CANCEL_LISTING"],
        accountAddresses: [collectionAddress],
        webhookType: "enhanced",
      }),
    })
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create webhook: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { webhookID: string };
  console.log(`[Marketplace] Webhook created: ${data.webhookID} for ${collectionAddress}`);
  return data.webhookID;
}

export async function deleteWebhook(webhookId: string): Promise<void> {
  const response = await rateLimited(() =>
    fetch(`${HELIUS_REST}/webhooks/${webhookId}?api-key=${HELIUS_API_KEY}`, {
      method: "DELETE",
    })
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to delete webhook: ${response.status} ${text}`);
  }

  console.log(`[Marketplace] Webhook deleted: ${webhookId}`);
}

// ═══ NFT EVENTS (INITIAL SYNC) ═══

export async function getNftEvents(
  address: string,
  types: string[] = ["NFT_SALE", "NFT_LISTING"]
): Promise<NormalizedEvent[]> {
  const allEvents: NormalizedEvent[] = [];
  let before: string | undefined;
  let pageCount = 0;
  const maxPages = 10;

  while (pageCount < maxPages) {
    const typeParam = types.join(",");
    let url = `${HELIUS_REST}/addresses/${address}/nft-events?api-key=${HELIUS_API_KEY}&type=${typeParam}`;
    if (before) {
      url += `&before=${before}`;
    }

    const response = await rateLimited(() => fetch(url));

    if (!response.ok) {
      const text = await response.text();
      console.error(`[Marketplace] NFT events fetch error: ${response.status} ${text}`);
      break;
    }

    const events = (await response.json()) as HeliusNftEvent[];

    if (!events || events.length === 0) break;

    for (const event of events) {
      const nftMint = event.nfts?.[0]?.mint || "";
      if (!nftMint) continue;

      allEvents.push({
        type: event.type as NormalizedEvent["type"],
        source: event.source || "unknown",
        amountLamports: event.amount || 0,
        buyer: event.buyer || "",
        seller: event.seller || "",
        nftMint,
        signature: event.signature,
        timestamp: event.timestamp,
      });
    }

    // Use the last signature as cursor for pagination
    before = events[events.length - 1].signature;
    pageCount++;

    // If we got fewer than a full page, we reached the end
    if (events.length < 100) break;
  }

  console.log(`[Marketplace] Fetched ${allEvents.length} NFT events for ${address} (${pageCount} pages)`);
  return allEvents;
}

// ═══ WEBHOOK PAYLOAD PARSING ═══

export function parseWebhookPayload(body: unknown): NormalizedEvent[] {
  if (!Array.isArray(body)) return [];

  const events: NormalizedEvent[] = [];

  for (const tx of body as HeliusWebhookTransaction[]) {
    const type = tx.type as NormalizedEvent["type"];
    if (!["NFT_SALE", "NFT_LISTING", "NFT_CANCEL_LISTING"].includes(type)) continue;

    const nftEvent = tx.events?.nft;
    const nftMint = nftEvent?.nfts?.[0]?.mint || "";
    if (!nftMint) continue;

    // Calculate amount from native transfers if not in nft event
    let amountLamports = nftEvent?.amount || 0;
    if (!amountLamports && tx.nativeTransfers) {
      amountLamports = tx.nativeTransfers.reduce((max, t) => Math.max(max, t.amount), 0);
    }

    events.push({
      type,
      source: tx.source || "unknown",
      amountLamports,
      buyer: nftEvent?.buyer || "",
      seller: nftEvent?.seller || "",
      nftMint,
      signature: tx.signature,
      timestamp: tx.timestamp,
    });
  }

  return events;
}

// ═══ NFT METADATA RESOLUTION ═══

export async function resolveNftMetadata(
  mint: string
): Promise<{ name: string; image: string }> {
  // Check cache first
  const cached = metadataCache.get(mint);
  if (cached) return cached;

  try {
    const response = await rateLimited(() =>
      fetch(HELIUS_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now().toString(),
          method: "getAsset",
          params: { id: mint },
        }),
      })
    );

    if (!response.ok) {
      console.error(`[Marketplace] getAsset error for ${mint}: ${response.status}`);
      return { name: "", image: "" };
    }

    const data = (await response.json()) as {
      result?: {
        content?: {
          metadata?: { name?: string };
          links?: { image?: string };
        };
      };
      error?: { message: string };
    };

    if (data.error) {
      console.error(`[Marketplace] getAsset RPC error for ${mint}: ${data.error.message}`);
      return { name: "", image: "" };
    }

    const name = data.result?.content?.metadata?.name || "";
    const image = data.result?.content?.links?.image || "";
    const result = { name, image };

    // Cache the result
    metadataCache.set(mint, result);

    return result;
  } catch (err) {
    console.error(`[Marketplace] Failed to resolve metadata for ${mint}:`, err);
    return { name: "", image: "" };
  }
}
