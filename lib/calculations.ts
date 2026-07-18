import { MONEY_SCALE, PRICE_SCALE, QUANTITY_SCALE } from "./money";
import type {
  AccountRow,
  InstrumentRow,
  LedgerRow,
  PlanRow,
  PriceRow,
  TargetRow,
} from "./types";

const DAY = 86_400_000;

function shanghaiDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

function dateRange(start: string, end: string): string[] {
  const values: string[] = [];
  for (
    let time = Date.parse(`${start}T00:00:00Z`);
    time <= Date.parse(`${end}T00:00:00Z`);
    time += DAY
  ) {
    values.push(new Date(time).toISOString().slice(0, 10));
  }
  return values;
}

export function calculateXirr(
  cashFlows: Array<{ date: string; value: number }>,
): number | null {
  if (
    !cashFlows.some((item) => item.value < 0) ||
    !cashFlows.some((item) => item.value > 0)
  )
    return null;
  const start = Date.parse(`${cashFlows[0].date}T00:00:00Z`);
  const npv = (rate: number) =>
    cashFlows.reduce((sum, item) => {
      const years = (Date.parse(`${item.date}T00:00:00Z`) - start) / DAY / 365;
      return sum + item.value / Math.pow(1 + rate, years);
    }, 0);
  // Search a logarithmic rate grid before solving. If more than one interval
  // changes sign, the cash-flow stream may have multiple IRRs and no single
  // result is reported as authoritative.
  const intervals: Array<[number, number]> = [];
  let previousRate = -0.9999;
  let previousValue = npv(previousRate);
  for (let index = 1; index <= 480; index += 1) {
    const transformed = -9.21 + (index / 480) * (Math.log(1_000_001) + 9.21);
    const rate = Math.exp(transformed) - 1;
    const value = npv(rate);
    if (
      Number.isFinite(previousValue) &&
      Number.isFinite(value) &&
      previousValue * value < 0
    ) {
      intervals.push([previousRate, rate]);
    }
    previousRate = rate;
    previousValue = value;
  }
  if (intervals.length !== 1) return null;
  let [low, high] = intervals[0];
  let lowValue = npv(low);
  for (let i = 0; i < 160; i += 1) {
    const middle = (low + high) / 2;
    const middleValue = npv(middle);
    if (Math.abs(middleValue) < 1e-9) return middle;
    if (lowValue * middleValue <= 0) {
      high = middle;
    } else {
      low = middle;
      lowValue = middleValue;
    }
  }
  return (low + high) / 2;
}

