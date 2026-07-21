import assert from "node:assert/strict";
import test from "node:test";
import {
  parseEastmoneyNavPoints,
  parseEastmoneyTotalReturnPoints,
} from "../lib/fund-data";
import {
  calculateBuyOnlyTopUp,
  calculateRequiredMonthlyContribution,
  combineDcaComparisons,
  estimateHistoricalAnnualizedReturn,
  projectLongTermDca,
  simulateDcaVsLumpSum,
} from "../lib/investment-planning";

test("historical NAV parser returns the published daily series", () => {
  const points = parseEastmoneyNavPoints(`
    var Data_netWorthTrend = [
      {"x":1784131200000,"y":1.1200,"equityReturn":0},
      {"x":1784217600000,"y":1.1501,"equityReturn":2.68}
    ];
  `);
  assert.deepEqual(points, [
    { date: "2026-07-16", nav: 1.12 },
    { date: "2026-07-17", nav: 1.1501 },
  ]);
});

test("total-return history reinvests cash distributions", () => {
  const points = parseEastmoneyTotalReturnPoints(`
    var Data_netWorthTrend = [
      {"x":${Date.UTC(2026, 0, 2)},"y":1.0000,"equityReturn":0,"unitMoney":""},
      {"x":${Date.UTC(2026, 1, 2)},"y":0.8000,"equityReturn":0,"unitMoney":"分红：每份派现金0.2元"},
      {"x":${Date.UTC(2026, 2, 2)},"y":0.8800,"equityReturn":10,"unitMoney":""}
    ];
  `);
  assert.equal(points[1].nav, 0.8);
  assert.equal(points[1].totalReturnNav, 1);
  assert.ok(Math.abs(points[2].totalReturnNav - 1.1) < 1e-12);
  const simulation = simulateDcaVsLumpSum(points, { monthlyAmount: 100 });
  assert.equal(simulation.curve[1].invested, 200);
  assert.equal(simulation.curve[1].dcaValue, 200);
});

test("historical annualized estimate uses total-return NAV and reports coverage", () => {
  const estimate = estimateHistoricalAnnualizedReturn(
    [
      { date: "2023-07-01", nav: 1, totalReturnNav: 1 },
      { date: "2026-07-01", nav: 1.1, totalReturnNav: 1.331 },
    ],
    3,
  );
  assert.equal(estimate.startDate, "2023-07-01");
  assert.equal(estimate.endDate, "2026-07-01");
  assert.ok(Math.abs(estimate.annualizedReturn - 0.1) < 0.001);
  assert.equal(estimate.limitedByHistory, false);
});

test("buy-only top-up sends more money to the largest target deficit", () => {
  const result = calculateBuyOnlyTopUp(
    [
      { instrumentId: 1, name: "A", currentValue: 7_000, targetBps: 6_000 },
      { instrumentId: 2, name: "B", currentValue: 3_000, targetBps: 3_000 },
      { instrumentId: 3, name: "C", currentValue: 0, targetBps: 1_000 },
    ],
    1_234.57,
  );

  assert.equal(result.requestedAmount, 1_234.57);
  assert.equal(result.allocatedAmount, 1_234.57);
  assert.equal(result.unallocatedAmount, 0);
  assert.equal(
    result.suggestions.reduce(
      (sum, suggestion) => sum + Math.round(suggestion.suggestedAmount * 100),
      0,
    ),
    123_457,
  );
  assert.equal(
    result.suggestions.find((item) => item.instrumentId === 1)?.suggestedAmount,
    0,
  );
  assert.ok(
    result.suggestions.find((item) => item.instrumentId === 3)!
      .suggestedAmount >
      result.suggestions.find((item) => item.instrumentId === 2)!
        .suggestedAmount,
  );
});

test("buy-only top-up normalizes targets and assigns every final cent", () => {
  const result = calculateBuyOnlyTopUp(
    [
      { instrumentId: 1, name: "A", currentValue: 0, targetBps: 2 },
      { instrumentId: 2, name: "B", currentValue: 0, targetBps: 1 },
    ],
    0.05,
  );

  assert.deepEqual(
    result.suggestions
      .sort((a, b) => a.instrumentId - b.instrumentId)
      .map((item) => item.suggestedAmount),
    [0.03, 0.02],
  );
  assert.equal(result.allocatedAmount, 0.05);
});

test("top-up without a valid target leaves the contribution as cash", () => {
  const result = calculateBuyOnlyTopUp(
    [{ instrumentId: 1, name: "A", currentValue: 1_000, targetBps: 0 }],
    500,
  );
  assert.equal(result.allocatedAmount, 0);
  assert.equal(result.unallocatedAmount, 500);
  assert.deepEqual(result.suggestions, []);
});

