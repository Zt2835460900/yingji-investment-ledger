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
  /** Calendar day used for each monthly investment; unavailable days use the next published NAV. */
  investmentDay?: number;
  /** Extra cash invested together with the first scheduled contribution. */
  initialAmount?: number;
  /** One-way subscription fee as a decimal, e.g. 0.0015 for 0.15%. */
  buyFeeRate?: number;
}

export interface SimulatedPurchase {
  date: string;
  nav: number;
  /** Cash budget, including the subscription fee. */
  amount: number;
  productAmount: number;
  fee: number;
  shares: number;
}

export interface SimulatedStrategyResult {
  invested: number;
  finalValue: number;
  profit: number;
  returnRate: number;
  shares: number;
  maxDrawdown: number;
  xirr: number | null;
  totalFees: number;
  averageCost: number;
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
  investmentDay: number;
  initialAmount: number;
  buyFeeRate: number;
  feesIncluded: boolean;
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

function monthIndex(date: string) {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}

function strategyResult(options: {
  invested: number;
  shares: number;
  finalNav: number;
  finalDate: string;
  maxDrawdown: number;
  totalFees: number;
  cashflows: Array<{ date: string; amount: number }>;
}) {
  const { invested, shares, finalNav, finalDate, maxDrawdown, totalFees, cashflows } =
    options;
  const finalValue = shares * finalNav;
  const profit = finalValue - invested;
  return {
    invested,
    finalValue,
    profit,
    returnRate: invested > 0 ? profit / invested : 0,
    shares,
    maxDrawdown,
    xirr: calculateCashflowXirr([
      ...cashflows,
      { date: finalDate, amount: finalValue },
    ]),
    totalFees,
    averageCost: shares > 0 ? invested / shares : 0,
  };
}

function xirrValue(
  rate: number,
  cashflows: Array<{ date: string; amount: number }>,
  firstTimestamp: number,
) {
  return cashflows.reduce((sum, cashflow) => {
    const days =
      (Date.parse(`${cashflow.date}T00:00:00Z`) - firstTimestamp) /
      86_400_000;
    return sum + cashflow.amount / Math.pow(1 + rate, days / 365);
  }, 0);
}

/** A bounded Newton/bisection XIRR for simulation cashflows. */
export function calculateCashflowXirr(
  rawCashflows: Array<{ date: string; amount: number }>,
) {
  const cashflows = rawCashflows
    .filter(
      (cashflow) =>
        /^\d{4}-\d{2}-\d{2}$/.test(cashflow.date) &&
        Number.isFinite(cashflow.amount) &&
        cashflow.amount !== 0,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  if (
    cashflows.length < 2 ||
    !cashflows.some((cashflow) => cashflow.amount < 0) ||
    !cashflows.some((cashflow) => cashflow.amount > 0)
  )
    return null;
  const firstTimestamp = Date.parse(`${cashflows[0].date}T00:00:00Z`);
  if (!Number.isFinite(firstTimestamp)) return null;
  let low = -0.9999;
  let high = 10;
  let lowValue = xirrValue(low, cashflows, firstTimestamp);
  let highValue = xirrValue(high, cashflows, firstTimestamp);
  while (lowValue * highValue > 0 && high < 1_000) {
    high *= 2;
    highValue = xirrValue(high, cashflows, firstTimestamp);
  }
  if (lowValue * highValue > 0) return null;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const middle = (low + high) / 2;
    const value = xirrValue(middle, cashflows, firstTimestamp);
    if (Math.abs(value) < 1e-7) return middle;
    if (lowValue * value <= 0) {
      high = middle;
      highValue = value;
    } else {
      low = middle;
      lowValue = value;
    }
  }
  return (low + high) / 2;
}

function strategyMaximumDrawdown(
  points: Array<{ date: string; nav: number }>,
  purchases: SimulatedPurchase[],
) {
  const purchasesByDate = new Map<string, SimulatedPurchase[]>();
  for (const purchase of purchases) {
    const items = purchasesByDate.get(purchase.date) ?? [];
    items.push(purchase);
    purchasesByDate.set(purchase.date, items);
  }
  let shares = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const point of points) {
    for (const purchase of purchasesByDate.get(point.date) ?? [])
      shares += purchase.shares;
    const value = shares * point.nav;
    peak = Math.max(peak, value);
    if (peak > 0) maxDrawdown = Math.min(maxDrawdown, value / peak - 1);
  }
  return maxDrawdown;
}

