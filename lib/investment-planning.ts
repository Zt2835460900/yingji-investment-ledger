import type { FundNavPoint } from "./fund-data";

export interface TopUpHolding {
  instrumentId: number;
  name: string;
  currentValue: number;
  targetBps: number;
}

export interface TopUpSuggestion {
  instrumentId: number;
  name: string;
  currentValue: number;
  targetRate: number;
  currentRate: number;
  suggestedAmount: number;
  projectedValue: number;
  projectedRate: number;
}

export interface BuyOnlyTopUpPlan {
  requestedAmount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  reservedCashAmount: number;
  projectedCashAmount: number;
  currentTotal: number;
  projectedTotal: number;
  suggestions: TopUpSuggestion[];
}

export interface BuyOnlyTopUpOptions {
  currentCash?: number;
  cashTargetBps?: number;
}

const finiteNonNegative = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

const moneyToCents = (value: number) =>
  Math.max(0, Math.round(finiteNonNegative(value) * 100));

/**
 * Produce a buy-only contribution plan. Existing positions are never sold.
 * The new money is split in proportion to each underweight product's target
 * deficit, then rounded with the largest-remainder method so no cent is lost.
 */
export function calculateBuyOnlyTopUp(
  holdings: TopUpHolding[],
  contribution: number,
  options: BuyOnlyTopUpOptions = {},
): BuyOnlyTopUpPlan {
  const requestedCents = moneyToCents(contribution);
  const currentCashCents = moneyToCents(options.currentCash ?? 0);
  const currentSecuritiesCents = holdings.reduce(
    (sum, holding) => sum + moneyToCents(holding.currentValue),
    0,
  );
  const currentTotalCents = currentSecuritiesCents + currentCashCents;
  const projectedTotalCents = currentTotalCents + requestedCents;
  const validTargets = holdings
    .map((holding, index) => ({
      ...holding,
      index,
      currentCents: moneyToCents(holding.currentValue),
      targetBps: finiteNonNegative(holding.targetBps),
    }))
    .filter((holding) => holding.targetBps > 0);
  const targetTotal = validTargets.reduce(
    (sum, holding) => sum + holding.targetBps,
    0,
  );
  const cashTargetBps = Math.min(
    10_000,
    finiteNonNegative(options.cashTargetBps ?? 0),
  );
  const targetScale = targetTotal + cashTargetBps;
  const targetCashCents = targetScale
    ? Math.round((projectedTotalCents * cashTargetBps) / targetScale)
    : 0;
  const reservedCashCents = Math.min(
    requestedCents,
    Math.max(0, targetCashCents - currentCashCents),
  );
  const investableCents = requestedCents - reservedCashCents;

  if (!validTargets.length || targetTotal <= 0) {
    return {
      requestedAmount: requestedCents / 100,
      allocatedAmount: 0,
      unallocatedAmount: requestedCents / 100,
      reservedCashAmount: reservedCashCents / 100,
      projectedCashAmount: (currentCashCents + requestedCents) / 100,
      currentTotal: currentTotalCents / 100,
      projectedTotal: projectedTotalCents / 100,
      suggestions: [],
    };
  }

  const candidates = validTargets.map((holding) => {
    const targetRate = holding.targetBps / targetScale;
    return {
      ...holding,
      targetRate,
      deficit: Math.max(
        0,
        projectedTotalCents * targetRate - holding.currentCents,
      ),
    };
  });
  const totalDeficit = candidates.reduce(
    (sum, holding) => sum + holding.deficit,
    0,
  );

  // Never buy beyond the current target deficits merely to spend the full
  // contribution. Any remainder stays as cash.
  const allocationCents = Math.min(
    investableCents,
    Math.max(0, Math.round(totalDeficit)),
  );

  const rounded = candidates.map((holding) => {
    const exact =
      allocationCents > 0 && totalDeficit > 0
        ? (allocationCents * holding.deficit) / totalDeficit
        : 0;
    const cents = Math.floor(exact);
    return { ...holding, exact, cents, remainder: exact - cents };
  });
  let centsLeft =
    allocationCents - rounded.reduce((sum, holding) => sum + holding.cents, 0);
  const remainderOrder = [...rounded].sort(
    (a, b) => b.remainder - a.remainder || a.index - b.index,
  );
  for (let index = 0; centsLeft > 0; index += 1, centsLeft -= 1)
    remainderOrder[index % remainderOrder.length].cents += 1;

  const suggestions = rounded
    .map((holding) => {
      const suggestedAmount = holding.cents / 100;
      const projectedValue = (holding.currentCents + holding.cents) / 100;
      return {
        instrumentId: holding.instrumentId,
        name: holding.name,
        currentValue: holding.currentCents / 100,
        targetRate: holding.targetRate,
        currentRate: currentTotalCents
          ? holding.currentCents / currentTotalCents
          : 0,
        suggestedAmount,
        projectedValue,
        projectedRate: projectedTotalCents
          ? (holding.currentCents + holding.cents) / projectedTotalCents
          : holding.targetRate,
      };
    })
    .sort(
      (a, b) =>
        b.suggestedAmount - a.suggestedAmount ||
        a.instrumentId - b.instrumentId,
    );
  const allocatedCents = suggestions.reduce(
    (sum, holding) => sum + moneyToCents(holding.suggestedAmount),
    0,
  );

  return {
    requestedAmount: requestedCents / 100,
    allocatedAmount: allocatedCents / 100,
    unallocatedAmount: (requestedCents - allocatedCents) / 100,
    reservedCashAmount: reservedCashCents / 100,
    projectedCashAmount:
      (currentCashCents + requestedCents - allocatedCents) / 100,
    currentTotal: currentTotalCents / 100,
    projectedTotal: projectedTotalCents / 100,
    suggestions,
  };
}

