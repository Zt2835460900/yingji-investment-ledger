export interface RedemptionFeeTier {
  label: string;
  minDays: number;
  maxDays: number | null;
  rateBps: number;
}

export interface LiveFundData {
  code: string;
  name: string;
  fundCategory: string;
  productType: "FUND" | "ETF";
  assetClass: string;
  confirmationBusinessDays: number;
  standardBuyFeeBps: number;
  eastmoneyBuyFeeBps: number;
  minPurchase: number;
  latestNav: number;
  latestNavDate: string;
  quoteNav: number;
  quoteNavDate: string;
  quoteDateRequested: string;
  quoteIsExact: boolean;
  redemptionTiers: RedemptionFeeTier[];
  source: "EASTMONEY";
  updatedAt: string;
}

export interface FundNavPoint {
  date: string;
  nav: number;
}

export function selectFundNav(
  points: FundNavPoint[],
  requestedDate = "",
): FundNavPoint | null {
  const ordered = points
    .filter(
      (point) =>
        /^\d{4}-\d{2}-\d{2}$/.test(point.date) &&
        Number.isFinite(point.nav) &&
        point.nav > 0,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!requestedDate) return ordered.at(-1) ?? null;
  return ordered.findLast((point) => point.date <= requestedDate) ?? null;
}

const plainText = (value: string) =>
  value
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .trim();

export function parseFundCategory(profileHtml: string) {
  const tableMatch = profileHtml.match(
    /<th[^>]*>\s*基金类型\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i,
  );
  const summaryMatch = profileHtml.match(
    /类型[：:]\s*<span[^>]*>([\s\S]*?)<\/span>/i,
  );
  return plainText(tableMatch?.[1] ?? summaryMatch?.[1] ?? "");
}

export function classifyFund(code: string, name: string, fundCategory = "") {
  const combined = `${name} ${fundCategory}`;
  const productType: "FUND" | "ETF" =
    (/ETF/i.test(combined) && !/联接/i.test(name)) ||
    /^(?:5[1-8]\d{4}|159\d{3})$/.test(code)
      ? "ETF"
      : "FUND";

  let assetClass = "中国股票";
  if (/货币|现金|同业存单/i.test(combined)) assetClass = "现金";
  else if (/债券|固收|短债|中短债|纯债/i.test(combined)) assetClass = "债券";
  else if (/黄金|白银|原油|商品/i.test(combined)) assetClass = "商品";
  else if (/港股|恒生|香港/i.test(combined)) assetClass = "港股";
  else if (/纳斯达克|纳指|标普|美国|美股/i.test(combined))
    assetClass = "美国股票";
  else if (/QDII|全球|海外|日经|印度|越南|德国|法国/i.test(combined))
    assetClass = "海外股票";

  const confirmationBusinessDays =
    productType === "ETF"
      ? 0
      : /QDII|全球|海外|纳斯达克|纳指|标普|美国|美股|日经|印度|越南|德国|法国/i.test(
            combined,
          )
        ? 2
        : 1;

  return { productType, assetClass, confirmationBusinessDays };
}

const valueOf = (source: string, variable: string) => {
  const match = source.match(
    new RegExp(`var\\s+${variable}\\s*=\\s*["']([^"']*)["']`),
  );
  return match?.[1]?.trim() ?? "";
};

const durationDays = (value: string, unit: string) => {
  const number = Number(value);
  if (unit.includes("年")) return number * 365;
  if (unit.includes("月")) return number * 30;
  return number;
};

function parseTier(label: string, rateText: string): RedemptionFeeTier | null {
  const normalized = label.replaceAll(" ", "").replaceAll("≤", "小于等于");
  let minDays = 0;
  let maxDays: number | null = null;
  const min = normalized.match(/大于等于(\d+(?:\.\d+)?)(天|个月|月|年)/);
  const strictMin = normalized.match(/大于(\d+(?:\.\d+)?)(天|个月|月|年)/);
  const max = normalized.match(/小于(\d+(?:\.\d+)?)(天|个月|月|年)/);
  const inclusiveMax = normalized.match(
    /小于等于(\d+(?:\.\d+)?)(天|个月|月|年)/,
  );
  const above = normalized.match(
    /(\d+(?:\.\d+)?)(天|个月|月|年)(?:以上|及以上)/,
  );
  if (min) minDays = durationDays(min[1], min[2]);
  else if (strictMin) minDays = durationDays(strictMin[1], strictMin[2]) + 1;
  else if (above) minDays = durationDays(above[1], above[2]);
  if (inclusiveMax)
    maxDays = durationDays(inclusiveMax[1], inclusiveMax[2]) + 1;
  else if (max) maxDays = durationDays(max[1], max[2]);
  const rate = Number(rateText.replace("%", "").trim());
  if (!Number.isFinite(rate)) return null;
  return { label, minDays, maxDays, rateBps: Math.round(rate * 100) };
}

