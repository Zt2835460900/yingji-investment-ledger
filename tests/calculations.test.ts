import assert from "node:assert/strict";
import test from "node:test";
import { calculatePortfolio, calculateXirr } from "../lib/calculations";
import { calculateTradingFeeUnits } from "../lib/fees";
import { calculateFifoRedemptionFeeUnits } from "../lib/fees";
import {
  classifyFund,
  parseFundCategory,
  selectFundNav,
} from "../lib/fund-data";
import { classifyMarketNews } from "../lib/market-news";
import {
  decimalToUnits,
  MONEY_SCALE,
  PRICE_SCALE,
  QUANTITY_SCALE,
  tradeGrossUnits,
} from "../lib/money";
import type {
  AccountRow,
  InstrumentRow,
  LedgerRow,
  PriceRow,
} from "../lib/types";

test("XIRR matches a one-year 10% return", () => {
  const result = calculateXirr([
    { date: "2025-01-01", value: -1_000 },
    { date: "2026-01-01", value: 1_100 },
  ]);
  assert.ok(result !== null);
  assert.ok(Math.abs(result - 0.1) < 1e-8);
});

test("XIRR refuses an ambiguous multiple-root cash-flow stream", () => {
  const result = calculateXirr([
    { date: "2024-01-01", value: -100 },
    { date: "2025-01-01", value: 230 },
    { date: "2026-01-01", value: -132 },
  ]);
  assert.equal(result, null);
});

test("scaled integer helpers avoid floating-point storage drift", () => {
  assert.equal(decimalToUnits("12.3456"), 123_456);
  assert.equal(decimalToUnits("2.846", PRICE_SCALE), 2_846_000);
  assert.equal(
    tradeGrossUnits(1 * QUANTITY_SCALE, 2_846_000),
    2.846 * MONEY_SCALE,
  );
});

test("fund profile parsing and classification use the published category", () => {
  const profile =
    "<tr><th>基金代码</th><td>001513（前端）<th>基金类型</th><td>混合型-偏股</td></tr>";
  const category = parseFundCategory(profile);
  assert.equal(category, "混合型-偏股");
  assert.deepEqual(classifyFund("001513", "易方达信息产业混合A", category), {
    productType: "FUND",
    assetClass: "中国股票",
    confirmationBusinessDays: 1,
  });
});

test("ETF links stay off-exchange funds while listed ETFs are classified correctly", () => {
  assert.equal(
    classifyFund("012708", "广发纳斯达克100ETF联接A", "QDII-指数型")
      .productType,
    "FUND",
  );
  assert.deepEqual(classifyFund("513100", "纳指ETF", "指数型-海外股票"), {
    productType: "ETF",
    assetClass: "美国股票",
    confirmationBusinessDays: 0,
  });
});

test("historical fund NAV follows the selected trade date", () => {
  const points = [
    { date: "2026-07-16", nav: 1.12 },
    { date: "2026-07-17", nav: 1.15 },
    { date: "2026-07-20", nav: 1.18 },
  ];
  assert.deepEqual(selectFundNav(points, "2026-07-17"), points[1]);
  assert.deepEqual(selectFundNav(points, "2026-07-18"), points[1]);
  assert.equal(selectFundNav(points, "2026-07-01"), null);
  assert.deepEqual(selectFundNav(points), points[2]);
});

test("market news is grouped into ETF and overseas sections", () => {
  assert.equal(classifyMarketNews("超2100亿元资金借道ETF进场扫货"), "基金ETF");
  assert.equal(classifyMarketNews("美股三大指数收跌，纳指跌超1%"), "海外市场");
});

test("fund subscription fee applies platform discount and exact rounding", () => {
  const fee = calculateTradingFeeUnits("BUY", 10_000 * MONEY_SCALE, {
    buyFeeBps: 150,
    buyDiscountBps: 1_000,
    sellFeeBps: 50,
    minFeeUnits: 0,
  });
  assert.equal(fee, 15 * MONEY_SCALE);
});

test("ETF commission respects the configured minimum fee", () => {
  const fee = calculateTradingFeeUnits("BUY", 1_000 * MONEY_SCALE, {
    buyFeeBps: 3,
    buyDiscountBps: 10_000,
    sellFeeBps: 3,
    minFeeUnits: 5 * MONEY_SCALE,
  });
  assert.equal(fee, 5 * MONEY_SCALE);
});

