export interface RedemptionFeeTier {
  label: string;
  minDays: number;
  maxDays: number | null;
  rateBps: number;
}

export interface LiveFundData {
  code: string;
  name: string;
  standardBuyFeeBps: number;
  eastmoneyBuyFeeBps: number;
  minPurchase: number;
  latestNav: number;
  latestNavDate: string;
  redemptionTiers: RedemptionFeeTier[];
  source: "EASTMONEY";
  updatedAt: string;
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
  const above = normalized.match(/(\d+(?:\.\d+)?)(天|个月|月|年)(?:以上|及以上)/);
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
  return [...section.matchAll(/<tr>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)]
    .map((match) =>
      parseTier(
        match[1].replace(/<[^>]+>/g, "").trim(),
        match[2].replace(/<[^>]+>/g, "").trim(),
      ),
    )
    .filter((tier): tier is RedemptionFeeTier => tier !== null);
}

export async function fetchLiveFundData(codeInput: string): Promise<LiveFundData> {
  const code = codeInput.trim();
  if (!/^\d{6}$/.test(code)) throw new Error("场外基金代码应为 6 位数字");
  const [scriptResponse, feeResponse] = await Promise.all([
    fetch(`https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`, {
      headers: { "User-Agent": "Yingji/1.0 personal-ledger" },
    }),
    fetch(`https://fundf10.eastmoney.com/jjfl_${code}.html`, {
      headers: { "User-Agent": "Yingji/1.0 personal-ledger" },
    }),
  ]);
  if (!scriptResponse.ok) throw new Error("未查询到该基金代码");
  const script = await scriptResponse.text();
  const name = valueOf(script, "fS_name");
  if (!name) throw new Error("该代码暂无可用基金资料");
  let latestNav = 0;
  let latestTimestamp = 0;
  const navStart = script.indexOf("var Data_netWorthTrend");
  const navEnd = navStart >= 0 ? script.indexOf("];", navStart) : -1;
  const navBlock =
    navStart >= 0 && navEnd > navStart
      ? script.slice(navStart, navEnd + 1)
      : "";
  for (const match of navBlock.matchAll(/\{"x":(\d+),"y":([\d.]+)/g)) {
    latestTimestamp = Number(match[1]);
    latestNav = Number(match[2]);
  }
  const standardRate = Number(valueOf(script, "fund_sourceRate") || 0);
  const eastmoneyRate = Number(valueOf(script, "fund_Rate") || 0);
  const minPurchase = Number(valueOf(script, "fund_minsg") || 0);
  const feeHtml = feeResponse.ok ? await feeResponse.text() : "";
  return {
    code,
    name,
    standardBuyFeeBps: Math.round(standardRate * 100),
    eastmoneyBuyFeeBps: Math.round(eastmoneyRate * 100),
    minPurchase,
    latestNav,
    latestNavDate: latestTimestamp
      ? new Date(latestTimestamp + 8 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10)
      : "",
    redemptionTiers: parseRedemptionTiers(feeHtml),
    source: "EASTMONEY",
    updatedAt: new Date().toISOString(),
  };
}
