import { calculatePortfolio } from "@/lib/calculations";
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
import { ensureDatabase, resetDemoDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";

export const dynamic = "force-dynamic";

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
          "SELECT id, name, code, market, asset_class, currency FROM instruments ORDER BY id",
        )
        .all<InstrumentRow>(),
      d1
        .prepare(
          "SELECT id, account_id, instrument_id, kind, trade_date, quantity_units, price_units, gross_amount_units, fee_units, tax_units, notes, external_ref FROM ledger_entries ORDER BY trade_date, id",
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

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const d1 = getD1();
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

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
        (account_id, instrument_id, kind, trade_date, quantity_units, price_units, gross_amount_units, fee_units, tax_units, notes, external_ref)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          accountId,
          instrumentId,
          kind,
          tradeDate,
          quantityUnits,
          priceUnits,
          grossAmountUnits,
          decimalToUnits(body.fee),
          decimalToUnits(body.tax),
          String(body.notes ?? "").slice(0, 200),
          String(body.externalRef ?? "").slice(0, 100),
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
    } else if (action === "createInstrument") {
      const name = String(body.name ?? "").trim();
      const code = String(body.code ?? "")
        .trim()
        .toUpperCase();
      if (!name || !code) throw new Error("产品名称和代码不能为空");
      await d1
        .prepare(
          "INSERT INTO instruments (name, code, market, asset_class, currency) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(
          name.slice(0, 80),
          code.slice(0, 30),
          String(body.market ?? "CN"),
          String(body.assetClass ?? "OTHER"),
          String(body.currency ?? "CNY"),
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
        .prepare("SELECT id, code FROM instruments")
        .all<{ id: number; code: string }>();
      const accountMap = new Map(
        accounts.results.map((row: { id: number; name: string }) => [
          row.name,
          row.id,
        ]),
      );
      const instrumentMap = new Map(
        instruments.results.map((row: { id: number; code: string }) => [
          row.code.toUpperCase(),
          row.id,
        ]),
      );
      const statements = rows.map((row, index) => {
        const accountId = accountMap.get(String(row.accountName ?? ""));
        const instrumentId = row.code
          ? (instrumentMap.get(String(row.code).toUpperCase()) ?? null)
          : null;
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
            decimalToUnits(row.fee),
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
    } else if (action === "resetDemo") {
      await resetDemoDatabase();
    } else {
      throw new Error("未知操作");
    }
    return Response.json(await loadPortfolio());
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
