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
  const today = new Date().toISOString().slice(0, 10);
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
    } else if (entry.kind === "WITHDRAWAL") {
      withdrawals += gross;
      cashByAccount.set(entry.account_id, cash - gross);
    } else if (entry.kind === "BUY") {
      position.quantity += quantity;
      position.cost += gross + fee;
      fees += fee;
      cashByAccount.set(entry.account_id, cash - gross - fee);
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
      positions.set(key, position);
    } else if (entry.kind === "DIVIDEND") {
      const net = gross - fee;
      position.income += net;
      income += net;
      fees += fee;
      cashByAccount.set(entry.account_id, cash + net);
      positions.set(key, position);
    } else if (entry.kind === "FEE") {
      fees += gross;
      cashByAccount.set(entry.account_id, cash - gross);
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
  const cash = [...cashByAccount.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const totalAssets = securitiesValue + cash;
  const netContributions = deposits - withdrawals;
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
      const key = `${entry.account_id}:${entry.instrument_id ?? 0}`;
      if (entry.kind === "DEPOSIT") {
        externalFlow += gross;
        cumulativeContributions += gross;
        simCash.set(entry.account_id, currentCash + gross);
      } else if (entry.kind === "WITHDRAWAL") {
        externalFlow -= gross;
        cumulativeContributions -= gross;
        simCash.set(entry.account_id, currentCash - gross);
      } else if (entry.kind === "BUY") {
        simQty.set(key, (simQty.get(key) ?? 0) + quantity);
        simCash.set(entry.account_id, currentCash - gross - fee);
      } else if (entry.kind === "SELL") {
        simQty.set(key, Math.max(0, (simQty.get(key) ?? 0) - quantity));
        simCash.set(entry.account_id, currentCash + gross - fee);
      } else if (entry.kind === "DIVIDEND") {
        simCash.set(entry.account_id, currentCash + gross - fee);
      } else if (entry.kind === "FEE") {
        simCash.set(entry.account_id, currentCash - gross);
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
    .filter((entry) => entry.kind === "DEPOSIT" || entry.kind === "WITHDRAWAL")
    .map((entry) => ({
      date: entry.trade_date,
      value:
        ((entry.kind === "DEPOSIT" ? -1 : 1) * entry.gross_amount_units) /
        MONEY_SCALE,
    }));
  cashFlows.push({ date: today, value: totalAssets });
  const personalXirr = calculateXirr(
    cashFlows.sort((a, b) => a.date.localeCompare(b.date)),
  );

  const accountSummaries = accounts.map((account) => {
    const accountHoldings = holdings.filter(
      (item) => item.accountId === account.id,
    );
    const accountAssets =
      accountHoldings.reduce((sum, item) => sum + item.marketValue, 0) +
      (cashByAccount.get(account.id) ?? 0);
    const accountDeposit = ledger
      .filter(
        (entry) => entry.account_id === account.id && entry.kind === "DEPOSIT",
      )
      .reduce((sum, entry) => sum + entry.gross_amount_units / MONEY_SCALE, 0);
    const accountWithdrawal = ledger
      .filter(
        (entry) =>
          entry.account_id === account.id && entry.kind === "WITHDRAWAL",
      )
      .reduce((sum, entry) => sum + entry.gross_amount_units / MONEY_SCALE, 0);
    const net = accountDeposit - accountWithdrawal;
    return {
      ...account,
      assets: accountAssets,
      contributions: net,
      profit: accountAssets - net,
      returnRate: calculateXirr(
        [
          ...ledger
            .filter(
              (entry) =>
                entry.account_id === account.id &&
                (entry.kind === "DEPOSIT" || entry.kind === "WITHDRAWAL"),
            )
            .map((entry) => ({
              date: entry.trade_date,
              value:
                (entry.kind === "DEPOSIT" ? -1 : 1) *
                (entry.gross_amount_units / MONEY_SCALE),
            })),
          { date: today, value: accountAssets },
        ].sort((a, b) => a.date.localeCompare(b.date)),
      ),
    };
  });

  const allocation = holdings.map((item) => {
    const target = targets.find(
      (targetRow) => targetRow.instrument_id === item.instrumentId,
    );
    const actual = totalAssets ? item.marketValue / totalAssets : 0;
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
  if (cash > 0)
    allocation.push({
      instrumentId: 0,
      name: "现金",
      value: cash,
      actual: totalAssets ? cash / totalAssets : 0,
      target: 0,
      drift: totalAssets ? cash / totalAssets : 0,
      alert: false,
    });

  const rankings = holdings
    .map((item) => ({
      name: item.instrumentName,
      profit: item.realized + item.unrealized + item.income,
      returnRate: item.returnRate,
    }))
    .sort((a, b) => b.returnRate - a.returnRate);

  return {
    metrics: {
      totalAssets,
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
    valuationDate:
      [...latestPrice.values()]
        .map((item) => item.price_date)
        .sort()
        .at(-1) ?? null,
    methodology:
      "日初现金流约定的日频 TWR；存在日内现金流但缺少流前估值时为估算值",
  };
}
