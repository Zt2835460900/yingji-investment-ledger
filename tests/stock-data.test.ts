import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAshareHistoryUrl,
  buildAshareQuoteUrl,
  describeUnsupportedStockCode,
  normalizeProductCodeInput,
  parseAshareCode,
  parseAshareHistoryPayload,
  parseAshareQuotePayload,
  parsePreferredProductType,
  productCodeLookupCandidates,
  productTypeMatchesPreference,
} from "../lib/stock-data";

test("normalizes Shanghai and Shenzhen A-share code styles", () => {
  assert.deepEqual(parseAshareCode("600519"), {
    code: "600519",
    canonicalCode: "SH600519",
    market: "SH",
    secid: "1.600519",
  });
  assert.deepEqual(parseAshareCode("000001.sz"), {
    code: "000001",
    canonicalCode: "SZ000001",
    market: "SZ",
    secid: "0.000001",
  });
  assert.deepEqual(parseAshareCode("sz300750"), {
    code: "300750",
    canonicalCode: "SZ300750",
    market: "SZ",
    secid: "0.300750",
  });
  // A six-digit identifier can be valid in both catalogues. The route checks
  // the fund catalogue first in AUTO mode; STOCK explicitly uses this result.
  assert.equal(parseAshareCode("001513")?.canonicalCode, "SZ001513");
  assert.throws(() => parseAshareCode("SH000001"), /市场前缀不匹配/);
});

test("parses a real quote payload using the provider decimal scale", () => {
  const stock = parseAshareCode("SH600519")!;
  assert.deepEqual(
    parseAshareQuotePayload(
      {
        data: {
          f43: 125300,
          f57: "600519",
          f58: "贵州茅台",
          f59: 2,
          f86: 1784275919,
        },
      },
      stock,
    ),
    { name: "贵州茅台", price: 1253, priceDate: "2026-07-17" },
  );
  assert.throws(
    () =>
      parseAshareQuotePayload(
        { data: { f43: "-", f57: "600519", f58: "贵州茅台", f59: 2 } },
        stock,
      ),
    /价格暂不可用/,
  );
});

test("constructs stock requests only on the fixed quote host", () => {
  const url = new URL(buildAshareQuoteUrl(parseAshareCode("600519")!));
  assert.equal(url.origin, "https://push2.eastmoney.com");
  assert.equal(url.pathname, "/api/qt/stock/get");
  assert.equal(url.searchParams.get("secid"), "1.600519");
  assert.equal(url.searchParams.get("fields"), "f43,f57,f58,f59,f86");
});

test("constructs and parses daily K-line data on the fixed history host", () => {
  const stock = parseAshareCode("600519")!;
  const url = new URL(buildAshareHistoryUrl(stock, 120));
  assert.equal(url.origin, "https://push2his.eastmoney.com");
  assert.equal(url.pathname, "/api/qt/stock/kline/get");
  assert.equal(url.searchParams.get("secid"), "1.600519");
  assert.equal(url.searchParams.get("klt"), "101");
  const parsed = parseAshareHistoryPayload(
    {
      data: {
        code: "600519",
        name: "贵州茅台",
        klines: ["2026-07-17,1250.00,1253.00,1260.00,1240.00,12345,15400000,1.60,0.24,3.00,0.30"],
      },
    },
    stock,
  );
  assert.equal(parsed.name, "贵州茅台");
  assert.deepEqual(parsed.bars[0], {
    date: "2026-07-17",
    open: 1250,
    close: 1253,
    high: 1260,
    low: 1240,
    volume: 12345,
    amount: 15400000,
    changePercent: 0.24,
    change: 3,
    turnover: 0.3,
  });
});

test("rejects URL, path and query-string input before any network request", () => {
  for (const malicious of [
    "https://example.com/a",
    "../../etc/passwd",
    "600519?redirect=evil.test",
    "600519#fragment",
    "600519\\host",
    "SH600519&x=1",
  ]) {
    assert.throws(() => normalizeProductCodeInput(malicious), /代码格式不正确/);
  }
});

test("validates disambiguation and explains unsupported foreign codes", () => {
  assert.equal(parsePreferredProductType(undefined), "AUTO");
  assert.equal(parsePreferredProductType("stock"), "STOCK");
  assert.throws(() => parsePreferredProductType("ETF"), /只能选择/);
  assert.match(describeUnsupportedStockCode("00700.HK"), /港股.*手动新增/);
  assert.match(describeUnsupportedStockCode("AAPL"), /美股.*手动新增/);
  assert.match(describeUnsupportedStockCode("430047"), /仅支持沪深 A 股/);
});

test("keeps colliding fund and stock identities in separate namespaces", () => {
  assert.deepEqual(productCodeLookupCandidates("000001", "FUND"), ["000001"]);
  assert.deepEqual(productCodeLookupCandidates("000001", "STOCK"), [
    "SZ000001",
    "000001",
  ]);
  assert.deepEqual(productCodeLookupCandidates("000001", "AUTO"), [
    "000001",
    "SZ000001",
  ]);
  assert.deepEqual(productCodeLookupCandidates("SH600519", "STOCK"), [
    "SH600519",
    "600519",
  ]);

  assert.equal(productTypeMatchesPreference("FUND", "FUND"), true);
  assert.equal(productTypeMatchesPreference("ETF", "FUND"), true);
  assert.equal(productTypeMatchesPreference("STOCK", "FUND"), false);
  assert.equal(productTypeMatchesPreference("STOCK", "STOCK"), true);
  assert.equal(productTypeMatchesPreference("FUND", "STOCK"), false);
  assert.equal(productTypeMatchesPreference("OTHER", "AUTO"), true);
});
