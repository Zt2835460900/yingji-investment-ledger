export type TrackedIndexKey =
  | "NASDAQ_100"
  | "SP_500"
  | "CSI_300"
  | "CSI_500"
  | "SSE_50"
  | "CHINEXT"
  | "STAR_50";

export interface TrackedIndexDefinition {
  key: TrackedIndexKey;
  label: string;
  symbol: string;
  secid: string;
  pattern: RegExp;
}

export interface IndexQuote {
  key: TrackedIndexKey;
  label: string;
  symbol: string;
  price: number;
  previousClose: number;
  changePercent: number;
  quoteTime: string;
  sourceName: string;
  sourceUrl: string;
}

export interface IndexMoveEstimate {
  estimatedRate: number;
  estimatedProfit: number;
  coveredWeightPercent: number;
  matchedIndices: number;
}

export interface IndexHistoryPoint {
  date: string;
  changePercent: number;
}

export interface FundIndexCalibration {
  calibrated: boolean;
  beta: number;
  alphaPercent: number;
  sampleSize: number;
  rSquared: number;
  alignment: "SAME_DATE" | "PREVIOUS_SESSION";
}

const EASTMONEY_QUOTE_ORIGIN = "https://push2.eastmoney.com";
const EASTMONEY_DELAY_QUOTE_ORIGIN = "https://push2delay.eastmoney.com";
const EASTMONEY_HISTORY_ORIGIN = "https://33.push2his.eastmoney.com";

export const TRACKED_INDICES: TrackedIndexDefinition[] = [
  {
    key: "NASDAQ_100",
    label: "纳斯达克100指数",
    symbol: "NDX",
    secid: "100.NDX",
    pattern: /(?:纳斯达克|纳指|NASDAQ)\s*100/i,
  },
  {
    key: "SP_500",
    label: "标普500指数",
    symbol: "SPX",
    secid: "100.SPX",
    pattern: /(?:标普|S&P|SP)\s*500/i,
  },
  {
    key: "CSI_300",
    label: "沪深300指数",
    symbol: "000300",
    secid: "1.000300",
    pattern: /沪深\s*300/i,
  },
  {
    key: "CSI_500",
    label: "中证500指数",
    symbol: "000905",
    secid: "1.000905",
    pattern: /中证\s*500/i,
  },
  {
    key: "SSE_50",
    label: "上证50指数",
    symbol: "000016",
    secid: "1.000016",
    pattern: /上证\s*50/i,
  },
  {
    key: "CHINEXT",
    label: "创业板指数",
    symbol: "399006",
    secid: "0.399006",
    pattern: /创业板(?:指|指数)?/i,
  },
  {
    key: "STAR_50",
    label: "科创50指数",
    symbol: "000688",
    secid: "1.000688",
    pattern: /科创\s*50/i,
  },
];

export function resolveTrackedIndex(fundName: unknown) {
  const name = String(fundName ?? "")
    .trim()
    .slice(0, 120);
  return TRACKED_INDICES.find((index) => index.pattern.test(name)) ?? null;
}

export function buildIndexQuoteUrl(
  indexKey: TrackedIndexKey,
  origin = EASTMONEY_QUOTE_ORIGIN,
) {
  const definition = TRACKED_INDICES.find((index) => index.key === indexKey);
  if (!definition) throw new Error("暂不支持该跟踪指数");
  const url = new URL("/api/qt/stock/get", origin);
  url.searchParams.set("secid", definition.secid);
  url.searchParams.set("fields", "f43,f57,f58,f59,f60,f86,f170");
  return url.toString();
}

export function buildIndexHistoryUrl(indexKey: TrackedIndexKey) {
  const definition = TRACKED_INDICES.find((index) => index.key === indexKey);
  if (!definition) throw new Error("暂不支持该跟踪指数");
  const url = new URL("/api/qt/stock/kline/get", EASTMONEY_HISTORY_ORIGIN);
  url.searchParams.set("secid", definition.secid);
  url.searchParams.set("klt", "101");
  url.searchParams.set("fqt", "0");
  url.searchParams.set("lmt", "180");
  url.searchParams.set("end", "20500101");
  url.searchParams.set("fields1", "f1,f2,f3,f4,f5,f6");
  url.searchParams.set(
    "fields2",
    "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
  );
  return url.toString();
}

type EastmoneyIndexPayload = {
  data?: {
    f43?: number | string;
    f57?: string;
    f59?: number | string;
    f60?: number | string;
    f86?: number | string;
    f170?: number | string;
  } | null;
};