/**
 * Compare monthly investing on a chosen calendar day with investing the same
 * total cash on the first execution date. Subscription fees are applied to
 * both strategies; taxes and redemption fees are deliberately excluded.
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

  const investmentDay = Math.floor(options.investmentDay ?? 1);
  if (!Number.isFinite(investmentDay) || investmentDay < 1 || investmentDay > 28)
    throw new Error("每月扣款日必须在 1 至 28 日之间");
  const initialAmount = moneyToCents(options.initialAmount ?? 0) / 100;
  if (!Number.isFinite(options.initialAmount ?? 0) || initialAmount < 0)
    throw new Error("首笔投入不能为负数");
  const buyFeeRate = options.buyFeeRate ?? 0;
  if (!Number.isFinite(buyFeeRate) || buyFeeRate < 0 || buyFeeRate >= 1)
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

  const pointsByMonth = new Map<string, Array<{ date: string; nav: number }>>();
  for (const point of points) {
    const month = point.date.slice(0, 7);
    const items = pointsByMonth.get(month) ?? [];
    items.push(point);
    pointsByMonth.set(month, items);
  }
  const amount = monthlyCents / 100;
  const purchases = [...pointsByMonth.values()].map((monthPoints, index) => {
    const selectedPoint =
      monthPoints.find((point) => Number(point.date.slice(8, 10)) >= investmentDay) ??
      monthPoints.at(-1)!;
    const cashAmount = amount + (index === 0 ? initialAmount : 0);
    const fee = cashAmount * buyFeeRate;
    const productAmount = cashAmount - fee;
    return {
      date: selectedPoint.date,
      nav: selectedPoint.nav,
      amount: cashAmount,
      productAmount,
      fee,
      shares: productAmount / selectedPoint.nav,
    };
  });
  if (!purchases.length) throw new Error("所选期间没有可执行的定投日");

  const invested = purchases.reduce((sum, purchase) => sum + purchase.amount, 0);
  const dcaShares = purchases.reduce(
    (sum, purchase) => sum + purchase.shares,
    0,
  );
  const lumpSumFee = invested * buyFeeRate;
  const lumpSumShares = (invested - lumpSumFee) / purchases[0].nav;
  const finalPoint = points.at(-1)!;
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

  const dcaCashflows = purchases.map((purchase) => ({
    date: purchase.date,
    amount: -purchase.amount,
  }));
  const lumpCashflows = [{ date: purchases[0].date, amount: -invested }];
  const dcaMaxDrawdown = strategyMaximumDrawdown(
    points.filter((point) => point.date >= purchases[0].date),
    purchases,
  );
  const lumpMaxDrawdown = strategyMaximumDrawdown(
    points.filter((point) => point.date >= purchases[0].date),
    [
      {
        date: purchases[0].date,
        nav: purchases[0].nav,
        amount: invested,
        productAmount: invested - lumpSumFee,
        fee: lumpSumFee,
        shares: lumpSumShares,
      },
    ],
  );
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
    investmentDay,
    initialAmount,
    buyFeeRate,
    feesIncluded: buyFeeRate > 0,
    methodology:
      `每月 ${investmentDay} 日起的首个可用净值执行定投；首笔可叠加初始投入；一次性投入在首个执行日投入相同现金预算；已计入 ${buyFeeRate > 0 ? "申购费" : "0 申购费"}，未计赎回费和税费；最大回撤按策略逐日市值路径计算。`,
    purchases,
    curve,
    dca: strategyResult({
      invested,
      shares: dcaShares,
      finalNav: finalPoint.nav,
      finalDate: finalPoint.date,
      maxDrawdown: dcaMaxDrawdown,
      totalFees: purchases.reduce((sum, purchase) => sum + purchase.fee, 0),
      cashflows: dcaCashflows,
    }),
    lumpSum: strategyResult({
      invested,
      shares: lumpSumShares,
      finalNav: finalPoint.nav,
      finalDate: finalPoint.date,
      maxDrawdown: lumpMaxDrawdown,
      totalFees: lumpSumFee,
      cashflows: lumpCashflows,
    }),
  };
}

export interface DcaPortfolioComponent {
  instrumentId: number;
  name: string;
  monthlyAmount: number;
  result: DcaComparisonResult;
}

export interface DcaPortfolioComparison {
  components: DcaPortfolioComponent[];
  startDate: string;
  endDate: string;
  executionCount: number;
  dca: SimulatedStrategyResult;
  lumpSum: SimulatedStrategyResult;
  curve: Array<{
    date: string;
    invested: number;
    dcaValue: number;
    lumpSumValue: number;
  }>;
  methodology: string;
}

/**
 * Merge independently simulated fund plans into one transparent portfolio
 * result. Each product keeps its own purchase schedule and fee rule; the
 * combined curve only sums values that were available on each date.
 */
