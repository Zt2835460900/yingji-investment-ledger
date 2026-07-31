import { parseAshareCode } from "./stock-data";

export type CompanyMarket = "US" | "CN" | "HK";

export interface CompanyQuote {
  symbol: string;
  name: string;
  market: CompanyMarket;
  price: number;
  previousClose: number;
  changePercent: number;
  quoteTime: string;
  sourceName: string;
  sourceUrl: string;
}

export interface CompanyEarnings {
  symbol: string;
  name: string;
  market: CompanyMarket;
  upcomingDate: string | null;
  upcomingPeriod: string;
  upcomingTiming: string;
  epsForecast: number | null;
  latestReportDate: string | null;
  latestPeriod: string;
  latestEps: number | null;
  latestConsensus: number | null;
  latestSurprisePercent: number | null;
  sourceName: string;
  sourceUrl: string;
  isEstimated: boolean;
}

export interface CompanyInsight {
  symbol: string;
  market: CompanyMarket;
  quote: CompanyQuote | null;
  earnings: CompanyEarnings | null;
  errors: string[];
}

export interface HoldingExposure {
  symbol: string;
  weightPercent: number;
}

export interface HoldingMoveEstimate {
  estimatedRate: number;
  estimatedProfit: number;
  coveredWeightPercent: number;
  matchedCompanies: number;
}

const EASTMONEY_QUOTE_ORIGIN = "https://push2.eastmoney.com";
const EASTMONEY_DELAY_QUOTE_ORIGIN = "https://push2delay.eastmoney.com";
const EASTMONEY_DATA_ORIGIN = "https://datacenter-web.eastmoney.com";
const NASDAQ_API_ORIGIN = "https://api.nasdaq.com";
const COMPANY_SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/;
const MONTHS: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

const cleanText = (value: unknown, length = 120) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f<>]/g, "")
    .trim()
    .slice(0, length);

