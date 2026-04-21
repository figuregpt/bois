import { getCollectionAssets, getLastTransferDate, AssetInfo } from "./helius";
import {
  upsertCollection,
  upsertHolder,
  deactivateMissing,
  getCollection,
  getExistingMint,
  CollectionRow,
} from "./db";

// ═══ SCAN STATUS TRACKING ═══

interface ScanStatus {
  scanning: boolean;
  progress: string;
  total: number;
  processed: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

const scanStatuses = new Map<string, ScanStatus>();

export function getScanStatus(address: string): ScanStatus {
  return scanStatuses.get(address) || {
    scanning: false,
    progress: "0/0",
    total: 0,
    processed: 0,
  };
}

// ═══ FULL SCAN ═══

/**
 * Full scan of a collection: fetches all NFTs, looks up transfer dates,
 * and populates the database.
 */
export async function scanCollection(collectionAddress: string): Promise<void> {
  const status: ScanStatus = {
    scanning: true,
    progress: "0/0",
    total: 0,
    processed: 0,
    startedAt: new Date().toISOString(),
  };
  scanStatuses.set(collectionAddress, status);

  try {
    // Step 1: Get all assets
    console.log(`[HODL] Fetching assets for collection ${collectionAddress}...`);
    status.progress = "Fetching collection assets...";
    const assets = await getCollectionAssets(collectionAddress);
    status.total = assets.length;
    status.progress = `0/${assets.length}`;

    if (assets.length === 0) {
      throw new Error("No assets found for this collection address");
    }

    console.log(`[HODL] Found ${assets.length} assets in collection`);

    // Step 2: Derive collection name from first asset
    const collectionName = deriveCollectionName(assets);

    // Step 3: Upsert collection
    const collection = upsertCollection(collectionAddress, collectionName, assets.length);
    const snapshotId = new Date().toISOString();

    // Step 4: Process each NFT
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];

      try {
        const transferDate = await getLastTransferDate(asset.mint);
        const score = Math.floor((Date.now() - transferDate.getTime()) / 86400000);

        upsertHolder({
          collection_id: collection.id,
          wallet: asset.owner,
          nft_mint: asset.mint,
          nft_name: asset.name,
          nft_image: asset.image || null,
          acquired_at: transferDate.toISOString(),
          score: Math.max(score, 0),
          last_snapshot: snapshotId,
        });
      } catch (err) {
        console.error(`[HODL] Error processing mint ${asset.mint}:`, err);
        // Still mark as processed, use current date as fallback
        upsertHolder({
          collection_id: collection.id,
          wallet: asset.owner,
          nft_mint: asset.mint,
          nft_name: asset.name,
          nft_image: asset.image || null,
          acquired_at: new Date().toISOString(),
          score: 0,
          last_snapshot: snapshotId,
        });
      }

      status.processed = i + 1;
      status.progress = `${i + 1}/${assets.length}`;

      if ((i + 1) % 100 === 0) {
        console.log(`[HODL] Processed ${i + 1}/${assets.length} NFTs`);
      }
    }

    // Step 5: Deactivate holders not in this snapshot
    deactivateMissing(collection.id, snapshotId);

    status.scanning = false;
    status.completedAt = new Date().toISOString();
    console.log(`[HODL] Scan complete for ${collectionAddress}: ${assets.length} NFTs processed`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[HODL] Scan failed for ${collectionAddress}:`, message);
    status.scanning = false;
    status.error = message;
    status.completedAt = new Date().toISOString();
    throw err;
  }
}

// ═══ DAILY SNAPSHOT ═══

/**
 * Lightweight daily snapshot: only looks up transfer dates for new holders.
 * Recalculates scores for existing holders from their stored acquired_at.
 */
export async function dailySnapshot(collectionId: number): Promise<void> {
  const collections = (await import("./db")).getAllCollections();
  const collection = collections.find((c: CollectionRow) => c.id === collectionId);
  if (!collection) throw new Error(`Collection ${collectionId} not found`);

  const address = collection.address;
  const status: ScanStatus = {
    scanning: true,
    progress: "Fetching assets...",
    total: 0,
    processed: 0,
    startedAt: new Date().toISOString(),
  };
  scanStatuses.set(address, status);

  try {
    // Get current holder state
    const assets = await getCollectionAssets(address);
    status.total = assets.length;

    const snapshotId = new Date().toISOString();
    const now = Date.now();

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];

      // Check if this mint already exists with the same owner
      const existing = getExistingMint(collectionId, asset.mint);

      let acquiredAt: string;

      if (existing && existing.wallet === asset.owner) {
        // Same owner, keep existing acquired_at — just recalculate score
        // We need to look up the holder record to get acquired_at
        const holders = (await import("./db")).getHoldersPaginated(collectionId, 1, 0);
        // Use the existing record's data; query the specific mint
        const db = (await import("./db")).db;
        const row = db.prepare(
          "SELECT acquired_at FROM holders WHERE collection_id = ? AND nft_mint = ?"
        ).get(collectionId, asset.mint) as { acquired_at: string } | undefined;
        acquiredAt = row?.acquired_at || new Date().toISOString();
      } else {
        // New holder or different owner — look up transfer date
        try {
          const transferDate = await getLastTransferDate(asset.mint);
          acquiredAt = transferDate.toISOString();
        } catch {
          acquiredAt = new Date().toISOString();
        }
      }

      const score = Math.floor((now - new Date(acquiredAt).getTime()) / 86400000);

      upsertHolder({
        collection_id: collectionId,
        wallet: asset.owner,
        nft_mint: asset.mint,
        nft_name: asset.name,
        nft_image: asset.image || null,
        acquired_at: acquiredAt,
        score: Math.max(score, 0),
        last_snapshot: snapshotId,
      });

      status.processed = i + 1;
      status.progress = `${i + 1}/${assets.length}`;
    }

    deactivateMissing(collectionId, snapshotId);

    // Update collection supply
    upsertCollection(address, collection.name || undefined, assets.length);

    status.scanning = false;
    status.completedAt = new Date().toISOString();
    console.log(`[HODL] Daily snapshot complete for ${address}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    status.scanning = false;
    status.error = message;
    status.completedAt = new Date().toISOString();
    throw err;
  }
}

// ═══ HELPERS ═══

function deriveCollectionName(assets: AssetInfo[]): string {
  if (assets.length === 0) return "Unknown Collection";
  // Try to extract collection name from NFT names (e.g., "Cool Cats #1234" -> "Cool Cats")
  const firstName = assets[0].name || "";
  const match = firstName.match(/^(.+?)[\s]*#?\d+$/);
  if (match) return match[1].trim();
  return firstName || "Unknown Collection";
}
