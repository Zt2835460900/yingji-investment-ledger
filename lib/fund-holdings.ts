export const FUND_HOLDINGS_SOURCE =
  "东方财富·天天基金公开基金档案（数据源自基金定期报告）";

export const FUND_HOLDINGS_DISCLOSURE_NOTICE =
  "持仓来自基金定期报告，通常按季度披露，存在信息滞后，不代表当前实时持仓。";

export interface DisclosedFundHolding {
  rank: number;
  stockCode: string;
  stockName: string;
  weightBps: number;
  weightPercent: number;
  sharesTenThousand: number | null;
  marketValueTenThousandCny: number | null;
}

export interface FundHoldingsDisclosure {
  fundCode: string;
  fundName: string;
  reportPeriod: string;
  reportDate: string;
  disclosureDate: string | null;
  disclosureDateAvailable: boolean;
  isQuarterlyDisclosure: true;
  holdings: DisclosedFundHolding[];
  disclosedTopHoldingsWeightBps: number;
  source: {
    name: typeof FUND_HOLDINGS_SOURCE;
    url: string;
    dataUrl: string;
    announcementUrl: string | null;
    isFundManagerOfficial: false;
    note: string;
  };
  fetchedAt: string;
}

export interface LookthroughFundWeight {
  fundCode: string;
  fundName: string;
  weightBps: number;
}

export interface LookthroughExposure {
  fundCode: string;
  fundName: string;
  fundWeightBps: number;
  holdingWeightBps: number;
  estimatedPortfolioWeightBps: number;
}

export interface AggregatedUnderlyingHolding {
  stockCode: string;
  stockName: string;
  estimatedPortfolioWeightBps: number;
  estimatedPortfolioWeightPercent: number;
  fundCount: number;
  isOverlap: boolean;
  exposures: LookthroughExposure[];
}

export interface FundLookthrough {
  weightMode: "PROVIDED" | "EQUAL";
  fundWeights: LookthroughFundWeight[];
  holdings: AggregatedUnderlyingHolding[];
  overlaps: AggregatedUnderlyingHolding[];
  disclosedCoverageBps: number;
  disclosedCoveragePercent: number;
  notice: typeof FUND_HOLDINGS_DISCLOSURE_NOTICE;
}

const SOURCE_NOTE =
  "该通用接口使用东方财富公开基金档案作为基金管理人官网之外的统一备用来源；报告期截止日由公开档案解析，页面未提供公告发布日期时不会推测。";

const requestHeaders = {
  Accept: "text/html,application/xhtml+xml",
  Referer: "https://fundf10.eastmoney.com/",
  "User-Agent": "Yingji/1.0 personal-ledger",
};