const isoDateOnly = (value: unknown) => {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

export function normalizeCompanySymbol(
  input: unknown,
  marketInput?: unknown,
): { symbol: string; market: CompanyMarket } {
  const raw = String(input ?? "")
    .trim()
    .toUpperCase();
  const marketText = String(marketInput ?? "")
    .trim()
    .toUpperCase();
  const requestedMarket: CompanyMarket | null =
    marketText === "US" || marketText === "CN" || marketText === "HK"
      ? marketText
      : null;

  const stock = parseAshareCode(raw);
  if (stock && (!requestedMarket || requestedMarket === "CN"))
    return { symbol: stock.code, market: "CN" };

  const hk = raw.match(/^(?:HK)?(\d{1,5})(?:\.HK)?$/);
  if (hk && requestedMarket === "HK")
    return { symbol: hk[1].padStart(5, "0"), market: "HK" };

  if (COMPANY_SYMBOL_PATTERN.test(raw) && requestedMarket !== "CN")
    return { symbol: raw, market: requestedMarket ?? "US" };

  throw new Error("公司代码格式不正确；支持美股代码、六位 A 股代码或港股代码");
}

export function buildCompanyQuoteUrls(
  symbolInput: unknown,
  marketInput?: unknown,
) {
  const { symbol, market } = normalizeCompanySymbol(symbolInput, marketInput);
  let secids: string[];
  if (market === "CN") {
    const stock = parseAshareCode(symbol);
    if (!stock) throw new Error("A 股代码不受支持");
    secids = [stock.secid];
  } else if (market === "HK") {
    secids = [`116.${symbol}`];
  } else {
    secids = [`105.${symbol}`, `106.${symbol}`, `107.${symbol}`];
  }
  return secids.flatMap((secid) =>
    [EASTMONEY_QUOTE_ORIGIN, EASTMONEY_DELAY_QUOTE_ORIGIN].map((origin) => {
      const url = new URL("/api/qt/stock/get", origin);
      url.searchParams.set("secid", secid);
      url.searchParams.set("fields", "f43,f57,f58,f59,f60,f86,f170");
      return url.toString();
    }),
  );
}

type EastmoneyQuotePayload = {
  data?: {
    f43?: number | string;
    f57?: string;
    f58?: string;
    f59?: number | string;
    f60?: number | string;
    f86?: number | string;
    f170?: number | string;
  } | null;
};

export function parseCompanyQuotePayload(
  payload: unknown,
  symbolInput: unknown,
  marketInput?: unknown,
): CompanyQuote {
  const { symbol, market } = normalizeCompanySymbol(symbolInput, marketInput);
  const data = (payload as EastmoneyQuotePayload | null)?.data;
  if (!data) throw new Error("未查询到公司行情");
  const returnedSymbol = cleanText(data.f57, 20).toUpperCase();
  if (
    returnedSymbol !== symbol &&
    !(market === "CN" && returnedSymbol === symbol.replace(/^(SH|SZ)/, ""))
  )
    throw new Error("公司行情代码不匹配");
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
    throw new Error("公司最新价格暂不可用");
  const divisor = 10 ** decimals;
  const timestamp = Number(data.f86);
  const quoteTime =
    Number.isFinite(timestamp) && timestamp > 0
      ? new Date(timestamp * 1000).toISOString()
      : new Date().toISOString();
  const sourceUrl =
    market === "US"
      ? `https://quote.eastmoney.com/us/${encodeURIComponent(symbol)}.html`
      : market === "HK"
        ? `https://quote.eastmoney.com/hk/${encodeURIComponent(symbol)}.html`
        : `https://quote.eastmoney.com/${parseAshareCode(symbol)?.market.toLowerCase()}${symbol}.html`;
  return {
    symbol,
    name: cleanText(data.f58, 80) || symbol,
    market,
    price: priceRaw / divisor,
    previousClose:
      Number.isFinite(previousCloseRaw) && previousCloseRaw > 0
        ? previousCloseRaw / divisor
        : 0,
    changePercent: Number.isFinite(changeRaw) ? changeRaw / 100 : 0,
    quoteTime,
    sourceName: "东方财富行情",
    sourceUrl,
  };
}

export async function fetchCompanyQuote(
  symbolInput: unknown,
  marketInput?: unknown,
): Promise<CompanyQuote> {
  const normalized = normalizeCompanySymbol(symbolInput, marketInput);
  const urls = buildCompanyQuoteUrls(normalized.symbol, normalized.market);
  let lastError: unknown = null;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
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
      return parseCompanyQuotePayload(
        await response.json(),
        normalized.symbol,
        normalized.market,
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `公司行情暂不可用${lastError instanceof Error ? `：${lastError.message}` : ""}`,
  );
}

type NasdaqDatePayload = {
  data?: {
    reportText?: string | null;
    announcement?: string | null;
  } | null;
};

const nasdaqDate = (text: string) => {
  const match = text.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})\b/i,
  );
  if (!match) return null;
  const monthKey =
    match[1].slice(0, 1).toUpperCase() + match[1].slice(1, 3).toLowerCase();
  const month = MONTHS[monthKey];
  return month
    ? `${match[3]}-${month}-${String(Number(match[2])).padStart(2, "0")}`
    : null;
};

export function parseNasdaqEarningsDatePayload(
  payload: unknown,
  symbolInput: unknown,
) {
  const { symbol } = normalizeCompanySymbol(symbolInput, "US");
  const data = (payload as NasdaqDatePayload | null)?.data;
  const announcement = cleanText(data?.announcement, 500);
  const reportText = cleanText(data?.reportText, 1500);
  const upcomingDate = nasdaqDate(`${announcement} ${reportText}`);
  const period =
    reportText.match(/fiscal\s+Quarter\s+ending\s+([^.]+)\./i)?.[1]?.trim() ??
    "";
  const epsText =
    reportText.match(
      /consensus\s+EPS\s+forecast[\s\S]*?(\$[+\-]?\d+(?:\.\d+)?)/i,
    )?.[1] ?? "";
  const epsForecast = epsText ? Number(epsText.replace("$", "")) : null;
  const timing = /after market close/i.test(reportText)
    ? "美股盘后"
    : /before market open|pre-market/i.test(reportText)
      ? "美股盘前"
      : "";
  return {
    symbol,
    upcomingDate,
    upcomingPeriod: period,
    upcomingTiming: timing,
    epsForecast:
      epsForecast !== null && Number.isFinite(epsForecast) ? epsForecast : null,
    isEstimated: /\bexpected\*?/i.test(reportText),
  };
}

type NasdaqSurprisePayload = {
  data?: {
    earningsSurpriseTable?: {
      rows?: Array<{
        fiscalQtrEnd?: string;
        dateReported?: string;
        eps?: number | string;
        consensusForecast?: number | string;
        percentageSurprise?: number | string;
      }> | null;
    } | null;
  } | null;
};

