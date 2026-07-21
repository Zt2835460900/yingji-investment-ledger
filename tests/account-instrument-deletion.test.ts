import assert from "node:assert/strict";
import test from "node:test";
import {
  accountInstrumentDeletionConfirmation,
  accountInstrumentDeletionSuccess,
  positiveIntegerId,
} from "../lib/account-instrument-deletion";

test("account and instrument identifiers must be positive integers", () => {
  assert.equal(positiveIntegerId("7", "账户"), 7);
  for (const invalid of [undefined, null, "", 0, -1, 1.5, "abc"])
    assert.throws(() => positiveIntegerId(invalid, "产品"), /产品不存在/);
});

test("product deletion confirmation explains its exact isolation boundary", () => {
  const message = accountInstrumentDeletionConfirmation("长期账户", "基金甲");
  for (const expected of [
    "当前账户内的全部买入、卖出、分红、费用等产品流水",
    "对应的定投计划",
    "独立入金/出金",
    "其他产品",
    "其他账户",
    "全局产品资料",
    "目标配置",
    "无法撤销",
  ])
    assert.ok(message.includes(expected), expected);
});

test("product deletion toast reports affected row counts", () => {
  assert.equal(
    accountInstrumentDeletionSuccess({ deletedEntries: 5, deletedPlans: 1 }),
    "产品已删除：5 条流水、1 个定投计划",
  );
});