export function combineDcaComparisons(
  rawComponents: DcaPortfolioComponent[],
): DcaPortfolioComparison {
  const components = rawComponents.filter(
    (component) => component.result.executionCount > 0,
  );
  if (!components.length) throw new Error("至少选择一个可回测产品");
  const dates = [
    ...new Set(
      components.flatMap((component) =>
        component.result.curve.map((point) => point.date),
      ),
    ),
  ].sort();
  const cursors = new Array(components.length).fill(0);
  const curve = dates.map((date) => {
    let invested = 0;
    let dcaValue = 0;
    let lumpSumValue = 0;
    components.forEach((component, index) => {
      const points = component.result.curve;
      while (
        cursors[index] + 1 < points.length &&
        points[cursors[index] + 1].date <= date
      )
        cursors[index] += 1;
      const point = points[cursors[index]];
      if (point && point.date <= date) {
        invested += point.invested;
        dcaValue += point.dcaValue;
        lumpSumValue += point.lumpSumValue;
      }
    });
    return { date, invested, dcaValue, lumpSumValue };
  });
  const totalInvested = components.reduce(
    (sum, component) => sum + component.result.dca.invested,
    0,
  );
  const totalDcaValue = components.reduce(
    (sum, component) => sum + component.result.dca.finalValue,
    0,
  );
  const totalLumpValue = components.reduce(
    (sum, component) => sum + component.result.lumpSum.finalValue,
    0,
  );
  const cashflows = components.flatMap((component) => [
    ...component.result.purchases.map((purchase) => ({
      date: purchase.date,
      amount: -purchase.amount,
    })),
    { date: component.result.endDate, amount: component.result.dca.finalValue },
  ]);
  const lumpCashflows = components.flatMap((component) => [
    { date: component.result.startDate, amount: -component.result.lumpSum.invested },
    { date: component.result.endDate, amount: component.result.lumpSum.finalValue },
  ]);
  const maximumDrawdown = (key: "dcaValue" | "lumpSumValue") => {
    let peak = 0;
    let drawdown = 0;
    for (const point of curve) {
      peak = Math.max(peak, point[key]);
      if (peak > 0) drawdown = Math.min(drawdown, point[key] / peak - 1);
    }
    return drawdown;
  };
  const makeResult = (
    finalValue: number,
    drawdown: number,
    flows: Array<{ date: string; amount: number }>,
    totalFees: number,
  ): SimulatedStrategyResult => ({
    invested: totalInvested,
    finalValue,
    profit: finalValue - totalInvested,
    returnRate: totalInvested > 0 ? finalValue / totalInvested - 1 : 0,
    shares: 0,
    maxDrawdown: drawdown,
    xirr: calculateCashflowXirr(flows),
    totalFees,
    averageCost: 0,
  });
  return {
    components,
    startDate: components
      .map((component) => component.result.startDate)
      .sort()[0],
    endDate: components
      .map((component) => component.result.endDate)
      .sort()
      .at(-1)!,
    executionCount: components.reduce(
      (sum, component) => sum + component.result.executionCount,
      0,
    ),
    dca: makeResult(
      totalDcaValue,
      maximumDrawdown("dcaValue"),
      cashflows,
      components.reduce((sum, component) => sum + component.result.dca.totalFees, 0),
    ),
    lumpSum: makeResult(
      totalLumpValue,
      maximumDrawdown("lumpSumValue"),
      lumpCashflows,
      components.reduce((sum, component) => sum + component.result.lumpSum.totalFees, 0),
    ),
    curve,
    methodology:
      "组合内每个产品按各自历史净值、扣款金额和申购费独立回测后汇总；不同产品的可用历史长度可能不同，组合曲线仅汇总当日已经有估值的持仓。",
  };
}

