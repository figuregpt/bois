const ME_API = "https://api-mainnet.magiceden.dev/v2";
const DELAY_MS = 600; // ~1.5 req/s to be safe with ME rate limits

async function meGet(path: string): Promise<unknown> {
  await new Promise((r) => setTimeout(r, DELAY_MS));
  const res = await fetch(`${ME_API}${path}`);
  if (!res.ok) throw new Error(`ME API ${res.status}: ${path}`);
  return res.json();
}

export interface MEStats {
  symbol: string;
  floorPrice: number; // lamports
  listedCount: number;
  avgPrice24hr: number;
  volumeAll: number;
}

export interface MEListing {
  tokenMint: string;
  seller: string;
  price: number; // SOL
  image: string;
  name: string;
  rarity: number;
}

export interface MEActivity {
  type: string; // "buyNow" | "list" | "delist" | "cancelBid" etc
  tokenMint: string;
  buyer: string;
  seller: string;
  price: number;
  source: string;
  blockTime: number;
  signature: string;
  image: string;
  name: string;
}

export async function getCollectionStats(symbol: string): Promise<MEStats> {
  const data = await meGet(`/collections/${symbol}/stats`) as Record<string, unknown>;
  return {
    symbol: data.symbol as string || symbol,
    floorPrice: (data.floorPrice as number) || 0,
    listedCount: (data.listedCount as number) || 0,
    avgPrice24hr: (data.avgPrice24hr as number) || 0,
    volumeAll: (data.volumeAll as number) || 0,
  };
}

export async function getCollectionListings(symbol: string, limit = 20, offset = 0): Promise<MEListing[]> {
  const data = await meGet(`/collections/${symbol}/listings?offset=${offset}&limit=${limit}`) as Array<Record<string, unknown>>;
  return data.map((l) => {
    // Use rawAmount from priceInfo for precision, fallback to price field
    const priceInfo = l.priceInfo as Record<string, unknown> | undefined;
    const solPrice = priceInfo?.solPrice as Record<string, unknown> | undefined;
    const rawAmount = solPrice?.rawAmount as string | undefined;
    const listPrice = rawAmount ? parseInt(rawAmount) / 1e9 : ((l.price as number) || 0);

    return {
      tokenMint: (l.tokenMint as string) || "",
      seller: (l.seller as string) || "",
      price: listPrice,
      image: ((l.extra as Record<string, string>)?.img) || "",
      name: ((l.token as Record<string, string>)?.name) || "",
      rarity: ((l.rarity as Record<string, Record<string, number>>)?.moonrank?.rank) || 0,
    };
  });
}

export async function getCollectionActivities(symbol: string, limit = 20, offset = 0): Promise<MEActivity[]> {
  const data = await meGet(`/collections/${symbol}/activities?offset=${offset}&limit=${limit}`) as Array<Record<string, unknown>>;
  return data.map((a) => ({
    type: (a.type as string) || "",
    tokenMint: (a.tokenMint as string) || "",
    buyer: (a.buyer as string) || "",
    seller: (a.seller as string) || "",
    price: (a.price as number) || 0,
    source: (a.source as string) || "",
    blockTime: (a.blockTime as number) || 0,
    signature: (a.signature as string) || "",
    image: (a.image as string) || "",
    name: "",
  }));
}

export interface MEAttribute {
  traitType: string;
  value: string;
  count: number;
  floor: number; // lamports
}

export async function getCollectionAttributes(symbol: string): Promise<MEAttribute[]> {
  const data = await meGet(`/collections/${symbol}/attributes`) as { results?: { availableAttributes?: Array<Record<string, unknown>> } };
  const attrs = data?.results?.availableAttributes || [];
  return attrs.map((a) => {
    const attr = a.attribute as Record<string, string> || {};
    return {
      traitType: attr.trait_type || "",
      value: attr.value || "",
      count: (a.count as number) || 0,
      floor: (a.floor as number) || 0,
    };
  });
}

/**
 * Fetch all listings for a collection (paginated, up to maxListings).
 */
export async function getAllListings(symbol: string, maxListings = 500): Promise<MEListing[]> {
  const all: MEListing[] = [];
  let offset = 0;
  const pageSize = 20;

  while (offset < maxListings) {
    const batch = await getCollectionListings(symbol, pageSize, offset);
    all.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}