const usDateToIso = (value: unknown) => {
  const match = String(value ?? "")
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match
    ? `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`
    : null;
};

export function parseNasdaqEarningsSurprisePayload(payload: unknown) {
  const row = (payload as NasdaqSurprisePayload | null)?.data
    ?.earningsSurpriseTable?.rows?.[0];
  if (!row)
    return {
      latestReportDate: null,
      latestPeriod: "",
      latestEps: null,
      latestConsensus: null,
      latestSurprisePercent: null,
    };
  const numberOrNull = (value: unknown) => {
    const parsed = Number(String(value ?? "").replace(/[$,%]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    latestReportDate: usDateToIso(row.dateReported),
    latestPeriod: cleanText(row.fiscalQtrEnd, 40),
    latestEps: numberOrNull(row.eps),
    latestConsensus: numberOrNull(row.consensusForecast),
    latestSurprisePercent: numberOrNull(row.percentageSurprise),
  };
}

type AshareEarningsRow = {
  SECURITY_CODE?: string;
  SECURITY_NAME_ABBR?: string;
  REPORT_TYPE_NAME?: string;
  APPOINT_PUBLISH_DATE?: string | null;
  ACTUAL_PUBLISH_DATE?: string | null;
  IS_PUBLISH?: string | number;
  REPORT_DATE?: string;
};

export function parseAshareEarningsRows(
  rows: AshareEarningsRow[],
  symbolInput: unknown,
): CompanyEarnings {
  const { symbol } = normalizeCompanySymbol(symbolInput, "CN");
  const matching = rows
    .filter((row) => String(row.SECURITY_CODE ?? "") === symbol)
    .sort((a, b) =>
      String(b.REPORT_DATE ?? "").localeCompare(String(a.REPORT_DATE ?? "")),
    );
  const upcoming = matching.find(
    (row) =>
      String(row.IS_PUBLISH ?? "") !== "1" &&
      isoDateOnly(row.APPOINT_PUBLISH_DATE),
  );
  const latest = matching.find(
    (row) =>
      String(row.IS_PUBLISH ?? "") === "1" &&
      isoDateOnly(row.ACTUAL_PUBLISH_DATE),
  );
  return {
    symbol,
    name:
      cleanText(
        upcoming?.SECURITY_NAME_ABBR ?? latest?.SECURITY_NAME_ABBR,
        80,
      ) || symbol,
    market: "CN",
    upcomingDate: isoDateOnly(upcoming?.APPOINT_PUBLISH_DATE),
    upcomingPeriod: cleanText(upcoming?.REPORT_TYPE_NAME, 80),
    upcomingTiming: "预约披露",
    epsForecast: null,
    latestReportDate: isoDateOnly(latest?.ACTUAL_PUBLISH_DATE),
    latestPeriod: cleanText(latest?.REPORT_TYPE_NAME, 80),
    latestEps: null,
    latestConsensus: null,
    latestSurprisePercent: null,
    sourceName: "东方财富财报预约",
    sourceUrl: "https://data.eastmoney.com/bbsj/",
    isEstimated: false,
  };
}

const nasdaqHeaders = {
  Accept: "application/json, text/plain, */*",
  Referer: "https://www.nasdaq.com/market-activity/earnings",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
};

async function fetchUsCompanyEarnings(symbolInput: unknown) {
  const { symbol } = normalizeCompanySymbol(symbolInput, "US");
  const [dateResponse, surpriseResponse] = await Promise.all([
    fetch(
      `${NASDAQ_API_ORIGIN}/api/analyst/${encodeURIComponent(symbol)}/earnings-date`,
      {
        headers: nasdaqHeaders,
        signal: AbortSignal.timeout(8_000),
      },
    ),
    fetch(
      `${NASDAQ_API_ORIGIN}/api/company/${encodeURIComponent(symbol)}/earnings-surprise`,
      {
        headers: nasdaqHeaders,
        signal: AbortSignal.timeout(8_000),
      },
    ),
  ]);
  if (!dateResponse.ok && !surpriseResponse.ok)
    throw new Error("美股财报日历暂不可用");
  const date = dateResponse.ok
    ? parseNasdaqEarningsDatePayload(await dateResponse.json(), symbol)
    : {
        symbol,
        upcomingDate: null,
        upcomingPeriod: "",
        upcomingTiming: "",
        epsForecast: null,
        isEstimated: false,
      };
  const history = surpriseResponse.ok
    ? parseNasdaqEarningsSurprisePayload(await surpriseResponse.json())
    : {
        latestReportDate: null,
        latestPeriod: "",
        latestEps: null,
        latestConsensus: null,
        latestSurprisePercent: null,
      };
  return {
    symbol,
    name: symbol,
    market: "US" as const,
    ...date,
    ...history,
    sourceName: "Nasdaq / Zacks",
    sourceUrl: `https://www.nasdaq.com/market-activity/stocks/${encodeURIComponent(symbol.toLowerCase())}/earnings`,
  };
}

async function fetchAshareCompanyEarnings(symbolInput: unknown) {
  const { symbol } = normalizeCompanySymbol(symbolInput, "CN");
  const url = new URL("/api/data/v1/get", EASTMONEY_DATA_ORIGIN);
  url.searchParams.set("reportName", "RPT_PUBLIC_BS_APPOIN");
  url.searchParams.set("columns", "ALL");
  url.searchParams.set("filter", `(SECURITY_CODE="${symbol}")`);
  url.searchParams.set("pageNumber", "1");
  url.searchParams.set("pageSize", "20");
  url.searchParams.set("sortColumns", "REPORT_DATE");
  url.searchParams.set("sortTypes", "-1");
  const response = await fetch(url, {
    headers: {
      Referer: "https://data.eastmoney.com/",
      "User-Agent": "Yingji/1.0 personal-ledger",
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("A 股财报预约暂不可用");
  const payload = (await response.json()) as {
    result?: { data?: AshareEarningsRow[] | null } | null;
  };
  return parseAshareEarningsRows(payload.result?.data ?? [], symbol);
}

export async function fetchCompanyEarnings(
  symbolInput: unknown,
  marketInput?: unknown,
) {
  const normalized = normalizeCompanySymbol(symbolInput, marketInput);
  if (normalized.market === "CN")
    return fetchAshareCompanyEarnings(normalized.symbol);
  if (normalized.market === "US")
    return fetchUsCompanyEarnings(normalized.symbol);
  throw new Error("港股财报日历暂未接入，可继续追踪行情");
}

export async function fetchCompanyInsight(
  symbolInput: unknown,
  marketInput?: unknown,
): Promise<CompanyInsight> {
  const normalized = normalizeCompanySymbol(symbolInput, marketInput);
  const [quoteResult, earningsResult] = await Promise.allSettled([
    fetchCompanyQuote(normalized.symbol, normalized.market),
    fetchCompanyEarnings(normalized.symbol, normalized.market),
  ]);
  return {
    ...normalized,
    quote: quoteResult.status === "fulfilled" ? quoteResult.value : null,
    earnings:
      earningsResult.status === "fulfilled" ? earningsResult.value : null,
    errors: [
      ...(quoteResult.status === "rejected"
        ? [
            quoteResult.reason instanceof Error
              ? quoteResult.reason.message
              : "行情读取失败",
          ]
        : []),
      ...(earningsResult.status === "rejected"
        ? [
            earningsResult.reason instanceof Error
              ? earningsResult.reason.message
              : "财报日历读取失败",
          ]
        : []),
    ],
  };
}

export function calculateHoldingMoveEstimate(
  exposures: HoldingExposure[],
  quotes: Array<Pick<CompanyQuote, "symbol" | "changePercent">>,
  totalAssets: number,
): HoldingMoveEstimate {
  const quoteMap = new Map(
    quotes.map((quote) => [quote.symbol.toUpperCase(), quote.changePercent]),
  );
  let rate = 0;
  let coveredWeightPercent = 0;
  let matchedCompanies = 0;
  for (const exposure of exposures) {
    const weight = Number(exposure.weightPercent);
    const change = quoteMap.get(exposure.symbol.toUpperCase());
    if (
      !Number.isFinite(weight) ||
      weight <= 0 ||
      change === undefined ||
      !Number.isFinite(change)
    )
      continue;
    rate += (weight / 100) * (change / 100);
    coveredWeightPercent += weight;
    matchedCompanies += 1;
  }
  return {
    estimatedRate: rate,
    estimatedProfit: Math.max(0, Number(totalAssets) || 0) * rate,
    coveredWeightPercent,
    matchedCompanies,
  };
}
