import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { normalizeCompanySymbol } from "@/lib/company-insights";

export const dynamic = "force-dynamic";

interface CompanyWatchRow {
  id: number;
  symbol: string;
  name: string;
  market: string;
  source: string;
  status: string;
  holding_rank: number;
  estimated_weight_bps: number;
  notes: string;
  last_discovered_at: string;
  created_at: string;
  updated_at: string;
}

const selectRows = async (d1: D1Database) =>
  (
    await d1
      .prepare(
        `SELECT id, symbol, name, market, source, status, holding_rank,
                estimated_weight_bps, notes, last_discovered_at, created_at, updated_at
           FROM company_watchlist
          WHERE status <> 'DELETED'
          ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END,
                   CASE WHEN holding_rank > 0 THEN holding_rank ELSE 999 END,
                   name, id`,
      )
      .all<CompanyWatchRow>()
  ).results;

const trustedWriteOrigin = (request: Request) => {
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
};

const parseCompany = (body: Record<string, unknown>) => {
  const normalized = normalizeCompanySymbol(body.symbol, body.market);
  const name =
    String(body.name ?? "")
      .replace(/[\u0000-\u001f<>]/g, "")
      .trim()
      .slice(0, 80) || normalized.symbol;
  return {
    ...normalized,
    name,
    notes: String(body.notes ?? "")
      .trim()
      .slice(0, 500),
  };
};

export async function GET() {
  try {
    await ensureDatabase();
    return Response.json({ companies: await selectRows(getD1()) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "公司列表读取失败" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!trustedWriteOrigin(request))
    return Response.json({ error: "请求来源校验失败" }, { status: 403 });
  try {
    await ensureDatabase();
    const d1 = getD1();
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (action === "sync") {
      const companies = Array.isArray(body.companies)
        ? (body.companies.slice(0, 12) as Array<Record<string, unknown>>)
        : [];
      const discoveredAt = new Date().toISOString();
      if (companies.length) {
        await d1.batch(
          companies.map((company, index) => {
            const parsed = parseCompany(company);
            const weightPercent = Number(company.weightPercent);
            const weightBps = Number.isFinite(weightPercent)
              ? Math.min(10_000, Math.max(0, Math.round(weightPercent * 100)))
              : 0;
            return d1
              .prepare(
                `INSERT INTO company_watchlist
                   (symbol, name, market, source, status, holding_rank,
                    estimated_weight_bps, last_discovered_at)
                 VALUES (?, ?, ?, 'AUTO', 'ACTIVE', ?, ?, ?)
                 ON CONFLICT(symbol) DO UPDATE SET
                   name = CASE WHEN company_watchlist.source = 'AUTO'
                               THEN excluded.name ELSE company_watchlist.name END,
                   market = excluded.market,
                   holding_rank = excluded.holding_rank,
                   estimated_weight_bps = excluded.estimated_weight_bps,
                   last_discovered_at = excluded.last_discovered_at,
                   updated_at = CURRENT_TIMESTAMP`,
              )
              .bind(
                parsed.symbol,
                parsed.name,
                parsed.market,
                index + 1,
                weightBps,
                discoveredAt,
              );
          }),
        );
      }
    } else if (action === "create") {
      const company = parseCompany(body);
      await d1
        .prepare(
          `INSERT INTO company_watchlist
             (symbol, name, market, source, status, holding_rank,
              estimated_weight_bps, notes, last_discovered_at)
           VALUES (?, ?, ?, 'MANUAL', 'ACTIVE', 0, 0, ?, '')
           ON CONFLICT(symbol) DO UPDATE SET
             name = excluded.name,
             market = excluded.market,
             source = 'MANUAL',
             status = 'ACTIVE',
             notes = excluded.notes,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(company.symbol, company.name, company.market, company.notes)
        .run();
    } else if (action === "update") {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) throw new Error("追踪公司不存在");
      const company = parseCompany(body);
      const updated = await d1
        .prepare(
          `UPDATE company_watchlist
              SET symbol = ?, name = ?, market = ?, notes = ?,
                  source = 'MANUAL', updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status <> 'DELETED'`,
        )
        .bind(company.symbol, company.name, company.market, company.notes, id)
        .run();
      if (!Number(updated.meta.changes ?? 0)) throw new Error("追踪公司不存在");
    } else if (action === "toggle") {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) throw new Error("追踪公司不存在");
      const updated = await d1
        .prepare(
          `UPDATE company_watchlist
              SET status = CASE status WHEN 'ACTIVE' THEN 'PAUSED' ELSE 'ACTIVE' END,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status <> 'DELETED'`,
        )
        .bind(id)
        .run();
      if (!Number(updated.meta.changes ?? 0)) throw new Error("追踪公司不存在");
    } else if (action === "delete") {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) throw new Error("追踪公司不存在");
      const updated = await d1
        .prepare(
          `UPDATE company_watchlist
              SET status = 'DELETED', updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status <> 'DELETED'`,
        )
        .bind(id)
        .run();
      if (!Number(updated.meta.changes ?? 0)) throw new Error("追踪公司不存在");
    } else {
      throw new Error("未知公司追踪操作");
    }
    return Response.json({ companies: await selectRows(d1) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "公司追踪保存失败";
    return Response.json(
      {
        error: /UNIQUE constraint failed/i.test(message)
          ? "该公司代码已经在追踪列表中"
          : message,
      },
      { status: 400 },
    );
  }
}
