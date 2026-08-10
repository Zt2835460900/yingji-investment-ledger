import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFundIndexCalibration,
  buildIndexQuoteUrl,
  calibrateFundToIndex,
  calculateIndexMoveEstimate,
  parseIndexHistoryPayload,
  parseFundDailyReturnPayload,
  lastValidFundCalibration,
  parseIndexQuotePayload,
  resolveTrackedIndex,
} from "../lib/index-insights";

test("resolves explicit fund tracking indices instead of underlying stocks", () => {
  assert.equal(
    resolveTrackedIndex("南方纳斯达克100指数发起(QDII)I")?.key,
    "NASDAQ_100",
  );
  assert.equal(
    resolveTrackedIndex("摩根标普500指数(QDII)人民币A")?.key,
    "SP_500",
  );
  assert.equal(resolveTrackedIndex("普通科技主题混合基金"), null);
});

test("index quote URLs stay on the fixed provider and use index identifiers", () => {
  const url = new URL(buildIndexQuoteUrl("NASDAQ_100"));
  assert.equal(url.origin, "https://push2.eastmoney.com");
  assert.equal(url.searchParams.get("secid"), "100.NDX");
});

test("parses an index quote with provider scaling", () => {
  const quote = parseIndexQuotePayload(
    {
      data: {
        f43: 2669062,
        f57: "NDX",
        f59: 2,
        f60: 2634835,
        f86: 1786132800,
        f170: 130,
      },
    },
    "NASDAQ_100",
  );
  assert.equal(quote.label, "纳斯达克100指数");
  assert.equal(quote.price, 26690.62);
  assert.equal(quote.changePercent, 1.3);
});

test("portfolio estimate is weighted only by matched indices", () => {
  const estimate = calculateIndexMoveEstimate(
    [
      { indexKey: "NASDAQ_100", weightPercent: 40 },
      { indexKey: "SP_500", weightPercent: 30 },
    ],
    [
      { key: "NASDAQ_100", changePercent: 1.3 },
      { key: "SP_500", changePercent: 0.62 },
    ],
    10_000,
  );
  assert.ok(Math.abs(estimate.estimatedRate - 0.00706) < 1e-12);
  assert.ok(Math.abs(estimate.estimatedProfit - 70.6) < 1e-9);
  assert.equal(estimate.coveredWeightPercent, 70);
  assert.equal(estimate.matchedIndices, 2);
});

test("parses daily index history returns for calibration", () => {
  const points = parseIndexHistoryPayload({
    data: {
      klines: [
        "2026-08-06,26268.84,26348.35,26499.42,26208.43,1,0,1.10,-0.06,-15.09,0",
        "2026-08-07,26534.66,26690.62,26712.62,26478.01,1,0,0.89,1.30,342.27,0",
      ],
    },
  });
  assert.deepEqual(points, [
    { date: "2026-08-06", changePercent: -0.06 },
    { date: "2026-08-07", changePercent: 1.3 },
  ]);
});

test("parses published fund NAV returns used for automatic correction", () => {
  const points = parseFundDailyReturnPayload({
    Data: {
      LSJZList: [
        { FSRQ: "2026-08-06", DWJZ: "1.7132", JZZZL: "-0.14" },
        { FSRQ: "2026-08-05", DWJZ: "1.7156", JZZZL: "-0.20" },
      ],
    },
  });
  assert.deepEqual(points, [
    { date: "2026-08-05", nav: 1.7156, dailyReturnPercent: -0.2 },
    { date: "2026-08-06", nav: 1.7132, dailyReturnPercent: -0.14 },
  ]);
});

test("automatically learns the fund tracking coefficient and publication lag", () => {
  const changes = [1.2, -0.7, 2.1, -1.5, 0.4, -2.2, 1.7, -0.3];
  const indexPoints = Array.from({ length: 48 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    changePercent: changes[index % changes.length],
  }));
  const fundPoints = indexPoints.slice(1).map((point, index) => ({
    date: point.date,
    dailyReturnPercent: indexPoints[index].changePercent * 0.82,
  }));
  const calibration = calibrateFundToIndex(fundPoints, indexPoints);

  assert.equal(calibration.calibrated, true);
  assert.equal(calibration.source, "LIVE_HISTORY");
  assert.equal(calibration.alignment, "PREVIOUS_SESSION");
  assert.ok(Math.abs(calibration.beta - 0.82) < 1e-10);
  assert.ok(calibration.rSquared > 0.99);
  assert.ok(
    Math.abs(applyFundIndexCalibration(1.3, calibration) - 1.066) < 1e-10,
  );
});

test("feeds recent real-NAV forecast errors into the next estimate", () => {
  const changes = [1.1, -0.8, 1.9, -1.4, 0.5, -2.1, 1.6, -0.2];
  const indexPoints = Array.from({ length: 80 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    changePercent: changes[index % changes.length],
  }));
  const fundPoints = indexPoints.map((point, index) => ({
    date: point.date,
    dailyReturnPercent:
      point.changePercent * 0.9 + (index >= 60 ? 0.3 : 0),
  }));
  const calibration = calibrateFundToIndex(fundPoints, indexPoints);

  assert.equal(calibration.calibrated, true);
  assert.ok(calibration.feedbackBiasPercent > 0.08);
  assert.ok(calibration.validationSampleSize >= 20);
  assert.ok(calibration.meanAbsoluteErrorPercent > 0);
  assert.equal(calibration.latestBacktestDate, indexPoints.at(-1)?.date);
  assert.ok((calibration.latestBacktestErrorPercent ?? 0) > 0);
  const withoutFeedback =
    calibration.alphaPercent + calibration.beta * 1.3;
  assert.ok(
    applyFundIndexCalibration(1.3, calibration) > withoutFeedback,
  );
});

test("uses the latest verified real-NAV calibration during provider outages", () => {
  const calibration = lastValidFundCalibration("017641");
  assert.equal(calibration.calibrated, true);
  assert.equal(calibration.source, "LAST_VALID_HISTORY");
  assert.ok(Math.abs(calibration.beta - 0.9370667671018301) < 1e-12);
});
