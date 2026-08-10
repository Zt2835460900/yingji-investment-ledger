import {
  applyFundIndexCalibration,
  calibrateFundToIndex,
  fetchFundDailyReturns,
  fetchIndexHistory,
  fetchIndexQuote,
  resolveTrackedIndex,
  type TrackedIndexKey,
} from "@/lib/index-insights";

export const dynamic = "force-dynamic";

const MAX_FUNDS = 12;

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const names = (params.get("names") ?? "")
      .split("|")
      .map((name) => name.trim())
      .filter(Boolean);
    const weights = (params.get("weights") ?? "")
      .split(",")
      .map((weight) => Number(weight));
    const codes = (params.get("codes") ?? "")
      .split(",")
      .map((code) => code.trim())
      .filter(Boolean);
    if (!names.length) throw new Error("请提供需要识别指数的基金");
    if (names.length > MAX_FUNDS)
      throw new Error(`一次最多识别 ${MAX_FUNDS} 只基金`);
    if (weights.length !== names.length || codes.length !== names.length)
      throw new Error("基金、代码与组合权重必须一一对应");
    if (codes.some((code) => !/^\d{6}$/.test(code)))
      throw new Error("基金代码格式不正确");
    if (
      weights.some(
        (weight) => !Number.isInteger(weight) || weight < 0 || weight > 10_000,
      )
    )
      throw new Error("基金组合权重不正确");

    const unmatchedFunds: string[] = [];
    const identifiedFunds = names.flatMap((name, index) => {
      const trackedIndex = resolveTrackedIndex(name);
      if (!trackedIndex) {
        unmatchedFunds.push(name.slice(0, 120));
        return [];
      }
      return [
        {
          fundName: name.slice(0, 120),
          fundCode: codes[index],
          weightBps: weights[index],
          trackedIndex,
        },
      ];
    });
    const indexKeys = [
      ...new Set(identifiedFunds.map((fund) => fund.trackedIndex.key)),
    ];
    const indexData = new Map<
      TrackedIndexKey,
      {
        quote: Awaited<ReturnType<typeof fetchIndexQuote>> | null;
        history: Awaited<ReturnType<typeof fetchIndexHistory>>;
        error: string;
      }
    >();
    await Promise.all(
      indexKeys.map(async (key) => {
        const [quoteResult, historyResult] = await Promise.allSettled([
          fetchIndexQuote(key),
          fetchIndexHistory(key),
        ]);
        indexData.set(key, {
          quote: quoteResult.status === "fulfilled" ? quoteResult.value : null,
          history:
            historyResult.status === "fulfilled" ? historyResult.value : [],
          error: [
            quoteResult.status === "rejected"
              ? quoteResult.reason instanceof Error
                ? quoteResult.reason.message
                : "指数实时行情读取失败"
              : "",
            historyResult.status === "rejected"
              ? historyResult.reason instanceof Error
                ? historyResult.reason.message
                : "指数历史行情读取失败"
              : "",
          ]
            .filter(Boolean)
            .join("；"),
        });
      }),
    );

    const items = await Promise.all(
      identifiedFunds.map(async (fund) => {
        const data = indexData.get(fund.trackedIndex.key);
        const fallback = {
          calibrated: false,
          beta: 1,
          alphaPercent: 0,
          sampleSize: 0,
          rSquared: 0,
          alignment: "SAME_DATE" as const,
        };
        let calibration = fallback;
        let latestNavDate = "";
        let latestActualReturnPercent: number | null = null;
        let calibrationError = "";
        try {
          const history = await fetchFundDailyReturns(fund.fundCode);
          latestNavDate = history.at(-1)?.date ?? "";
          latestActualReturnPercent =
            history.at(-1)?.dailyReturnPercent ?? null;
          calibration = calibrateFundToIndex(history, data?.history ?? []);
        } catch (error) {
          calibrationError =
            error instanceof Error ? error.message : "基金真实净值读取失败";
        }
        const rawIndexChangePercent = data?.quote?.changePercent ?? null;
        const adjustedChangePercent =
          rawIndexChangePercent === null
            ? null
            : applyFundIndexCalibration(rawIndexChangePercent, calibration);
        return {
          fundName: fund.fundName,
          fundCode: fund.fundCode,
          weightBps: fund.weightBps,
          key: fund.trackedIndex.key,
          label: fund.trackedIndex.label,
          symbol: fund.trackedIndex.symbol,
          quote: data?.quote ?? null,
          rawIndexChangePercent,
          adjustedChangePercent,
          calibration,
          latestNavDate,
          latestActualReturnPercent,
          error: [data?.error ?? "", calibrationError]
            .filter(Boolean)
            .join("；"),
        };
      }),
    );
    return Response.json(
      {
        updatedAt: new Date().toISOString(),
        items,
        unmatchedFunds,
        notice:
          "涨跌估算只使用基金明确跟踪的指数，并以该基金真实历史净值收益自动回归校准跟踪系数、平均偏差和时点滞后；个股涨跌不再参与估算。",
      },
      {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=900",
        },
      },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "指数行情读取失败" },
      { status: 400 },
    );
  }
}
