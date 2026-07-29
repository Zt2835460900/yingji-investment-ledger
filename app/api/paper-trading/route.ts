import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import {
  calculatePaperPortfolio,
  type PaperTradeRow,
} from "@/lib/paper-trading";
import {
  decimalToUnits,
  isoDate,
  MONEY_SCALE,
  PRICE_SCALE,
  QUANTITY_SCALE,
  unitsToNumber,
} from "@/lib/money";

export const dynamic = "force-dynamic";

interface PaperAccountRow {
  id: number;
  name: string;
  initial_cash_units: number;
  created_at: string;
}

interface PaperInstrumentRow {
  id: number;
  name: string;
  code: string;
  market: string;
  asset_class: string;
  product_type: string;
}

interface PaperPriceRow {
  instrument_id: number;
  price_date: string;
  price_units: number;
}

const shanghaiDate = () =>
  new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

let paperWriteQueue: Promise<void> = Promise.resolve();

async function withPaperWriteLock<T>(task: () => Promise<T>) {
  const previous = paperWriteQueue;
  let release = () => {};
  paperWriteQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

async function loadPaperTrading() {
  await ensureDatabase();
  const d1 = getD1();
  const valuationDate = shanghaiDate();
  const [accounts, trades, instruments, prices] = await Promise.all([
    d1
      .prepare(
        "SELECT id, name, initial_cash_units, created_at FROM paper_accounts ORDER BY id",
      )
      .all<PaperAccountRow>(),
    d1
      .prepare(
        `SELECT id, account_id, instrument_id, side, trade_date,
                quantity_units, price_units, fee_units
         FROM paper_trades ORDER BY trade_date, id`,
      )
      .all<PaperTradeRow>(),
    d1
      .prepare(
        "SELECT id, name, code, market, asset_class, product_type FROM instruments ORDER BY id",
      )
      .all<PaperInstrumentRow>(),
    d1
      .prepare(
        `SELECT p.instrument_id, p.price_date, p.price_units
         FROM prices p
         INNER JOIN (
           SELECT instrument_id, MAX(price_date) AS price_date
           FROM prices
           WHERE price_date <= ?
           GROUP BY instrument_id
         ) latest
         ON latest.instrument_id = p.instrument_id
         AND latest.price_date = p.price_date`,
      )
      .bind(valuationDate)
      .all<PaperPriceRow>(),
  ]);
  const instrumentById = new Map(
    instruments.results.map((instrument) => [instrument.id, instrument]),
  );
  return {
    accounts: accounts.results.map((account) => {
      const accountTrades = trades.results.filter(
        (trade) => trade.account_id === account.id,
      );
      return {
        id: account.id,
        name: account.name,
        createdAt: account.created_at,
        ...calculatePaperPortfolio(
          account.initial_cash_units,
          accountTrades,
          instruments.results,
          prices.results,
        ),
        trades: [...accountTrades].reverse().map((trade) => {
          const instrument = instrumentById.get(trade.instrument_id);
          return {
            id: trade.id,
            instrumentId: trade.instrument_id,
            instrumentName: instrument?.name ?? "未知产品",
            code: instrument?.code ?? "",
            side: trade.side,
            tradeDate: trade.trade_date,
            quantity: unitsToNumber(trade.quantity_units, QUANTITY_SCALE),
            price: unitsToNumber(trade.price_units, PRICE_SCALE),
            fee: unitsToNumber(trade.fee_units, MONEY_SCALE),
          };
        }),
      };
    }),
  };
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

export async function GET() {
  try {
    return Response.json(await loadPaperTrading(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "模拟账户读取失败" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site" || !hasTrustedWriteOrigin(request))
    return Response.json({ error: "拒绝跨站数据操作" }, { status: 403 });

  return withPaperWriteLock(async () => {
    try {
      await ensureDatabase();
      const d1 = getD1();
      const body = (await request.json()) as Record<string, unknown>;
      const action = String(body.action ?? "");

      if (action === "createAccount") {
        const name = String(body.name ?? "").trim();
        const initialCashUnits = decimalToUnits(body.initialCash, MONEY_SCALE);
        if (!name) throw new Error("请填写模拟账户名称");
        if (initialCashUnits <= 0) throw new Error("初始虚拟资金必须大于 0");
        if (initialCashUnits > 100_000_000 * MONEY_SCALE)
          throw new Error("初始虚拟资金不能超过 1 亿元");
        await d1
          .prepare(
            "INSERT INTO paper_accounts (name, initial_cash_units) VALUES (?, ?)",
          )
          .bind(name.slice(0, 50), initialCashUnits)
          .run();
      } else if (action === "createTrade" || action === "updateTrade") {
        const tradeId = action === "updateTrade" ? Number(body.id) : null;
        if (
          action === "updateTrade" &&
          (!Number.isInteger(tradeId) || Number(tradeId) <= 0)
        )
          throw new Error("模拟交易不存在");
        const accountId = Number(body.accountId);
        const instrumentId = Number(body.instrumentId);
        const side = String(body.side ?? "").toUpperCase();
        const quantityUnits = decimalToUnits(body.quantity, QUANTITY_SCALE);
        const priceUnits = decimalToUnits(body.price, PRICE_SCALE);
        const feeUnits = decimalToUnits(body.fee, MONEY_SCALE);
        if (!Number.isInteger(accountId) || accountId <= 0)
          throw new Error("请选择模拟账户");
        if (!Number.isInteger(instrumentId) || instrumentId <= 0)
          throw new Error("请先输入并匹配产品代码");
        if (!["BUY", "SELL"].includes(side)) throw new Error("交易方向无效");
        if (quantityUnits <= 0) throw new Error("交易数量必须大于 0");
        if (priceUnits <= 0) throw new Error("成交价格必须大于 0");
        if (feeUnits < 0) throw new Error("手续费不能为负数");
        const [account, instrument, existingTrades, instruments, prices] =
          await Promise.all([
            d1
              .prepare(
                "SELECT id, initial_cash_units FROM paper_accounts WHERE id = ?",
              )
              .bind(accountId)
              .first<{ id: number; initial_cash_units: number }>(),
            d1
              .prepare("SELECT id FROM instruments WHERE id = ?")
              .bind(instrumentId)
              .first<{ id: number }>(),
            d1
              .prepare(
                `SELECT id, account_id, instrument_id, side, trade_date,
                      quantity_units, price_units, fee_units
               FROM paper_trades
               WHERE account_id = ? AND (? IS NULL OR id <> ?)
               ORDER BY trade_date, id`,
              )
              .bind(accountId, tradeId, tradeId)
              .all<PaperTradeRow>(),
            d1
              .prepare(
                "SELECT id, name, code, market, asset_class, product_type FROM instruments ORDER BY id",
              )
              .all<PaperInstrumentRow>(),
            d1
              .prepare(
                "SELECT instrument_id, price_date, price_units FROM prices ORDER BY price_date, id",
              )
              .all<PaperPriceRow>(),
          ]);
        if (!account) throw new Error("模拟账户不存在");
        if (!instrument) throw new Error("投资产品不存在");
        if (tradeId) {
          const existingTrade = await d1
            .prepare("SELECT id, account_id FROM paper_trades WHERE id = ?")
            .bind(tradeId)
            .first<{ id: number; account_id: number }>();
          if (!existingTrade) throw new Error("模拟交易不存在");
          if (existingTrade.account_id !== accountId)
            throw new Error("模拟交易不能移动到其他账户");
        }
        const tradeDate = isoDate(body.tradeDate);
        if (tradeDate > shanghaiDate())
          throw new Error("模拟成交日期不能晚于今天");
        const candidate: PaperTradeRow = {
          id: Number.MAX_SAFE_INTEGER,
          account_id: accountId,
          instrument_id: instrumentId,
          side: side as "BUY" | "SELL",
          trade_date: tradeDate,
          quantity_units: quantityUnits,
          price_units: priceUnits,
          fee_units: feeUnits,
        };
        calculatePaperPortfolio(
          account.initial_cash_units,
          [...existingTrades.results, candidate],
          instruments.results,
          prices.results,
        );
        if (tradeId) {
          await d1
            .prepare(
              `UPDATE paper_trades
               SET account_id = ?, instrument_id = ?, side = ?, trade_date = ?,
                   quantity_units = ?, price_units = ?, fee_units = ?
               WHERE id = ?`,
            )
            .bind(
              accountId,
              instrumentId,
              side,
              candidate.trade_date,
              quantityUnits,
              priceUnits,
              feeUnits,
              tradeId,
            )
            .run();
        } else {
          await d1
            .prepare(
              `INSERT INTO paper_trades
           (account_id, instrument_id, side, trade_date, quantity_units, price_units, fee_units)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              accountId,
              instrumentId,
              side,
              candidate.trade_date,
              quantityUnits,
              priceUnits,
              feeUnits,
            )
            .run();
        }
      } else if (action === "deleteTrade") {
        const tradeId = Number(body.id);
        if (!Number.isInteger(tradeId) || tradeId <= 0)
          throw new Error("模拟交易不存在");
        const target = await d1
          .prepare("SELECT account_id FROM paper_trades WHERE id = ?")
          .bind(tradeId)
          .first<{ account_id: number }>();
        if (!target) throw new Error("模拟交易不存在");
        const [account, trades, instruments, prices] = await Promise.all([
          d1
            .prepare(
              "SELECT initial_cash_units FROM paper_accounts WHERE id = ?",
            )
            .bind(target.account_id)
            .first<{ initial_cash_units: number }>(),
          d1
            .prepare(
              `SELECT id, account_id, instrument_id, side, trade_date,
                    quantity_units, price_units, fee_units
             FROM paper_trades WHERE account_id = ? AND id <> ?
             ORDER BY trade_date, id`,
            )
            .bind(target.account_id, tradeId)
            .all<PaperTradeRow>(),
          d1
            .prepare(
              "SELECT id, name, code, market, asset_class, product_type FROM instruments ORDER BY id",
            )
            .all<PaperInstrumentRow>(),
          d1
            .prepare(
              "SELECT instrument_id, price_date, price_units FROM prices ORDER BY price_date, id",
            )
            .all<PaperPriceRow>(),
        ]);
        if (!account) throw new Error("模拟账户不存在");
        calculatePaperPortfolio(
          account.initial_cash_units,
          trades.results,
          instruments.results,
          prices.results,
        );
        await d1
          .prepare("DELETE FROM paper_trades WHERE id = ?")
          .bind(tradeId)
          .run();
      } else {
        throw new Error("未知模拟交易操作");
      }
      return Response.json(await loadPaperTrading());
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "模拟交易保存失败" },
        { status: 400 },
      );
    }
  });
}
