function shanghaiDate() {
  const d = new Date();
  d.setHours(d.getHours() + 8);
  return d.toISOString().slice(0, 10);
}

interface MarketIndex {
  symbol: string;
  name: string;
  market: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  updatedAt: string;
}

interface YahooChartPayload {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        currency?: string;
        regularMarketTime?: number;
      };
    } | null> | null;
  };
}

const INDICES: Array<{ symbol: string; name: string; market: string }> = [
  { symbol: "^GSPC", name: "标普500", market: "美国" },
  { symbol: "^IXIC", name: "纳斯达克综合", market: "美国" },
  { symbol: "^DJI", name: "道琼斯", market: "美国" },
  { symbol: "000001.SS", name: "上证指数", market: "中国A股" },
  { symbol: "399001.SZ", name: "深证成指", market: "中国A股" },
  { symbol: "399006.SZ", name: "创业板指", market: "中国A股" },
  { symbol: "000688.SS", name: "科创50", market: "中国A股" },
  { symbol: "000300.SS", name: "沪深300", market: "中国A股" },
  { symbol: "^HSI", name: "恒生指数", market: "港股" },
  { symbol: "^N225", name: "日经225", market: "日本" },
  { symbol: "^TWII", name: "台湾加权", market: "台湾" },
  { symbol: "^KS11", name: "KOSPI", market: "韩国" },
];

const QUOTE_CACHE_TTL_MS = 45_000;
let quoteCache: {
  expiresAt: number;
  payload: { indices: MarketIndex[]; updatedAt: string; generatedAt: string };
} | null = null;

async function fetchYahooQuote(symbol: string): Promise<null | {
  price: number; change: number; changePercent: number; currency: string; updatedAt: string;
}> {
  try {
    const encoded = encodeURIComponent(symbol);
    const response = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/" + encoded + "?interval=1d&range=1d",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as YahooChartPayload;
    const result = payload?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose ?? price;
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
    const currency = meta.currency ?? "USD";
    const updatedAt = meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString();
    return { price, change, changePercent, currency, updatedAt };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get("refresh") === "1";
  if (!force && quoteCache && quoteCache.expiresAt > Date.now())
    return Response.json(quoteCache.payload, {
      headers: { "Cache-Control": "private, max-age=45, stale-while-revalidate=60" },
    });
  const results = await Promise.all(
    INDICES.map(async (index) => {
      const quote = await fetchYahooQuote(index.symbol);
      if (!quote) return null;
      return { ...index, ...quote } as MarketIndex;
    }),
  );
  const indices = results.filter((r): r is MarketIndex => r !== null);
  const payload = {
    indices,
    updatedAt: new Date().toISOString(),
    generatedAt: shanghaiDate(),
  };
  quoteCache = { expiresAt: Date.now() + QUOTE_CACHE_TTL_MS, payload };
  return Response.json(payload, {
    headers: { "Cache-Control": "private, max-age=45, stale-while-revalidate=60" },
  });
}
