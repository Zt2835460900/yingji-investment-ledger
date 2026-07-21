import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_NAME_MAX_LENGTH,
  accountRenameUpdatesFromLatestBuys,
  accountNameForEntry,
} from "../lib/account-renaming";

test("BUY can rename an account from the official instrument name", () => {
  assert.equal(
    accountNameForEntry({
      kind: "BUY",
      autoRenameAccount: true,
      instrumentId: 17,
      instrumentName: "  华夏纳斯达克100ETF联接(QDII)A  ",
    }),
    "华夏纳斯达克100ETF联接(QDII)A",
  );
});

test("account rename uses the same maximum length as account creation", () => {
  const result = accountNameForEntry({
    kind: "BUY",
    autoRenameAccount: true,
    instrumentId: 17,
    instrumentName: "产".repeat(ACCOUNT_NAME_MAX_LENGTH + 10),
  });
  assert.equal(result?.length, ACCOUNT_NAME_MAX_LENGTH);
});

test("SELL never renames an account", () => {
  assert.equal(
    accountNameForEntry({
      kind: "SELL",
      autoRenameAccount: true,
      instrumentId: 17,
      instrumentName: "正式产品名称",
    }),
    null,
  );
});

test("BUY without the explicit flag never renames an account", () => {
  for (const autoRenameAccount of [false, undefined, "true", 1]) {
    assert.equal(
      accountNameForEntry({
        kind: "BUY",
        autoRenameAccount,
        instrumentId: 17,
        instrumentName: "正式产品名称",
      }),
      null,
    );
  }
});

test("invalid instrument identity cannot trigger an account rename", () => {
  assert.equal(
    accountNameForEntry({
      kind: "BUY",
      autoRenameAccount: true,
      instrumentId: 0,
      instrumentName: "正式产品名称",
    }),
    null,
  );
});

test("latest-buy synchronization only emits accounts whose official name changed", () => {
  assert.deepEqual(
    accountRenameUpdatesFromLatestBuys([
      {
        accountId: 1,
        currentName: "纳斯达克100ETF",
        instrumentId: 17,
        instrumentName: "华宝纳斯达克精选股票发起式(QDII)A",
      },
      {
        accountId: 2,
        currentName: "标普500ETF",
        instrumentId: 18,
        instrumentName: "标普500ETF",
      },
    ]),
    [
      {
        accountId: 1,
        name: "华宝纳斯达克精选股票发起式(QDII)A",
      },
    ],
  );
});
