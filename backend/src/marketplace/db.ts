import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.resolve(__dirname, "../../data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "marketplace.db");
const db: BetterSqlite3.Database = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");

// ═══ SCHEMA ═══

db.exec(`
  CREATE TABLE IF NOT EXISTS marketplace_collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_address TEXT UNIQUE NOT NULL,
    name TEXT,
    floor_price REAL DEFAULT 0,
    volume_24h REAL DEFAULT 0,
    volume_7d REAL DEFAULT 0,
    volume_total REAL DEFAULT 0,
    listed_count INTEGER DEFAULT 0,
    owner_count INTEGER DEFAULT 0,
    webhook_id TEXT,
    me_symbol TEXT,
    last_updated TEXT,
    added_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS marketplace_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_address TEXT NOT NULL,
    nft_mint TEXT NOT NULL,
    nft_name TEXT,
    nft_image TEXT,
    seller TEXT NOT NULL,
    price_sol REAL NOT NULL,
    price_lamports INTEGER NOT NULL,
    marketplace TEXT,
    listed_at TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    signature TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS marketplace_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_address TEXT NOT NULL,
    nft_mint TEXT NOT NULL,
    nft_name TEXT,
    nft_image TEXT,
    buyer TEXT NOT NULL,
    seller TEXT NOT NULL,
    price_sol REAL NOT NULL,
    price_lamports INTEGER NOT NULL,
    marketplace TEXT,
    sold_at TEXT NOT NULL,
    signature TEXT UNIQUE NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_listings_collection ON marketplace_listings(collection_address);
  CREATE INDEX IF NOT EXISTS idx_listings_active ON marketplace_listings(active);
  CREATE INDEX IF NOT EXISTS idx_listings_mint ON marketplace_listings(nft_mint);
  CREATE INDEX IF NOT EXISTS idx_listings_signature ON marketplace_listings(signature);
  CREATE INDEX IF NOT EXISTS idx_sales_collection ON marketplace_sales(collection_address);
  CREATE INDEX IF NOT EXISTS idx_sales_mint ON marketplace_sales(nft_mint);
  CREATE INDEX IF NOT EXISTS idx_sales_signature ON marketplace_sales(signature);
`);

// Migrations
try { db.exec("ALTER TABLE marketplace_collections ADD COLUMN me_symbol TEXT"); } catch {}
try { db.exec("ALTER TABLE marketplace_collections ADD COLUMN image TEXT"); } catch {}
try { db.exec("ALTER TABLE marketplace_collections ADD COLUMN description TEXT"); } catch {}

// Migration: add attributes column to listings
try { db.exec("ALTER TABLE marketplace_listings ADD COLUMN attributes TEXT"); } catch { /* exists */ }

// ═══ PREPARED STATEMENTS ═══

const stmts = {
  // Collections
  upsertCollection: db.prepare(`
    INSERT INTO marketplace_collections (collection_address, name, added_at)
    VALUES (?, ?, ?)
    ON CONFLICT(collection_address) DO UPDATE SET
      name = COALESCE(excluded.name, marketplace_collections.name)
  `),

  getCollection: db.prepare(
    `SELECT * FROM marketplace_collections WHERE collection_address = ?`
  ),

  getAllCollections: db.prepare(
    `SELECT * FROM marketplace_collections ORDER BY added_at DESC`
  ),

  updateCollectionWebhook: db.prepare(
    `UPDATE marketplace_collections SET webhook_id = ? WHERE collection_address = ?`
  ),

  updateCollectionStats: db.prepare(`
    UPDATE marketplace_collections SET
      floor_price = ?,
      volume_24h = ?,
      volume_7d = ?,
      volume_total = ?,
      listed_count = ?,
      owner_count = ?,
      last_updated = ?
    WHERE collection_address = ?
  `),

  // Listings
  insertListing: db.prepare(`
    INSERT OR IGNORE INTO marketplace_listings
      (collection_address, nft_mint, nft_name, nft_image, seller, price_sol, price_lamports, marketplace, listed_at, active, signature)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `),

  deactivateListingByMint: db.prepare(
    `UPDATE marketplace_listings SET active = 0 WHERE nft_mint = ? AND active = 1`
  ),

  deactivateListingBySignature: db.prepare(
    `UPDATE marketplace_listings SET active = 0 WHERE signature = ?`
  ),

  getActiveListingsPriceAsc: db.prepare(`
    SELECT * FROM marketplace_listings
    WHERE collection_address = ? AND active = 1
    ORDER BY price_sol ASC
    LIMIT ? OFFSET ?
  `),

  getActiveListingsPriceDesc: db.prepare(`
    SELECT * FROM marketplace_listings
    WHERE collection_address = ? AND active = 1
    ORDER BY price_sol DESC
    LIMIT ? OFFSET ?
  `),

  getActiveListingsRecent: db.prepare(`
    SELECT * FROM marketplace_listings
    WHERE collection_address = ? AND active = 1
    ORDER BY listed_at DESC
    LIMIT ? OFFSET ?
  `),

  getActiveListingCount: db.prepare(
    `SELECT COUNT(*) as count FROM marketplace_listings WHERE collection_address = ? AND active = 1`
  ),

  // Sales
  insertSale: db.prepare(`
    INSERT OR IGNORE INTO marketplace_sales
      (collection_address, nft_mint, nft_name, nft_image, buyer, seller, price_sol, price_lamports, marketplace, sold_at, signature)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

  getRecentSales: db.prepare(`
    SELECT * FROM marketplace_sales
    WHERE collection_address = ?
    ORDER BY sold_at DESC
    LIMIT ? OFFSET ?
  `),

  getSaleCount: db.prepare(
    `SELECT COUNT(*) as count FROM marketplace_sales WHERE collection_address = ?`
  ),

  // Stats queries
  getFloorPrice: db.prepare(`
    SELECT MIN(price_sol) as floor FROM marketplace_listings
    WHERE collection_address = ? AND active = 1
  `),

  getVolume24h: db.prepare(`
    SELECT COALESCE(SUM(price_sol), 0) as volume FROM marketplace_sales
    WHERE collection_address = ? AND sold_at >= datetime('now', '-1 day')
  `),

  getVolume7d: db.prepare(`
    SELECT COALESCE(SUM(price_sol), 0) as volume FROM marketplace_sales
    WHERE collection_address = ? AND sold_at >= datetime('now', '-7 days')
  `),

  getVolumeTotal: db.prepare(`
    SELECT COALESCE(SUM(price_sol), 0) as volume FROM marketplace_sales
    WHERE collection_address = ?
  `),

  getListedCount: db.prepare(
    `SELECT COUNT(*) as count FROM marketplace_listings WHERE collection_address = ? AND active = 1`
  ),

  getUniqueOwners: db.prepare(`
    SELECT COUNT(DISTINCT seller) as count FROM marketplace_listings
    WHERE collection_address = ? AND active = 1
  `),

  // Metadata update
  updateListingMetadata: db.prepare(
    `UPDATE marketplace_listings SET nft_name = ?, nft_image = ? WHERE nft_mint = ? AND (nft_name IS NULL OR nft_name = '')`
  ),

  updateSaleMetadata: db.prepare(
    `UPDATE marketplace_sales SET nft_name = ?, nft_image = ? WHERE nft_mint = ? AND (nft_name IS NULL OR nft_name = '')`
  ),

  updateListingAttributes: db.prepare(
    `UPDATE marketplace_listings SET attributes = ? WHERE nft_mint = ? AND collection_address = ?`
  ),

  getListingsWithoutAttributes: db.prepare(
    `SELECT nft_mint FROM marketplace_listings WHERE collection_address = ? AND active = 1 AND (attributes IS NULL OR attributes = '')`
  ),
};

// ═══ PUBLIC API ═══

export interface MarketplaceCollectionRow {
  id: number;
  collection_address: string;
  name: string | null;
  image: string | null;
  description: string | null;
  me_symbol: string | null;
  floor_price: number;
  volume_24h: number;
  volume_7d: number;
  volume_total: number;
  listed_count: number;
  owner_count: number;
  webhook_id: string | null;
  last_updated: string | null;
  added_at: string;
}

export interface ListingRow {
  id: number;
  collection_address: string;
  nft_mint: string;
  nft_name: string | null;
  nft_image: string | null;
  seller: string;
  price_sol: number;
  price_lamports: number;
  marketplace: string | null;
  listed_at: string;
  active: number;
  signature: string;
  attributes: string | null;
}

export interface SaleRow {
  id: number;
  collection_address: string;
  nft_mint: string;
  nft_name: string | null;
  nft_image: string | null;
  buyer: string;
  seller: string;
  price_sol: number;
  price_lamports: number;
  marketplace: string | null;
  sold_at: string;
  signature: string;
}

export function upsertCollection(address: string, name?: string): MarketplaceCollectionRow {
  stmts.upsertCollection.run(address, name || null, new Date().toISOString());
  return stmts.getCollection.get(address) as MarketplaceCollectionRow;
}

export function getCollection(address: string): MarketplaceCollectionRow | undefined {
  return stmts.getCollection.get(address) as MarketplaceCollectionRow | undefined;
}

export function getAllCollections(): MarketplaceCollectionRow[] {
  return stmts.getAllCollections.all() as MarketplaceCollectionRow[];
}

export function updateCollectionSymbol(address: string, symbol: string) {
  db.prepare("UPDATE marketplace_collections SET me_symbol = ? WHERE collection_address = ?").run(symbol, address);
}

export function getCollectionSymbol(address: string): string | null {
  const row = db.prepare("SELECT me_symbol FROM marketplace_collections WHERE collection_address = ?").get(address) as { me_symbol: string | null } | undefined;
  return row?.me_symbol || null;
}

export function getCollectionBySymbol(symbol: string): MarketplaceCollectionRow | undefined {
  return db.prepare("SELECT * FROM marketplace_collections WHERE me_symbol = ?").get(symbol) as MarketplaceCollectionRow | undefined;
}

export function updateCollectionStats(symbol: string, floor: number, volume: number, listed: number) {
  db.prepare("UPDATE marketplace_collections SET floor_price = ?, volume_total = ?, listed_count = ?, last_updated = ? WHERE me_symbol = ?")
    .run(floor, volume, listed, new Date().toISOString(), symbol);
}

export function getCollectionsPaginated(limit: number, offset: number, sort: string = "volume_total"): MarketplaceCollectionRow[] {
  const validSorts: Record<string, string> = {
    volume_total: "volume_total DESC",
    volume_24h: "volume_24h DESC",
    floor_price: "floor_price DESC",
    listed_count: "listed_count DESC",
    name: "name ASC",
    recent: "added_at DESC",
  };
  const orderBy = validSorts[sort] || "volume_total DESC";
  return db.prepare(`SELECT * FROM marketplace_collections ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(limit, offset) as MarketplaceCollectionRow[];
}

export function getCollectionsCount(): number {
  const row = db.prepare("SELECT COUNT(*) as count FROM marketplace_collections").get() as { count: number };
  return row.count;
}

export function searchCollections(query: string, limit: number): MarketplaceCollectionRow[] {
  return db.prepare("SELECT * FROM marketplace_collections WHERE name LIKE ? ORDER BY volume_total DESC LIMIT ?")
    .all(`%${query}%`, limit) as MarketplaceCollectionRow[];
}

export function updateCollectionWebhook(address: string, webhookId: string) {
  stmts.updateCollectionWebhook.run(webhookId, address);
}

export function insertListing(params: {
  collection_address: string;
  nft_mint: string;
  nft_name: string | null;
  nft_image: string | null;
  seller: string;
  price_sol: number;
  price_lamports: number;
  marketplace: string | null;
  listed_at: string;
  signature: string;
}) {
  stmts.insertListing.run(
    params.collection_address,
    params.nft_mint,
    params.nft_name,
    params.nft_image,
    params.seller,
    params.price_sol,
    params.price_lamports,
    params.marketplace,
    params.listed_at,
    params.signature
  );
}

export function insertSale(params: {
  collection_address: string;
  nft_mint: string;
  nft_name: string | null;
  nft_image: string | null;
  buyer: string;
  seller: string;
  price_sol: number;
  price_lamports: number;
  marketplace: string | null;
  sold_at: string;
  signature: string;
}) {
  stmts.insertSale.run(
    params.collection_address,
    params.nft_mint,
    params.nft_name,
    params.nft_image,
    params.buyer,
    params.seller,
    params.price_sol,
    params.price_lamports,
    params.marketplace,
    params.sold_at,
    params.signature
  );
}

export function clearListings(collectionAddress: string) {
  db.prepare("DELETE FROM marketplace_listings WHERE collection_address = ?").run(collectionAddress);
}

export function deactivateListingByMint(nftMint: string) {
  stmts.deactivateListingByMint.run(nftMint);
}

export function deactivateListingBySignature(signature: string) {
  stmts.deactivateListingBySignature.run(signature);
}

export function getActiveListings(
  collectionAddress: string,
  sort: "price_asc" | "price_desc" | "recent",
  limit: number,
  offset: number
): ListingRow[] {
  switch (sort) {
    case "price_asc":
      return stmts.getActiveListingsPriceAsc.all(collectionAddress, limit, offset) as ListingRow[];
    case "price_desc":
      return stmts.getActiveListingsPriceDesc.all(collectionAddress, limit, offset) as ListingRow[];
    case "recent":
    default:
      return stmts.getActiveListingsRecent.all(collectionAddress, limit, offset) as ListingRow[];
  }
}

export function getActiveListingCount(collectionAddress: string): number {
  const row = stmts.getActiveListingCount.get(collectionAddress) as { count: number };
  return row.count;
}

export function getRecentSales(collectionAddress: string, limit: number, offset: number): SaleRow[] {
  return stmts.getRecentSales.all(collectionAddress, limit, offset) as SaleRow[];
}

export function getSaleCount(collectionAddress: string): number {
  const row = stmts.getSaleCount.get(collectionAddress) as { count: number };
  return row.count;
}

export function getFloorPrice(collectionAddress: string): number {
  const row = stmts.getFloorPrice.get(collectionAddress) as { floor: number | null };
  return row.floor || 0;
}

export function getVolume24h(collectionAddress: string): number {
  const row = stmts.getVolume24h.get(collectionAddress) as { volume: number };
  return Math.round(row.volume * 100) / 100;
}

export function getVolume7d(collectionAddress: string): number {
  const row = stmts.getVolume7d.get(collectionAddress) as { volume: number };
  return Math.round(row.volume * 100) / 100;
}

export function getVolumeTotal(collectionAddress: string): number {
  const row = stmts.getVolumeTotal.get(collectionAddress) as { volume: number };
  return Math.round(row.volume * 100) / 100;
}

export function getListedCount(collectionAddress: string): number {
  const row = stmts.getListedCount.get(collectionAddress) as { count: number };
  return row.count;
}

export function refreshCollectionStats(collectionAddress: string) {
  const floor = getFloorPrice(collectionAddress);
  const vol24h = getVolume24h(collectionAddress);
  const vol7d = getVolume7d(collectionAddress);
  const volTotal = getVolumeTotal(collectionAddress);
  const listed = getListedCount(collectionAddress);
  const owners = (stmts.getUniqueOwners.get(collectionAddress) as { count: number }).count;

  stmts.updateCollectionStats.run(
    floor,
    vol24h,
    vol7d,
    volTotal,
    listed,
    owners,
    new Date().toISOString(),
    collectionAddress
  );
}

export function updateNftMetadata(nftMint: string, name: string, image: string) {
  stmts.updateListingMetadata.run(name, image, nftMint);
  stmts.updateSaleMetadata.run(name, image, nftMint);
}

export function updateListingAttributes(nftMint: string, collectionAddress: string, attributes: string) {
  stmts.updateListingAttributes.run(attributes, nftMint, collectionAddress);
}

export function getListingsWithoutAttributes(collectionAddress: string): Array<{ nft_mint: string }> {
  return stmts.getListingsWithoutAttributes.all(collectionAddress) as Array<{ nft_mint: string }>;
}

export { db };
