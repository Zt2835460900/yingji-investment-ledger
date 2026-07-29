import assert from "node:assert/strict";
import test from "node:test";
import { calculatePaperPortfolio } from "../lib/paper-trading";
import { MONEY_SCALE, PRICE_SCALE, QUANTITY_SCALE } from "../lib/money";

const instrument = {
  id: 1,
  name: "测试股票",
  code: "600000",
  market: "SH",
  asset_class: "中国股票",
  product_type: "STOCK",
};
const trade = (
  id: number,
  side: "BUY" | "SELL",
  quantity: number,
  price: number,
  fee = 0,
) => ({
  id,
  account_id: 1,
  instrument_id: 1,
  side,
  trade_date: `2026-07-${String(10 + id).padStart(2, "0")}`,
  quantity_units: quantity * QUANTITY_SCALE,
  price_units: price * PRICE_SCALE,
  fee_units: fee * MONEY_SCALE,
});

test("paper buy is valued independently from the real ledger", () => {
  const result = calculatePaperPortfolio(
    100_000 * MONEY_SCALE,
    [trade(1, "BUY", 100, 10, 5)],
    [instrument],
    [
      {
        instrument_id: 1,
        price_date: "2026-07-18",
        price_units: 12 * PRICE_SCALE,
      },
    ],
  );
  assert.equal(result.metrics.cash, 98_995);
  assert.equal(result.metrics.totalAssets, 100_195);
  assert.equal(result.metrics.totalProfit, 195);
  assert.equal(result.holdings[0].averageCost, 10.05);
  assert.equal(result.holdings[0].unrealized, 195);
});

test("paper partial sale retains proceeds as virtual cash", () => {
  const result = calculatePaperPortfolio(
    10_000 * MONEY_SCALE,
    [trade(1, "BUY", 100, 10), trade(2, "SELL", 40, 15, 2)],
    [instrument],
    [
      {
        instrument_id: 1,
        price_date: "2026-07-18",
        price_units: 12 * PRICE_SCALE,
      },
    ],
  );
  assert.equal(result.metrics.cash, 9_598);
  assert.equal(result.metrics.securitiesValue, 720);
  assert.equal(result.metrics.totalProfit, 318);
  assert.equal(result.metrics.realized, 198);
  assert.equal(result.metrics.unrealized, 120);
});

test("paper portfolio rejects overspending and overselling", () => {
  assert.throws(
    () =>
      calculatePaperPortfolio(
        100 * MONEY_SCALE,
        [trade(1, "BUY", 100, 10)],
        [instrument],
        [],
      ),
    /可用资金不足/,
  );
  assert.throws(
    () =>
      calculatePaperPortfolio(
        10_000 * MONEY_SCALE,
        [trade(1, "BUY", 10, 10), trade(2, "SELL", 11, 12)],
        [instrument],
        [],
      ),
    /超过可用持仓/,
  );
  assert.throws(
    () =>
      calculatePaperPortfolio(
        10_000 * MONEY_SCALE,
        [trade(1, "BUY", 10, 10), trade(2, "SELL", 1, 12, 13)],
        [instrument],
        [],
      ),
    /手续费不能超过成交金额/,
  );
});
