import { calculatePortfolio } from "@/lib/calculations";
import {
  calculateFifoRedemptionFeeUnits,
  calculateTradingFeeUnits,
  feeRuleFromInput,
} from "@/lib/fees";
import { fetchLiveFundData } from "@/lib/fund-data";
import {
  decimalToUnits,
  isoDate,
  PRICE_SCALE,
  QUANTITY_SCALE,
  tradeGrossUnits,
} from "@/lib/money";
import type {
  AccountRow,
  InstrumentRow,
  LedgerRow,
  PlanRow,
  PriceRow,
  TargetRow,
} from "@/lib/types";
import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";

export const dynamic = "force-dynamic";

const instrumentColumns =
  "id, name, code, market, asset_class, currency, product_type, buy_fee_bps, buy_discount_bps, sell_fee_bps, min_fee_units, eastmoney_fee_bps, min_purchase_units, redemption_fee_json, data_source, source_updated_at";

const inferFundType = (code: string, name: string) =>
  /ETF/i.test(name) || /^(5\d{5}|159\d{3})$/.test(code) ? "ETF" : "FUND";

const inferAssetClass = (name: string) => {
  if (/纳斯达克|标普|美国|美股/i.test(name)) return "美国股票";
  if (/港股|恒生/i.test(name)) return "港股";
  if (/债|固收/i.test(name)) return "债券";
  return "中国股票";
};

async function syncFundInstrument(
  d1: D1Database,
  instrumentId: number,
  code: string,
) {
  const live = await fetchLiveFundData(code);
  await d1
    .prepare(
      "UPDATE instruments SET name = ?, buy_fee_bps = ?, eastmoney_fee_bps = ?, min_purchase_units = ?, redemption_fee_json = ?, data_source = ?, source_updated_at = ? WHERE id = ?",
    )
    .bind(
      live.name,
      live.standardBuyFeeBps,
      live.eastmoneyBuyFeeBps,
      decimalToUnits(live.minPurchase),
      JSON.stringify(live.redemptionTiers),
      live.source,
      live.updatedAt,
      instrumentId,
    )
    .run();
  if (live.latestNav && live.latestNavDate)
    await d1
      .prepare(
        "INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (?, ?, ?, 'EASTMONEY') ON CONFLICT(instrument_id, price_date) DO UPDATE SET price_units = excluded.price_units, source = excluded.source",
      )
      .bind(
        instrumentId,
        live.latestNavDate,
        decimalToUnits(live.latestNav, PRICE_SCALE),
      )
      .run();
  return live;
}

async function resolveFundInstrument(d1: D1Database, codeInput: string) {
  const code = codeInput.trim();
  if (!/^\d{6}$/.test(code)) throw new Error("请输入 6 位基金或 ETF 代码");
  let instrument = await d1
    .prepare(`SELECT ${instrumentColumns} FROM instruments WHERE code = ?`)
    .bind(code)
    .first<InstrumentRow>();

  if (instrument) {
    try {
      await syncFundInstrument(d1, instrument.id, code);
      instrument = await d1
        .prepare(`SELECT ${instrumentColumns} FROM instruments WHERE id = ?`)
        .bind(instrument.id)
        .first<InstrumentRow>();
    } catch {
      // 已收录的产品即使数据源临时不可用，也允许继续录入实际成交。
    }
    return instrument;
  }

  const live = await fetchLiveFundData(code);
  await d1
    .prepare(
      "INSERT OR IGNORE INTO instruments (name, code, market, asset_class, currency, product_type, buy_fee_bps, buy_discount_bps, sell_fee_bps, min_fee_units, eastmoney_fee_bps, min_purchase_units, redemption_fee_json, data_source, source_updated_at) VALUES (?, ?, 'CN', ?, 'CNY', ?, ?, 10000, 0, 0, ?, ?, ?, ?, ?)",
    )
    .bind(
      live.name.slice(0, 80),
      code,
      inferAssetClass(live.name),
      inferFundType(code, live.name),
      live.standardBuyFeeBps,
      live.eastmoneyBuyFeeBps,
      decimalToUnits(live.minPurchase),
      JSON.stringify(live.redemptionTiers),
      live.source,
      live.updatedAt,
    )
    .run();
  instrument = await d1
    .prepare(`SELECT ${instrumentColumns} FROM instruments WHERE code = ?`)
    .bind(code)
    .first<InstrumentRow>();
  if (!instrument) throw new Error("基金资料保存失败");
  if (live.latestNav && live.latestNavDate)
    await d1
      .prepare(
        "INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (?, ?, ?, 'EASTMONEY') ON CONFLICT(instrument_id, price_date) DO UPDATE SET price_units = excluded.price_units, source = excluded.source",
      )
      .bind(
        instrument.id,
        live.latestNavDate,
        decimalToUnits(live.latestNav, PRICE_SCALE),
      )
      .run();
  return instrument;
}

