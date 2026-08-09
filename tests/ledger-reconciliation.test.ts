import assert from "node:assert/strict";
import test from "node:test";
import { reconcileTradeEntry } from "../lib/ledger-reconciliation";
import { MONEY_SCALE, PRICE_SCALE, QUANTITY_SCALE } from "../lib/money";

test("flags a trade whose recorded amount conflicts with shares times NAV", () => {
  const result = reconcileTradeEntry({
    kind: "BUY",
    quantity_units: 11.976048 * QUANTITY_SCALE,
    price_units: 1.67 * PRICE_SCALE,
    gross_amount_units: 10 * MONEY_SCALE,
    fee_units: 0.01 * MONEY_SCALE,
    tax_units: 0,
  });

  assert.ok(result?.needsReview);
  assert.ok(Math.abs(result!.calculatedAmount - 20) < 0.0001);
  assert.ok(Math.abs(result!.gap - 10) < 0.0001);
});

test("allows normal rounding and fee-sized differences", () => {
  const result = reconcileTradeEntry({
    kind: "BUY",
    quantity_units: 100_000_000,
    price_units: 1_001_000,
    gross_amount_units: 100 * MONEY_SCALE,
    fee_units: 0.1 * MONEY_SCALE,
    tax_units: 0,
  });

  assert.equal(result?.needsReview, false);
});