const decodeHtmlEntities = (value: string) =>
  value.replace(
    /&(#(?:x[0-9a-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/gi,
    (entity, token: string) => {
      const normalized = token.toLowerCase();
      if (normalized === "amp") return "&";
      if (normalized === "lt") return "<";
      if (normalized === "gt") return ">";
      if (normalized === "quot") return '"';
      if (normalized === "apos") return "'";
      if (normalized === "nbsp") return " ";
      const radix = normalized.startsWith("#x") ? 16 : 10;
      const number = Number.parseInt(normalized.slice(radix === 16 ? 2 : 1), radix);
      return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
    },
  );

const plainText = (value: string) =>
  decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\\[nr]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const numberFromText = (value: string) => {
  const number = Number(value.replaceAll(",", "").replace("%", "").trim());
  return Number.isFinite(number) ? number : null;
};

const sourcePageUrl = (code: string) =>
  `https://fundf10.eastmoney.com/ccmx_${code}.html`;

const sourceDataUrl = (code: string, year: number) =>
  `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${code}&topline=10&year=${year}&month=`;

/**
 * Parses the public FundArchivesDatas response. The response wraps an HTML
 * table in JavaScript, so this parser deliberately reads only text from the
 * expected table cells and never evaluates the returned script.
 */
export function parseEastmoneyFundHoldings(
  responseText: string,
  fundCodeInput: string,
  fetchedAt = new Date().toISOString(),
  dataUrl = "",
): FundHoldingsDisclosure | null {
  const fundCode = fundCodeInput.trim();
  if (!/^\d{6}$/.test(fundCode)) return null;

  const reportMatch = responseText.match(
    /(\d{4})年\s*([1-4])\s*季度股票投资明细/i,
  );
  const reportDate = responseText.match(
    /截止至[：:]\s*(?:<[^>]+>\s*)*(\d{4}-\d{2}-\d{2})/i,
  )?.[1];
  const fundNameHtml = responseText.match(
    new RegExp(
      `<a\\b[^>]*href=['"](?:https?:)?//fund\\.eastmoney\\.com/${fundCode}\\.html(?:\\?[^'"]*)?['"][^>]*>([\\s\\S]*?)<\\/a>`,
      "i",
    ),
  )?.[1];
  const fundName = plainText(fundNameHtml ?? "");
  if (!reportMatch || !reportDate || !fundName) return null;

  const tableBody = responseText.match(
    /<table\b[^>]*\btzxq\b[^>]*>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i,
  )?.[1];
  if (!tableBody) return null;

  const holdings: DisclosedFundHolding[] = [];
  for (const rowMatch of tableBody.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [
      ...rowMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi),
    ].map((cell) => plainText(cell[1]));
    if (cells.length < 6) continue;

    const rank = Number.parseInt(cells[0], 10);
    const stockCode = cells[1].replace(/\s+/g, "").toUpperCase();
    const stockName = cells[2];
    const weight = numberFromText(cells.at(-3) ?? "");
    if (
      !Number.isInteger(rank) ||
      rank <= 0 ||
      !stockCode ||
      !stockName ||
      weight === null ||
      weight < 0
    )
      continue;

    holdings.push({
      rank,
      stockCode,
      stockName,
      weightBps: Math.round(weight * 100),
      weightPercent: weight,
      sharesTenThousand: numberFromText(cells.at(-2) ?? ""),
      marketValueTenThousandCny: numberFromText(cells.at(-1) ?? ""),
    });
  }
  if (!holdings.length) return null;

  return {
    fundCode,
    fundName,
    reportPeriod: `${reportMatch[1]}年第${reportMatch[2]}季度`,
    reportDate,
    // FundArchivesDatas exposes the report-period cutoff, but not the actual
    // publication day. Keep it null instead of presenting a guessed date.
    disclosureDate: null,
    disclosureDateAvailable: false,
    isQuarterlyDisclosure: true,
    holdings: holdings.sort((a, b) => a.rank - b.rank),
    disclosedTopHoldingsWeightBps: holdings.reduce(
      (sum, holding) => sum + holding.weightBps,
      0,
    ),
    source: {
      name: FUND_HOLDINGS_SOURCE,
      url: sourcePageUrl(fundCode),
      dataUrl: dataUrl || sourceDataUrl(fundCode, Number(reportMatch[1])),
      announcementUrl: null,
      isFundManagerOfficial: false,
      note: SOURCE_NOTE,
    },
    fetchedAt,
  };
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: requestHeaders,
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`基金持仓数据源返回 HTTP ${response.status}`);
  return response.text();
}

export interface FundDisclosureAnnouncement {
  disclosureDate: string;
  title: string;
  url: string;
}

/** Matches the holdings report period to the corresponding public notice. */
export function parseEastmoneyFundAnnouncement(
  responseText: string,
  fundCode: string,
  reportPeriod: string,
): FundDisclosureAnnouncement | null {
  let value: unknown;
  try {
    value = JSON.parse(responseText);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const data = (value as { Data?: unknown }).Data;
  if (!Array.isArray(data)) return null;
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = typeof row.TITLE === "string" ? row.TITLE : "";
    const disclosureDate =
      typeof row.PUBLISHDATEDesc === "string" ? row.PUBLISHDATEDesc : "";
    const id = typeof row.ID === "string" ? row.ID : "";
    if (
      title.includes(`${reportPeriod}报告`) &&
      /^\d{4}-\d{2}-\d{2}$/.test(disclosureDate) &&
      /^AN\d+$/.test(id)
    )
      return {
        disclosureDate,
        title,
        url: `https://fund.eastmoney.com/gonggao/${fundCode},${id}.html`,
      };
  }
  return null;
}

async function fetchDisclosureAnnouncement(
  fundCode: string,
  reportPeriod: string,
) {
  const url = `https://api.fund.eastmoney.com/f10/JJGG?fundcode=${fundCode}&pageIndex=1&pageSize=20&type=3`;
  try {
    const text = await fetchText(url);
    return parseEastmoneyFundAnnouncement(text, fundCode, reportPeriod);
  } catch {
    return null;
  }
}

/**
 * Fetches the latest available quarterly stock holdings disclosure. A current
 * year request is attempted first and the previous year is used only when a
 * new-year report has not yet been published.
 */