test("buy-only top-up reserves a 20% cash target before buying products", () => {
  const result = calculateBuyOnlyTopUp(
    [{ instrumentId: 1, name: "A", currentValue: 8_000, targetBps: 8_000 }],
    1_000,
    { currentCash: 2_000, cashTargetBps: 2_000 },
  );

  assert.equal(result.currentTotal, 10_000);
  assert.equal(result.projectedTotal, 11_000);
  assert.equal(result.requestedAmount, 1_000);
  assert.equal(result.reservedCashAmount, 200);
  assert.equal(result.allocatedAmount, 800);
  assert.equal(result.unallocatedAmount, 200);
  assert.equal(result.projectedCashAmount, 2_200);
  assert.equal(result.suggestions[0].suggestedAmount, 800);
  assert.equal(result.suggestions[0].projectedValue, 8_800);
  assert.equal(result.suggestions[0].projectedRate, 0.8);
  assert.equal(
    result.suggestions.some((suggestion) => suggestion.instrumentId === 0),
    false,
  );
});

test("an empty portfolio invests only the product share of an 80/20 target", () => {
  const result = calculateBuyOnlyTopUp(
    [{ instrumentId: 1, name: "A", currentValue: 0, targetBps: 8_000 }],
    1_000,
    { currentCash: 0, cashTargetBps: 2_000 },
  );

  assert.equal(result.allocatedAmount, 800);
  assert.equal(result.reservedCashAmount, 200);
  assert.equal(result.unallocatedAmount, 200);
  assert.equal(result.projectedCashAmount, 200);
  assert.equal(result.suggestions[0].suggestedAmount, 800);
});

test("cash already above target makes the whole contribution investable", () => {
  const result = calculateBuyOnlyTopUp(
    [{ instrumentId: 1, name: "A", currentValue: 7_000, targetBps: 8_000 }],
    1_000,
    { currentCash: 3_000, cashTargetBps: 2_000 },
  );

  assert.equal(result.reservedCashAmount, 0);
  assert.equal(result.allocatedAmount, 1_000);
  assert.equal(result.projectedCashAmount, 3_000);
  assert.equal(result.suggestions[0].projectedValue, 8_000);
  assert.ok(result.suggestions[0].projectedValue <= 8_800);
});

test("buy-only top-up leaves money as cash instead of buying past all deficits", () => {
  const result = calculateBuyOnlyTopUp(
    [{ instrumentId: 1, name: "A", currentValue: 10_000, targetBps: 8_000 }],
    1_000,
    { currentCash: 0, cashTargetBps: 2_000 },
  );

  assert.equal(result.allocatedAmount, 0);
  assert.equal(result.unallocatedAmount, 1_000);
  assert.equal(result.reservedCashAmount, 1_000);
  assert.equal(result.projectedCashAmount, 1_000);
});

test("products with no target are not force-bought and extra cash is reported", () => {
  const result = calculateBuyOnlyTopUp(
    [{ instrumentId: 1, name: "A", currentValue: 10_000, targetBps: 0 }],
    1_000,
    { currentCash: 500, cashTargetBps: 0 },
  );

  assert.equal(result.reservedCashAmount, 0);
  assert.equal(result.allocatedAmount, 0);
  assert.equal(result.unallocatedAmount, 1_000);
  assert.equal(result.projectedCashAmount, 1_500);
  assert.deepEqual(result.suggestions, []);
});

