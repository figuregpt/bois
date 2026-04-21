import { Router, Request, Response } from "express";
import {
  getAllCollections,
  getCollection,
  getAggregatedHolders,
  getAggregatedHolderCount,
  getActiveHolderCount,
  getAvgScore,
  getTopHolder,
  getWalletHoldings,
  getWalletAllHoldings,
  getWalletTotalScore,
  getNftsPaginated,
  getNftCount,
  getExistingMint,
} from "./db";
import { scanCollection, getScanStatus } from "./scanner";

export function createHodlRouter(): Router {
  const router = Router();

  // ═══ POST /api/hodl/collections — start scanning a collection ═══
  router.post("/collections", async (req: Request, res: Response) => {
    const { address } = req.body;
    if (!address || typeof address !== "string") {
      res.status(400).json({ error: "address is required" });
      return;
    }

    const trimmed = address.trim();

    // Check if already scanning
    const status = getScanStatus(trimmed);
    if (status.scanning) {
      res.json({ ok: true, message: "Already scanning", status });
      return;
    }

    // Start scan in background
    scanCollection(trimmed).catch((err) => {
      console.error(`[HODL] Background scan error for ${trimmed}:`, err);
    });

    res.json({ ok: true, message: "Scan started", address: trimmed });
  });

  // ═══ GET /api/hodl/collections — list all tracked collections ═══
  router.get("/collections", (_req: Request, res: Response) => {
    const collections = getAllCollections();

    const result = collections.map((c) => {
      const holderCount = getAggregatedHolderCount(c.id);
      const avgScore = getAvgScore(c.id);
      const scanStatus = getScanStatus(c.address);

      return {
        id: c.id,
        address: c.address,
        name: c.name,
        totalSupply: c.total_supply,
        holders: holderCount,
        avgScore,
        addedAt: c.added_at,
        scanning: scanStatus.scanning,
        scanProgress: scanStatus.progress,
      };
    });

    res.json({ collections: result });
  });

  // ═══ GET /api/hodl/collections/:address/holders — leaderboard ═══
  router.get("/collections/:address/holders", (req: Request, res: Response) => {
    const address = String(req.params.address);
    const page = Math.max(1, parseInt(String(req.query.page || "1")));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "50"))));
    const offset = (page - 1) * limit;

    const collection = getCollection(address);
    if (!collection) {
      res.status(404).json({ error: "Collection not found" });
      return;
    }

    const holders = getAggregatedHolders(collection.id, limit, offset);
    const totalHolders = getAggregatedHolderCount(collection.id);
    const totalPages = Math.ceil(totalHolders / limit);

    res.json({
      holders: holders.map((h, i) => ({
        rank: offset + i + 1,
        wallet: h.wallet,
        nftCount: h.nft_count,
        totalScore: h.total_score,
        longestHold: h.longest_hold,
        earliestAcquire: h.earliest_acquire,
      })),
      pagination: {
        page,
        limit,
        totalHolders,
        totalPages,
      },
    });
  });

  // ═══ GET /api/hodl/collections/:address/stats ═══
  router.get("/collections/:address/stats", (req: Request, res: Response) => {
    const address = String(req.params.address);
    const collection = getCollection(address);
    if (!collection) {
      res.status(404).json({ error: "Collection not found" });
      return;
    }

    const totalHolders = getAggregatedHolderCount(collection.id);
    const avgScore = getAvgScore(collection.id);
    const topHolder = getTopHolder(collection.id);
    const nftCount = getActiveHolderCount(collection.id);

    res.json({
      collection: {
        address: collection.address,
        name: collection.name,
        totalSupply: collection.total_supply,
      },
      stats: {
        uniqueHolders: totalHolders,
        totalNftsTracked: nftCount,
        avgScore,
        topHolder: topHolder
          ? {
              wallet: topHolder.wallet,
              totalScore: topHolder.total_score,
              nftCount: topHolder.nft_count,
            }
          : null,
      },
    });
  });

  // ═══ GET /api/hodl/collections/:address/wallet/:wallet — NFTs held by a specific wallet ═══
  router.get("/collections/:address/wallet/:wallet", async (req: Request, res: Response) => {
    const address = String(req.params.address);
    const wallet = String(req.params.wallet);
    const collection = getCollection(address);
    if (!collection) {
      res.status(404).json({ error: "Collection not found" });
      return;
    }

    const holdings = getWalletHoldings(collection.id, wallet);
    const totalScore = holdings.reduce((sum, h) => sum + h.score, 0);

    res.json({
      wallet,
      nftCount: holdings.length,
      totalScore,
      nfts: holdings.map((h) => ({
        mint: h.nft_mint,
        name: h.nft_name,
        image: h.nft_image || null,
        acquiredAt: h.acquired_at,
        score: h.score,
      })),
    });
  });

  // ═══ GET /api/hodl/wallet/:wallet — cross-collection wallet profile ═══
  router.get("/wallet/:wallet", (req: Request, res: Response) => {
    const wallet = String(req.params.wallet);
    const holdings = getWalletAllHoldings(wallet);
    const totals = getWalletTotalScore(wallet);

    // Group by collection
    const byCollection: Record<string, { address: string; name: string | null; nfts: typeof holdings; totalScore: number }> = {};
    for (const h of holdings) {
      if (!byCollection[h.collection_address]) {
        byCollection[h.collection_address] = { address: h.collection_address, name: h.collection_name, nfts: [], totalScore: 0 };
      }
      byCollection[h.collection_address].nfts.push(h);
      byCollection[h.collection_address].totalScore += h.score;
    }

    res.json({
      wallet,
      totalScore: totals.total_score || 0,
      totalNfts: totals.nft_count || 0,
      collectionCount: totals.collection_count || 0,
      collections: Object.values(byCollection).map((c) => ({
        address: c.address,
        name: c.name,
        nftCount: c.nfts.length,
        totalScore: c.totalScore,
        nfts: c.nfts.map((n) => ({
          mint: n.nft_mint,
          name: n.nft_name,
          image: n.nft_image || null,
          acquiredAt: n.acquired_at,
          score: n.score,
        })),
      })),
    });
  });

  // ═══ GET /api/hodl/collections/:address/nfts — individual NFTs with attributes from Helius ═══
  router.get("/collections/:address/nfts", async (req: Request, res: Response) => {
    const address = String(req.params.address);
    const page = Math.max(1, parseInt(String(req.query.page || "1")));
    const limit = Math.min(1000, Math.max(1, parseInt(String(req.query.limit || "40"))));

    const collection = getCollection(address);
    if (!collection) {
      res.status(404).json({ error: "Collection not found" });
      return;
    }

    // Use Helius searchAssets for paginated NFTs with attributes
    const HELIUS_RPC = "https://mainnet.helius-rpc.com/?api-key=c3d590ee-9ff6-4ee8-b72c-111a6bbdf9a9";
    try {
      const rpcRes = await fetch(HELIUS_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "nfts",
          method: "searchAssets",
          params: { grouping: ["collection", address], page, limit },
        }),
      });
      const rpcData = (await rpcRes.json()) as { result?: { total: number; items: Array<Record<string, unknown>> } };
      const items = rpcData.result?.items || [];
      const total = rpcData.result?.total || 0;
      const totalPages = Math.ceil(total / limit);

      // Cross-reference with HODL scores
      const nfts = items.map((item) => {
        const mint = (item.id as string) || "";
        const content = item.content as Record<string, unknown> || {};
        const metadata = (content.metadata as Record<string, unknown>) || {};
        const links = (content.links as Record<string, string>) || {};
        const ownership = (item.ownership as Record<string, unknown>) || {};
        const attrs = (metadata.attributes as Array<{ trait_type: string; value: string | number }>) || [];

        // Get HODL score from DB
        const holder = getExistingMint(collection.id, mint);
        let score = 0;
        if (holder) {
          const db = require("./db");
          const row = db.db.prepare("SELECT score FROM holders WHERE collection_id = ? AND nft_mint = ? AND active = 1").get(collection.id, mint) as { score: number } | undefined;
          score = row?.score || 0;
        }

        return {
          mint,
          name: (metadata.name as string) || "",
          image: links.image || "",
          wallet: (ownership.owner as string) || "",
          score,
          attributes: attrs.map((a) => ({ trait_type: a.trait_type, value: String(a.value) })),
        };
      });

      res.json({ nfts, pagination: { page, limit, total, totalPages } });
    } catch (err) {
      // Fallback to DB without attributes
      const offset = (page - 1) * limit;
      const nfts = getNftsPaginated(collection.id, limit, offset);
      const total = getNftCount(collection.id);
      res.json({
        nfts: nfts.map((n) => ({
          mint: n.nft_mint, name: n.nft_name, image: n.nft_image || null,
          wallet: n.wallet, score: n.score, attributes: [],
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }
  });

  // ═══ POST /api/hodl/collections/:address/backfill-images — fill missing images from DAS API ═══
  router.post("/collections/:address/backfill-images", async (req: Request, res: Response) => {
    const address = String(req.params.address);
    const collection = getCollection(address);
    if (!collection) { res.status(404).json({ error: "Collection not found" }); return; }

    // Fetch all assets (includes image URLs)
    const { getCollectionAssets } = await import("./helius");
    const { db } = await import("./db");
    const updateStmt = db.prepare("UPDATE holders SET nft_image = ? WHERE collection_id = ? AND nft_mint = ? AND (nft_image IS NULL OR nft_image = '')");

    res.json({ ok: true, message: "Backfill started" });

    // Run in background
    getCollectionAssets(address).then((assets) => {
      let updated = 0;
      for (const a of assets) {
        if (a.image) {
          const result = updateStmt.run(a.image, collection.id, a.mint);
          if (result.changes > 0) updated++;
        }
      }
      console.log(`[HODL] Image backfill complete: ${updated} images updated for ${address}`);
    }).catch((err) => {
      console.error(`[HODL] Image backfill error:`, err);
    });
  });

  // ═══ GET /api/hodl/scan-status/:address ═══
  router.get("/scan-status/:address", (req: Request, res: Response) => {
    const address = String(req.params.address);
    const status = getScanStatus(address);
    res.json(status);
  });

  return router;
}