export function parseIndexQuotePayload(
  payload: unknown,
  indexKey: TrackedIndexKey,
): IndexQuote {
  const definition = TRACKED_INDICES.find((index) => index.key === indexKey);
  if (!definition) throw new Error("暂不支持该跟踪指数");
  const data = (payload as EastmoneyIndexPayload | null)?.data;
  if (!data) throw new Error(`${definition.label}行情暂不可用`);
  const returnedSymbol = String(data.f57 ?? "")
    .trim()
    .toUpperCase();
  if (returnedSymbol !== definition.symbol)
    throw new Error(`${definition.label}行情代码不匹配`);
  const decimals = Number(data.f59);
  const priceRaw = Number(data.f43);
  const previousCloseRaw = Number(data.f60);
  const changeRaw = Number(data.f170);
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 6 ||
    !Number.isFinite(priceRaw) ||
    priceRaw <= 0
  )
    throw new Error(`${definition.label}最新点位暂不可用`);
  const divisor = 10 ** decimals;
  const timestamp = Number(data.f86);
  return {
    key: definition.key,
    label: definition.label,
    symbol: definition.symbol,
    price: priceRaw / divisor,
    previousClose:
      Number.isFinite(previousCloseRaw) && previousCloseRaw > 0
        ? previousCloseRaw / divisor
        : 0,
    changePercent: Number.isFinite(changeRaw) ? changeRaw / 100 : 0,
    quoteTime:
      Number.isFinite(timestamp) && timestamp > 0
        ? new Date(timestamp * 1000).toISOString()
        : new Date().toISOString(),
    sourceName: "东方财富指数行情",
    sourceUrl: `https://quote.eastmoney.com/center/hszs.html#${encodeURIComponent(definition.symbol)}`,
  };
}