test("fund redemption fee uses FIFO holding-period tiers", () => {
  const fee = calculateFifoRedemptionFeeUnits(
    [
      { tradeDate: "2026-07-15", quantityUnits: 100 * QUANTITY_SCALE },
      { tradeDate: "2026-01-01", quantityUnits: 100 * QUANTITY_SCALE },
    ],
    150 * QUANTITY_SCALE,
    1_500 * MONEY_SCALE,
    "2026-07-18",
    [
      { label: "小于7天", minDays: 0, maxDays: 7, rateBps: 150 },
      { label: "大于等于7天", minDays: 7, maxDays: null, rateBps: 50 },
    ],
  );
  assert.equal(fee, 17.5 * MONEY_SCALE);
});

test("a new deposit does not create TWR profit", () => {
  const accounts: AccountRow[] = [
    {
      id: 1,
      name: "测试账户",
      currency: "CNY",
      color: "#000",
      cost_method: "MOVING_AVERAGE",
    },
  ];
  const instruments: InstrumentRow[] = [
    {
      id: 1,
      name: "测试ETF",
      code: "TEST",
      market: "CN",
      asset_class: "股票",
      currency: "CNY",
      product_type: "ETF",
      buy_fee_bps: 3,
      buy_discount_bps: 10_000,
      sell_fee_bps: 3,
      min_fee_units: 5 * MONEY_SCALE,
      eastmoney_fee_bps: 3,
      min_purchase_units: 0,
      redemption_fee_json: "[]",
      data_source: "TEST",
      source_updated_at: "",
    },
  ];
  const ledger: LedgerRow[] = [
    {
      id: 1,
      account_id: 1,
      instrument_id: null,
      kind: "DEPOSIT",
      trade_date: "2026-07-15",
      confirmation_date: "",
      quantity_units: 0,
      price_units: 0,
      gross_amount_units: 10_000 * MONEY_SCALE,
      fee_units: 0,
      tax_units: 0,
      notes: "",
      external_ref: "",
      purchase_channel: "DIRECT",
      fee_source: "TEST",
    },
    {
      id: 2,
      account_id: 1,
      instrument_id: 1,
      kind: "BUY",
      trade_date: "2026-07-15",
      confirmation_date: "2026-07-16",
      quantity_units: 1_000 * QUANTITY_SCALE,
      price_units: 10 * PRICE_SCALE,
      gross_amount_units: 10_000 * MONEY_SCALE,
      fee_units: 0,
      tax_units: 0,
      notes: "",
      external_ref: "",
      purchase_channel: "DIRECT",
      fee_source: "TEST",
    },
    {
      id: 3,
      account_id: 1,
      instrument_id: null,
      kind: "DEPOSIT",
      trade_date: "2026-07-17",
      confirmation_date: "",
      quantity_units: 0,
      price_units: 0,
      gross_amount_units: 5_000 * MONEY_SCALE,
      fee_units: 0,
      tax_units: 0,
      notes: "",
      external_ref: "",
      purchase_channel: "DIRECT",
      fee_source: "TEST",
    },
  ];
  const prices: PriceRow[] = [
    {
      id: 1,
      instrument_id: 1,
      price_date: "2026-07-15",
      price_units: 10 * PRICE_SCALE,
      source: "TEST",
    },
  ];
  const result = calculatePortfolio(
    accounts,
    instruments,
    ledger,
    prices,
    [],
    [],
  );
  assert.equal(result.metrics.totalProfit, 0);
  assert.ok(Math.abs(result.metrics.twr) < 1e-12);
  assert.equal(result.metrics.netContributions, 15_000);
});