export interface InvestmentSimulationOptions {
  monthlyAmount: number;
  months?: number;
  startDate?: string;
  endDate?: string;
  purchaseFeeRate?: number;
}

export interface SimulatedPurchase {
  date: string;
  nav: number;
  amount: number;
  purchaseFee: number;
  shares: number;
}

export interface SimulatedStrategyResult {
  invested: number;
  finalValue: number;
  profit: number;
  returnRate: number;
  shares: number;
  maxDrawdown: number;
}

export interface DcaComparisonResult {
  historyStartDate: string;
  availableMonths: number;
  availableYears: number;
  requestedMonths: number;
  limitedByHistory: boolean;
  startDate: string;
  endDate: string;
  finalNav: number;
  executionCount: number;
  feesIncluded: boolean;
  purchaseFeeRate: number;
  totalPurchaseFees: number;
  methodology: string;
  purchases: SimulatedPurchase[];
  curve: Array<{
    date: string;
    invested: number;
    dcaValue: number;
    lumpSumValue: number;
    nav: number;
  }>;
  dca: SimulatedStrategyResult;
  lumpSum: SimulatedStrategyResult;
}

function normalizedNavPoints(
  points: Array<FundNavPoint & { totalReturnNav?: number }>,
) {
  const byDate = new Map<string, number>();
  for (const point of points) {
    const nav = point.totalReturnNav ?? point.nav;
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(point.date) &&
      Number.isFinite(nav) &&
      nav > 0
    )
      byDate.set(point.date, nav);
  }
  return [...byDate.entries()]
    .map(([date, nav]) => ({ date, nav }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface HistoricalReturnEstimate {
  startDate: string;
  endDate: string;
  historyYears: number;
  baseRate: number;
  conservativeRate: number;
  optimisticRate: number;
  annualizedVolatility: number;
  cagrSamples: number;
  methodology: string;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

/**
 * Estimate a deliberately conservative future-return range from the fund's
 * total-return NAV. The median of available 1/3/5/10-year CAGRs is less
 * sensitive to a single unusually strong start date than one full-period CAGR.
 */
export function estimateHistoricalAnnualReturn(
  navPoints: Array<FundNavPoint & { totalReturnNav?: number }>,
): HistoricalReturnEstimate {
  const points = normalizedNavPoints(navPoints);
  if (points.length < 2) throw new Error("历史净值数据不足");
  const first = points[0];
  const last = points.at(-1)!;
  const historyDays =
    (Date.parse(`${last.date}T00:00:00Z`) -
      Date.parse(`${first.date}T00:00:00Z`)) /
    86_400_000;
  if (historyDays < 330) throw new Error("至少需要约 1 年历史净值才能估算");

  const cagrs: number[] = [];
  for (const years of [1, 3, 5, 10]) {
    if (historyDays < years * 365.25 * 0.9) continue;
    const targetTime =
      Date.parse(`${last.date}T00:00:00Z`) - years * 365.25 * 86_400_000;
    const start = points.find(
      (point) => Date.parse(`${point.date}T00:00:00Z`) >= targetTime,
    );
    if (!start || start.date >= last.date) continue;
    const elapsedDays =
      (Date.parse(`${last.date}T00:00:00Z`) -
        Date.parse(`${start.date}T00:00:00Z`)) /
      86_400_000;
    cagrs.push(Math.pow(last.nav / start.nav, 365.25 / elapsedDays) - 1);
  }
  if (!cagrs.length) throw new Error("历史净值跨度不足以估算年化收益");
  const sortedCagrs = [...cagrs].sort((a, b) => a - b);
  const middle = Math.floor(sortedCagrs.length / 2);
  const medianCagr =
    sortedCagrs.length % 2
      ? sortedCagrs[middle]
      : (sortedCagrs[middle - 1] + sortedCagrs[middle]) / 2;

  const lastByMonth = new Map<string, { date: string; nav: number }>();
  for (const point of points) lastByMonth.set(point.date.slice(0, 7), point);
  const monthlyPoints = [...lastByMonth.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const monthlyReturns = monthlyPoints
    .slice(1)
    .map((point, index) => point.nav / monthlyPoints[index].nav - 1)
    .filter(Number.isFinite);
  const average =
    monthlyReturns.reduce((sum, value) => sum + value, 0) /
    Math.max(1, monthlyReturns.length);
  const variance =
    monthlyReturns.reduce(
      (sum, value) => sum + Math.pow(value - average, 2),
      0,
    ) / Math.max(1, monthlyReturns.length - 1);
  const annualizedVolatility = Math.sqrt(variance) * Math.sqrt(12);
  const baseRate = clamp(medianCagr, -0.25, 0.3);
  const uncertainty = clamp(annualizedVolatility * 0.35, 0.025, 0.1);

  return {
    startDate: first.date,
    endDate: last.date,
    historyYears: historyDays / 365.25,
    baseRate,
    conservativeRate: clamp(baseRate - uncertainty, -0.4, 0.45),
    optimisticRate: clamp(baseRate + uncertainty, -0.4, 0.45),
    annualizedVolatility,
    cagrSamples: cagrs.length,
    methodology:
      "基于含现金分红再投资的总回报净值，取可用 1/3/5/10 年年化收益中位数，并按历史月度波动率生成保守与乐观区间。",
  };
}

function monthIndex(date: string) {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}

function maximumNavDrawdown(points: FundNavPoint[]) {
  let peak = 0;
  let maxDrawdown = 0;
  for (const point of points) {
    peak = Math.max(peak, point.nav);
    if (peak > 0) maxDrawdown = Math.min(maxDrawdown, point.nav / peak - 1);
  }
  return maxDrawdown;
}

function strategyResult(
  invested: number,
  shares: number,
  finalNav: number,
  maxDrawdown: number,
): SimulatedStrategyResult {
  const finalValue = shares * finalNav;
  const profit = finalValue - invested;
  return {
    invested,
    finalValue,
    profit,
    returnRate: invested > 0 ? profit / invested : 0,
    shares,
    maxDrawdown,
  };
}

/**
 * Compare investing once on the first available date with investing the same
 * total amount on the first available NAV of every month. A configured
 * purchase fee is deducted from investable cash; redemption fees, taxes and
 * subscription limits remain excluded.
 */
export function simulateDcaVsLumpSum(
  navPoints: Array<FundNavPoint & { totalReturnNav?: number }>,
  options: InvestmentSimulationOptions,
): DcaComparisonResult {
  const monthlyCents = moneyToCents(options.monthlyAmount);
  if (monthlyCents <= 0) throw new Error("每月投入金额必须大于 0");
  if (options.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(options.startDate))
    throw new Error("开始日期格式不正确");
  if (options.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(options.endDate))
    throw new Error("结束日期格式不正确");

  let points = normalizedNavPoints(navPoints).filter(
    (point) =>
      (!options.startDate || point.date >= options.startDate) &&
      (!options.endDate || point.date <= options.endDate),
  );
  if (!points.length) throw new Error("所选期间没有可用净值");

  const purchaseFeeRate = options.purchaseFeeRate ?? 0;
  if (
    !Number.isFinite(purchaseFeeRate) ||
    purchaseFeeRate < 0 ||
    purchaseFeeRate >= 1
  )
    throw new Error("申购费率必须在 0%（含）至 100%（不含）之间");

  const historyStartDate = points[0].date;
  const availableMonths = new Set(points.map((point) => point.date.slice(0, 7)))
    .size;
  const availableYears = availableMonths / 12;
  let requestedMonths = availableMonths;
  let limitedByHistory = false;

  if (options.months !== undefined) {
    const months = Math.floor(options.months);
    if (!Number.isFinite(months) || months <= 0)
      throw new Error("模拟月数必须大于 0");
    requestedMonths = months;
    limitedByHistory = months > availableMonths;
    const firstMonth = monthIndex(points.at(-1)!.date) - months + 1;
    points = points.filter((point) => monthIndex(point.date) >= firstMonth);
  }
  if (!points.length) throw new Error("所选期间没有可用净值");

  const firstByMonth = new Map<string, FundNavPoint>();
  for (const point of points) {
    const month = point.date.slice(0, 7);
    if (!firstByMonth.has(month)) firstByMonth.set(month, point);
  }
  const amount = monthlyCents / 100;
  const purchases = [...firstByMonth.values()].map((point) => ({
    ...point,
    amount,
    purchaseFee: amount * purchaseFeeRate,
    shares: (amount * (1 - purchaseFeeRate)) / point.nav,
  }));
  if (!purchases.length) throw new Error("所选期间没有可执行的定投日");

  const invested = amount * purchases.length;
  const dcaShares = purchases.reduce(
    (sum, purchase) => sum + purchase.shares,
    0,
  );
  const lumpSumShares = (invested * (1 - purchaseFeeRate)) / purchases[0].nav;
  const finalPoint = points.at(-1)!;
  const drawdownPoints = points.filter(
    (point) => point.date >= purchases[0].date,
  );
  const maxDrawdown = maximumNavDrawdown(drawdownPoints);
  const lastByMonth = new Map<string, FundNavPoint>();
  for (const point of points) lastByMonth.set(point.date.slice(0, 7), point);
  let accumulatedShares = 0;
  let accumulatedInvestment = 0;
  const curve = purchases.map((purchase) => {
    accumulatedShares += purchase.shares;
    accumulatedInvestment += purchase.amount;
    const valuationPoint = lastByMonth.get(purchase.date.slice(0, 7))!;
    return {
      date: valuationPoint.date,
      invested: accumulatedInvestment,
      dcaValue: accumulatedShares * valuationPoint.nav,
      lumpSumValue: lumpSumShares * valuationPoint.nav,
      nav: valuationPoint.nav,
    };
  });

  return {
    historyStartDate,
    availableMonths,
    availableYears,
    requestedMonths,
    limitedByHistory,
    startDate: purchases[0].date,
    endDate: finalPoint.date,
    finalNav: finalPoint.nav,
    executionCount: purchases.length,
    feesIncluded: purchaseFeeRate > 0,
    purchaseFeeRate,
    totalPurchaseFees: invested * purchaseFeeRate,
    methodology:
      "每月首个可用净值执行定投；一次性投入在首个执行日投入相同总本金；已按产品申购费率扣除可购份额，未计赎回费和税费；最大回撤按期间基金总回报净值路径计算。",
    purchases,
    curve,
    dca: strategyResult(invested, dcaShares, finalPoint.nav, maxDrawdown),
    lumpSum: strategyResult(
      invested,
      lumpSumShares,
      finalPoint.nav,
      maxDrawdown,
    ),
  };
}

export interface LongTermDcaOptions {
  monthlyAmount: number;
  years: number;
  annualReturn: number;
  annualFeeRate?: number;
  initialAmount?: number;
  purchaseFeeRate?: number;
}

export interface LongTermDcaYearPoint {
  year: number;
  principal: number;
  assets: number;
  profit: number;
  returnRate: number;
}

export interface LongTermDcaProjection {
  monthlyAmount: number;
  years: number;
  annualReturn: number;
  annualFeeRate: number;
  initialAmount: number;
  purchaseFeeRate: number;
  totalPurchaseFees: number;
  netAnnualRate: number;
  monthlyRate: number;
  principal: number;
  finalValue: number;
  profit: number;
  returnRate: number;
  methodology: string;
  curve: LongTermDcaYearPoint[];
}

/**
 * Project a long-term monthly investment with an effective annual return.
 * Growth is applied first each month and the contribution is made at month
 * end, so a newly added contribution begins earning a return next month.
 */
export function projectLongTermDca(
  options: LongTermDcaOptions,
): LongTermDcaProjection {
  if (!Number.isFinite(options.monthlyAmount) || options.monthlyAmount <= 0)
    throw new Error("每月投入金额必须大于 0");
  if (
    !Number.isInteger(options.years) ||
    options.years < 1 ||
    options.years > 30
  )
    throw new Error("测算年限必须为 1 至 30 年的整数");
  if (
    !Number.isFinite(options.annualReturn) ||
    options.annualReturn <= -1 ||
    options.annualReturn > 1
  )
    throw new Error("年化收益率必须大于 -100% 且不超过 100%");

  const annualFeeRate = options.annualFeeRate ?? 0;
  if (
    !Number.isFinite(annualFeeRate) ||
    annualFeeRate < 0 ||
    annualFeeRate >= 1
  )
    throw new Error("年度费率必须在 0%（含）至 100%（不含）之间");
  const initialAmount = options.initialAmount ?? 0;
  if (!Number.isFinite(initialAmount) || initialAmount < 0)
    throw new Error("初始投入不能为负数");
  const purchaseFeeRate = options.purchaseFeeRate ?? 0;
  if (
    !Number.isFinite(purchaseFeeRate) ||
    purchaseFeeRate < 0 ||
    purchaseFeeRate >= 1
  )
    throw new Error("申购费率必须在 0%（含）至 100%（不含）之间");

  const monthlyAmount = moneyToCents(options.monthlyAmount) / 100;
  const roundedInitialAmount = moneyToCents(initialAmount) / 100;
  const annualGrowthFactor = (1 + options.annualReturn) * (1 - annualFeeRate);
  const netAnnualRate = annualGrowthFactor - 1;
  const monthlyGrowthFactor = Math.pow(annualGrowthFactor, 1 / 12);
  const monthlyRate = monthlyGrowthFactor - 1;
  let principal = roundedInitialAmount;
  let assets = roundedInitialAmount * (1 - purchaseFeeRate);
  const curve: LongTermDcaYearPoint[] = [];

  for (let month = 1; month <= options.years * 12; month += 1) {
    assets *= monthlyGrowthFactor;
    assets += monthlyAmount * (1 - purchaseFeeRate);
    principal += monthlyAmount;
    if (month % 12 === 0) {
      const profit = assets - principal;
      curve.push({
        year: month / 12,
        principal,
        assets,
        profit,
        returnRate: principal > 0 ? profit / principal : 0,
      });
    }
  }

  const profit = assets - principal;
  return {
    monthlyAmount,
    years: options.years,
    annualReturn: options.annualReturn,
    annualFeeRate,
    initialAmount: roundedInitialAmount,
    purchaseFeeRate,
    totalPurchaseFees: principal * purchaseFeeRate,
    netAnnualRate,
    monthlyRate,
    principal,
    finalValue: assets,
    profit,
    returnRate: principal > 0 ? profit / principal : 0,
    methodology:
      "按有效年化收益率折算月收益率，先计当月收益、再于月末投入；每次投入先扣产品申购费，年度费率按年度增长因子扣除；结果为历史统计情景，不代表未来收益。",
    curve,
  };
}
