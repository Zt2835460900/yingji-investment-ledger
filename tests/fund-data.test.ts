import assert from "node:assert/strict";
import test from "node:test";
import {
  parseEastmoneyF10LatestNav,
  parseEastmoneyLatestNav,
  parseEfundsOfficialNav,
  parseFundPurchaseLimit,
  selectFundNavOnOrAfter,
} from "../lib/fund-data";
import { fundOrderNavStartDate } from "../lib/fund-order";

test("parses the latest published NAV from the official E Fund page", () => {
  const html = `
    <section>
      <div class="fund-value" id="net-today">8.5190</div>
      基金净值日期：<span data-kind="date" class="muted nav-update">2026/7/17</span>
    </section>
  `;
  assert.deepEqual(parseEfundsOfficialNav(html), {
    date: "2026-07-17",
    nav: 8.519,
  });
});

test("rejects an incomplete official NAV response", () => {
  assert.equal(parseEfundsOfficialNav('<div id="net-today">8.519</div>'), null);
  assert.equal(
    parseEfundsOfficialNav(
      '<div id="net-today">--</div><span class="nav-update">2026-07-17</span>',
    ),
    null,
  );
});

test("selects the final valid point from the Eastmoney NAV script", () => {
  const script = `
    var fS_name = "测试基金";
    var Data_netWorthTrend = [
      {"x":1784131200000,"y":1.1200,"equityReturn":0},
      {"x":1784217600000,"y":1.1501,"equityReturn":2.68}
    ];
    var Data_ACWorthTrend = [];
  `;
  assert.deepEqual(parseEastmoneyLatestNav(script), {
    date: "2026-07-17",
    nav: 1.1501,
  });
  assert.equal(parseEastmoneyLatestNav("var Data_netWorthTrend = [];"), null);
});

test("parses the newest published NAV from the stable F10 response", () => {
  assert.deepEqual(
    parseEastmoneyF10LatestNav({
      Data: {
        LSJZList: [
          { FSRQ: "2026-08-07", DWJZ: "2.3098" },
          { FSRQ: "2026-08-06", DWJZ: "2.2838" },
        ],
      },
    }),
    { date: "2026-08-07", nav: 2.3098 },
  );
});

test("fund order cutoff chooses the first published NAV on or after its target", () => {
  assert.equal(fundOrderNavStartDate("2026-08-07", "14:59"), "2026-08-07");
  assert.equal(fundOrderNavStartDate("2026-08-07", "15:00"), "2026-08-10");
  assert.equal(fundOrderNavStartDate("2026-08-08", "10:00"), "2026-08-10");
  assert.deepEqual(
    selectFundNavOnOrAfter(
      [
        { date: "2026-08-07", nav: 1 },
        { date: "2026-08-11", nav: 1.1 },
      ],
      "2026-08-10",
    ),
    { date: "2026-08-11", nav: 1.1 },
  );
});

test("parses a paused fund and its published daily purchase limit", () => {
  const html = `
    <div class="staticItem">
      <span class="itemTit">交易状态：</span>
      <span class="staticCell">暂停申购（<span>单日累计购买上限100.00元</span>）</span>
      <span class="staticCell">开放赎回</span>
    </div>
  `;
  assert.deepEqual(parseFundPurchaseLimit(html), {
    status: "PAUSED",
    dailyLimit: 100,
    available: true,
  });
});

test("distinguishes open subscription from exchange-only trading", () => {
  assert.deepEqual(
    parseFundPurchaseLimit(`
      交易状态：</span><span class="staticCell">开放申购</span>
      <span class="staticCell">开放赎回</span>
    `),
    { status: "OPEN", dailyLimit: 0, available: true },
  );
  assert.deepEqual(
    parseFundPurchaseLimit(`
      交易状态：</span><span class="staticCell">场内交易</span>
      <span class="staticCell">场内交易</span>
    `),
    { status: "EXCHANGE_ONLY", dailyLimit: 0, available: true },
  );
  assert.deepEqual(parseFundPurchaseLimit("<main>暂无交易资料</main>"), {
    status: "UNKNOWN",
    dailyLimit: 0,
    available: false,
  });
});