test("a trade-only account derives invested capital without negative cash", () => {
  const accounts: AccountRow[] = [
    {
      id: 1,
      name: "直接买入账户",
      currency: "CNY",
      color: "#5B7CFA",
      cost_method: "MOVING_AVERAGE",
    },
  ];
  const instruments: InstrumentRow[] = [
    {
      id: 1,
      name: "测试基金",
      code: "000001",
      market: "CN",
      asset_class: "中国股票",
      currency: "CNY",
      product_type: "FUND",
      buy_fee_bps: 15,
      buy_discount_bps: 10_000,
      sell_fee_bps: 0,
      min_fee_units: 0,
      eastmoney_fee_bps: 15,
      min_purchase_units: 0,
      redemption_fee_json: "[]",
      data_source: "TEST",
      source_updated_at: "",
    },
  ];
  const ledger: LedgerRow[] = [
    {
      id: 1,
      account_id: 1,
      instrument_id: 1,
      kind: "BUY",
      trade_date: "2026-07-15",
      confirmation_date: "2026-07-16",
      quantity_units: 1_000 * QUANTITY_SCALE,
      price_units: 10 * PRICE_SCALE,
      gross_amount_units: 10_000 * MONEY_SCALE,
      fee_units: 10 * MONEY_SCALE,
      tax_units: 0,
      notes: "",
      external_ref: "",
      purchase_channel: "THIRD_PARTY",
      fee_source: "TEST",
    },
  ];
  const prices: PriceRow[] = [
    {
      id: 1,
      instrument_id: 1,
      price_date: "2026-07-18",
      price_units: 9.8 * PRICE_SCALE,
      source: "TEST",
    },
  ];

  const result = calculatePortfolio(
    accounts,
    instruments,
    ledger,
    prices,
    [],
    [],
  );

  assert.equal(result.metrics.netContributions, 10_010);
  assert.equal(result.metrics.totalAssets, 9_800);
  assert.equal(result.metrics.securitiesValue, 9_800);
  assert.equal(result.metrics.cash, 0);
  assert.equal(result.metrics.holdingCost, 10_010);
  assert.equal(result.metrics.totalProfit, -210);
  assert.equal(result.accounts[0].contributions, 10_010);
  assert.equal(result.accounts[0].assets, 9_800);
  assert.equal(result.accounts[0].securitiesValue, 9_800);
  assert.equal(result.accounts[0].cash, 0);
  assert.equal(result.accounts[0].profit, -210);
  assert.equal(
    result.metrics.totalAssets,
    result.metrics.netContributions + result.metrics.totalProfit,
  );
  assert.equal(result.allocation[0].actual, 1);
  assert.ok(result.allocation.every((item) => item.actual >= 0));
});

const accountingAccount: AccountRow = {
  id: 1,
  name: "Retained cash account",
  currency: "CNY",
  color: "#5B7CFA",
  cost_method: "MOVING_AVERAGE",
};

function accountingInstrument(id = 1): InstrumentRow {
  return {
    id,
    name: `Fund ${id}`,
    code: String(id).padStart(6, "0"),
    market: "CN",
    asset_class: "EQUITY",
    currency: "CNY",
    product_type: "FUND",
    buy_fee_bps: 0,
    buy_discount_bps: 10_000,
    sell_fee_bps: 0,
    min_fee_units: 0,
    eastmoney_fee_bps: 0,
    min_purchase_units: 0,
    redemption_fee_json: "[]",
    data_source: "TEST",
    source_updated_at: "",
  };
}

function accountingEntry(
  id: number,
  kind: LedgerRow["kind"],
  options: {
    date?: string;
    instrumentId?: number | null;
    quantity?: number;
    price?: number;
    gross?: number;
    fee?: number;
  } = {},
): LedgerRow {
  const quantity = options.quantity ?? 0;
  const price = options.price ?? 0;
  const gross = options.gross ?? quantity * price;
  return {
    id,
    account_id: 1,
    instrument_id:
      options.instrumentId === undefined ? 1 : options.instrumentId,
    kind,
    trade_date: options.date ?? "2026-07-15",
    confirmation_date: options.date ?? "2026-07-15",
    quantity_units: quantity * QUANTITY_SCALE,
    price_units: price * PRICE_SCALE,
    gross_amount_units: gross * MONEY_SCALE,
    fee_units: (options.fee ?? 0) * MONEY_SCALE,
    tax_units: 0,
    notes: "",
    external_ref: "",
    purchase_channel: "THIRD_PARTY",
    fee_source: "TEST",
  };
}

function accountingPrice(
  id: number,
  price: number,
  date = "2026-07-18",
  instrumentId = 1,
): PriceRow {
  return {
    id,
    instrument_id: instrumentId,
    price_date: date,
    price_units: price * PRICE_SCALE,
    source: "TEST",
  };
}

test("an open profitable holding is included in total assets", () => {
  const result = calculatePortfolio(
    [accountingAccount],
    [accountingInstrument()],
    [accountingEntry(1, "BUY", { quantity: 100, price: 10 })],
    [accountingPrice(1, 12)],
    [],
    [],
  );

  assert.equal(result.metrics.netContributions, 1_000);
  assert.equal(result.metrics.securitiesValue, 1_200);
  assert.equal(result.metrics.cash, 0);
  assert.equal(result.metrics.totalAssets, 1_200);
  assert.equal(result.metrics.unrealized, 200);
  assert.equal(result.metrics.totalProfit, 200);
  assert.equal(
    result.metrics.totalAssets,
    result.metrics.netContributions + result.metrics.totalProfit,
  );
});

