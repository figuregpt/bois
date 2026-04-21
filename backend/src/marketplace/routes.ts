import { Router, Request, Response } from "express";
import {
  upsertCollection,
  getCollection,
  getAllCollections,
  getActiveListings,
  getActiveListingCount,
  getRecentSales,
  getSaleCount,
  getFloorPrice,
  getVolume24h,
  getVolume7d,
  getVolumeTotal,
  getListedCount,
  updateCollectionSymbol,
  getCollectionSymbol,
  getCollectionsPaginated,
  getCollectionsCount,
  searchCollections,
  db,
} from "./db";
import { initialSync, getSyncStatus, setSymbol, getSymbol } from "./sync";
import { seedAllCollections, getSeedStatus } from "./seeder";

export function createMarketplaceRouter(): Router {
  const router = Router();

  // Load ME symbols from DB on startup
  const existingCollections = getAllCollections();
  for (const c of existingCollections) {
    const symbol = getCollectionSymbol(c.collection_address);
    if (symbol) setSymbol(c.collection_address, symbol);
  }

  // POST /api/marketplace/collections - add collection
  // body: { address, name?, symbol } - symbol is the ME collection slug
  router.post("/collections", async (req: Request, res: Response) => {
    const { address, name, symbol } = req.body;
    if (!address || typeof address !== "string") {
      res.status(400).json({ error: "address is required" });
      return;
    }
    if (!symbol || typeof symbol !== "string") {
      res.status(400).json({ error: "symbol (Magic Eden slug) is required" });
      return;
    }

    const trimmed = address.trim();
    const meSymbol = symbol.trim();

    const status = getSyncStatus(trimmed);
    if (status.syncing) {
      res.json({ ok: true, message: "Already syncing", status });
      return;
    }

    upsertCollection(trimmed, name || meSymbol);
    updateCollectionSymbol(trimmed, meSymbol);
    setSymbol(trimmed, meSymbol);

    // Start sync in background
    initialSync(trimmed, meSymbol).catch((err) => {
      console.error(`[Marketplace] Sync error:`, err);
    });

    res.json({ ok: true, message: "Collection added, sync started", address: trimmed, symbol: meSymbol });
  });

  // GET /api/marketplace/collections
  router.get("/collections", (_req: Request, res: Response) => {
    const collections = getAllCollections();
    const result = collections.map((c) => {
      const syncStatus = getSyncStatus(c.collection_address);
      return {
        id: c.id,
        address: c.collection_address,
        name: c.name,
        floorPrice: c.floor_price,
        volume24h: c.volume_24h,
        listedCount: c.listed_count,
        lastUpdated: c.last_updated,
        syncing: syncStatus.syncing,
        syncProgress: syncStatus.progress,
      };
    });
    res.json({ collections: result });
  });

  // GET /api/marketplace/collections/:address
  router.get("/collections/:address", (req: Request, res: Response) => {
    const address = String(req.params.address);
    const collection = getCollection(address);
    if (!collection) {
      res.status(404).json({ error: "Collection not found" });
      return;
    }
    const syncStatus = getSyncStatus(address);
    res.json({ ...collection, syncing: syncStatus.syncing, syncProgress: syncStatus.progress });
  });

  // GET /api/marketplace/collections/:address/listings
  router.get("/collections/:address/listings", (req: Request, res: Response) => {
    const address = String(req.params.address);
    const sortRaw = String(req.query.sort || "price_asc");
    const sort = (["price_asc", "price_desc", "recent"].includes(sortRaw) ? sortRaw : "price_asc") as "price_asc" | "price_desc" | "recent";
    const page = Math.max(1, parseInt(String(req.query.page || "1")));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"))));
    const offset = (page - 1) * limit;

    const listings = getActiveListings(address, sort, limit, offset);
    const total = getActiveListingCount(address);
    const totalPages = Math.ceil(total / limit);

    res.json({
      listings: listings.map((l) => {
        let parsedAttributes: Array<{ trait_type: string; value: string }> | null = null;
        if (l.attributes) {
          try { parsedAttributes = JSON.parse(l.attributes); } catch { /* ignore */ }
        }
        return {
          id: l.id,
          nftMint: l.nft_mint,
          nftName: l.nft_name,
          nftImage: l.nft_image,
          seller: l.seller,
          priceSol: l.price_sol,
          marketplace: l.marketplace,
          listedAt: l.listed_at,
          attributes: parsedAttributes,
        };
      }),
      pagination: { page, limit, total, totalPages },
    });
  });

  // GET /api/marketplace/collections/:address/sales
  router.get("/collections/:address/sales", (req: Request, res: Response) => {
    const address = String(req.params.address);
    const page = Math.max(1, parseInt(String(req.query.page || "1")));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"))));
    const offset = (page - 1) * limit;

    const sales = getRecentSales(address, limit, offset);
    const total = getSaleCount(address);
    const totalPages = Math.ceil(total / limit);

    res.json({
      sales: sales.map((s) => ({
        id: s.id,
        nftMint: s.nft_mint,
        nftName: s.nft_name,
        nftImage: s.nft_image,
        buyer: s.buyer,
        seller: s.seller,
        priceSol: s.price_sol,
        marketplace: s.marketplace,
        soldAt: s.sold_at,
      })),
      pagination: { page, limit, total, totalPages },
    });
  });

  // GET /api/marketplace/collections/:address/stats
  router.get("/collections/:address/stats", (req: Request, res: Response) => {
    const address = String(req.params.address);
    const collection = getCollection(address);
    if (!collection) {
      res.status(404).json({ error: "Collection not found" });
      return;
    }

    // Cross-reference HODL data if available
    let avgHodlScore = 0;
    try {
      const hodlDb = require("../hodl/db");
      const hodlCollection = hodlDb.getCollection(address);
      if (hodlCollection) {
        avgHodlScore = hodlDb.getAvgScore(hodlCollection.id);
      }
    } catch { /* hodl module may not be available */ }

    res.json({
      stats: {
        floorPrice: getFloorPrice(address),
        volume24h: getVolume24h(address),
        volume7d: getVolume7d(address),
        volumeTotal: getVolumeTotal(address),
        listedCount: getListedCount(address),
        avgHodlScore,
      },
    });
  });

  // GET /api/marketplace/collections/:address/attributes
  router.get("/collections/:address/attributes", async (req: Request, res: Response) => {
    const address = String(req.params.address);
    const symbol = getSymbol(address) || getCollectionSymbol(address);
    if (!symbol) { res.status(400).json({ error: "No ME symbol mapped" }); return; }

    try {
      const { getCollectionAttributes } = await import("./magiceden");
      const attrs = await getCollectionAttributes(symbol);

      // Group by trait type
      const grouped: Record<string, Array<{ value: string; count: number; floor: number }>> = {};
      for (const a of attrs) {
        if (!grouped[a.traitType]) grouped[a.traitType] = [];
        grouped[a.traitType].push({ value: a.value, count: a.count, floor: a.floor });
      }

      res.json({ attributes: grouped });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch attributes" });
    }
  });

  // POST /api/marketplace/collections/:address/refresh - manual refresh
  router.post("/collections/:address/refresh", async (req: Request, res: Response) => {
    const address = String(req.params.address);
    const symbol = getSymbol(address);
    if (!symbol) {
      res.status(400).json({ error: "No ME symbol mapped for this collection" });
      return;
    }

    const { refreshListings } = await import("./sync");
    refreshListings(address).catch((err) => {
      console.error("[Marketplace] Refresh error:", err);
    });

    res.json({ ok: true, message: "Refresh started" });
  });

  // POST /api/marketplace/seed - start seeding all ME collections
  router.post("/seed", async (_req: Request, res: Response) => {
    const status = getSeedStatus();
    if (status.running) {
      res.json({ ok: true, message: "Already running", status });
      return;
    }
    seedAllCollections().catch((err) => console.error("[Seeder] Error:", err));
    res.json({ ok: true, message: "Seed started" });
  });

  // GET /api/marketplace/seed-status
  router.get("/seed-status", (_req: Request, res: Response) => {
    res.json(getSeedStatus());
  });

  // GET /api/marketplace/collections/:address/live-stats - fetch fresh stats on demand
  router.get("/collections/:addressOrSymbol/live-stats", async (req: Request, res: Response) => {
    const param = String(req.params.addressOrSymbol);
    // Find the ME symbol
    let symbol = getSymbol(param) || getCollectionSymbol(param);
    if (!symbol && param.startsWith("me:")) symbol = param.replace("me:", "");
    if (!symbol) {
      // Try DB lookup
      const row = db.prepare("SELECT me_symbol FROM marketplace_collections WHERE collection_address = ? OR me_symbol = ?").get(param, param) as { me_symbol: string } | undefined;
      symbol = row?.me_symbol || null;
    }
    if (!symbol) { res.status(400).json({ error: "Unknown collection" }); return; }

    try {
      const { getCollectionStats } = await import("./magiceden");
      const stats = await getCollectionStats(symbol);
      const floorPrice = (stats.floorPrice || 0) / 1e9;
      const volumeAll = (stats.volumeAll || 0) / 1e9;
      const listedCount = stats.listedCount || 0;

      // Save to DB for future
      db.prepare(
        "UPDATE marketplace_collections SET floor_price = ?, volume_total = ?, listed_count = ?, last_updated = ? WHERE me_symbol = ?"
      ).run(floorPrice, volumeAll, listedCount, new Date().toISOString(), symbol);

      res.json({ floorPrice, volumeTotal: volumeAll, listedCount, symbol });
    } catch {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // GET /api/marketplace/browse - paginated collection browser with search
  router.get("/browse", (req: Request, res: Response) => {
    const page = Math.max(1, parseInt(String(req.query.page || "1")));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "40"))));
    const offset = (page - 1) * limit;
    const sort = String(req.query.sort || "volume_total");
    const search = String(req.query.search || "").trim();

    if (search) {
      const results = searchCollections(search, limit);
      res.json({
        collections: results.map((c) => ({
          address: c.collection_address,
          name: c.name,
          image: c.image,
          symbol: c.me_symbol,
          floorPrice: c.floor_price,
          volumeTotal: c.volume_total,
          volume24h: c.volume_24h,
          listedCount: c.listed_count,
        })),
        pagination: { page: 1, limit, total: results.length, totalPages: 1 },
      });
      return;
    }

    const collections = getCollectionsPaginated(limit, offset, sort);
    const total = getCollectionsCount();
    const totalPages = Math.ceil(total / limit);

    res.json({
      collections: collections.map((c) => ({
        address: c.collection_address,
        name: c.name,
        image: c.image,
        symbol: c.me_symbol,
        floorPrice: c.floor_price,
        volumeTotal: c.volume_total,
        volume24h: c.volume_24h,
        listedCount: c.listed_count,
      })),
      pagination: { page, limit, total, totalPages },
    });
  });

  // POST /api/marketplace/global-webhook - Helius enhanced webhook receiver
  router.post("/global-webhook", (req: Request, res: Response) => {
    // Return 200 immediately
    res.json({ ok: true });

    // Process in background
    try {
      const events = Array.isArray(req.body) ? req.body : [req.body];

      for (const event of events) {
        if (!event || event.type !== "NFT_SALE") continue;

        const nftEvent = event.events?.nft || {};
        const amount = nftEvent.amount || 0;
        const priceSol = amount / 1e9;
        const buyer = nftEvent.buyer || "";
        const seller = nftEvent.seller || "";
        const sig = event.signature || "";
        const timestamp = event.timestamp ? new Date(event.timestamp * 1000).toISOString() : new Date().toISOString();
        const source = nftEvent.source || event.source || "unknown";

        // Get NFT mints from the event
        const nfts = nftEvent.nfts || [];
        for (const nft of nfts) {
          const mint = nft.mint || "";
          if (!mint) continue;

          // Find which collection this belongs to
          const collectionRow = db.prepare(
            "SELECT collection_address FROM marketplace_listings WHERE nft_mint = ? LIMIT 1"
          ).get(mint) as { collection_address: string } | undefined;

          // Also check by grouping in the event
          let collectionAddr = collectionRow?.collection_address || "";

          // If not found via listing, try to find via holders DB
          if (!collectionAddr) {
            try {
              const hodlDb = require("../hodl/db");
              const allCollections = hodlDb.getAllCollections();
              for (const c of allCollections) {
                const existing = hodlDb.getExistingMint(c.id, mint);
                if (existing) { collectionAddr = c.address; break; }
              }
            } catch {}
          }

          if (!collectionAddr) continue;

          // Insert sale
          try {
            const { insertSale, refreshCollectionStats } = require("./db");
            insertSale({
              collection_address: collectionAddr,
              nft_mint: mint,
              nft_name: nft.name || null,
              nft_image: null,
              buyer,
              seller,
              price_sol: priceSol,
              price_lamports: amount,
              marketplace: source,
              sold_at: timestamp,
              signature: sig + "-" + mint,
            });

            // Deactivate listing if exists
            const { deactivateListingByMint } = require("./db");
            deactivateListingByMint(mint);

            // Refresh stats
            refreshCollectionStats(collectionAddr);

            console.log("[Webhook] Sale: " + mint.slice(0,8) + " for " + priceSol.toFixed(2) + " SOL on " + source);
          } catch (err) {
            // Duplicate signature, ignore
          }
        }
      }
    } catch (err) {
      console.error("[Webhook] Error processing:", err);
    }
  });

  return router;
}
