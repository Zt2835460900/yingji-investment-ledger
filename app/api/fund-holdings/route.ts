import {
  aggregateFundLookthrough,
  fetchFundHoldings,
  FUND_HOLDINGS_DISCLOSURE_NOTICE,
} from "@/lib/fund-holdings";

export const dynamic = "force-dynamic";

const MAX_FUNDS = 10;

const badRequest = (message: string) =>
  Response.json({ error: message }, { status: 400 });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawCodes = params.get("codes")?.trim() ?? "";
  if (!rawCodes) return badRequest("请提供 codes 参数");

  const codes = rawCodes.split(",").map((code) => code.trim());
  if (codes.length > MAX_FUNDS)
    return badRequest(`一次最多查询 ${MAX_FUNDS} 只基金`);
  if (codes.some((code) => !/^\d{6}$/.test(code)))
    return badRequest("基金代码必须是 6 位数字，并使用英文逗号分隔");
  if (new Set(codes).size !== codes.length)
    return badRequest("codes 中不能包含重复基金代码");

  const rawWeights = params.get("weights")?.trim() ?? "";
  let providedWeights: Record<string, number> | undefined;
  if (rawWeights) {
    const tokens = rawWeights.split(",").map((weight) => weight.trim());
    if (tokens.length !== codes.length)
      return badRequest("weights 必须与 codes 一一对应");
    if (tokens.some((weight) => !/^\d{1,5}$/.test(weight)))
      return badRequest("weights 必须使用 0 至 10000 的整数 bps");
    const weights = tokens.map(Number);
    if (weights.some((weight) => weight < 0 || weight > 10_000))
      return badRequest("单只基金权重必须在 0 至 10000 bps 之间");
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (total <= 0 || total > 10_000)
      return badRequest("基金权重合计必须大于 0 且不超过 10000 bps");
    providedWeights = Object.fromEntries(
      codes.map((code, index) => [code, weights[index]]),
    );
  }

  const results = await Promise.allSettled(codes.map(fetchFundHoldings));
  const funds = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const errors = results.flatMap((result, index) =>
    result.status === "rejected"
      ? [
          {
            fundCode: codes[index],
            message:
              result.reason instanceof Error
                ? result.reason.message
                : "基金持仓披露查询失败",
          },
        ]
      : [],
  );
  if (!funds.length)
    return Response.json(
      {
        error: "所选基金暂时都没有可用的公开持仓披露",
        errors,
        notice: FUND_HOLDINGS_DISCLOSURE_NOTICE,
      },
      { status: 502 },
    );

  const usableWeights = providedWeights
    ? Object.fromEntries(
        funds.map((fund) => [fund.fundCode, providedWeights[fund.fundCode] ?? 0]),
      )
    : undefined;
  const lookthrough = aggregateFundLookthrough(funds, usableWeights);
  return Response.json(
    {
      generatedAt: new Date().toISOString(),
      isQuarterlyDisclosure: true,
      notice: FUND_HOLDINGS_DISCLOSURE_NOTICE,
      funds,
      errors,
      lookthrough,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=900, stale-while-revalidate=3600",
      },
    },
  );
}