export interface LongTermDcaOptions {
  monthlyAmount: number;
  years: number;
  annualReturn: number;
  annualFeeRate?: number;
  initialAmount?: number;
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
  netAnnualRate: number;
  monthlyRate: number;
  principal: number;
  finalValue: number;
  profit: number;
  returnRate: number;
  methodology: string;
  curve: LongTermDcaYearPoint[];
}

export interface MonthlyContributionGoalOptions {
  targetAmount: number;
  years: number;
  annualReturn: number;
  annualFeeRate?: number;
  initialAmount?: number;
}

export interface MonthlyContributionGoal {
  targetAmount: number;
  years: number;
  initialAmount: number;
  netAnnualRate: number;
  requiredMonthlyAmount: number;
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

  const monthlyAmount = moneyToCents(options.monthlyAmount) / 100;
  const roundedInitialAmount = moneyToCents(initialAmount) / 100;
  const annualGrowthFactor = (1 + options.annualReturn) * (1 - annualFeeRate);
  const netAnnualRate = annualGrowthFactor - 1;
  const monthlyGrowthFactor = Math.pow(annualGrowthFactor, 1 / 12);
  const monthlyRate = monthlyGrowthFactor - 1;
  let principal = roundedInitialAmount;
  let assets = roundedInitialAmount;
  const curve: LongTermDcaYearPoint[] = [];

  for (let month = 1; month <= options.years * 12; month += 1) {
    assets *= monthlyGrowthFactor;
    assets += monthlyAmount;
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
    netAnnualRate,
    monthlyRate,
    principal,
    finalValue: assets,
    profit,
    returnRate: principal > 0 ? profit / principal : 0,
    methodology:
      "按有效年化收益率折算月收益率，先计当月收益、再于月末投入；年度费率按年度增长因子扣除；结果为情景测算，不代表未来收益。",
    curve,
  };
}

/** Calculate the month-end contribution needed to reach a stated asset goal. */
export function calculateRequiredMonthlyContribution(
  options: MonthlyContributionGoalOptions,
): MonthlyContributionGoal {
  if (!Number.isFinite(options.targetAmount) || options.targetAmount <= 0)
    throw new Error("目标金额必须大于 0");
  if (!Number.isInteger(options.years) || options.years < 1 || options.years > 30)
    throw new Error("目标年限必须为 1 至 30 年的整数");
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
  const initialAmount = moneyToCents(options.initialAmount ?? 0) / 100;
  if (!Number.isFinite(options.initialAmount ?? 0) || initialAmount < 0)
    throw new Error("初始投入不能为负数");

  const targetAmount = moneyToCents(options.targetAmount) / 100;
  const annualGrowthFactor = (1 + options.annualReturn) * (1 - annualFeeRate);
  const monthlyGrowthFactor = Math.pow(annualGrowthFactor, 1 / 12);
  const periods = options.years * 12;
  const initialTerminalValue = initialAmount * Math.pow(monthlyGrowthFactor, periods);
  const contributionFactor =
    Math.abs(monthlyGrowthFactor - 1) < 1e-12
      ? periods
      : (Math.pow(monthlyGrowthFactor, periods) - 1) /
        (monthlyGrowthFactor - 1);
  const requiredMonthlyAmount = Math.max(
    0,
    Math.ceil(((targetAmount - initialTerminalValue) / contributionFactor) * 100) /
      100,
  );
  return {
    targetAmount,
    years: options.years,
    initialAmount,
    netAnnualRate: annualGrowthFactor - 1,
    requiredMonthlyAmount,
  };
}
