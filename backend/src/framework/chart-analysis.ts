import { registerToolHandler } from "./llm";

// ═══ TOKEN INFO (DexScreener only) ═══

export function registerChartAnalysisTools(): void {
  registerToolHandler("get_token_info", async (_agentId, args) => {
    const address = String(args.contract_address || "");
    if (!address) return JSON.stringify({ error: "No address" });

    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
      const data = await res.json() as { pairs?: Array<Record<string, unknown>> };
      const pair = data.pairs?.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
        ((b.liquidity as Record<string, number>)?.usd || 0) - ((a.liquidity as Record<string, number>)?.usd || 0)
      )?.[0];

      if (!pair) return JSON.stringify({ error: "Token not found on any DEX" });

      const baseToken = pair.baseToken as Record<string, string>;
      const priceChange = pair.priceChange as Record<string, number> | undefined;
      const volume = pair.volume as Record<string, number> | undefined;
      const liquidity = pair.liquidity as Record<string, number> | undefined;
      const price = parseFloat(String(pair.priceUsd || "0"));
      const mcap = (pair.marketCap as number) || 0;

      return JSON.stringify({
        instruction: "Tell the user about this token and ask if they want to buy some.",
        symbol: baseToken?.symbol || "???",
        name: baseToken?.name || "Unknown",
        price: price < 0.01 ? `$${price.toFixed(8)}` : price < 1 ? `$${price.toFixed(4)}` : `$${price.toFixed(2)}`,
        mcap: mcap > 1e6 ? `$${(mcap / 1e6).toFixed(1)}M` : mcap > 1e3 ? `$${(mcap / 1e3).toFixed(0)}K` : `$${mcap.toFixed(0)}`,
        volume24h: volume?.h24 ? `$${(volume.h24 > 1e6 ? (volume.h24 / 1e6).toFixed(1) + "M" : volume.h24 > 1e3 ? (volume.h24 / 1e3).toFixed(0) + "K" : volume.h24.toFixed(0))}` : "N/A",
        change1h: priceChange?.h1 ? `${priceChange.h1 > 0 ? "+" : ""}${priceChange.h1.toFixed(1)}%` : "N/A",
        change24h: priceChange?.h24 ? `${priceChange.h24 > 0 ? "+" : ""}${priceChange.h24.toFixed(1)}%` : "N/A",
        liquidity: liquidity?.usd ? `$${(liquidity.usd / 1e3).toFixed(0)}K` : "N/A",
        dexUrl: pair.url || "",
        address,
        tokenCard: true,
      });
    } catch {
      return JSON.stringify({ error: "Failed to fetch token info" });
    }
  });
}

export function registerChartRoutes(_router: import("express").Router): void {
  // No chart routes needed anymore
}
