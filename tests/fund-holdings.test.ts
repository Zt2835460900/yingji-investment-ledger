import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateFundLookthrough,
  parseEastmoneyFundAnnouncement,
  parseEastmoneyFundHoldings,
  type FundHoldingsDisclosure,
} from "../lib/fund-holdings";

const responseFixture = `
var apidata={ content:"<div class='box'><div class='boxitem w790'>
<h4><a title='易方达信息产业混合A' href='http://fund.eastmoney.com/001513.html'>易方达信息产业混合A</a>&nbsp;2026年1季度股票投资明细
<label>来源：天天基金&nbsp;截止至：<font class='px12'>2026-03-31</font></label></h4>
<table class='w782 comm tzxq'><thead><tr><th>序号</th></tr></thead><tbody>
<tr><td>1</td><td><a>300502</a></td><td><a>新易盛</a></td><td><span></span></td><td><span></span></td><td>资讯</td><td>8.69%</td><td>146.73</td><td>64,978.00</td></tr>
<tr><td>2</td><td><a>NVDA</a></td><td><a>NVIDIA &amp; Co.</a></td><td>--</td><td>--</td><td>资讯</td><td>8.38%</td><td>110.02</td><td>62,646.32</td></tr>
</tbody></table></div></div>",arryear:[2026,2025],curyear:2026};
`;

test("parses quarterly fund holdings without evaluating the source script", () => {
  const parsed = parseEastmoneyFundHoldings(
    responseFixture,
    "001513",
    "2026-07-18T00:00:00.000Z",
    "https://example.test/data",
  );
  assert.ok(parsed);
  assert.equal(parsed.fundName, "易方达信息产业混合A");
  assert.equal(parsed.reportPeriod, "2026年第1季度");
  assert.equal(parsed.reportDate, "2026-03-31");
  assert.equal(parsed.disclosureDate, null);
  assert.equal(parsed.disclosureDateAvailable, false);
  assert.equal(parsed.source.isFundManagerOfficial, false);
  assert.match(parsed.source.name, /东方财富/);
  assert.deepEqual(parsed.holdings[0], {
    rank: 1,
    stockCode: "300502",
    stockName: "新易盛",
    weightBps: 869,
    weightPercent: 8.69,
    sharesTenThousand: 146.73,
    marketValueTenThousandCny: 64978,
  });
  assert.equal(parsed.holdings[1].stockCode, "NVDA");
  assert.equal(parsed.holdings[1].stockName, "NVIDIA & Co.");
  assert.equal(parsed.disclosedTopHoldingsWeightBps, 1707);
});

test("rejects malformed codes and incomplete disclosures", () => {
  assert.equal(parseEastmoneyFundHoldings(responseFixture, "../../etc"), null);
  assert.equal(
    parseEastmoneyFundHoldings("var apidata={content:''};", "001513"),
    null,
  );
});

test("matches the quarterly report publication date without guessing", () => {
  const result = parseEastmoneyFundAnnouncement(
    JSON.stringify({
      Data: [
        {
          TITLE: "易方达信息产业混合型证券投资基金2025年年度报告",
          PUBLISHDATEDesc: "2026-03-31",
          ID: "AN202603311820890862",
        },
        {
          TITLE: "易方达信息产业混合型证券投资基金2026年第1季度报告",
          PUBLISHDATEDesc: "2026-04-22",
          ID: "AN202604221821399864",
        },
      ],
    }),
    "001513",
    "2026年第1季度",
  );
  assert.deepEqual(result, {
    disclosureDate: "2026-04-22",
    title: "易方达信息产业混合型证券投资基金2026年第1季度报告",
    url: "https://fund.eastmoney.com/gonggao/001513,AN202604221821399864.html",
  });
  assert.equal(
    parseEastmoneyFundAnnouncement("not-json", "001513", "2026年第1季度"),
    null,
  );
});

const disclosure = (
  fundCode: string,
  fundName: string,
  holdings: FundHoldingsDisclosure["holdings"],
): FundHoldingsDisclosure => ({
  fundCode,
  fundName,
  reportPeriod: "2026年第1季度",
  reportDate: "2026-03-31",
  disclosureDate: null,
  disclosureDateAvailable: false,
  isQuarterlyDisclosure: true,
  holdings,
  disclosedTopHoldingsWeightBps: holdings.reduce(
    (sum, holding) => sum + holding.weightBps,
    0,
  ),
  source: {
    name: "东方财富·天天基金公开基金档案（数据源自基金定期报告）",
    url: "https://example.test/page",
    dataUrl: "https://example.test/data",
    announcementUrl: null,
    isFundManagerOfficial: false,
    note: "fixture",
  },
  fetchedAt: "2026-07-18T00:00:00.000Z",
});

const holding = (
  stockCode: string,
  stockName: string,
  weightBps: number,
): FundHoldingsDisclosure["holdings"][number] => ({
  rank: 1,
  stockCode,
  stockName,
  weightBps,
  weightPercent: weightBps / 100,
  sharesTenThousand: null,
  marketValueTenThousandCny: null,
});

test("aggregates overlapping securities with provided portfolio bps", () => {
  const result = aggregateFundLookthrough(
    [
      disclosure("001513", "基金甲", [
        holding("300502", "新易盛", 800),
        holding("300750", "宁德时代", 500),
      ]),
      disclosure("021000", "基金乙", [
        holding("300502", "新易盛", 400),
        holding("NVDA", "英伟达", 900),
      ]),
    ],
    { "001513": 6000, "021000": 3000 },
  );
  assert.equal(result.weightMode, "PROVIDED");
  assert.equal(result.holdings[0].stockCode, "300502");
  assert.equal(result.holdings[0].estimatedPortfolioWeightBps, 600);
  assert.equal(result.holdings[0].estimatedPortfolioWeightPercent, 6);
  assert.equal(result.holdings[0].fundCount, 2);
  assert.equal(result.holdings[0].isOverlap, true);
  assert.deepEqual(
    result.overlaps.map((item) => item.stockCode),
    ["300502"],
  );
  assert.equal(result.disclosedCoverageBps, 1170);
  assert.equal(result.disclosedCoveragePercent, 11.7);
});

test("uses exact equal weights when portfolio weights are omitted", () => {
  const result = aggregateFundLookthrough([
    disclosure("000001", "基金一", [holding("AAA", "A", 1000)]),
    disclosure("000002", "基金二", [holding("BBB", "B", 1000)]),
    disclosure("000003", "基金三", [holding("CCC", "C", 1000)]),
  ]);
  assert.equal(result.weightMode, "EQUAL");
  assert.equal(
    result.fundWeights.reduce((sum, item) => sum + item.weightBps, 0),
    10_000,
  );
  assert.equal(result.disclosedCoverageBps, 1000);
});
