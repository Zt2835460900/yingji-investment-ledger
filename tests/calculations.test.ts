import assert from "node:assert/strict";
import test from "node:test";
import { calculatePortfolio, calculateXirr } from "../lib/calculations";
import { calculateTradingFeeUnits } from "../lib/fees";
import { calculateFifoRedemptionFeeUnits } from "../lib/fees";
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