export async function fetchFundHoldings(
  fundCodeInput: string,
): Promise<FundHoldingsDisclosure> {
  const fundCode = fundCodeInput.trim();
  if (!/^\d{6}$/.test(fundCode)) throw new Error("基金代码必须是 6 位数字");

  const currentYear = new Date().getUTCFullYear();
  let lastError: unknown = null;
  for (const year of [currentYear, currentYear - 1]) {
    const dataUrl = sourceDataUrl(fundCode, year);
    try {
      const text = await fetchText(dataUrl);
      const parsed = parseEastmoneyFundHoldings(
        text,
        fundCode,
        new Date().toISOString(),
        dataUrl,
      );
      if (parsed) {
        const announcement = await fetchDisclosureAnnouncement(
          fundCode,
          parsed.reportPeriod,
        );
        if (announcement) {
          parsed.disclosureDate = announcement.disclosureDate;
          parsed.disclosureDateAvailable = true;
          parsed.source.announcementUrl = announcement.url;
        }
        return parsed;
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof Error && /HTTP 404/.test(lastError.message))
    throw new Error("未查到该基金公开持仓披露");
  throw new Error("暂未查到该基金可用的季度持仓披露");
}

const roundedBps = (value: number) => Math.round(value * 100) / 100;

const equalFundWeights = (funds: FundHoldingsDisclosure[]) => {
  const base = Math.floor(10_000 / funds.length);
  const remainder = 10_000 - base * funds.length;
  return Object.fromEntries(
    funds.map((fund, index) => [
      fund.fundCode,
      base + (index < remainder ? 1 : 0),
    ]),
  );
};

/**
 * Estimates portfolio-level underlying exposures from disclosed fund weights.
 * This remains a partial look-through because periodic reports usually expose
 * only the largest holdings.
 */
export function aggregateFundLookthrough(
  funds: FundHoldingsDisclosure[],
  providedWeightsBps?: Readonly<Record<string, number>>,
): FundLookthrough {
  if (!funds.length)
    return {
      weightMode: providedWeightsBps ? "PROVIDED" : "EQUAL",
      fundWeights: [],
      holdings: [],
      overlaps: [],
      disclosedCoverageBps: 0,
      disclosedCoveragePercent: 0,
      notice: FUND_HOLDINGS_DISCLOSURE_NOTICE,
    };

  const weights = providedWeightsBps ?? equalFundWeights(funds);
  const fundWeights = funds.map((fund) => {
    const weightBps = weights[fund.fundCode] ?? 0;
    if (!Number.isFinite(weightBps) || weightBps < 0 || weightBps > 10_000)
      throw new Error(`基金 ${fund.fundCode} 的组合权重无效`);
    return { fundCode: fund.fundCode, fundName: fund.fundName, weightBps };
  });
  const totalFundWeight = fundWeights.reduce(
    (sum, fund) => sum + fund.weightBps,
    0,
  );
  if (totalFundWeight > 10_000)
    throw new Error("所选基金的组合权重合计不能超过 10000 bps");

  const grouped = new Map<
    string,
    {
      stockCode: string;
      stockName: string;
      estimatedPortfolioWeightBps: number;
      exposures: LookthroughExposure[];
    }
  >();
  for (const fund of funds) {
    const fundWeightBps = weights[fund.fundCode] ?? 0;
    for (const holding of fund.holdings) {
      const key = holding.stockCode
        ? `CODE:${holding.stockCode.toUpperCase()}`
        : `NAME:${holding.stockName}`;
      const contribution =
        (fundWeightBps * holding.weightBps) / 10_000;
      const entry = grouped.get(key) ?? {
        stockCode: holding.stockCode,
        stockName: holding.stockName,
        estimatedPortfolioWeightBps: 0,
        exposures: [],
      };
      entry.estimatedPortfolioWeightBps += contribution;
      entry.exposures.push({
        fundCode: fund.fundCode,
        fundName: fund.fundName,
        fundWeightBps,
        holdingWeightBps: holding.weightBps,
        estimatedPortfolioWeightBps: roundedBps(contribution),
      });
      grouped.set(key, entry);
    }
  }

  const holdings = [...grouped.values()]
    .map((holding): AggregatedUnderlyingHolding => {
      const estimatedPortfolioWeightBps = roundedBps(
        holding.estimatedPortfolioWeightBps,
      );
      const fundCount = new Set(
        holding.exposures.map((exposure) => exposure.fundCode),
      ).size;
      return {
        ...holding,
        estimatedPortfolioWeightBps,
        estimatedPortfolioWeightPercent: roundedBps(
          estimatedPortfolioWeightBps / 100,
        ),
        fundCount,
        isOverlap: fundCount > 1,
        exposures: holding.exposures.sort(
          (a, b) =>
            b.estimatedPortfolioWeightBps - a.estimatedPortfolioWeightBps,
        ),
      };
    })
    .sort(
      (a, b) =>
        b.estimatedPortfolioWeightBps - a.estimatedPortfolioWeightBps ||
        a.stockCode.localeCompare(b.stockCode),
    );
  const disclosedCoverageBps = roundedBps(
    holdings.reduce(
      (sum, holding) => sum + holding.estimatedPortfolioWeightBps,
      0,
    ),
  );
  return {
    weightMode: providedWeightsBps ? "PROVIDED" : "EQUAL",
    fundWeights,
    holdings,
    overlaps: holdings.filter((holding) => holding.isOverlap),
    disclosedCoverageBps,
    disclosedCoveragePercent: roundedBps(disclosedCoverageBps / 100),
    notice: FUND_HOLDINGS_DISCLOSURE_NOTICE,
  };
}
