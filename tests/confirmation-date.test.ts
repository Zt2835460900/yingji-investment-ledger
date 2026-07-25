import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateFundConfirmationDate,
  nextBusinessDay,
} from "../lib/confirmation-date";

test("fund confirmation uses T+1 before the 15:00 cut-off", () => {
  const result = estimateFundConfirmationDate("2026-07-20", {
    businessDays: 1,
    tradeTime: "14:59",
  });
  assert.equal(result.acceptedDate, "2026-07-20");
  assert.equal(result.confirmationDate, "2026-07-21");
  assert.equal(result.cutoffPassed, false);
});

test("fund confirmation rolls a post-cut-off order forward", () => {
  const result = estimateFundConfirmationDate("2026-07-17", {
    businessDays: 1,
    tradeTime: "15:00",
  });
  assert.equal(result.acceptedDate, "2026-07-20");
  assert.equal(result.confirmationDate, "2026-07-21");
  assert.equal(result.cutoffPassed, true);
});

test("weekend orders roll to the next business day before T+N", () => {
  const result = estimateFundConfirmationDate("2026-07-18", {
    businessDays: 2,
    tradeTime: "10:00",
  });
  assert.equal(result.acceptedDate, "2026-07-20");
  assert.equal(result.confirmationDate, "2026-07-22");
  assert.equal(nextBusinessDay("2026-07-18", 0), "2026-07-20");
});

test("exchange traded products keep the trade date", () => {
  const result = estimateFundConfirmationDate("2026-07-17", {
    businessDays: 0,
    tradeTime: "16:00",
    isExchangeTraded: true,
  });
  assert.equal(result.confirmationDate, "2026-07-17");
});

test("mainland market holidays use the published market closure calendar", () => {
  const result = estimateFundConfirmationDate("2026-10-01", {
    businessDays: 1,
    tradeTime: "10:00",
  });
  assert.equal(result.acceptedDate, "2026-10-08");
  assert.equal(result.confirmationDate, "2026-10-09");
  assert.equal(result.calendarCovered, true);
});