export function calculatePortfolio(
  accounts: AccountRow[],
  instruments: InstrumentRow[],
  ledger: LedgerRow[],
  prices: PriceRow[],
  plans: PlanRow[],
  targets: TargetRow[],
) {
  const today = shanghaiDate();
  const instrumentById = new Map(instruments.map((item) => [item.id, item]));
  const accountById = new Map(accounts.map((item) => [item.id, item]));
  const orderedLedger = [...ledger].sort(
    (a, b) => a.trade_date.localeCompare(b.trade_date) || a.id - b.id,
  );
  const orderedPrices = [...prices].sort((a, b) =>
    a.price_date.localeCompare(b.price_date),
  );
  const firstDate = orderedLedger[0]?.trade_date ?? today;

  const cashByAccount = new Map<number, number>();
  // Investor-perspective cash flow: contributions are negative, withdrawals
  // are positive. Keeping it per ledger row lets TWR, XIRR and the account
  // summaries share exactly the same cash-flow convention.
  const investorCashFlowByEntry = new Map<number, number>();
  const contributionByAccount = new Map<number, number>();
  const positions = new Map<
    string,
    {
      accountId: number;
      instrumentId: number;
      quantity: number;
      cost: number;
      realized: number;
      income: number;
    }
  >();
  let deposits = 0;
  let withdrawals = 0;
  let realized = 0;
  let income = 0;
  let fees = 0;

  const recordInvestorCashFlow = (entry: LedgerRow, value: number) => {
    investorCashFlowByEntry.set(entry.id, value);
    contributionByAccount.set(
      entry.account_id,
      (contributionByAccount.get(entry.account_id) ?? 0) - value,
    );
  };

  const applyEntry = (entry: LedgerRow) => {
    const cash = cashByAccount.get(entry.account_id) ?? 0;
    const gross = entry.gross_amount_units / MONEY_SCALE;
    const fee = (entry.fee_units + entry.tax_units) / MONEY_SCALE;
    const quantity = entry.quantity_units / QUANTITY_SCALE;
    const key = `${entry.account_id}:${entry.instrument_id ?? 0}`;
    const position = positions.get(key) ?? {
      accountId: entry.account_id,
      instrumentId: entry.instrument_id ?? 0,
      quantity: 0,
      cost: 0,
      realized: 0,
      income: 0,
    };
    if (entry.kind === "DEPOSIT") {
      deposits += gross;
      cashByAccount.set(entry.account_id, cash + gross);
      recordInvestorCashFlow(entry, -gross);
    } else if (entry.kind === "WITHDRAWAL") {
      withdrawals += gross;
      cashByAccount.set(entry.account_id, cash - gross);
      recordInvestorCashFlow(entry, gross);
    } else if (entry.kind === "BUY") {
      const requiredCash = gross + fee;
      const cashTopUp = Math.max(0, requiredCash - cash);
      position.quantity += quantity;
      position.cost += requiredCash;
      fees += fee;
      deposits += cashTopUp;
      cashByAccount.set(entry.account_id, cash + cashTopUp - requiredCash);
      recordInvestorCashFlow(entry, -cashTopUp);
      positions.set(key, position);
    } else if (entry.kind === "SELL") {
      const matchedQuantity = Math.min(quantity, position.quantity);
      const matchedCost =
        position.quantity > 0
          ? position.cost * (matchedQuantity / position.quantity)
          : 0;
      const profit = gross - fee - matchedCost;
      position.quantity -= matchedQuantity;
      position.cost -= matchedCost;
      position.realized += profit;
      realized += profit;
      fees += fee;
      cashByAccount.set(entry.account_id, cash + gross - fee);
      recordInvestorCashFlow(entry, 0);
      positions.set(key, position);
    } else if (entry.kind === "DIVIDEND") {
      const net = gross - fee;
      position.income += net;
      income += net;
      fees += fee;
      cashByAccount.set(entry.account_id, cash + net);
      recordInvestorCashFlow(entry, 0);
      positions.set(key, position);
    } else if (entry.kind === "FEE") {
      const cashTopUp = Math.max(0, gross - cash);
      fees += gross;
      deposits += cashTopUp;
      cashByAccount.set(entry.account_id, cash + cashTopUp - gross);
      recordInvestorCashFlow(entry, -cashTopUp);
    }
  };
  orderedLedger.forEach(applyEntry);

  const latestPrice = new Map<number, PriceRow>();
  for (const price of orderedPrices)
    if (price.price_date <= today) latestPrice.set(price.instrument_id, price);

  const holdings = [...positions.values()]
    .filter((item) => item.instrumentId > 0 && item.quantity > 0.0000001)
    .map((item) => {
      const instrument = instrumentById.get(item.instrumentId)!;
      const priceRow = latestPrice.get(item.instrumentId);
      const price = (priceRow?.price_units ?? 0) / PRICE_SCALE;
      const marketValue = item.quantity * price;
      const unrealized = marketValue - item.cost;
      return {
        ...item,
        accountName: accountById.get(item.accountId)?.name ?? "未知账户",
        instrumentName: instrument?.name ?? "未知产品",
        code: instrument?.code ?? "-",
        assetClass: instrument?.asset_class ?? "OTHER",
        price,
        priceDate: priceRow?.price_date ?? null,
        marketValue,
        unrealized,
        returnRate: item.cost ? unrealized / item.cost : 0,
      };
    });

  const securitiesValue = holdings.reduce(
    (sum, item) => sum + item.marketValue,
    0,
  );
  const holdingCost = holdings.reduce((sum, item) => sum + item.cost, 0);
  // Every account retains its available cash. A direct BUY without a prior
  // deposit receives only the cash top-up needed for that purchase, while
  // proceeds and dividends stay in the account until a WITHDRAWAL is recorded.
  const cash = [...cashByAccount.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const totalAssets = securitiesValue + cash;
  const netContributions = [...contributionByAccount.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const totalProfit = totalAssets - netContributions;
  const unrealized = holdings.reduce((sum, item) => sum + item.unrealized, 0);

  const entriesByDate = new Map<string, LedgerRow[]>();
  for (const entry of orderedLedger)
    entriesByDate.set(entry.trade_date, [
      ...(entriesByDate.get(entry.trade_date) ?? []),
      entry,
    ]);
  const pricesByInstrument = new Map<number, PriceRow[]>();
  for (const price of orderedPrices)
    pricesByInstrument.set(price.instrument_id, [
      ...(pricesByInstrument.get(price.instrument_id) ?? []),
      price,
    ]);
  const simCash = new Map<number, number>();
  const simQty = new Map<string, number>();
  const simPrices = new Map<number, number>();
  const series: Array<{
    date: string;
    assets: number;
    contributions: number;
    profit: number;
    dailyReturn: number;
    twr: number;
    drawdown: number;
  }> = [];
  let cumulativeContributions = 0;
  let priorValue = 0;
  let wealth = 1;
  let peak = 1;

  for (const date of dateRange(firstDate, today)) {
    for (const instrument of instruments) {
      const rows = pricesByInstrument.get(instrument.id) ?? [];
      const price = rows.findLast((item) => item.price_date <= date);
      if (price) simPrices.set(instrument.id, price.price_units / PRICE_SCALE);
    }
    let externalFlow = 0;
    for (const entry of entriesByDate.get(date) ?? []) {
      const gross = entry.gross_amount_units / MONEY_SCALE;
      const fee = (entry.fee_units + entry.tax_units) / MONEY_SCALE;
      const quantity = entry.quantity_units / QUANTITY_SCALE;
      const currentCash = simCash.get(entry.account_id) ?? 0;
      const portfolioExternalFlow = -(
        investorCashFlowByEntry.get(entry.id) ?? 0
      );
      externalFlow += portfolioExternalFlow;
      cumulativeContributions += portfolioExternalFlow;
      const key = `${entry.account_id}:${entry.instrument_id ?? 0}`;
      if (entry.kind === "DEPOSIT") {
        simCash.set(entry.account_id, currentCash + gross);
      } else if (entry.kind === "WITHDRAWAL") {
        simCash.set(entry.account_id, currentCash - gross);
      } else if (entry.kind === "BUY") {
        simQty.set(key, (simQty.get(key) ?? 0) + quantity);
        simCash.set(
          entry.account_id,
          currentCash + portfolioExternalFlow - gross - fee,
        );
      } else if (entry.kind === "SELL") {
        simQty.set(key, Math.max(0, (simQty.get(key) ?? 0) - quantity));
        simCash.set(entry.account_id, currentCash + gross - fee);
      } else if (entry.kind === "DIVIDEND") {
        simCash.set(entry.account_id, currentCash + gross - fee);
      } else if (entry.kind === "FEE") {
        simCash.set(
          entry.account_id,
          currentCash + portfolioExternalFlow - gross,
        );
      }
    }
    const simulatedCash = [...simCash.values()].reduce(
      (sum, value) => sum + value,
      0,
    );
    let simulatedSecurities = 0;
    for (const [key, quantity] of simQty.entries()) {
      const instrumentId = Number(key.split(":")[1]);
      simulatedSecurities += quantity * (simPrices.get(instrumentId) ?? 0);
    }
    const assets = simulatedCash + simulatedSecurities;
    const denominator = priorValue + externalFlow;
    const dailyReturn =
      denominator > 0 ? (assets - priorValue - externalFlow) / denominator : 0;
    wealth *= 1 + dailyReturn;
    peak = Math.max(peak, wealth);
    series.push({
      date,
      assets,
      contributions: cumulativeContributions,
      profit: assets - cumulativeContributions,
      dailyReturn,
      twr: wealth - 1,
      drawdown: wealth / peak - 1,
    });
    priorValue = assets;
  }

  const dailyReturns = series
    .map((item) => item.dailyReturn)
    .filter((value) => Number.isFinite(value));
  const mean =
    dailyReturns.reduce((sum, value) => sum + value, 0) /
    Math.max(1, dailyReturns.length);
  const variance =
    dailyReturns.length > 1
      ? dailyReturns.reduce(
          (sum, value) => sum + Math.pow(value - mean, 2),
          0,
        ) /
        (dailyReturns.length - 1)
      : 0;
  const volatility = Math.sqrt(variance) * Math.sqrt(252);
  const sharpe = volatility ? (mean * 252) / volatility : 0;
  const maxDrawdown = Math.min(0, ...series.map((item) => item.drawdown));
  const positiveDays = dailyReturns.filter((value) => value > 0).length;
  const negativeDays = dailyReturns.filter((value) => value < 0).length;

  const monthMap = new Map<
    string,
    { start: number; end: number; profitStart: number; profitEnd: number }
  >();
  for (const item of series) {
    const month = item.date.slice(0, 7);
    const current = monthMap.get(month);
    if (!current)
      monthMap.set(month, {
        start: item.assets,
        end: item.assets,
        profitStart: item.profit,
        profitEnd: item.profit,
      });
    else {
      current.end = item.assets;
      current.profitEnd = item.profit;
    }
  }
  const monthly = [...monthMap.entries()].slice(-12).map(([month, value]) => ({
    month: month.slice(5),
    profit: value.profitEnd - value.profitStart,
  }));

  const cashFlows = orderedLedger
    .map((entry) => ({
      date: entry.trade_date,
      value: investorCashFlowByEntry.get(entry.id) ?? 0,
    }))
    .filter((entry) => entry.value !== 0);
  cashFlows.push({ date: today, value: totalAssets });
  const personalXirr = calculateXirr(
    cashFlows.sort((a, b) => a.date.localeCompare(b.date)),
  );

  const accountSummaries = accounts.map((account) => {
    const accountHoldings = holdings.filter(
      (item) => item.accountId === account.id,
    );
    const accountSecuritiesValue = accountHoldings.reduce(
      (sum, item) => sum + item.marketValue,
      0,
    );
    const accountCash = cashByAccount.get(account.id) ?? 0;
    const accountAssets = accountSecuritiesValue + accountCash;
    const net = contributionByAccount.get(account.id) ?? 0;
    const accountCashFlows = orderedLedger
      .filter((entry) => entry.account_id === account.id)
      .map((entry) => ({
        date: entry.trade_date,
        value: investorCashFlowByEntry.get(entry.id) ?? 0,
      }))
      .filter((entry) => entry.value !== 0);
    return {
      ...account,
      assets: accountAssets,
      securitiesValue: accountSecuritiesValue,
      cash: accountCash,
      contributions: net,
      profit: accountAssets - net,
      returnRate: calculateXirr(
        [...accountCashFlows, { date: today, value: accountAssets }].sort(
          (a, b) => a.date.localeCompare(b.date),
        ),
      ),
    };
  });

  const allocatableCash = Math.max(0, cash);
  const allocationBase = securitiesValue + allocatableCash;
  const allocation = holdings
    .filter((item) => item.marketValue > 0)
    .map((item) => {
      const target = targets.find(
        (targetRow) => targetRow.instrument_id === item.instrumentId,
      );
      const actual = allocationBase ? item.marketValue / allocationBase : 0;
      const targetRate = (target?.target_bps ?? 0) / 10_000;
      const drift = actual - targetRate;
      return {
        instrumentId: item.instrumentId,
        name: item.instrumentName,
        value: item.marketValue,
        actual,
        target: targetRate,
        drift,
        alert: Math.abs(drift) * 10_000 > (target?.alert_bps ?? 500),
      };
    });
  if (allocatableCash > 0)
    allocation.push({
      instrumentId: 0,
      name: "现金",
      value: allocatableCash,
      actual: allocationBase ? allocatableCash / allocationBase : 0,
      target: 0,
      drift: allocationBase ? allocatableCash / allocationBase : 0,
      alert: false,
    });

  const rankings = holdings
    .map((item) => ({
      name: item.instrumentName,
      profit: item.realized + item.unrealized + item.income,
      returnRate: item.returnRate,
    }))
    .sort((a, b) => b.returnRate - a.returnRate);

  // Freshness is based only on instruments that are currently held. The
  // earliest held-instrument price is the conservative portfolio valuation
  // date; the latest date and missing count make mixed update states explicit.
  const holdingPriceDates = holdings
    .map((item) => item.priceDate)
    .filter((value): value is string => value !== null)
    .sort();
  const missingPriceCount = holdings.filter(
    (item) => item.priceDate === null,
  ).length;
  const valuationDate = holdingPriceDates.at(0) ?? null;
  const latestValuationDate = holdingPriceDates.at(-1) ?? null;

  return {
    metrics: {
      totalAssets,
      securitiesValue,
      cash,
      holdingCost,
      deposits,
      withdrawals,
      netContributions,
      totalProfit,
      realized,
      unrealized,
      income,
      fees,
      twr: series.at(-1)?.twr ?? 0,
      xirr: personalXirr,
      todayProfit:
        series.length > 1 ? series.at(-1)!.profit - series.at(-2)!.profit : 0,
    },
    risk: {
      volatility,
      sharpe,
      maxDrawdown,
      positiveDays,
      negativeDays,
      winRate:
        positiveDays + negativeDays
          ? positiveDays / (positiveDays + negativeDays)
          : 0,
    },
    accounts: accountSummaries,
    instruments,
    ledger: orderedLedger.slice().reverse(),
    holdings,
    plans: plans.map((plan) => ({
      ...plan,
      accountName: accountById.get(plan.account_id)?.name ?? "-",
      instrumentName: instrumentById.get(plan.instrument_id)?.name ?? "-",
      amount: plan.amount_units / MONEY_SCALE,
    })),
    targets,
    series: series.filter(
      (_, index) =>
        index % Math.max(1, Math.floor(series.length / 180)) === 0 ||
        index === series.length - 1,
    ),
    monthly,
    allocation,
    rankings,
    valuationDate,
    latestValuationDate,
    missingPriceCount,
    methodology:
      "日初现金流约定的日频 TWR；存在日内现金流但缺少流前估值时为估算值",
  };
}
