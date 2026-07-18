import assert from "node:assert/strict";
import test from "node:test";
import { calculatePortfolio, calculateXirr } from "../lib/calculations";
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
