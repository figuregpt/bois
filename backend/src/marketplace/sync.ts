import {
  upsertCollection,
  insertListing,
  insertSale,
  clearListings,
  refreshCollectionStats,
  getCollection,
  updateListingAttributes,
  getListingsWithoutAttributes,
} from "./db";
import {
  getCollectionStats,
  getAllListings,
  getCollectionActivities,
} from "./magiceden";

// ═══ HELIUS DAS: ATTRIBUTE FETCHING ═══

const HELIUS_RPC = "https://mainnet.helius-rpc.com/?api-key=c3d590ee-9ff6-4ee8-b72c-111a6bbdf9a9";
const ATTR_MAX_RPS = 15;
const ATTR_MIN_INTERVAL = Math.ceil(1000 / ATTR_MAX_RPS);

let attrLastRequest = 0;
const attrQueue: Array<{
  execute: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}> = [];
let attrProcessing = false;

async function processAttrQueue() {
  if (attrProcessing) return;
  attrProcessing = true;
  while (attrQueue.length > 0) {
    const item = attrQueue.shift()!;
    const now = Date.now();
    const elapsed = now - attrLastRequest;
    if (elapsed < ATTR_MIN_INTERVAL) {
      await new Promise((r) => setTimeout(r, ATTR_MIN_INTERVAL - elapsed));
    }
    attrLastRequest = Date.now();
    try {
      const result = await item.execute();
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    }
  }
  attrProcessing = false;
}

function attrRateLimited<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    attrQueue.push({
      execute: fn as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    processAttrQueue();
  });
}

async function heliusGetAsset(mint: string): Promise<Array<{ trait_type: string; value: string }> | null> {
  try {
    const response = await fetch(HELIUS_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "getAsset",
        params: { id: mint },
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      result?: {
        content?: {
          metadata?: {
            attributes?: Array<{ trait_type: string; value: string }>;
          };
        };
      };
      error?: unknown;
    };
    return data.result?.content?.metadata?.attributes || null;
  } catch {
    return null;
  }
}

async function fetchAndStoreAttributes(collectionAddress: string): Promise<void> {
  const mints = getListingsWithoutAttributes(collectionAddress);
  if (mints.length === 0) return;

  console.log(`[Marketplace] Fetching attributes for ${mints.length} listings...`);

  // Process in chunks of 10
  for (let i = 0; i < mints.length; i += 10) {
    const chunk = mints.slice(i, i + 10);
    const results = await Promise.all(
      chunk.map((m) =>
        attrRateLimited(async () => {
          const attrs = await heliusGetAsset(m.nft_mint);
          return { mint: m.nft_mint, attributes: attrs };
        })
      )
    );
    for (const r of results) {
      if (r.attributes && r.attributes.length > 0) {
        updateListingAttributes(r.mint, collectionAddress, JSON.stringify(r.attributes));
      }
    }
  }

  console.log(`[Marketplace] Attribute fetch complete for ${collectionAddress}`);
}

// ═══ SYNC STATUS TRACKING ═══

interface SyncStatus {
  syncing: boolean;
  progress: string;
  total: number;
  processed: number;
  error?: string;
}

const syncStatuses = new Map<string, SyncStatus>();

export function getSyncStatus(address: string): SyncStatus {
  return syncStatuses.get(address) || {
    syncing: false,
    progress: "idle",
    total: 0,
    processed: 0,
  };
}

// ═══ COLLECTION SYMBOL MAPPING ═══
// ME uses "symbol" not collection address. We need to discover it.
const symbolMap = new Map<string, string>();

export function setSymbol(address: string, symbol: string) {
  symbolMap.set(address, symbol);
}

export function getSymbol(address: string): string | undefined {
  return symbolMap.get(address);
}

// ═══ INITIAL SYNC ═══