test("DCA simulator uses the first published NAV of each calendar month", () => {
  const result = simulateDcaVsLumpSum(
    [
      { date: "2026-01-02", nav: 1 },
      { date: "2026-01-30", nav: 1.1 },
      { date: "2026-02-02", nav: 0.8 },
      { date: "2026-02-27", nav: 1 },
      { date: "2026-03-02", nav: 1.2 },
      { date: "2026-03-31", nav: 0.9 },
    ],
    { monthlyAmount: 100 },
  );

  assert.deepEqual(
    result.purchases.map((purchase) => [purchase.date, purchase.nav]),
    [
      ["2026-01-02", 1],
      ["2026-02-02", 0.8],
      ["2026-03-02", 1.2],
    ],
  );
  assert.equal(result.executionCount, 3);
  assert.equal(result.historyStartDate, "2026-01-02");
  assert.equal(result.availableMonths, 3);
  assert.equal(result.availableYears, 0.25);
  assert.equal(result.requestedMonths, 3);
  assert.equal(result.limitedByHistory, false);
  assert.equal(result.dca.invested, 300);
  assert.ok(Math.abs(result.dca.shares - 308.3333333333333) < 1e-10);
  assert.ok(Math.abs(result.dca.finalValue - 277.5) < 1e-10);
  assert.ok(Math.abs(result.dca.returnRate + 0.075) < 1e-10);
  assert.ok(Math.abs(result.lumpSum.finalValue - 270) < 1e-10);
  assert.ok(Math.abs(result.lumpSum.returnRate + 0.1) < 1e-10);
  assert.ok(Math.abs(result.dca.maxDrawdown + 0.25) < 1e-10);
  assert.equal(result.feesIncluded, false);
  assert.deepEqual(
    result.curve.map((point) => point.date),
    ["2026-01-30", "2026-02-27", "2026-03-31"],
  );
  assert.deepEqual(
    result.curve.map((point) => point.invested),
    [100, 200, 300],
  );
  assert.ok(Math.abs(result.curve[0].dcaValue - 110) < 1e-10);
  assert.ok(Math.abs(result.curve[0].lumpSumValue - 330) < 1e-10);
  assert.ok(Math.abs(result.curve.at(-1)!.dcaValue - 277.5) < 1e-10);
  assert.ok(Math.abs(result.curve.at(-1)!.lumpSumValue - 270) < 1e-10);
});

test("DCA simulator honours the selected deduction day and subscription fee", () => {
  const result = simulateDcaVsLumpSum(
    [
      { date: "2026-01-02", nav: 1 },
      { date: "2026-01-08", nav: 0.9 },
      { date: "2026-01-30", nav: 1.1 },
      { date: "2026-02-03", nav: 0.8 },
      { date: "2026-02-10", nav: 0.75 },
      { date: "2026-02-27", nav: 1 },
    ],
    {
      monthlyAmount: 100,
      initialAmount: 50,
      investmentDay: 8,
      buyFeeRate: 0.01,
    },
  );
  assert.deepEqual(
    result.purchases.map((purchase) => purchase.date),
    ["2026-01-08", "2026-02-10"],
  );
  assert.equal(result.dca.invested, 250);
  assert.equal(result.dca.totalFees, 2.5);
  assert.equal(result.feesIncluded, true);
  assert.equal(result.investmentDay, 8);
  assert.equal(result.initialAmount, 50);
  assert.ok(result.dca.averageCost > 0);
});

test("portfolio DCA combines multiple product schedules without mixing their fees", () => {
  const fundA = simulateDcaVsLumpSum(
    [
      { date: "2026-01-02", nav: 1 },
      { date: "2026-01-30", nav: 1.1 },
      { date: "2026-02-02", nav: 1 },
      { date: "2026-02-27", nav: 1.2 },
    ],
    { monthlyAmount: 100, buyFeeRate: 0.01 },
  );
  const fundB = simulateDcaVsLumpSum(
    [
      { date: "2026-01-02", nav: 2 },
      { date: "2026-01-30", nav: 1.8 },
      { date: "2026-02-02", nav: 2.2 },
      { date: "2026-02-27", nav: 2.1 },
    ],
    { monthlyAmount: 50, buyFeeRate: 0 },
  );
  const result = combineDcaComparisons([
    { instrumentId: 1, name: "基金 A", monthlyAmount: 100, result: fundA },
    { instrumentId: 2, name: "基金 B", monthlyAmount: 50, result: fundB },
  ]);
  assert.equal(result.components.length, 2);
  assert.equal(result.dca.invested, 300);
  assert.equal(result.dca.totalFees, fundA.dca.totalFees);
  assert.equal(result.executionCount, 4);
  assert.ok(result.curve.length >= 2);
  assert.ok(result.dca.finalValue > 0);
});

test("DCA simulator can limit the history to trailing calendar months", () => {
  const result = simulateDcaVsLumpSum(
    [
      { date: "2026-01-02", nav: 1 },
      { date: "2026-02-02", nav: 0.8 },
      { date: "2026-03-02", nav: 1.2 },
      { date: "2026-03-31", nav: 0.9 },
    ],
    { monthlyAmount: 100, months: 2 },
  );
  assert.equal(result.startDate, "2026-02-02");
  assert.equal(result.executionCount, 2);
  assert.equal(result.dca.invested, 200);
  assert.equal(result.historyStartDate, "2026-01-02");
  assert.equal(result.availableMonths, 3);
  assert.equal(result.requestedMonths, 2);
  assert.equal(result.limitedByHistory, false);
});

