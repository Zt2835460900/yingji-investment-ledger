import {
  fetchCompanyInsight,
  normalizeCompanySymbol,
} from "@/lib/company-insights";

export const dynamic = "force-dynamic";

const MAX_COMPANIES = 15;

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const symbols = (params.get("symbols") ?? "")
      .split(",")
      .map((symbol) => symbol.trim())
      .filter(Boolean);
    const markets = (params.get("markets") ?? "")
      .split(",")
      .map((market) => market.trim())
      .filter(Boolean);
    if (!symbols.length) throw new Error("请提供需要追踪的公司代码");
    if (symbols.length > MAX_COMPANIES)
      throw new Error(`一次最多追踪 ${MAX_COMPANIES} 家公司`);
    if (markets.length && markets.length !== symbols.length)
      throw new Error("公司代码与市场必须一一对应");

    const companies = symbols.map((symbol, index) =>
      normalizeCompanySymbol(symbol, markets[index]),
    );
    const deduplicated = new Map(
      companies.map((company) => [
        `${company.market}:${company.symbol}`,
        company,
      ]),
    );
    if (deduplicated.size !== companies.length)
      throw new Error("公司代码不能重复");

    const items = await Promise.all(
      companies.map((company) =>
        fetchCompanyInsight(company.symbol, company.market),
      ),
    );
    return Response.json(
      {
        updatedAt: new Date().toISOString(),
        items,
        notice:
          "持仓涨跌按基金最近公开披露权重与底层公司行情估算；未披露持仓、汇率、现金、费用及不同市场交易时段会造成偏差。财报日期以公司最终公告为准。",
      },
      {
        headers: {
          "Cache-Control": "private, max-age=900, stale-while-revalidate=3600",
        },
      },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "公司追踪读取失败" },
      { status: 400 },
    );
  }
}
