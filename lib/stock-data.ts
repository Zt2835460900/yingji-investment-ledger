export type PreferredProductType = "AUTO" | "FUND" | "STOCK";

export interface AshareCode {
  code: string;
  canonicalCode: string;
  market: "SH" | "SZ";
  secid: string;
}

export interface LiveStockQuote extends AshareCode {
  name: string;
  price: number;
  priceDate: string;
  source: "EASTMONEY_QUOTE";
  fetchedAt: string;
}

const EASTMONEY_QUOTE_ORIGIN = "https://push2.eastmoney.com";
const PRODUCT_CODE_PATTERN = /^[A-Z0-9.-]{1,20}$/;

/**
 * Product codes are treated as identifiers, never as URLs. Keeping this
 * validation separate makes it impossible for callers to smuggle a host,
 * path or query string into the fixed quote endpoint below.
 */
export function normalizeProductCodeInput(codeInput: string) {
  const code = codeInput.trim().toUpperCase();
  if (!code) throw new Error("请输入基金或股票代码");
  if (!PRODUCT_CODE_PATTERN.test(code))
    throw new Error("代码格式不正确，请勿输入网址、路径或查询参数");
  return code;
}

export function parsePreferredProductType(
  input: unknown,
): PreferredProductType {
  const value = String(input ?? "AUTO")
    .trim()
    .toUpperCase();
  if (value === "AUTO" || value === "FUND" || value === "STOCK") return value;
  throw new Error("产品类型只能选择自动、基金或股票");
}

export function productTypeMatchesPreference(
  productType: string,
  preferredProductType: PreferredProductType,
) {
  if (preferredProductType === "AUTO") return true;
  if (preferredProductType === "STOCK") return productType === "STOCK";
  return productType === "FUND" || productType === "ETF";
}

const isAshareCodeForMarket = (code: string, market: "SH" | "SZ") =>
  market === "SH"
    ? /^(?:60|68)\d{4}$/.test(code)
    : /^(?:00|30)\d{4}$/.test(code);

/**
 * Accept common A-share input styles while storing a market-qualified code.
 * The market prefix avoids collisions with six-digit off-exchange fund codes.
 */
export function parseAshareCode(codeInput: string): AshareCode | null {
  const input = normalizeProductCodeInput(codeInput);
  let code = "";
  let market: "SH" | "SZ" | "" = "";

  const prefixed = input.match(/^(SH|SZ)(\d{6})$/);
  const suffixed = input.match(/^(\d{6})\.(SH|SZ)$/);
  if (prefixed) {
    market = prefixed[1] as "SH" | "SZ";
    code = prefixed[2];
  } else if (suffixed) {
    market = suffixed[2] as "SH" | "SZ";
    code = suffixed[1];
  } else if (/^\d{6}$/.test(input)) {
    code = input;
    if (/^(?:60|68)\d{4}$/.test(code)) market = "SH";
    else if (/^(?:00|30)\d{4}$/.test(code)) market = "SZ";
    else return null;
  } else {
    return null;
  }

  if (!isAshareCodeForMarket(code, market))
    throw new Error(
      "股票代码与 SH/SZ 市场前缀不匹配，或不是受支持的中国 A 股代码",
    );
  return {
    code,
    market,
    canonicalCode: `${market}${code}`,
    secid: `${market === "SH" ? "1" : "0"}.${code}`,
  };
}

/**
 * Return database lookup keys in an order that preserves product identity.
 * Funds keep their public six-digit code, while A shares prefer a market-
 * qualified key so a fund and a stock such as 000001 can coexist safely.
 */
export function productCodeLookupCandidates(
  codeInput: string,
  preferredProductType: PreferredProductType,
) {
  const code = normalizeProductCodeInput(codeInput);
  const stock = parseAshareCode(code);
  if (preferredProductType === "FUND") return [code];
  if (preferredProductType === "STOCK") {
    if (!stock) return [code];
    return [...new Set([stock.canonicalCode, stock.code])];
  }
  return [
    ...new Set([
      code,
      ...(stock && stock.canonicalCode !== code ? [stock.canonicalCode] : []),
    ]),
  ];
}

export function describeUnsupportedStockCode(codeInput: string) {
  const code = normalizeProductCodeInput(codeInput);
  if (/^(?:HK\d{5}|\d{5}\.HK|\d{5})$/.test(code))
    return `已识别为港股代码 ${code}，目前不自动查询港股行情；请在产品管理中手动新增并录入价格`;
  if (/^[A-Z][A-Z0-9.-]{0,9}$/.test(code))
    return `已识别为美股代码 ${code}，目前不自动查询美股行情；请在产品管理中手动新增并录入价格`;
  return "股票自动匹配目前仅支持沪深 A 股代码，可输入六位代码或 SH/SZ 前缀";
}

export function buildAshareQuoteUrl(stock: AshareCode) {
  if (!/^\d\.\d{6}$/.test(stock.secid)) throw new Error("股票行情请求参数无效");
  const url = new URL("/api/qt/stock/get", EASTMONEY_QUOTE_ORIGIN);
  url.searchParams.set("secid", stock.secid);
  url.searchParams.set("fields", "f43,f57,f58,f59,f86");
  return url.toString();
}

type QuotePayload = {
  data?: {
    f43?: number | string;
    f57?: string;
    f58?: string;
    f59?: number | string;
    f86?: number | string;
  } | null;
};

export function parseAshareQuotePayload(
  payload: unknown,
  stock: AshareCode,
): Omit<LiveStockQuote, keyof AshareCode | "source" | "fetchedAt"> {
  const data = (payload as QuotePayload | null)?.data;
  if (!data || String(data.f57 ?? "") !== stock.code)
    throw new Error("未查询到该中国 A 股代码");
  const name = String(data.f58 ?? "")
    .replace(/[\u0000-\u001f<>]/g, "")
    .trim();
  const rawPrice = Number(data.f43);
  const decimals = Number(data.f59);
  const timestamp = Number(data.f86);
  if (!name) throw new Error("股票行情缺少产品名称");
  if (
    !Number.isFinite(rawPrice) ||
    rawPrice <= 0 ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 6
  )
    throw new Error("股票最新价格暂不可用");
  if (!Number.isFinite(timestamp) || timestamp <= 0)
    throw new Error("股票行情日期暂不可用");
  const priceDate = new Date(timestamp * 1000 + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return {
    name: name.slice(0, 80),
    price: rawPrice / 10 ** decimals,
    priceDate,
  };
}

export async function fetchLiveAshareQuote(
  codeInput: string,
): Promise<LiveStockQuote> {
  const stock = parseAshareCode(codeInput);
  if (!stock) throw new Error(describeUnsupportedStockCode(codeInput));
  const response = await fetch(buildAshareQuoteUrl(stock), {
    headers: { "User-Agent": "Yingji/1.0 personal-ledger" },
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok)
    throw new Error(`股票行情数据源暂时不可用（HTTP ${response.status}）`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("股票行情数据格式异常");
  }
  const quote = parseAshareQuotePayload(payload, stock);
  return {
    ...stock,
    ...quote,
    source: "EASTMONEY_QUOTE",
    fetchedAt: new Date().toISOString(),
  };
}