export async function initialSync(collectionAddress: string, meSymbol: string): Promise<void> {
  const status: SyncStatus = {
    syncing: true,
    progress: "Starting...",
    total: 0,
    processed: 0,
  };
  syncStatuses.set(collectionAddress, status);
  symbolMap.set(collectionAddress, meSymbol);

  try {
    // 1. Get collection stats
    status.progress = "Fetching stats...";
    const stats = await getCollectionStats(meSymbol);
    console.log(`[Marketplace] ${meSymbol}: floor=${(stats.floorPrice / 1e9).toFixed(2)} SOL, listed=${stats.listedCount}`);

    // 2. Fetch all active listings
    status.progress = "Fetching listings...";
    status.total = stats.listedCount;
    const listings = await getAllListings(meSymbol, stats.listedCount + 50);
    console.log(`[Marketplace] Fetched ${listings.length} listings for ${meSymbol}`);

    // 3. Clear old listings and insert fresh ones
    const collection = getCollection(collectionAddress);
    if (collection) clearListings(collectionAddress);

    for (let i = 0; i < listings.length; i++) {
      const l = listings[i];
      insertListing({
        collection_address: collectionAddress,
        nft_mint: l.tokenMint,
        nft_name: l.name || null,
        nft_image: l.image || null,
        seller: l.seller,
        price_sol: l.price,
        price_lamports: Math.floor(l.price * 1e9),
        marketplace: "magiceden",
        listed_at: new Date().toISOString(),
        signature: `me-listing-${l.tokenMint}`,
      });
      status.processed = i + 1;
      status.progress = `Listings: ${i + 1}/${listings.length}`;
    }

    // 3b. Fetch attributes for listings from Helius DAS
    status.progress = "Fetching attributes...";
    await fetchAndStoreAttributes(collectionAddress);

    // 4. Fetch recent activities (sales) - multiple pages
    status.progress = "Fetching sales...";
    let allActivities: Awaited<ReturnType<typeof getCollectionActivities>> = [];
    for (let offset = 0; offset < 500; offset += 100) {
      const batch = await getCollectionActivities(meSymbol, 100, offset);
      allActivities.push(...batch);
      if (batch.length < 100) break;
    }
    // Insert both sales (buyNow) and listing activity as sales for the activity feed
    const salesEvents = allActivities.filter((a) => a.type === "buyNow" || a.type === "list");
    console.log(`[Marketplace] Fetched ${salesEvents.length} recent activities for ${meSymbol}`);

    for (const s of salesEvents) {
      if (s.type === "buyNow") {
        insertSale({
          collection_address: collectionAddress,
          nft_mint: s.tokenMint,
          nft_name: null,
          nft_image: s.image || null,
          buyer: s.buyer || "",
          seller: s.seller || "",
          price_sol: s.price,
          price_lamports: Math.floor(s.price * 1e9),
          marketplace: s.source || "magiceden",
          sold_at: s.blockTime ? new Date(s.blockTime * 1000).toISOString() : new Date().toISOString(),
          signature: s.signature || `me-sale-${s.tokenMint}-${s.blockTime}`,
        });
      }
      // List events are already in listings table from step 3
    }

    // 5. Refresh stats
    refreshCollectionStats(collectionAddress);

    status.syncing = false;
    status.progress = "complete";
    console.log(`[Marketplace] Sync complete for ${meSymbol}: ${listings.length} listings, ${salesEvents.length} activities`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Marketplace] Sync error for ${meSymbol}:`, msg);
    status.syncing = false;
    status.error = msg;
    status.progress = "error";
  }
}

// ═══ REFRESH (periodic) ═══

export async function refreshListings(collectionAddress: string): Promise<void> {
  const symbol = symbolMap.get(collectionAddress);
  if (!symbol) return;

  try {
    const stats = await getCollectionStats(symbol);
    const listings = await getAllListings(symbol, stats.listedCount + 50);

    clearListings(collectionAddress);
    for (const l of listings) {
      insertListing({
        collection_address: collectionAddress,
        nft_mint: l.tokenMint,
        nft_name: l.name || null,
        nft_image: l.image || null,
        seller: l.seller,
        price_sol: l.price,
        price_lamports: Math.floor(l.price * 1e9),
        marketplace: "magiceden",
        listed_at: new Date().toISOString(),
        signature: `me-listing-${l.tokenMint}`,
      });
    }

    // Fetch attributes for new listings
    await fetchAndStoreAttributes(collectionAddress);

    refreshCollectionStats(collectionAddress);
  } catch (err) {
    console.error(`[Marketplace] Refresh error:`, err);
  }
}
