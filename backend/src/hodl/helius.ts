const HELIUS_RPC = "https://mainnet.helius-rpc.com/?api-key=c3d590ee-9ff6-4ee8-b72c-111a6bbdf9a9";
const MAX_RPS = 8;
const MIN_INTERVAL_MS = Math.ceil(1000 / MAX_RPS); // 125ms between requests

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

// ═══ RPC HELPER ═══

async function rpcCall(method: string, params: unknown): Promise<unknown> {
  const response = await fetch(HELIUS_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now().toString(),
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`Helius RPC error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { result?: unknown; error?: { message: string } };
  if (data.error) {
    throw new Error(`Helius RPC error: ${data.error.message}`);
  }

  return data.result;
}

// ═══ PUBLIC API ═══

export interface AssetInfo {
  mint: string;
  owner: string;
  name: string;
  image: string;
}

/**
 * Get all assets in a collection using the DAS API getAssetsByGroup method.
 * Paginates automatically (1000 per page).
 */
export async function getCollectionAssets(collectionAddress: string): Promise<AssetInfo[]> {
  const assets: AssetInfo[] = [];
  let page = 1;

  while (true) {
    const result = await rateLimited(() =>
      rpcCall("getAssetsByGroup", {
        groupKey: "collection",
        groupValue: collectionAddress,
        page,
        limit: 1000,
      })
    ) as { total: number; limit: number; page: number; items: Array<{
      id: string;
      ownership: { owner: string };
      content: { metadata: { name: string } };
    }> };

    if (!result || !result.items || result.items.length === 0) break;

    for (const item of result.items) {
      const links = (item.content as Record<string, unknown>)?.links as Record<string, string> | undefined;
      assets.push({
        mint: item.id,
        owner: item.ownership?.owner || "",
        name: item.content?.metadata?.name || "",
        image: links?.image || "",
      });
    }

    // If we got fewer items than the limit, we've reached the end
    if (result.items.length < 1000) break;
    page++;
  }

  return assets;
}

/**
 * Get the timestamp of the last transfer for an NFT mint address.
 * Uses getSignaturesForAddress with limit=1.
 */
/**
 * Batch fetch asset images from Helius DAS API.
 * Returns a map of mint -> image URL.
 */
export async function getAssetBatch(mints: string[]): Promise<Record<string, string>> {
  const imageMap: Record<string, string> = {};
  // Process in chunks of 10
  for (let i = 0; i < mints.length; i += 10) {
    const chunk = mints.slice(i, i + 10);
    const results = await Promise.all(
      chunk.map((mint) =>
        rateLimited(async () => {
          const result = await rpcCall("getAsset", { id: mint }) as {
            id: string;
            content?: { links?: { image?: string } };
          };
          return { mint, image: result?.content?.links?.image || "" };
        })
      )
    );
    for (const r of results) {
      if (r.image) imageMap[r.mint] = r.image;
    }
  }
  return imageMap;
}

export async function getLastTransferDate(nftMint: string): Promise<Date> {
  const result = await rateLimited(() =>
    rpcCall("getSignaturesForAddress", [nftMint, { limit: 1 }])
  ) as Array<{ blockTime: number | null; signature: string }>;

  if (!result || result.length === 0 || !result[0].blockTime) {
    // Fallback: if no signatures found, use current time
    return new Date();
  }

  return new Date(result[0].blockTime * 1000);
}
