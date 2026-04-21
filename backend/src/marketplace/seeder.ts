import {
  upsertCollection,
  updateCollectionSymbol,
  updateCollectionStats,
  getCollectionBySymbol,
  db,
} from "./db";

const ME_API = "https://api-mainnet.magiceden.dev/v2";
const DELAY_MS = 3000; // ~0.33 req/s to avoid ME rate limits

async function meGet(path: string): Promise<unknown> {
  await new Promise((r) => setTimeout(r, DELAY_MS));
  const res = await fetch(`${ME_API}${path}`);
  if (!res.ok) {
    if (res.status === 429) {
      // Rate limited, wait and retry
      console.log("[Seeder] Rate limited, waiting 60s...");
      await new Promise((r) => setTimeout(r, 60000));
      return meGet(path);
    }
    throw new Error(`ME API ${res.status}: ${path}`);
  }
  return res.json();
}

// ═══ SEED STATUS ═══

interface SeedStatus {
  running: boolean;
  phase: string;
  collectionsFound: number;
  collectionsProcessed: number;
  statsProcessed: number;
  addressesResolved: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

let seedStatus: SeedStatus = {
  running: false,
  phase: "idle",
  collectionsFound: 0,
  collectionsProcessed: 0,
  statsProcessed: 0,
  addressesResolved: 0,
};

export function getSeedStatus(): SeedStatus {
  return { ...seedStatus };
}

// ═══ PHASE 1: Fetch all collections ═══

async function fetchAllCollections(): Promise<Array<{ symbol: string; name: string; image: string; description: string }>> {
  const all: Array<{ symbol: string; name: string; image: string; description: string }> = [];
  let offset = 0;
  const limit = 20;

  console.log("[Seeder] Phase 1: Fetching all collections from ME...");

  while (true) {
    try {
      const data = await meGet(`/collections?offset=${offset}&limit=${limit}`) as Array<Record<string, unknown>>;

      if (!Array.isArray(data) || data.length === 0) break;

      for (const c of data) {
        all.push({
          symbol: (c.symbol as string) || "",
          name: (c.name as string) || "",
          image: (c.image as string) || "",
          description: (c.description as string) || "",
        });
      }

      seedStatus.collectionsFound = all.length;
      seedStatus.phase = `Fetching collections... ${all.length}`;

      if (data.length < limit) break;
      offset += limit;

      if (offset % 500 === 0) {
        console.log(`[Seeder] Fetched ${all.length} collections so far...`);
      }
    } catch (err) {
      console.error(`[Seeder] Error at offset ${offset}:`, err);
      // If we hit a hard limit, stop
      break;
    }
  }

  console.log(`[Seeder] Phase 1 complete: ${all.length} collections found`);
  return all;
}

// ═══ PHASE 2: Save collections to DB ═══

function saveCollections(collections: Array<{ symbol: string; name: string; image: string; description: string }>) {
  console.log("[Seeder] Phase 2: Saving to DB...");

  // Use a transaction for speed
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO marketplace_collections (collection_address, name, image, description, me_symbol, added_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Add image and description columns if missing
  try { db.exec("ALTER TABLE marketplace_collections ADD COLUMN image TEXT"); } catch {}
  try { db.exec("ALTER TABLE marketplace_collections ADD COLUMN description TEXT"); } catch {}

  const tx = db.transaction(() => {
    for (const c of collections) {
      // Use symbol as temporary address until we resolve the real one
      insertStmt.run(
        `me:${c.symbol}`, // temporary address
        c.name,
        c.image,
        c.description,
        c.symbol,
        new Date().toISOString()
      );
      seedStatus.collectionsProcessed++;
    }
  });

  tx();
  console.log(`[Seeder] Phase 2 complete: ${collections.length} saved`);
}

// ═══ PHASE 3: Fetch stats for each collection ═══

async function fetchAllStats(collections: Array<{ symbol: string }>) {
  console.log("[Seeder] Phase 3: Fetching stats for each collection...");

  // Skip collections that already have stats
  const alreadyDone = db.prepare(
    "SELECT me_symbol FROM marketplace_collections WHERE last_updated IS NOT NULL"
  ).all() as Array<{ me_symbol: string }>;
  const doneSet = new Set(alreadyDone.map((r) => r.me_symbol));
  const todo = collections.filter((c) => !doneSet.has(c.symbol));
  console.log(`[Seeder] Phase 3: ${doneSet.size} already done, ${todo.length} remaining`);

  for (let i = 0; i < todo.length; i++) {
    const c = todo[i];
    try {
      const stats = await meGet(`/collections/${c.symbol}/stats`) as Record<string, unknown>;

      const floorPrice = ((stats.floorPrice as number) || 0) / 1e9;
      const volumeAll = ((stats.volumeAll as number) || 0) / 1e9;
      const listedCount = (stats.listedCount as number) || 0;
      const avgPrice24hr = ((stats.avgPrice24hr as number) || 0) / 1e9;

      db.prepare(`
        UPDATE marketplace_collections
        SET floor_price = ?, volume_total = ?, listed_count = ?, volume_24h = ?, last_updated = ?
        WHERE me_symbol = ?
      `).run(floorPrice, volumeAll, listedCount, avgPrice24hr, new Date().toISOString(), c.symbol);

      seedStatus.statsProcessed = doneSet.size + i + 1;
      seedStatus.phase = `Stats: ${doneSet.size + i + 1}/${collections.length}`;

      if ((i + 1) % 100 === 0) {
        console.log(`[Seeder] Stats: ${doneSet.size + i + 1}/${collections.length}`);
      }
    } catch (err) {
      // Skip failed ones silently
      if ((i + 1) % 500 === 0) {
        console.log(`[Seeder] Stats: ${doneSet.size + i + 1}/${collections.length} (some failed)`);
      }
    }
  }

  console.log(`[Seeder] Phase 3 complete: ${seedStatus.statsProcessed} stats fetched`);
}

// ═══ PHASE 4: Resolve real Solana collection addresses ═══

const HELIUS_RPC = "https://mainnet.helius-rpc.com/?api-key=c3d590ee-9ff6-4ee8-b72c-111a6bbdf9a9";

async function heliusGetAsset(mint: string): Promise<{ collectionAddress: string } | null> {
  const res = await fetch(HELIUS_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "1", method: "getAsset", params: { id: mint } }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { result?: { grouping?: Array<{ group_key: string; group_value: string }> } };
  const grouping = data.result?.grouping || [];
  const col = grouping.find((g) => g.group_key === "collection");
  return col ? { collectionAddress: col.group_value } : null;
}

async function resolveCollectionAddresses(collections: Array<{ symbol: string }>) {
  console.log("[Seeder] Phase 4: Resolving collection addresses...");

  // Get collections that still have me:symbol as address
  const unresolved = db.prepare(
    "SELECT me_symbol FROM marketplace_collections WHERE collection_address LIKE 'me:%'"
  ).all() as Array<{ me_symbol: string }>;

  console.log(`[Seeder] ${unresolved.length} collections need address resolution`);

  let resolved = 0;
  let failed = 0;

  for (let i = 0; i < unresolved.length; i++) {
    const c = unresolved[i];
    seedStatus.phase = `Addresses: ${i + 1}/${unresolved.length}`;
    seedStatus.addressesResolved = resolved;

    try {
      // Step 1: Get a listing mint from ME
      await new Promise((r) => setTimeout(r, DELAY_MS));
      const listingData = await meGet(`/collections/${c.me_symbol}/listings?offset=0&limit=1`) as Array<Record<string, unknown>>;

      if (!Array.isArray(listingData) || listingData.length === 0) {
        failed++;
        continue;
      }

      const mint = listingData[0].tokenMint as string;
      if (!mint) { failed++; continue; }

      // Step 2: Get collection address from Helius (fast, no rate limit concern)
      const asset = await heliusGetAsset(mint);
      if (!asset) { failed++; continue; }

      // Step 3: Update DB with real address
      db.prepare(
        "UPDATE marketplace_collections SET collection_address = ? WHERE me_symbol = ?"
      ).run(asset.collectionAddress, c.me_symbol);

      resolved++;

      if ((i + 1) % 100 === 0) {
        console.log(`[Seeder] Addresses: ${i + 1}/${unresolved.length} (resolved: ${resolved}, failed: ${failed})`);
      }
    } catch {
      failed++;
    }
  }

  seedStatus.addressesResolved = resolved;
  console.log(`[Seeder] Phase 4 complete: ${resolved} resolved, ${failed} failed`);
}

// ═══ MAIN SEED FUNCTION ═══

export async function seedAllCollections(): Promise<void> {
  if (seedStatus.running) {
    console.log("[Seeder] Already running");
    return;
  }

  seedStatus = {
    running: true,
    phase: "Starting...",
    collectionsFound: 0,
    collectionsProcessed: 0,
    statsProcessed: 0,
    addressesResolved: 0,
    startedAt: new Date().toISOString(),
  };

  try {
    // Check if we already have collections in DB
    const existing = db.prepare("SELECT me_symbol FROM marketplace_collections").all() as Array<{ me_symbol: string }>;
    let collections: Array<{ symbol: string }>;

    if (existing.length > 0) {
      console.log(`[Seeder] DB already has ${existing.length} collections, skipping Phase 1-2`);
      collections = existing.map((r) => ({ symbol: r.me_symbol }));
      seedStatus.collectionsFound = collections.length;
      seedStatus.collectionsProcessed = collections.length;
    } else {
      // Phase 1: Fetch all collections
      const fetched = await fetchAllCollections();
      // Phase 2: Save to DB
      saveCollections(fetched);
      collections = fetched.map((c) => ({ symbol: c.symbol }));
    }

    // Phase 3: Fetch stats (skips already done)
    await fetchAllStats(collections);

    // Phase 4: Resolve real collection addresses
    await resolveCollectionAddresses(collections);

    seedStatus.running = false;
    seedStatus.phase = "complete";
    seedStatus.completedAt = new Date().toISOString();
    console.log(`[Seeder] All done. ${collections.length} collections seeded.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Seeder] Fatal error:", msg);
    seedStatus.running = false;
    seedStatus.error = msg;
    seedStatus.phase = "error";
  }
}