async function loadPortfolio() {
  await ensureDatabase();
  const d1 = getD1();
  const [accounts, instruments, ledger, prices, plans, targets] =
    await Promise.all([
      d1
        .prepare(
          "SELECT id, name, currency, color, cost_method FROM accounts ORDER BY id",
        )
        .all<AccountRow>(),
      d1
        .prepare(
          "SELECT id, name, code, market, asset_class, currency, product_type, buy_fee_bps, buy_discount_bps, sell_fee_bps, min_fee_units, eastmoney_fee_bps, min_purchase_units, redemption_fee_json, data_source, source_updated_at FROM instruments ORDER BY id",
        )
        .all<InstrumentRow>(),
      d1
        .prepare(
          "SELECT id, account_id, instrument_id, kind, trade_date, quantity_units, price_units, gross_amount_units, fee_units, tax_units, notes, external_ref, purchase_channel, fee_source FROM ledger_entries ORDER BY trade_date, id",
        )
        .all<LedgerRow>(),
      d1
        .prepare(
          "SELECT id, instrument_id, price_date, price_units, source FROM prices ORDER BY price_date, id",
        )
        .all<PriceRow>(),
      d1
        .prepare(
          "SELECT id, account_id, instrument_id, amount_units, frequency, day_of_month, next_date, status FROM recurring_plans ORDER BY id",
        )
        .all<PlanRow>(),
      d1
        .prepare(
          "SELECT id, instrument_id, target_bps, alert_bps FROM allocation_targets ORDER BY id",
        )
        .all<TargetRow>(),
    ]);
  return calculatePortfolio(
    accounts.results,
    instruments.results,
    ledger.results,
    prices.results,
    plans.results,
    targets.results,
  );
}

export async function GET() {
  try {
    return Response.json(await loadPortfolio());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "读取数据失败" },
      { status: 500 },
    );
  }
}

function hasTrustedWriteOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  try {
    const requestUrl = new URL(request.url);
    const publicHost = (
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      requestUrl.host
    )
      .split(",")[0]
      .trim()
      .toLowerCase();
    const publicProtocol = (
      request.headers.get("x-forwarded-proto") ??
      requestUrl.protocol.replace(":", "")
    )
      .split(",")[0]
      .trim()
      .toLowerCase();
    const originUrl = new URL(origin);
    return (
      originUrl.host.toLowerCase() === publicHost &&
      originUrl.protocol.toLowerCase() === `${publicProtocol}:`
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site" || !hasTrustedWriteOrigin(request)) {
    return Response.json({ error: "拒绝跨站数据操作" }, { status: 403 });
  }

  try {
    await ensureDatabase();
    const d1 = getD1();
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "lookupFund") {
      return Response.json(await fetchLiveFundData(String(body.code ?? "")));
    }

    if (action === "resolveInstrument") {
      const instrument = await resolveFundInstrument(
        d1,
        String(body.code ?? ""),
      );
      return Response.json({ instrument });
    }

    if (action === "createEntry") {
      const kind = String(body.kind ?? "").toUpperCase();
      const allowed = new Set([
        "DEPOSIT",
        "WITHDRAWAL",
        "BUY",
        "SELL",
        "DIVIDEND",
        "FEE",
      ]);
      if (!allowed.has(kind)) throw new Error("不支持的流水类型");
      const accountId = Number(body.accountId);
      const instrumentId = body.instrumentId ? Number(body.instrumentId) : null;
      if (!Number.isInteger(accountId)) throw new Error("请选择账户");
      if (
        ["BUY", "SELL", "DIVIDEND"].includes(kind) &&
        !Number.isInteger(instrumentId)
      )
        throw new Error("请选择投资产品");
      const quantityUnits = decimalToUnits(body.quantity, QUANTITY_SCALE);
      const priceUnits = decimalToUnits(body.price, PRICE_SCALE);
      const tradeDate = isoDate(body.tradeDate);
      if (["BUY", "SELL"].includes(kind) && quantityUnits <= 0)
        throw new Error("成交份额必须大于 0");
      let grossAmountUnits = decimalToUnits(body.amount);
      if (!grossAmountUnits && quantityUnits && priceUnits)
        grossAmountUnits = tradeGrossUnits(quantityUnits, priceUnits);
      if (grossAmountUnits <= 0) throw new Error("金额必须大于 0");
      let feeUnits = decimalToUnits(body.fee);
      let feeSource = String(body.fee ?? "").trim() === "" ? "AUTO" : "ACTUAL";
      const purchaseChannel = String(body.purchaseChannel ?? "DIRECT");
      if (
        ["BUY", "SELL"].includes(kind) &&
        String(body.fee ?? "").trim() === "" &&
        instrumentId
      ) {
        let instrument = await d1
          .prepare(
            "SELECT code, product_type, buy_fee_bps, buy_discount_bps, sell_fee_bps, min_fee_units, eastmoney_fee_bps, redemption_fee_json FROM instruments WHERE id = ?",
          )
          .bind(instrumentId)
          .first<{
            code: string;
            product_type: string;
            buy_fee_bps: number;
            buy_discount_bps: number;
            sell_fee_bps: number;
            min_fee_units: number;
            eastmoney_fee_bps: number;
            redemption_fee_json: string;
          }>();
        if (!instrument) throw new Error("基金/证券代码不存在");
        if (
          ["FUND", "ETF"].includes(instrument.product_type) &&
          /^\d{6}$/.test(instrument.code)
        ) {
          try {
            const live = await fetchLiveFundData(instrument.code);
            await d1
              .prepare(
                "UPDATE instruments SET name = ?, buy_fee_bps = ?, eastmoney_fee_bps = ?, min_purchase_units = ?, redemption_fee_json = ?, data_source = ?, source_updated_at = ? WHERE id = ?",
              )
              .bind(
                live.name,
                live.standardBuyFeeBps,
                live.eastmoneyBuyFeeBps,
                decimalToUnits(live.minPurchase),
                JSON.stringify(live.redemptionTiers),
                live.source,
                live.updatedAt,
                instrumentId,
              )
              .run();
            if (live.latestNav && live.latestNavDate)
              await d1
                .prepare(
                  "INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (?, ?, ?, 'EASTMONEY') ON CONFLICT(instrument_id, price_date) DO UPDATE SET price_units = excluded.price_units, source = excluded.source",
                )
                .bind(
                  instrumentId,
                  live.latestNavDate,
                  decimalToUnits(live.latestNav, PRICE_SCALE),
                )
                .run();
            instrument = {
              ...instrument,
              buy_fee_bps: live.standardBuyFeeBps,
              eastmoney_fee_bps: live.eastmoneyBuyFeeBps,
              redemption_fee_json: JSON.stringify(live.redemptionTiers),
            };
          } catch {
            // Keep the last synchronized rules when the external source is unavailable.
          }
        }
        if (kind === "SELL") {
          const history = await d1
            .prepare(
              "SELECT kind, trade_date, quantity_units FROM ledger_entries WHERE account_id = ? AND instrument_id = ? AND trade_date <= ? AND kind IN ('BUY','SELL') ORDER BY trade_date, id",
            )
            .bind(accountId, instrumentId, tradeDate)
            .all<{
              kind: string;
              trade_date: string;
              quantity_units: number;
            }>();
          const lots: Array<{ tradeDate: string; quantityUnits: number }> = [];
          for (const row of history.results) {
            if (row.kind === "BUY")
              lots.push({
                tradeDate: row.trade_date,
                quantityUnits: row.quantity_units,
              });
            else {
              let consumed = row.quantity_units;
              for (const lot of lots) {
                const take = Math.min(consumed, lot.quantityUnits);
                lot.quantityUnits -= take;
                consumed -= take;
                if (consumed <= 0) break;
              }
            }
          }
          const tiers = JSON.parse(instrument.redemption_fee_json || "[]");
          feeUnits = calculateFifoRedemptionFeeUnits(
            lots.filter((lot) => lot.quantityUnits > 0),
            quantityUnits,
            grossAmountUnits,
            tradeDate,
            tiers,
          );
          feeSource = tiers.length ? "LIVE_REDEMPTION_FIFO" : "PRODUCT_RULE";
        } else {
          const channelRate =
            purchaseChannel === "EASTMONEY" && instrument.eastmoney_fee_bps > 0
              ? instrument.eastmoney_fee_bps
              : instrument.buy_fee_bps;
          feeUnits = calculateTradingFeeUnits("BUY", grossAmountUnits, {
            buyFeeBps: channelRate,
            buyDiscountBps: 10_000,
            sellFeeBps: instrument.sell_fee_bps,
            minFeeUnits: instrument.min_fee_units,
          });
          feeSource =
            purchaseChannel === "EASTMONEY"
              ? "LIVE_EASTMONEY"
              : "LIVE_STANDARD";
        }
      }
      if (kind === "SELL" && instrumentId) {
        const position = await d1
          .prepare(
            `SELECT COALESCE(SUM(CASE WHEN kind = 'BUY' THEN quantity_units WHEN kind = 'SELL' THEN -quantity_units ELSE 0 END), 0) AS available
             FROM ledger_entries WHERE account_id = ? AND instrument_id = ? AND trade_date <= ?`,
          )
          .bind(accountId, instrumentId, tradeDate)
          .first<{ available: number }>();
        if (quantityUnits > Number(position?.available ?? 0))
          throw new Error("卖出份额超过该日期的可用持仓");
      }
      await d1
        .prepare(
          `INSERT INTO ledger_entries
        (account_id, instrument_id, kind, trade_date, quantity_units, price_units, gross_amount_units, fee_units, tax_units, notes, external_ref, purchase_channel, fee_source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          accountId,
          instrumentId,
          kind,
          tradeDate,
          quantityUnits,
          priceUnits,
          grossAmountUnits,
          feeUnits,
          decimalToUnits(body.tax),
          String(body.notes ?? "").slice(0, 200),
          String(body.externalRef ?? "").slice(0, 100),
          purchaseChannel.slice(0, 30),
          feeSource.slice(0, 40),
        )
        .run();
      if (instrumentId && priceUnits) {
        await d1
          .prepare(
            "INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (?, ?, ?, 'TRADE') ON CONFLICT(instrument_id, price_date) DO UPDATE SET price_units = excluded.price_units, source = excluded.source",
          )
          .bind(instrumentId, isoDate(body.tradeDate), priceUnits)
          .run();
      }
    } else if (action === "createAccount") {
      const name = String(body.name ?? "").trim();
      if (!name) throw new Error("账户名称不能为空");
      await d1
        .prepare(
          "INSERT INTO accounts (name, currency, color) VALUES (?, 'CNY', ?)",
        )
        .bind(name.slice(0, 50), String(body.color ?? "#5B7CFA"))
        .run();
    } else if (action === "deleteAccount") {
      const accountId = Number(body.id);
      if (!Number.isInteger(accountId) || accountId <= 0)
        throw new Error("账户不存在");
      const [entryUsage, planUsage] = await Promise.all([
        d1
          .prepare(
            "SELECT COUNT(*) AS count FROM ledger_entries WHERE account_id = ?",
          )
          .bind(accountId)
          .first<{ count: number }>(),
        d1
          .prepare(
            "SELECT COUNT(*) AS count FROM recurring_plans WHERE account_id = ?",
          )
          .bind(accountId)
          .first<{ count: number }>(),
      ]);
      const entryCount = Number(entryUsage?.count ?? 0);
      const planCount = Number(planUsage?.count ?? 0);
      if (entryCount || planCount)
        throw new Error(
          `为保护历史数据，请先删除该账户的 ${entryCount} 条流水和 ${planCount} 个定投计划`,
        );
      const deleted = await d1
        .prepare("DELETE FROM accounts WHERE id = ?")
        .bind(accountId)
        .run();
      if (!Number(deleted.meta.changes ?? 0)) throw new Error("账户不存在");
    } else if (action === "createInstrument") {
      const name = String(body.name ?? "").trim();
      const code = String(body.code ?? "")
        .trim()
        .toUpperCase();
      if (!name || !code) throw new Error("产品名称和代码不能为空");
      const feeRule = feeRuleFromInput(body);
      if (
        feeRule.buyFeeBps < 0 ||
        feeRule.buyFeeBps > 10_000 ||
        feeRule.buyDiscountBps < 0 ||
        feeRule.buyDiscountBps > 10_000 ||
        feeRule.sellFeeBps < 0 ||
        feeRule.sellFeeBps > 10_000 ||
        feeRule.minFeeUnits < 0
      )
        throw new Error("费率必须在 0%–100% 之间，最低手续费不能为负数");
      const created = await d1
        .prepare(
          "INSERT INTO instruments (name, code, market, asset_class, currency, product_type, buy_fee_bps, buy_discount_bps, sell_fee_bps, min_fee_units, eastmoney_fee_bps, min_purchase_units, redemption_fee_json, data_source, source_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          name.slice(0, 80),
          code.slice(0, 30),
          String(body.market ?? "CN"),
          String(body.assetClass ?? "OTHER"),
          String(body.currency ?? "CNY"),
          String(body.productType ?? "FUND"),
          feeRule.buyFeeBps,
          feeRule.buyDiscountBps,
          feeRule.sellFeeBps,
          feeRule.minFeeUnits,
          Math.round(Number(body.eastmoneyFeePercent ?? 0) * 100),
          decimalToUnits(body.minPurchase),
          String(body.redemptionFeeJson ?? "[]"),
          String(body.dataSource ?? "MANUAL"),
          String(body.sourceUpdatedAt ?? ""),
        )
        .run();
      const newInstrumentId = Number(created.meta.last_row_id);
      if (newInstrumentId && body.latestNav && body.latestNavDate)
        await d1
          .prepare(
            "INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (?, ?, ?, ?)",
          )
          .bind(
            newInstrumentId,
            isoDate(body.latestNavDate),
            decimalToUnits(body.latestNav, PRICE_SCALE),
            String(body.dataSource ?? "MANUAL"),
          )
          .run();
    } else if (action === "createPlan") {
      await d1
        .prepare(
          "INSERT INTO recurring_plans (account_id, instrument_id, amount_units, day_of_month, next_date) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(
          Number(body.accountId),
          Number(body.instrumentId),
          decimalToUnits(body.amount),
          Math.min(28, Math.max(1, Number(body.dayOfMonth) || 1)),
          isoDate(body.nextDate),
        )
        .run();
    } else if (action === "togglePlan") {
      const planId = Number(body.id);
      if (!Number.isInteger(planId)) throw new Error("定投计划不存在");
      await d1
        .prepare(
          "UPDATE recurring_plans SET status = CASE WHEN status = 'ACTIVE' THEN 'PAUSED' ELSE 'ACTIVE' END WHERE id = ?",
        )
        .bind(planId)
        .run();
    } else if (action === "updateTarget") {
      const instrumentId = Number(body.instrumentId);
      const targetBps = Math.round(Number(body.targetPercent) * 100);
      const alertBps = Math.round(Number(body.alertPercent ?? 5) * 100);
      await d1
        .prepare(
          "INSERT INTO allocation_targets (instrument_id, target_bps, alert_bps) VALUES (?, ?, ?) ON CONFLICT(instrument_id) DO UPDATE SET target_bps = excluded.target_bps, alert_bps = excluded.alert_bps",
        )
        .bind(instrumentId, targetBps, alertBps)
        .run();
    } else if (action === "updateTargets") {
      const targets = Array.isArray(body.targets)
        ? (body.targets.slice(0, 100) as Array<Record<string, unknown>>)
        : [];
      if (!targets.length) throw new Error("没有可保存的配置目标");
      const invalidTarget = targets.some((target) => {
        const instrumentId = Number(target.instrumentId);
        const targetPercent = Number(target.targetPercent);
        return (
          !Number.isInteger(instrumentId) ||
          instrumentId <= 0 ||
          !Number.isFinite(targetPercent) ||
          targetPercent < 0 ||
          targetPercent > 100
        );
      });
      if (invalidTarget) throw new Error("配置目标数据无效");
      const total = targets.reduce(
        (sum, target) => sum + Number(target.targetPercent ?? 0),
        0,
      );
      if (Math.abs(total - 100) > 0.01)
        throw new Error("配置目标合计必须等于 100%");
      await d1.batch(
        targets.map((target) =>
          d1
            .prepare(
              "INSERT INTO allocation_targets (instrument_id, target_bps, alert_bps) VALUES (?, ?, 500) ON CONFLICT(instrument_id) DO UPDATE SET target_bps = excluded.target_bps, alert_bps = excluded.alert_bps",
            )
            .bind(
              Number(target.instrumentId),
              Math.round(Number(target.targetPercent) * 100),
            ),
        ),
      );
    } else if (action === "syncInstrument") {
      const instrumentId = Number(body.instrumentId);
      const instrument = await d1
        .prepare("SELECT code, product_type FROM instruments WHERE id = ?")
        .bind(instrumentId)
        .first<{ code: string; product_type: string }>();
      if (!instrument) throw new Error("投资产品不存在");
      if (
        !["FUND", "ETF"].includes(instrument.product_type) ||
        !/^\d{6}$/.test(instrument.code)
      )
        throw new Error("只有 6 位代码的基金或 ETF 支持自动同步");
      await syncFundInstrument(d1, instrumentId, instrument.code);
    } else if (action === "upsertPrice") {
      await d1
        .prepare(
          "INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (?, ?, ?, 'MANUAL') ON CONFLICT(instrument_id, price_date) DO UPDATE SET price_units = excluded.price_units, source = excluded.source",
        )
        .bind(
          Number(body.instrumentId),
          isoDate(body.priceDate),
          decimalToUnits(body.price, PRICE_SCALE),
        )
        .run();
    } else if (action === "importRows") {
      const rows = Array.isArray(body.rows)
        ? (body.rows.slice(0, 1000) as Array<Record<string, unknown>>)
        : [];
      if (!rows.length) throw new Error("没有可导入的数据");
      const accounts = await d1
        .prepare("SELECT id, name FROM accounts")
        .all<{ id: number; name: string }>();
      const instruments = await d1
        .prepare(
          "SELECT id, code, buy_fee_bps, buy_discount_bps, sell_fee_bps, min_fee_units FROM instruments",
        )
        .all<{
          id: number;
          code: string;
          buy_fee_bps: number;
          buy_discount_bps: number;
          sell_fee_bps: number;
          min_fee_units: number;
        }>();
      const accountMap = new Map(
        accounts.results.map((row: { id: number; name: string }) => [
          row.name,
          row.id,
        ]),
      );
      const instrumentMap = new Map(
        instruments.results.map((row) => [row.code.toUpperCase(), row]),
      );
      const statements = rows.map((row, index) => {
        const accountId = accountMap.get(String(row.accountName ?? ""));
        const instrument = row.code
          ? (instrumentMap.get(String(row.code).toUpperCase()) ?? null)
          : null;
        const instrumentId = instrument?.id ?? null;
        const kind = String(row.kind ?? "").toUpperCase();
        if (
          !["DEPOSIT", "WITHDRAWAL", "BUY", "SELL", "DIVIDEND", "FEE"].includes(
            kind,
          )
        )
          throw new Error(`第 ${index + 2} 行交易类型无效`);
        if (!accountId) throw new Error(`第 ${index + 2} 行账户不存在`);
        if (["BUY", "SELL", "DIVIDEND"].includes(kind) && !instrumentId)
          throw new Error(`第 ${index + 2} 行产品代码不存在`);
        const quantityUnits = decimalToUnits(row.quantity, QUANTITY_SCALE);
        const priceUnits = decimalToUnits(row.price, PRICE_SCALE);
        let amountUnits = decimalToUnits(row.amount);
        if (!amountUnits && quantityUnits && priceUnits)
          amountUnits = tradeGrossUnits(quantityUnits, priceUnits);
        if (amountUnits <= 0)
          throw new Error(`第 ${index + 2} 行金额必须大于 0`);
        const feeUnits =
          String(row.fee ?? "").trim() === "" &&
          instrument &&
          (kind === "BUY" || kind === "SELL")
            ? calculateTradingFeeUnits(kind, amountUnits, {
                buyFeeBps: instrument.buy_fee_bps,
                buyDiscountBps: instrument.buy_discount_bps,
                sellFeeBps: instrument.sell_fee_bps,
                minFeeUnits: instrument.min_fee_units,
              })
            : decimalToUnits(row.fee);
        return d1
          .prepare(
            `INSERT INTO ledger_entries
          (account_id, instrument_id, kind, trade_date, quantity_units, price_units, gross_amount_units, fee_units, tax_units, notes, external_ref)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            accountId,
            instrumentId,
            kind,
            isoDate(row.tradeDate),
            quantityUnits,
            priceUnits,
            amountUnits,
            feeUnits,
            decimalToUnits(row.tax),
            String(row.notes ?? ""),
            String(row.externalRef ?? ""),
          );
      });
      await d1.batch(statements);
    } else if (action === "deleteEntry") {
      await d1
        .prepare("DELETE FROM ledger_entries WHERE id = ?")
        .bind(Number(body.id))
        .run();
    } else if (action === "deletePlan") {
      await d1
        .prepare("DELETE FROM recurring_plans WHERE id = ?")
        .bind(Number(body.id))
        .run();
    } else {
      throw new Error("未知操作");
    }
    return Response.json(await loadPortfolio());
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
