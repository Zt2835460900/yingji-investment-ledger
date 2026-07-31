import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateHoldingMoveEstimate,
  normalizeCompanySymbol,
  parseAshareEarningsRows,
  parseCompanyQuotePayload,
  parseNasdaqEarningsDatePayload,
  parseNasdaqEarningsSurprisePayload,
} from "../lib/company-insights";

test("normalizes supported company symbols without accepting URLs", () => {
  assert.deepEqual(normalizeCompanySymbol("nvda"), {
    symbol: "NVDA",
    market: "US",
  });
  assert.deepEqual(normalizeCompanySymbol("600519", "CN"), {
    symbol: "600519",
    market: "CN",
  });
  assert.deepEqual(normalizeCompanySymbol("700", "HK"), {
    symbol: "00700",
    market: "HK",
  });
  assert.throws(() => normalizeCompanySymbol("https://example.com"), /格式/);
});

test("parses an Eastmoney global quote with scaled price and daily move", () => {
  const quote = parseCompanyQuotePayload(
    {
      data: {
        f43: 195040,
        f57: "NVDA",
        f58: "英伟达",
        f59: 3,
        f60: 190010,
        f86: 1785456000,
        f170: 265,
      },
    },
    "NVDA",
    "US",
  );
  assert.equal(quote.price, 195.04);
  assert.equal(quote.previousClose, 190.01);
  assert.equal(quote.changePercent, 2.65);
  assert.equal(quote.name, "英伟达");
});

test("parses Nasdaq upcoming earnings wording and latest surprise", () => {
  const upcoming = parseNasdaqEarningsDatePayload(
    {
      data: {
        announcement: "Earnings announcement* for NVDA: Aug 26, 2026",
        reportText:
          "NVIDIA is expected* to report earnings on 08/26/2026 after market close. The report will be for the fiscal Quarter ending Jul 2026. The consensus EPS forecast for the quarter is $2.01.",
      },
    },
    "NVDA",
  );
  assert.equal(upcoming.upcomingDate, "2026-08-26");
  assert.equal(upcoming.upcomingTiming, "美股盘后");
  assert.equal(upcoming.upcomingPeriod, "Jul 2026");
  assert.equal(upcoming.epsForecast, 2.01);
  assert.equal(upcoming.isEstimated, true);

  const latest = parseNasdaqEarningsSurprisePayload({
    data: {
      earningsSurpriseTable: {
        rows: [
          {
            fiscalQtrEnd: "Apr 2026",
            dateReported: "5/20/2026",
            eps: 1.87,
            consensusForecast: "1.7",
            percentageSurprise: "10",
          },
        ],
      },
    },
  });
  assert.equal(latest.latestReportDate, "2026-05-20");
  assert.equal(latest.latestSurprisePercent, 10);
});

test("selects the next and latest published A-share reports", () => {
  const earnings = parseAshareEarningsRows(
    [
      {
        SECURITY_CODE: "000001",
        SECURITY_NAME_ABBR: "平安银行",
        REPORT_TYPE_NAME: "2026年 半年报",
        APPOINT_PUBLISH_DATE: "2026-08-15 00:00:00",
        ACTUAL_PUBLISH_DATE: null,
        IS_PUBLISH: "0",
        REPORT_DATE: "2026-06-30 00:00:00",
      },
      {
        SECURITY_CODE: "000001",
        SECURITY_NAME_ABBR: "平安银行",
        REPORT_TYPE_NAME: "2026年 一季报",
        APPOINT_PUBLISH_DATE: "2026-04-25 00:00:00",
        ACTUAL_PUBLISH_DATE: "2026-04-25 00:00:00",
        IS_PUBLISH: "1",
        REPORT_DATE: "2026-03-31 00:00:00",
      },
    ],
    "000001",
  );
  assert.equal(earnings.upcomingDate, "2026-08-15");
  assert.equal(earnings.latestReportDate, "2026-04-25");
  assert.equal(earnings.name, "平安银行");
});

test("estimates portfolio move only from covered underlying companies", () => {
  const estimate = calculateHoldingMoveEstimate(
    [
      { symbol: "NVDA", weightPercent: 3.31 },
      { symbol: "AAPL", weightPercent: 2.89 },
      { symbol: "UNKNOWN", weightPercent: 5 },
    ],
    [
      { symbol: "NVDA", changePercent: 2.65 },
      { symbol: "AAPL", changePercent: -1.2 },
    ],
    10_000,
  );
  assert.ok(Math.abs(estimate.estimatedRate - 0.00053035) < 1e-12);
  assert.ok(Math.abs(estimate.estimatedProfit - 5.3035) < 1e-9);
  assert.equal(estimate.coveredWeightPercent, 6.2);
  assert.equal(estimate.matchedCompanies, 2);
});
