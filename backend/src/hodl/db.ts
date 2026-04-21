import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.resolve(__dirname, "../../data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "hodl.db");
const db: BetterSqlite3.Database = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");

// ═══ SCHEMA ═══

db.exec(`
  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT UNIQUE NOT NULL,
    name TEXT,
    total_supply INTEGER DEFAULT 0,
    added_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS holders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL,
    wallet TEXT NOT NULL,
    nft_mint TEXT NOT NULL,
    nft_name TEXT,
    nft_image TEXT,
    acquired_at TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    last_snapshot TEXT,
    FOREIGN KEY (collection_id) REFERENCES collections(id)
  );

  CREATE INDEX IF NOT EXISTS idx_holders_collection_wallet ON holders(collection_id, wallet);
  CREATE INDEX IF NOT EXISTS idx_holders_collection_active ON holders(collection_id, active);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_holders_mint ON holders(collection_id, nft_mint);
`);

// Migration: add nft_image column if missing
try { db.exec("ALTER TABLE holders ADD COLUMN nft_image TEXT"); } catch { /* already exists */ }

// ═══ PREPARED STATEMENTS ═══

const stmts = {
  insertCollection: db.prepare(
    `INSERT OR IGNORE INTO collections (address, name, total_supply, added_at) VALUES (?, ?, ?, ?)`
  ),
  getCollection: db.prepare(`SELECT * FROM collections WHERE address = ?`),
  getAllCollections: db.prepare(`SELECT * FROM collections ORDER BY added_at DESC`),
  updateCollectionSupply: db.prepare(
    `UPDATE collections SET total_supply = ?, name = COALESCE(?, name) WHERE id = ?`
  ),

  upsertHolder: db.prepare(`
    INSERT INTO holders (collection_id, wallet, nft_mint, nft_name, nft_image, acquired_at, score, active, last_snapshot)
    VALUES (@collection_id, @wallet, @nft_mint, @nft_name, @nft_image, @acquired_at, @score, 1, @last_snapshot)
    ON CONFLICT(collection_id, nft_mint) DO UPDATE SET
      wallet = @wallet,
      nft_name = @nft_name,
      nft_image = COALESCE(@nft_image, nft_image),
      acquired_at = @acquired_at,
      score = @score,
      active = 1,
      last_snapshot = @last_snapshot
  `),

  deactivateMissing: db.prepare(
    `UPDATE holders SET active = 0 WHERE collection_id = ? AND last_snapshot != ?`
  ),

  getHoldersByCollection: db.prepare(`
    SELECT wallet, nft_mint, nft_name, acquired_at, score, active
    FROM holders
    WHERE collection_id = ? AND active = 1
    ORDER BY score DESC
  `),

  getHoldersPaginated: db.prepare(`
    SELECT wallet, nft_mint, nft_name, acquired_at, score, active
    FROM holders
    WHERE collection_id = ? AND active = 1
    ORDER BY score DESC
    LIMIT ? OFFSET ?
  `),

  getActiveHolderCount: db.prepare(
    `SELECT COUNT(*) as count FROM holders WHERE collection_id = ? AND active = 1`
  ),

  getAvgScore: db.prepare(
    `SELECT AVG(score) as avg FROM holders WHERE collection_id = ? AND active = 1`
  ),

  getTopHolder: db.prepare(`
    SELECT wallet, SUM(score) as total_score, COUNT(*) as nft_count
    FROM holders
    WHERE collection_id = ? AND active = 1
    GROUP BY wallet
    ORDER BY total_score DESC
    LIMIT 1
  `),

  getAggregatedHolders: db.prepare(`
    SELECT wallet, SUM(score) as total_score, COUNT(*) as nft_count,
           MIN(acquired_at) as earliest_acquire, MAX(score) as longest_hold
    FROM holders
    WHERE collection_id = ? AND active = 1
    GROUP BY wallet
    ORDER BY total_score DESC
    LIMIT ? OFFSET ?
  `),

  getAggregatedHolderCount: db.prepare(`
    SELECT COUNT(DISTINCT wallet) as count
    FROM holders
    WHERE collection_id = ? AND active = 1
  `),

  getExistingMint: db.prepare(
    `SELECT nft_mint, wallet FROM holders WHERE collection_id = ? AND nft_mint = ? AND active = 1`
  ),

  getWalletHoldings: db.prepare(`
    SELECT nft_mint, nft_name, nft_image, acquired_at, score, active
    FROM holders
    WHERE collection_id = ? AND wallet = ? AND active = 1
    ORDER BY score DESC
  `),

  getWalletAllHoldings: db.prepare(`
    SELECT h.nft_mint, h.nft_name, h.nft_image, h.acquired_at, h.score, h.active,
           c.address as collection_address, c.name as collection_name
    FROM holders h
    JOIN collections c ON c.id = h.collection_id
    WHERE h.wallet = ? AND h.active = 1
    ORDER BY h.score DESC
  `),

  getWalletTotalScore: db.prepare(`
    SELECT SUM(score) as total_score, COUNT(*) as nft_count, COUNT(DISTINCT collection_id) as collection_count
    FROM holders
    WHERE wallet = ? AND active = 1
  `),

  getNftsPaginated: db.prepare(`
    SELECT nft_mint, nft_name, nft_image, wallet, acquired_at, score
    FROM holders
    WHERE collection_id = ? AND active = 1
    ORDER BY score DESC
    LIMIT ? OFFSET ?
  `),

  getNftCount: db.prepare(
    `SELECT COUNT(*) as count FROM holders WHERE collection_id = ? AND active = 1`
  ),
};

// ═══ PUBLIC API ═══

export interface CollectionRow {
  id: number;
  address: string;
  name: string | null;
  total_supply: number;
  added_at: string;
}

export interface HolderRow {
  wallet: string;
  nft_mint: string;
  nft_name: string | null;
  nft_image: string | null;
  acquired_at: string;
  score: number;
  active: number;
}

export interface AggregatedHolder {
  wallet: string;
  total_score: number;
  nft_count: number;
  earliest_acquire: string;
  longest_hold: number;
}

export function upsertCollection(address: string, name?: string, totalSupply?: number): CollectionRow {
  stmts.insertCollection.run(address, name || null, totalSupply || 0, new Date().toISOString());
  const row = stmts.getCollection.get(address) as CollectionRow;
  if (totalSupply !== undefined) {
    stmts.updateCollectionSupply.run(totalSupply, name || null, row.id);
  }
  return stmts.getCollection.get(address) as CollectionRow;
}

export function getCollection(address: string): CollectionRow | undefined {
  return stmts.getCollection.get(address) as CollectionRow | undefined;
}

export function getAllCollections(): CollectionRow[] {
  return stmts.getAllCollections.all() as CollectionRow[];
}

export function upsertHolder(params: {
  collection_id: number;
  wallet: string;
  nft_mint: string;
  nft_name: string | null;
  nft_image: string | null;
  acquired_at: string;
  score: number;
  last_snapshot: string;
}) {
  stmts.upsertHolder.run(params);
}

export function deactivateMissing(collectionId: number, snapshotId: string) {
  stmts.deactivateMissing.run(collectionId, snapshotId);
}

export function getHoldersPaginated(collectionId: number, limit: number, offset: number): HolderRow[] {
  return stmts.getHoldersPaginated.all(collectionId, limit, offset) as HolderRow[];
}

export function getAggregatedHolders(collectionId: number, limit: number, offset: number): AggregatedHolder[] {
  return stmts.getAggregatedHolders.all(collectionId, limit, offset) as AggregatedHolder[];
}

export function getAggregatedHolderCount(collectionId: number): number {
  const row = stmts.getAggregatedHolderCount.get(collectionId) as { count: number };
  return row.count;
}

export function getActiveHolderCount(collectionId: number): number {
  const row = stmts.getActiveHolderCount.get(collectionId) as { count: number };
  return row.count;
}

export function getAvgScore(collectionId: number): number {
  const row = stmts.getAvgScore.get(collectionId) as { avg: number | null };
  return Math.round(row.avg || 0);
}

export function getTopHolder(collectionId: number): { wallet: string; total_score: number; nft_count: number } | null {
  const row = stmts.getTopHolder.get(collectionId) as { wallet: string; total_score: number; nft_count: number } | undefined;
  return row || null;
}

export function getWalletHoldings(collectionId: number, wallet: string): HolderRow[] {
  return stmts.getWalletHoldings.all(collectionId, wallet) as HolderRow[];
}

export interface WalletHoldingRow extends HolderRow {
  collection_address: string;
  collection_name: string | null;
}

export function getWalletAllHoldings(wallet: string): WalletHoldingRow[] {
  return stmts.getWalletAllHoldings.all(wallet) as WalletHoldingRow[];
}

export function getWalletTotalScore(wallet: string): { total_score: number; nft_count: number; collection_count: number } {
  return stmts.getWalletTotalScore.get(wallet) as { total_score: number; nft_count: number; collection_count: number };
}

export function getExistingMint(collectionId: number, mint: string): { nft_mint: string; wallet: string } | undefined {
  return stmts.getExistingMint.get(collectionId, mint) as { nft_mint: string; wallet: string } | undefined;
}

export function getNftsPaginated(collectionId: number, limit: number, offset: number): HolderRow[] {
  return stmts.getNftsPaginated.all(collectionId, limit, offset) as HolderRow[];
}

export function getNftCount(collectionId: number): number {
  const row = stmts.getNftCount.get(collectionId) as { count: number };
  return row.count;
}

export { db };