test("a partial sale stays as cash and realized profit remains in total assets", () => {
  const result = calculatePortfolio(
    [accountingAccount],
    [accountingInstrument()],
    [
      accountingEntry(1, "BUY", { quantity: 100, price: 10 }),
      accountingEntry(2, "SELL", {
        date: "2026-07-16",
        quantity: 40,
        price: 15,
      }),
    ],
    [accountingPrice(1, 12)],
    [],
    [],
  );

  assert.equal(result.metrics.netContributions, 1_000);
  assert.equal(result.metrics.securitiesValue, 720);
  assert.equal(result.metrics.cash, 600);
  assert.equal(result.metrics.totalAssets, 1_320);
  assert.equal(result.metrics.realized, 200);
  assert.equal(result.metrics.unrealized, 120);
  assert.equal(result.metrics.totalProfit, 320);
  assert.equal(result.accounts[0].cash, 600);
  assert.equal(result.accounts[0].securitiesValue, 720);
});

test("reusing retained sale proceeds does not increase invested capital", () => {
  const result = calculatePortfolio(
    [accountingAccount],
    [accountingInstrument()],
    [
      accountingEntry(1, "BUY", { quantity: 100, price: 10 }),
      accountingEntry(2, "SELL", {
        date: "2026-07-16",
        quantity: 40,
        price: 15,
      }),
      accountingEntry(3, "BUY", {
        date: "2026-07-17",
        quantity: 30,
        price: 10,
      }),
    ],
    [accountingPrice(1, 12)],
    [],
    [],
  );

  assert.equal(result.metrics.deposits, 1_000);
  assert.equal(result.metrics.netContributions, 1_000);
  assert.equal(result.metrics.cash, 300);
  assert.equal(result.metrics.securitiesValue, 1_080);
  assert.equal(result.metrics.totalAssets, 1_380);
  assert.equal(result.metrics.totalProfit, 380);
});

test("withdrawing retained cash reduces net investment but not earned profit", () => {
  const result = calculatePortfolio(
    [accountingAccount],
    [accountingInstrument()],
    [
      accountingEntry(1, "BUY", { quantity: 100, price: 10 }),
      accountingEntry(2, "SELL", {
        date: "2026-07-16",
        quantity: 40,
        price: 15,
      }),
      accountingEntry(3, "WITHDRAWAL", {
        date: "2026-07-17",
        instrumentId: null,
        gross: 500,
      }),
    ],
    [accountingPrice(1, 12)],
    [],
    [],
  );

  assert.equal(result.metrics.withdrawals, 500);
  assert.equal(result.metrics.netContributions, 500);
  assert.equal(result.metrics.cash, 100);
  assert.equal(result.metrics.totalAssets, 820);
  assert.equal(result.metrics.totalProfit, 320);
  assert.equal(
    result.metrics.totalAssets,
    result.metrics.netContributions + result.metrics.totalProfit,
  );
});

test("dividends remain as available cash until explicitly withdrawn", () => {
  const result = calculatePortfolio(
    [accountingAccount],
    [accountingInstrument()],
    [
      accountingEntry(1, "BUY", { quantity: 100, price: 10 }),
      accountingEntry(2, "DIVIDEND", {
        date: "2026-07-17",
        quantity: 0,
        price: 0,
        gross: 50,
      }),
    ],
    [accountingPrice(1, 10)],
    [],
    [],
  );

  assert.equal(result.metrics.netContributions, 1_000);
  assert.equal(result.metrics.income, 50);
  assert.equal(result.metrics.cash, 50);
  assert.equal(result.metrics.totalAssets, 1_050);
  assert.equal(result.metrics.totalProfit, 50);
});

test("valuation freshness is derived conservatively from held instruments", () => {
  const result = calculatePortfolio(
    [accountingAccount],
    [accountingInstrument(1), accountingInstrument(2), accountingInstrument(3)],
    [
      accountingEntry(1, "BUY", { instrumentId: 1, quantity: 10, price: 10 }),
      accountingEntry(2, "BUY", {
        date: "2026-07-16",
        instrumentId: 2,
        quantity: 10,
        price: 10,
      }),
      accountingEntry(3, "BUY", {
        date: "2026-07-17",
        instrumentId: 3,
        quantity: 10,
        price: 10,
      }),
    ],
    [
      accountingPrice(1, 11, "2026-07-16", 1),
      accountingPrice(2, 12, "2026-07-17", 2),
    ],
    [],
    [],
  );

  assert.equal(result.valuationDate, "2026-07-16");
  assert.equal(result.latestValuationDate, "2026-07-17");
  assert.equal(result.missingPriceCount, 1);
});