export async function fetchIndexQuote(indexKey: TrackedIndexKey) {
  let lastError: unknown = null;
  for (const origin of [EASTMONEY_QUOTE_ORIGIN, EASTMONEY_DELAY_QUOTE_ORIGIN]) {
    try {
      const response = await fetch(buildIndexQuoteUrl(indexKey, origin), {
        headers: {
          "User-Agent": "Yingji/1.0 personal-ledger",
          Referer: "https://quote.eastmoney.com/",
        },
        signal: AbortSignal.timeout(6_000),
      });
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      return parseIndexQuotePayload(await response.json(), indexKey);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `指数行情暂不可用${lastError instanceof Error ? `：${lastError.message}` : ""}`,
  );
}

export function parseIndexHistoryPayload(
  payload: unknown,
): IndexHistoryPoint[] {
  const rows = (
    payload as { data?: { klines?: unknown[] | null } | null } | null
  )?.data?.klines;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => String(row).split(","))
    .map((parts) => ({
      date: parts[0] ?? "",
      changePercent: Number(parts[8]),
    }))
    .filter(
      (point) =>
        /^\d{4}-\d{2}-\d{2}$/.test(point.date) &&
        Number.isFinite(point.changePercent),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchIndexHistory(indexKey: TrackedIndexKey) {
  const response = await fetch(buildIndexHistoryUrl(indexKey), {
    headers: {
      "User-Agent": "Yingji/1.0 personal-ledger",
      Referer: "https://quote.eastmoney.com/",
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok)
    throw new Error(`指数历史行情暂不可用：HTTP ${response.status}`);
  const points = parseIndexHistoryPayload(await response.json());
  if (points.length < 20) throw new Error("指数历史行情不足");
  return points;
}

const fallbackCalibration = (): FundIndexCalibration => ({
  calibrated: false,
  beta: 1,
  alphaPercent: 0,
  sampleSize: 0,
  rSquared: 0,
  alignment: "SAME_DATE",
});

const regression = (pairs: Array<{ x: number; y: number }>) => {
  if (pairs.length < 20) return null;
  const xMean = pairs.reduce((sum, pair) => sum + pair.x, 0) / pairs.length;
  const yMean = pairs.reduce((sum, pair) => sum + pair.y, 0) / pairs.length;
  let covariance = 0;
  let xVariance = 0;
  let yVariance = 0;
  for (const pair of pairs) {
    covariance += (pair.x - xMean) * (pair.y - yMean);
    xVariance += Math.pow(pair.x - xMean, 2);
    yVariance += Math.pow(pair.y - yMean, 2);
  }
  if (xVariance <= 0 || yVariance <= 0) return null;
  const correlation = covariance / Math.sqrt(xVariance * yVariance);
  const beta = Math.min(2, Math.max(0, covariance / xVariance));
  const rawAlpha = yMean - beta * xMean;
  return {
    beta,
    // Shrink the average residual to avoid projecting one-off FX/NAV noise.
    alphaPercent: Math.min(0.5, Math.max(-0.5, rawAlpha * 0.25)),
    rSquared: correlation * correlation,
  };
};

export function calibrateFundToIndex(
  fundPoints: Array<{ date: string; dailyReturnPercent?: number }>,
  indexPoints: IndexHistoryPoint[],
): FundIndexCalibration {
  const validFundPoints = fundPoints
    .filter(
      (point) =>
        /^\d{4}-\d{2}-\d{2}$/.test(point.date) &&
        Number.isFinite(point.dailyReturnPercent) &&
        Math.abs(Number(point.dailyReturnPercent)) <= 10,
    )
    .slice(-120);
  if (validFundPoints.length < 20 || indexPoints.length < 20)
    return fallbackCalibration();
  const indexByDate = new Map(
    indexPoints.map((point) => [point.date, point.changePercent]),
  );
  const previousIndexByFundDate = new Map<string, number>();
  for (const fundPoint of validFundPoints) {
    const previous = indexPoints.findLast(
      (indexPoint) => indexPoint.date < fundPoint.date,
    );
    if (previous)
      previousIndexByFundDate.set(fundPoint.date, previous.changePercent);
  }
  const buildPairs = (alignment: "SAME_DATE" | "PREVIOUS_SESSION") =>
    validFundPoints.flatMap((point) => {
      const x =
        alignment === "SAME_DATE"
          ? indexByDate.get(point.date)
          : previousIndexByFundDate.get(point.date);
      const y = Number(point.dailyReturnPercent);
      return x !== undefined && Number.isFinite(x) && Math.abs(x) <= 10
        ? [{ x, y }]
        : [];
    });
  const candidates = (["SAME_DATE", "PREVIOUS_SESSION"] as const)
    .map((alignment) => {
      const pairs = buildPairs(alignment);
      const result = regression(pairs);
      return result ? { alignment, pairs, ...result } : null;
    })
    .filter((candidate) => candidate !== null)
    .sort((a, b) => b.rSquared - a.rSquared);
  const best = candidates[0];
  if (!best || best.rSquared < 0.08) return fallbackCalibration();
  return {
    calibrated: true,
    beta: best.beta,
    alphaPercent: best.alphaPercent,
    sampleSize: best.pairs.length,
    rSquared: best.rSquared,
    alignment: best.alignment,
  };
}

export function applyFundIndexCalibration(
  indexChangePercent: number,
  calibration: FundIndexCalibration,
) {
  if (!Number.isFinite(indexChangePercent)) return 0;
  const adjusted =
    calibration.alphaPercent + calibration.beta * indexChangePercent;
  return Math.min(10, Math.max(-10, adjusted));
}

export function calculateIndexMoveEstimate(
  exposures: Array<{ indexKey: TrackedIndexKey; weightPercent: number }>,
  quotes: Array<Pick<IndexQuote, "key" | "changePercent">>,
  totalAssets: number,
): IndexMoveEstimate {
  const quoteMap = new Map(
    quotes.map((quote) => [quote.key, quote.changePercent]),
  );
  let rate = 0;
  let coveredWeightPercent = 0;
  let matchedIndices = 0;
  for (const exposure of exposures) {
    const weight = Number(exposure.weightPercent);
    const change = quoteMap.get(exposure.indexKey);
    if (
      !Number.isFinite(weight) ||
      weight <= 0 ||
      change === undefined ||
      !Number.isFinite(change)
    )
      continue;
    rate += (weight / 100) * (change / 100);
    coveredWeightPercent += weight;
    matchedIndices += 1;
  }
  return {
    estimatedRate: rate,
    estimatedProfit: Math.max(0, Number(totalAssets) || 0) * rate,
    coveredWeightPercent,
    matchedIndices,
  };
}

export function calculateCalibratedFundEstimate(
  funds: Array<{
    weightPercent: number;
    estimatedChangePercent: number;
    available: boolean;
  }>,
  totalAssets: number,
): IndexMoveEstimate {
  let rate = 0;
  let coveredWeightPercent = 0;
  let matchedIndices = 0;
  for (const fund of funds) {
    if (
      !fund.available ||
      !Number.isFinite(fund.weightPercent) ||
      fund.weightPercent <= 0 ||
      !Number.isFinite(fund.estimatedChangePercent)
    )
      continue;
    rate += (fund.weightPercent / 100) * (fund.estimatedChangePercent / 100);
    coveredWeightPercent += fund.weightPercent;
    matchedIndices += 1;
  }
  return {
    estimatedRate: rate,
    estimatedProfit: Math.max(0, Number(totalAssets) || 0) * rate,
    coveredWeightPercent,
    matchedIndices,
  };
}