function parseRedemptionTiers(html: string) {
  const section = html.match(
    /<label class="left">赎回费率[\s\S]*?<table[^>]*>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/,
  )?.[1];
  if (!section) return [];
  return [
    ...section.matchAll(
      /<tr>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g,
    ),
  ]
    .map((match) =>
      parseTier(
        match[1].replace(/<[^>]+>/g, "").trim(),
        match[2].replace(/<[^>]+>/g, "").trim(),
      ),
    )
    .filter((tier): tier is RedemptionFeeTier => tier !== null);
}

export async function fetchLiveFundData(
  codeInput: string,
  quoteDateInput = "",
): Promise<LiveFundData> {
  const code = codeInput.trim();
  if (!/^\d{6}$/.test(code)) throw new Error("场外基金代码应为 6 位数字");
  const quoteDate = quoteDateInput.trim();
  if (quoteDate && !/^\d{4}-\d{2}-\d{2}$/.test(quoteDate))
    throw new Error("净值查询日期格式不正确");
  const signal = AbortSignal.timeout(10_000);
  const [scriptResponse, feeResponse, profileResponse] = await Promise.all([
    fetch(
      `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`,
      {
        headers: { "User-Agent": "Yingji/1.0 personal-ledger" },
        signal,
      },
    ),
    fetch(`https://fundf10.eastmoney.com/jjfl_${code}.html`, {
      headers: { "User-Agent": "Yingji/1.0 personal-ledger" },
      signal,
    }),
    fetch(`https://fundf10.eastmoney.com/jbgk_${code}.html`, {
      headers: { "User-Agent": "Yingji/1.0 personal-ledger" },
      signal,
    }),
  ]);
  if (!scriptResponse.ok) throw new Error("未查询到该基金代码");
  const script = await scriptResponse.text();
  const name = valueOf(script, "fS_name");
  if (!name) throw new Error("该代码暂无可用基金资料");
  let latestNav = 0;
  let latestNavDate = "";
  const navPoints: FundNavPoint[] = [];
  const navStart = script.indexOf("var Data_netWorthTrend");
  const navEnd = navStart >= 0 ? script.indexOf("];", navStart) : -1;
  const navBlock =
    navStart >= 0 && navEnd > navStart
      ? script.slice(navStart, navEnd + 1)
      : "";
  for (const match of navBlock.matchAll(/\{"x":(\d+),"y":([\d.]+)/g)) {
    const timestamp = Number(match[1]);
    const nav = Number(match[2]);
    const date = timestamp
      ? new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : "";
    if (date && Number.isFinite(nav) && nav > 0) navPoints.push({ date, nav });
  }
  const latestPoint = selectFundNav(navPoints);
  const quotePoint = selectFundNav(navPoints, quoteDate);
  latestNav = latestPoint?.nav ?? 0;
  latestNavDate = latestPoint?.date ?? "";
  const standardRate = Number(valueOf(script, "fund_sourceRate") || 0);
  const eastmoneyRate = Number(valueOf(script, "fund_Rate") || 0);
  const minPurchase = Number(valueOf(script, "fund_minsg") || 0);
  const feeHtml = feeResponse.ok ? await feeResponse.text() : "";
  const profileHtml = profileResponse.ok ? await profileResponse.text() : "";
  const fundCategory = parseFundCategory(profileHtml);
  const classification = classifyFund(code, name, fundCategory);
  return {
    code,
    name,
    fundCategory,
    ...classification,
    standardBuyFeeBps: Math.round(standardRate * 100),
    eastmoneyBuyFeeBps: Math.round(eastmoneyRate * 100),
    minPurchase,
    latestNav,
    latestNavDate,
    quoteNav: quotePoint?.nav ?? 0,
    quoteNavDate: quotePoint?.date ?? "",
    quoteDateRequested: quoteDate,
    quoteIsExact: Boolean(quoteDate && quotePoint?.date === quoteDate),
    redemptionTiers: parseRedemptionTiers(feeHtml),
    source: "EASTMONEY",
    updatedAt: new Date().toISOString(),
  };
}
