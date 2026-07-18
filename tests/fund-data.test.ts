import assert from "node:assert/strict";
import test from "node:test";
import {
  parseEastmoneyLatestNav,
  parseEfundsOfficialNav,
} from "../lib/fund-data";

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
