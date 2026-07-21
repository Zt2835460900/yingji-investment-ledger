import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { fetchUsdCnyRate, toExchangeUnits, fromExchangeUnits } from "@/lib/exchange-rates";

export const dynamic = "force-dynamic";

interface ExchangeRateDbRow {
  from_currency: string;
  to_currency: string;
  rate: number;
  rate_date: string;
  source: string;
}

export async function GET() {
  try {
    await ensureDatabase();
    const d1 = getD1();
    const rows = await d1
      .prepare(
        "SELECT from_currency, to_currency, rate, rate_date, source FROM exchange_rates WHERE (from_currency, to_currency, rate_date) IN (SELECT from_currency, to_currency, MAX(rate_date) FROM exchange_rates GROUP BY from_currency, to_currency) ORDER BY from_currency",
      )
      .all();
    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    return Response.json({
      rates: (rows.results as unknown as ExchangeRateDbRow[]).map((r) => ({
        from: r.from_currency,
        to: r.to_currency,
        rate: fromExchangeUnits(r.rate),
        date: r.rate_date,
        source: r.source,
      })),
      today,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "汇率读取失败" },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const { rate, date } = await fetchUsdCnyRate();
    const units = toExchangeUnits(rate);
    await ensureDatabase();
    const d1 = getD1();
    await d1
      .prepare(
        "INSERT OR REPLACE INTO exchange_rates (from_currency, to_currency, rate, rate_date, source) VALUES (?, ?, ?, ?, ?)",
      )
      .bind("USD", "CNY", units, date, "EXCHANGERATE_API")
      .run();
    const hkdRate = rate / 7.83;
    const hkdUnits = toExchangeUnits(hkdRate);
    await d1
      .prepare(
        "INSERT OR REPLACE INTO exchange_rates (from_currency, to_currency, rate, rate_date, source) VALUES (?, ?, ?, ?, ?)",
      )
      .bind("HKD", "CNY", hkdUnits, date, "PEG_HKDUSD")
      .run();
    return Response.json({ usdCny: rate, hkdCny: hkdRate, date });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "汇率同步失败" },
      { status: 502 },
    );
  }
}