test("historical simulator exposes when a requested period predates inception", () => {
  const result = simulateDcaVsLumpSum(
    [
      { date: "2026-01-02", nav: 1 },
      { date: "2026-02-02", nav: 1.1 },
      { date: "2026-03-02", nav: 1.2 },
    ],
    { monthlyAmount: 100, months: 60 },
  );

  assert.equal(result.requestedMonths, 60);
  assert.equal(result.availableMonths, 3);
  assert.equal(result.executionCount, 3);
  assert.equal(result.historyStartDate, "2026-01-02");
  assert.equal(result.startDate, "2026-01-02");
  assert.equal(result.limitedByHistory, true);
});

test("DCA simulator rejects unusable inputs", () => {
  assert.throws(
    () => simulateDcaVsLumpSum([], { monthlyAmount: 100 }),
    /没有可用净值/,
  );
  assert.throws(
    () =>
      simulateDcaVsLumpSum([{ date: "2026-01-02", nav: 1 }], {
        monthlyAmount: 0,
      }),
    /必须大于 0/,
  );
});

test("long-term projection uses month-end contributions", () => {
  const result = projectLongTermDca({
    monthlyAmount: 100,
    years: 1,
    annualReturn: 0,
    initialAmount: 1_000,
  });

  assert.equal(result.principal, 2_200);
  assert.equal(result.finalValue, 2_200);
  assert.equal(result.profit, 0);
  assert.equal(result.returnRate, 0);
  assert.equal(result.curve.length, 1);
  assert.deepEqual(result.curve[0], {
    year: 1,
    principal: 2_200,
    assets: 2_200,
    profit: 0,
    returnRate: 0,
  });
});

test("long-term projection compounds monthly and reports yearly points", () => {
  const result = projectLongTermDca({
    monthlyAmount: 500,
    years: 2,
    annualReturn: 0.12,
    initialAmount: 10_000,
  });
  const monthlyFactor = Math.pow(1.12, 1 / 12);
  let expected = 10_000;
  for (let month = 0; month < 24; month += 1)
    expected = expected * monthlyFactor + 500;

  assert.ok(Math.abs(result.finalValue - expected) < 1e-8);
  assert.equal(result.principal, 22_000);
  assert.equal(result.curve.length, 2);
  assert.equal(result.curve[0].year, 1);
  assert.equal(result.curve[1].year, 2);
  assert.ok(result.profit > 0);
  assert.ok(Math.abs(result.monthlyRate - (monthlyFactor - 1)) < 1e-12);
});

test("annual fee reduces the long-term projection growth factor", () => {
  const withoutFee = projectLongTermDca({
    monthlyAmount: 1_000,
    years: 10,
    annualReturn: 0.1,
  });
  const withFee = projectLongTermDca({
    monthlyAmount: 1_000,
    years: 10,
    annualReturn: 0.1,
    annualFeeRate: 0.01,
  });

  assert.ok(Math.abs(withFee.netAnnualRate - 0.089) < 1e-12);
  assert.ok(withFee.finalValue < withoutFee.finalValue);
  assert.equal(withFee.principal, withoutFee.principal);
});

test("long-term projection validates its boundaries", () => {
  assert.throws(
    () => projectLongTermDca({ monthlyAmount: 0, years: 1, annualReturn: 0.1 }),
    /每月投入金额/,
  );
  for (const years of [0, 1.5, 31])
    assert.throws(
      () =>
        projectLongTermDca({ monthlyAmount: 100, years, annualReturn: 0.1 }),
      /1 至 30 年/,
    );
  assert.throws(
    () =>
      projectLongTermDca({ monthlyAmount: 100, years: 1, annualReturn: -1 }),
    /大于 -100%/,
  );
  assert.throws(
    () =>
      projectLongTermDca({ monthlyAmount: 100, years: 1, annualReturn: 1.01 }),
    /不超过 100%/,
  );
  assert.throws(
    () =>
      projectLongTermDca({
        monthlyAmount: 100,
        years: 1,
        annualReturn: 0.1,
        annualFeeRate: 1,
      }),
    /年度费率/,
  );
  assert.throws(
    () =>
      projectLongTermDca({
        monthlyAmount: 100,
        years: 1,
        annualReturn: 0.1,
        initialAmount: -1,
      }),
    /初始投入/,
  );
});

test("goal calculator reverses the same month-end contribution formula", () => {
  const target = projectLongTermDca({
    monthlyAmount: 1_000,
    years: 5,
    annualReturn: 0.06,
    initialAmount: 10_000,
  }).finalValue;
  const goal = calculateRequiredMonthlyContribution({
    targetAmount: target,
    years: 5,
    annualReturn: 0.06,
    initialAmount: 10_000,
  });
  assert.ok(Math.abs(goal.requiredMonthlyAmount - 1_000) < 0.02);
});
