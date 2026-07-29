import { calculatePortfolio } from "@/lib/calculations";
import {
  accountNameForEntry,
  accountRenameUpdatesFromLatestBuys,
} from "@/lib/account-renaming";
import { positiveIntegerId } from "@/lib/account-instrument-deletion";
import {
  CASH_INSTRUMENT_ID,
  DEFAULT_ALLOCATION_ALERT_BPS,
  parseAllocationTarget,
  parseAllocationTargets,
  TOTAL_ALLOCATION_BPS,
  type ParsedAllocationTarget,
} from "@/lib/allocation-targets";
import {
  calculateFifoRedemptionFeeUnits,
  calculateTradingFeeUnits,
  feeRuleFromInput,
} from "@/lib/fees";
import { fetchLatestFundNav, fetchLiveFundData } from "@/lib/fund-data";
import {
  describeUnsupportedStockCode,
  fetchLiveAshareQuote,
  normalizeProductCodeInput,
  parseAshareCode,
  parsePreferredProductType,
  productCodeLookupCandidates,
  productTypeMatchesPreference,
  type PreferredProductType,
} from "@/lib/stock-data";
import {
  decimalToUnits,
  isoDate,
  PRICE_SCALE,
  QUANTITY_SCALE,
  tradeGrossUnits,
  unitsToNumber,
} from "@/lib/money";
import type {
  AccountRow,
  InstrumentRow,
  JournalRow,
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

const NAV_SYNC_COOLDOWN_MS = 2 * 60 * 1000;

async function upsertSyncedPrice(
  d1: D1Database,
  instrumentId: number,
  priceDate: string,
  nav: number,
  source: string,
) {
  if (!priceDate || !Number.isFinite(nav) || nav <= 0) return;
  await d1
    .prepare(
      `INSERT INTO prices (instrument_id, price_date, price_units, source)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(instrument_id, price_date) DO UPDATE SET
         price_units = excluded.price_units,
         source = excluded.source
       WHERE prices.source <> 'MANUAL'
         AND NOT (prices.source = 'OFFICIAL_EFUNDS' AND excluded.source = 'EASTMONEY')`,
    )
    .bind(instrumentId, priceDate, decimalToUnits(nav, PRICE_SCALE), source)
    .run();
}

async function syncLatestFundNav(
  d1: D1Database,
  instrument: Pick<InstrumentRow, "id" | "code" | "name">,
) {
  const quote = await fetchLatestFundNav(instrument.code, instrument.name);
  await upsertSyncedPrice(
    d1,
    instrument.id,
    quote.date,
    quote.nav,
    quote.source,
  );
  await d1
    .prepare("UPDATE instruments SET source_updated_at = ? WHERE id = ?")
    .bind(quote.fetchedAt, instrument.id)
    .run();
  return quote;
}

async function syncFundInstrument(
  d1: D1Database,
  instrumentId: number,
  code: string,
  quoteDate = "",
) {
  const live = await fetchLiveFundData(code, quoteDate);
  const updated = await d1
    .prepare(
      "UPDATE instruments SET name = ?, asset_class = ?, product_type = ?, buy_fee_bps = ?, eastmoney_fee_bps = ?, min_purchase_units = ?, redemption_fee_json = CASE WHEN ? = 1 THEN ? ELSE redemption_fee_json END, data_source = ?, source_updated_at = ? WHERE id = ? AND product_type IN ('FUND', 'ETF')",
    )
    .bind(
      live.name,
      live.assetClass,
      live.productType,
      live.standardBuyFeeBps,
      live.eastmoneyBuyFeeBps,
      decimalToUnits(live.minPurchase),
      live.redemptionFeeAvailable ? 1 : 0,
      JSON.stringify(live.redemptionTiers),
      live.source,
      live.updatedAt,
      instrumentId,
    )
    .run();
  if (!Number(updated.meta.changes ?? 0))
    throw new Error("目标产品不是基金或 ETF，已拒绝同步基金资料");
  if (live.latestNav && live.latestNavDate)
    await upsertSyncedPrice(
      d1,
      instrumentId,
      live.latestNavDate,
      live.latestNav,
      live.source,
    );
  if (
    live.quoteNav &&
    live.quoteNavDate &&
    live.quoteNavDate !== live.latestNavDate
  )
    await upsertSyncedPrice(
      d1,
      instrumentId,
      live.quoteNavDate,
      live.quoteNav,
      live.source,
    );
  return live;
}

async function resolveFundInstrument(
  d1: D1Database,
  codeInput: string,
  quoteDateInput = "",
) {
  const code = codeInput.trim();
  const quoteDate = quoteDateInput.trim();
  if (!/^\d{6}$/.test(code)) throw new Error("请输入 6 位基金或 ETF 代码");
  if (quoteDate && !/^\d{4}-\d{2}-\d{2}$/.test(quoteDate))
    throw new Error("交易日期格式不正确");
  let instrument = await d1
    .prepare(
      `SELECT ${instrumentColumns} FROM instruments WHERE code = ? AND product_type IN ('FUND', 'ETF')`,
    )
    .bind(code)
    .first<InstrumentRow>();

  if (instrument) {
    let live: Awaited<ReturnType<typeof fetchLiveFundData>> | null = null;
    try {
      live = await syncFundInstrument(d1, instrument.id, code, quoteDate);
      instrument = await d1
        .prepare(`SELECT ${instrumentColumns} FROM instruments WHERE id = ?`)
        .bind(instrument.id)
        .first<InstrumentRow>();
    } catch {
      // 已收录的产品即使数据源临时不可用，也允许继续录入实际成交。
    }
    if (
      !instrument ||
      !productTypeMatchesPreference(instrument.product_type, "FUND")
    )
      throw new Error("基金资料读取失败");
    const cachedPrice = live
      ? null
      : await d1
          .prepare(
            quoteDate
              ? "SELECT price_date, price_units, source FROM prices WHERE instrument_id = ? AND price_date <= ? ORDER BY price_date DESC LIMIT 1"
              : "SELECT price_date, price_units, source FROM prices WHERE instrument_id = ? ORDER BY price_date DESC LIMIT 1",
          )
          .bind(...(quoteDate ? [instrument.id, quoteDate] : [instrument.id]))
          .first<{ price_date: string; price_units: number; source: string }>();
    return {
      instrument,
      quoteNav:
        live?.quoteNav ??
        (cachedPrice ? unitsToNumber(cachedPrice.price_units, PRICE_SCALE) : 0),
      quoteNavDate: live?.quoteNavDate ?? cachedPrice?.price_date ?? "",
      quoteDateRequested: quoteDate,
      quoteIsExact: live
        ? live.quoteIsExact
        : Boolean(quoteDate && cachedPrice?.price_date === quoteDate),
      latestNav: live?.latestNav ?? 0,
      latestNavDate: live?.latestNavDate ?? "",
      fundCategory: live?.fundCategory ?? "",
      confirmationBusinessDays:
        live?.confirmationBusinessDays ??
        (instrument.product_type === "ETF"
          ? 0
          : /美国|海外/.test(instrument.asset_class)
            ? 2
            : 1),
      quoteSource: live ? live.source : (cachedPrice?.source ?? "CACHED"),
      isLive: Boolean(live),
    };
  }

  const occupiedCode = await d1
    .prepare("SELECT id, name, product_type FROM instruments WHERE code = ?")
    .bind(code)
    .first<{ id: number; name: string; product_type: string }>();
  if (occupiedCode)
    throw new Error(
      occupiedCode.product_type === "STOCK"
        ? `代码 ${code} 已被历史股票“${occupiedCode.name}”占用，请先将股票保存为带 SH/SZ 前缀的规范代码`
        : `代码 ${code} 已被其他类型产品“${occupiedCode.name}”占用`,
    );

  const live = await fetchLiveFundData(code, quoteDate);
  await d1
    .prepare(
      "INSERT OR IGNORE INTO instruments (name, code, market, asset_class, currency, product_type, buy_fee_bps, buy_discount_bps, sell_fee_bps, min_fee_units, eastmoney_fee_bps, min_purchase_units, redemption_fee_json, data_source, source_updated_at) VALUES (?, ?, 'CN', ?, 'CNY', ?, ?, 10000, 0, 0, ?, ?, ?, ?, ?)",
    )
    .bind(
      live.name.slice(0, 80),
      code,
      live.assetClass,
      live.productType,
      live.standardBuyFeeBps,
      live.eastmoneyBuyFeeBps,
      decimalToUnits(live.minPurchase),
      JSON.stringify(live.redemptionTiers),
      live.source,
      live.updatedAt,
    )
    .run();
  instrument = await d1
    .prepare(
      `SELECT ${instrumentColumns} FROM instruments WHERE code = ? AND product_type IN ('FUND', 'ETF')`,
    )
    .bind(code)
    .first<InstrumentRow>();
  if (!instrument) throw new Error("基金资料保存失败");
  if (live.latestNav && live.latestNavDate)
    await upsertSyncedPrice(
      d1,
      instrument.id,
      live.latestNavDate,
      live.latestNav,
      live.source,
    );
  if (
    live.quoteNav &&
    live.quoteNavDate &&
    live.quoteNavDate !== live.latestNavDate
  )
    await upsertSyncedPrice(
      d1,
      instrument.id,
      live.quoteNavDate,
      live.quoteNav,
      live.source,
    );
  return {
    instrument,
    quoteNav: live.quoteNav,
    quoteNavDate: live.quoteNavDate,
    quoteDateRequested: quoteDate,
    quoteIsExact: live.quoteIsExact,
    latestNav: live.latestNav,
    latestNavDate: live.latestNavDate,
    fundCategory: live.fundCategory,
    confirmationBusinessDays: live.confirmationBusinessDays,
    quoteSource: live.source,
    isLive: true,
  };
}

async function readInstrumentPrice(
  d1: D1Database,
  instrumentId: number,
  quoteDate = "",
) {
  const selected = await d1
    .prepare(
      quoteDate
        ? "SELECT price_date, price_units, source FROM prices WHERE instrument_id = ? AND price_date <= ? ORDER BY price_date DESC LIMIT 1"
        : "SELECT price_date, price_units, source FROM prices WHERE instrument_id = ? ORDER BY price_date DESC LIMIT 1",
    )
    .bind(...(quoteDate ? [instrumentId, quoteDate] : [instrumentId]))
    .first<{ price_date: string; price_units: number; source: string }>();
  const latest = quoteDate
    ? await d1
        .prepare(
          "SELECT price_date, price_units, source FROM prices WHERE instrument_id = ? ORDER BY price_date DESC LIMIT 1",
        )
        .bind(instrumentId)
        .first<{ price_date: string; price_units: number; source: string }>()
    : selected;
  return { selected, latest };
}

async function storedInstrumentResponse(
  d1: D1Database,
  instrument: InstrumentRow,
  quoteDate = "",
  isLive = false,
) {
  const prices = await readInstrumentPrice(d1, instrument.id, quoteDate);
  const quoteNav = prices.selected
    ? unitsToNumber(prices.selected.price_units, PRICE_SCALE)
    : 0;
  const latestNav = prices.latest
    ? unitsToNumber(prices.latest.price_units, PRICE_SCALE)
    : 0;
  return {
    instrument,
    quoteNav,
    quoteNavDate: prices.selected?.price_date ?? "",
    quoteDateRequested: quoteDate,
    quoteIsExact: Boolean(
      quoteDate && prices.selected?.price_date === quoteDate,
    ),
    latestNav,
    latestNavDate: prices.latest?.price_date ?? "",
    price: quoteNav,
    priceDate: prices.selected?.price_date ?? "",
    fundCategory: "",
    confirmationBusinessDays: 0,
    quoteSource: prices.selected?.source ?? instrument.data_source ?? "CACHED",
    isLive,
    matchedProductType: instrument.product_type,
    feeNotice:
      instrument.product_type === "STOCK"
        ? "股票交易佣金因券商和渠道而异，请按实际成交单填写手续费"
        : "",
    persisted: true,
  };
}

function fundInstrumentFromLive(
  code: string,
  live: Awaited<ReturnType<typeof fetchLiveFundData>>,
  stored: InstrumentRow | null,
): InstrumentRow {
  return {
    id: stored?.id ?? 0,
    name: live.name.slice(0, 80),
    code,
    market: stored?.market ?? "CN",
    asset_class: live.assetClass,
    currency: stored?.currency ?? "CNY",
    product_type: live.productType,
    buy_fee_bps: live.standardBuyFeeBps,
    buy_discount_bps: stored?.buy_discount_bps ?? 10_000,
    sell_fee_bps: stored?.sell_fee_bps ?? 0,
    min_fee_units: stored?.min_fee_units ?? 0,
    eastmoney_fee_bps: live.eastmoneyBuyFeeBps,
    min_purchase_units: decimalToUnits(live.minPurchase),
    redemption_fee_json: live.redemptionFeeAvailable
      ? JSON.stringify(live.redemptionTiers)
      : (stored?.redemption_fee_json ?? "[]"),
    data_source: live.source,
    source_updated_at: live.updatedAt,
  };
}

async function lookupFundInstrument(
  d1: D1Database,
  codeInput: string,
  quoteDateInput = "",
) {
  const code = normalizeProductCodeInput(codeInput);
  const quoteDate = quoteDateInput.trim();
  if (!/^\d{6}$/.test(code)) throw new Error("请输入 6 位基金或 ETF 代码");
  if (quoteDate && !/^\d{4}-\d{2}-\d{2}$/.test(quoteDate))
    throw new Error("交易日期格式不正确");

  const stored = await d1
    .prepare(
      `SELECT ${instrumentColumns} FROM instruments WHERE code = ? AND product_type IN ('FUND', 'ETF')`,
    )
    .bind(code)
    .first<InstrumentRow>();
  if (!stored) {
    const occupiedCode = await d1
      .prepare("SELECT name, product_type FROM instruments WHERE code = ?")
      .bind(code)
      .first<{ name: string; product_type: string }>();
    if (occupiedCode)
      throw new Error(
        occupiedCode.product_type === "STOCK"
          ? `代码 ${code} 已被历史股票“${occupiedCode.name}”占用，请先将股票保存为带 SH/SZ 前缀的规范代码`
          : `代码 ${code} 已被其他类型产品“${occupiedCode.name}”占用`,
      );
  }

  let live: Awaited<ReturnType<typeof fetchLiveFundData>>;
  try {
    live = await fetchLiveFundData(code, quoteDate);
  } catch (error) {
    if (stored)
      return {
        ...(await storedInstrumentResponse(d1, stored, quoteDate, false)),
        persisted: true,
      };
    throw error;
  }
  return {
    instrument: fundInstrumentFromLive(code, live, stored ?? null),
    quoteNav: live.quoteNav,
    quoteNavDate: live.quoteNavDate,
    quoteDateRequested: quoteDate,
    quoteIsExact: live.quoteIsExact,
    latestNav: live.latestNav,
    latestNavDate: live.latestNavDate,
    price: live.quoteNav,
    priceDate: live.quoteNavDate,
    fundCategory: live.fundCategory,
    confirmationBusinessDays: live.confirmationBusinessDays,
    quoteSource: live.source,
    isLive: true,
    matchedProductType: live.productType,
    feeNotice: "",
    persisted: Boolean(stored),
  };
}

function stockInstrumentFromQuote(
  quote: Awaited<ReturnType<typeof fetchLiveAshareQuote>>,
  stored: InstrumentRow | null,
): InstrumentRow {
  return {
    id: stored?.id ?? 0,
    name: quote.name,
    code: quote.canonicalCode,
    market: quote.market,
    asset_class: "中国股票",
    currency: "CNY",
    product_type: "STOCK",
    buy_fee_bps: stored?.buy_fee_bps ?? 0,
    buy_discount_bps: stored?.buy_discount_bps ?? 10_000,
    sell_fee_bps: stored?.sell_fee_bps ?? 0,
    min_fee_units: stored?.min_fee_units ?? 0,
    eastmoney_fee_bps: 0,
    min_purchase_units: 0,
    redemption_fee_json: "[]",
    data_source: quote.source,
    source_updated_at: quote.fetchedAt,
  };
}

async function lookupStockInstrument(
  d1: D1Database,
  codeInput: string,
  quoteDateInput = "",
) {
  const stock = parseAshareCode(codeInput);
  if (!stock) throw new Error(describeUnsupportedStockCode(codeInput));
  const quoteDate = quoteDateInput.trim();
  if (quoteDate && !/^\d{4}-\d{2}-\d{2}$/.test(quoteDate))
    throw new Error("交易日期格式不正确");

  const [canonicalOwner, legacyOwner] = await Promise.all([
    d1
      .prepare(`SELECT ${instrumentColumns} FROM instruments WHERE code = ?`)
      .bind(stock.canonicalCode)
      .first<InstrumentRow>(),
    d1
      .prepare(`SELECT ${instrumentColumns} FROM instruments WHERE code = ?`)
      .bind(stock.code)
      .first<InstrumentRow>(),
  ]);
  if (canonicalOwner && canonicalOwner.product_type !== "STOCK")
    throw new Error(`规范股票代码 ${stock.canonicalCode} 已被其他类型产品占用`);
  const canonicalStock =
    canonicalOwner?.product_type === "STOCK" ? canonicalOwner : null;
  const legacyStock =
    legacyOwner?.product_type === "STOCK" ? legacyOwner : null;
  if (canonicalStock && legacyStock && canonicalStock.id !== legacyStock.id)
    throw new Error(
      `检测到重复股票记录 ${stock.code} 与 ${stock.canonicalCode}，请先合并历史数据`,
    );
  const stored = canonicalStock ?? legacyStock;

  let quote: Awaited<ReturnType<typeof fetchLiveAshareQuote>>;
  try {
    quote = await fetchLiveAshareQuote(stock.canonicalCode);
  } catch (error) {
    if (stored)
      return {
        ...(await storedInstrumentResponse(d1, stored, quoteDate, false)),
        persisted: true,
      };
    throw error;
  }

  const cached = stored
    ? await storedInstrumentResponse(d1, stored, quoteDate, false)
    : null;
  const liveFitsRequestedDate = !quoteDate || quote.priceDate <= quoteDate;
  const quotePrice = liveFitsRequestedDate
    ? quote.price
    : (cached?.quoteNav ?? 0);
  const quotePriceDate = liveFitsRequestedDate
    ? quote.priceDate
    : (cached?.quoteNavDate ?? "");
  return {
    instrument: stockInstrumentFromQuote(quote, stored ?? null),
    quoteNav: quotePrice,
    quoteNavDate: quotePriceDate,
    quoteDateRequested: quoteDate,
    quoteIsExact: Boolean(quoteDate && quotePriceDate === quoteDate),
    latestNav: quote.price,
    latestNavDate: quote.priceDate,
    price: quotePrice,
    priceDate: quotePriceDate,
    fundCategory: "",
    confirmationBusinessDays: 0,
    quoteSource: liveFitsRequestedDate
      ? quote.source
      : (cached?.quoteSource ?? quote.source),
    isLive: true,
    matchedProductType: "STOCK",
    feeNotice: "股票交易佣金因券商和渠道而异，请按实际成交单填写手续费",
    persisted: Boolean(stored),
  };
}

async function resolveStockInstrument(
  d1: D1Database,
  codeInput: string,
  quoteDateInput = "",
) {
  const stock = parseAshareCode(codeInput);
  if (!stock) throw new Error(describeUnsupportedStockCode(codeInput));
  const quoteDate = quoteDateInput.trim();
  if (quoteDate && !/^\d{4}-\d{2}-\d{2}$/.test(quoteDate))
    throw new Error("交易日期格式不正确");

  const [canonicalOwner, legacyOwner] = await Promise.all([
    d1
      .prepare(`SELECT ${instrumentColumns} FROM instruments WHERE code = ?`)
      .bind(stock.canonicalCode)
      .first<InstrumentRow>(),
    d1
      .prepare(`SELECT ${instrumentColumns} FROM instruments WHERE code = ?`)
      .bind(stock.code)
      .first<InstrumentRow>(),
  ]);
  if (canonicalOwner && canonicalOwner.product_type !== "STOCK")
    throw new Error(`规范股票代码 ${stock.canonicalCode} 已被其他类型产品占用`);
  const canonicalStock =
    canonicalOwner?.product_type === "STOCK" ? canonicalOwner : null;
  const legacyStock =
    legacyOwner?.product_type === "STOCK" ? legacyOwner : null;
  if (canonicalStock && legacyStock && canonicalStock.id !== legacyStock.id)
    throw new Error(
      `检测到重复股票记录 ${stock.code} 与 ${stock.canonicalCode}，请先合并历史数据`,
    );

  let instrument = canonicalStock;
  if (!instrument && legacyStock) {
    const migrated = await d1
      .prepare(
        "UPDATE instruments SET code = ?, market = ? WHERE id = ? AND code = ? AND product_type = 'STOCK'",
      )
      .bind(stock.canonicalCode, stock.market, legacyStock.id, stock.code)
      .run();
    if (!Number(migrated.meta.changes ?? 0))
      throw new Error("历史股票代码规范化失败，请重试");
    instrument = await d1
      .prepare(`SELECT ${instrumentColumns} FROM instruments WHERE id = ?`)
      .bind(legacyStock.id)
      .first<InstrumentRow>();
    if (!instrument || instrument.product_type !== "STOCK")
      throw new Error("历史股票资料读取失败");
  }

  let quote: Awaited<ReturnType<typeof fetchLiveAshareQuote>> | null = null;
  try {
    quote = await fetchLiveAshareQuote(stock.canonicalCode);
  } catch (error) {
    if (!instrument) throw error;
  }

  if (!instrument && quote) {
    await d1
      .prepare(
        "INSERT OR IGNORE INTO instruments (name, code, market, asset_class, currency, product_type, buy_fee_bps, buy_discount_bps, sell_fee_bps, min_fee_units, eastmoney_fee_bps, min_purchase_units, redemption_fee_json, data_source, source_updated_at) VALUES (?, ?, ?, '中国股票', 'CNY', 'STOCK', 0, 10000, 0, 0, 0, 0, '[]', ?, ?)",
      )
      .bind(
        quote.name,
        stock.canonicalCode,
        stock.market,
        quote.source,
        quote.fetchedAt,
      )
      .run();
    instrument = await d1
      .prepare(
        `SELECT ${instrumentColumns} FROM instruments WHERE code = ? AND product_type = 'STOCK'`,
      )
      .bind(stock.canonicalCode)
      .first<InstrumentRow>();
  }
  if (!instrument) throw new Error("股票资料保存失败");

  if (quote) {
    const updated = await d1
      .prepare(
        "UPDATE instruments SET name = ?, market = ?, asset_class = '中国股票', currency = 'CNY', data_source = ?, source_updated_at = ? WHERE id = ? AND product_type = 'STOCK'",
      )
      .bind(
        quote.name,
        quote.market,
        quote.source,
        quote.fetchedAt,
        instrument.id,
      )
      .run();
    if (!Number(updated.meta.changes ?? 0))
      throw new Error("目标产品不是股票，已拒绝同步股票资料");
    await upsertSyncedPrice(
      d1,
      instrument.id,
      quote.priceDate,
      quote.price,
      quote.source,
    );
    instrument = await d1
      .prepare(`SELECT ${instrumentColumns} FROM instruments WHERE id = ?`)
      .bind(instrument.id)
      .first<InstrumentRow>();
  }
  if (!instrument) throw new Error("股票资料读取失败");
  return storedInstrumentResponse(d1, instrument, quoteDate, Boolean(quote));
}

async function resolveStoredInstrument(
  d1: D1Database,
  instrument: InstrumentRow,
  quoteDate = "",
) {
  if (
    ["FUND", "ETF"].includes(instrument.product_type) &&
    /^\d{6}$/.test(instrument.code)
  )
    return resolveFundInstrument(d1, instrument.code, quoteDate);
  if (instrument.product_type === "STOCK") {
    const stock = parseAshareCode(instrument.code);
    if (stock) return resolveStockInstrument(d1, instrument.code, quoteDate);
  }
  return storedInstrumentResponse(d1, instrument, quoteDate, false);
}

async function findStoredInvestmentInstrument(
  d1: D1Database,
  code: string,
  preferredProductType: PreferredProductType,
) {
  const lookupCodes = productCodeLookupCandidates(code, preferredProductType);
  for (const lookupCode of lookupCodes) {
    const existing = await d1
      .prepare(`SELECT ${instrumentColumns} FROM instruments WHERE code = ?`)
      .bind(lookupCode)
      .first<InstrumentRow>();
    if (
      existing &&
      productTypeMatchesPreference(existing.product_type, preferredProductType)
    )
      return existing;
  }
  return null;
}

async function resolveInvestmentInstrument(
  d1: D1Database,
  codeInput: string,
  quoteDate = "",
  preferredProductType: PreferredProductType = "AUTO",
) {
  const code = normalizeProductCodeInput(codeInput);
  const stock = parseAshareCode(code);
  const existing = await findStoredInvestmentInstrument(
    d1,
    code,
    preferredProductType,
  );
  if (existing) return resolveStoredInstrument(d1, existing, quoteDate);

  if (preferredProductType === "FUND")
    return resolveFundInstrument(d1, code, quoteDate);
  if (preferredProductType === "STOCK")
    return resolveStockInstrument(d1, code, quoteDate);

  if (/^\d{6}$/.test(code)) {
    // AUTO deliberately checks the fund catalogue first. Six-digit fund and
    // stock codes can overlap; selecting STOCK explicitly always disambiguates.
    try {
      return await resolveFundInstrument(d1, code, quoteDate);
    } catch (fundError) {
      if (stock) return resolveStockInstrument(d1, code, quoteDate);
      throw fundError;
    }
  }
  if (stock) return resolveStockInstrument(d1, code, quoteDate);
  throw new Error(describeUnsupportedStockCode(code));
}

async function lookupStoredInstrument(
  d1: D1Database,
  instrument: InstrumentRow,
  quoteDate = "",
) {
  if (
    productTypeMatchesPreference(instrument.product_type, "FUND") &&
    /^\d{6}$/.test(instrument.code)
  )
    return lookupFundInstrument(d1, instrument.code, quoteDate);
  if (instrument.product_type === "STOCK" && parseAshareCode(instrument.code))
    return lookupStockInstrument(d1, instrument.code, quoteDate);
  return storedInstrumentResponse(d1, instrument, quoteDate, false);
}

async function lookupInvestmentInstrument(
  d1: D1Database,
  codeInput: string,
  quoteDate = "",
  preferredProductType: PreferredProductType = "AUTO",
) {
  const code = normalizeProductCodeInput(codeInput);
  const stock = parseAshareCode(code);
  const existing = await findStoredInvestmentInstrument(
    d1,
    code,
    preferredProductType,
  );
  if (existing) return lookupStoredInstrument(d1, existing, quoteDate);

  if (preferredProductType === "FUND")
    return lookupFundInstrument(d1, code, quoteDate);
  if (preferredProductType === "STOCK")
    return lookupStockInstrument(d1, code, quoteDate);

  if (/^\d{6}$/.test(code)) {
    try {
      return await lookupFundInstrument(d1, code, quoteDate);
    } catch (fundError) {
      if (stock) return lookupStockInstrument(d1, code, quoteDate);
      throw fundError;
    }
  }
  if (stock) return lookupStockInstrument(d1, code, quoteDate);
  throw new Error(describeUnsupportedStockCode(code));
}

type NavSyncStatus = "idle" | "running" | "success" | "partial" | "error";

function navSyncFromRows(rows: Array<{ key: string; value: string }>) {
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const numeric = (key: string) => {
    const value = Number(values.get(key) ?? 0);
    return Number.isFinite(value) ? value : 0;
  };
  const storedStatus = values.get("nav_sync_status");
  const status: NavSyncStatus = [
    "idle",
    "running",
    "success",
    "partial",
    "error",
  ].includes(storedStatus ?? "")
    ? (storedStatus as NavSyncStatus)
    : "idle";
  return {
    lastAttemptAt: values.get("nav_sync_last_attempt_at") ?? "",
    lastSuccessAt: values.get("nav_sync_last_success_at") ?? "",
    synced: numeric("nav_sync_last_synced"),
    total: numeric("nav_sync_last_total"),
    official: numeric("nav_sync_last_official"),
    status,
  };
}

async function readNavSync(d1: D1Database) {
  const rows = await d1
    .prepare("SELECT key, value FROM app_meta WHERE key LIKE 'nav_sync_%'")
    .all<{ key: string; value: string }>();
  return navSyncFromRows(rows.results);
}

async function writeAppMeta(
  d1: D1Database,
  values: Record<string, string | number>,
) {
  const entries = Object.entries(values);
  if (!entries.length) return;
  await d1.batch(
    entries.map(([key, value]) =>
      d1
        .prepare(
          "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .bind(key, String(value)),
    ),
  );
}

async function loadPortfolio() {
  await ensureDatabase();
  const d1 = getD1();
  const [
    accounts,
    instruments,
    ledger,
    prices,
    plans,
    targets,
    journal,
    navSyncRows,
  ] = await Promise.all([
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
        "SELECT id, account_id, instrument_id, kind, trade_date, confirmation_date, quantity_units, price_units, gross_amount_units, fee_units, tax_units, notes, external_ref, purchase_channel, fee_source FROM ledger_entries ORDER BY trade_date, id",
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
    d1
      .prepare(
        `SELECT j.id, j.account_id, j.instrument_id, j.entry_date, j.title,
                  j.decision, j.mood, j.thesis, j.review_date, j.review_note,
                  j.created_at, j.updated_at, a.name AS account_name,
                  i.name AS instrument_name, i.code AS instrument_code
           FROM investment_journal j
           LEFT JOIN accounts a ON a.id = j.account_id
           LEFT JOIN instruments i ON i.id = j.instrument_id
           ORDER BY j.entry_date DESC, j.id DESC`,
      )
      .all<JournalRow>(),
    d1
      .prepare("SELECT key, value FROM app_meta WHERE key LIKE 'nav_sync_%'")
      .all<{ key: string; value: string }>(),
  ]);
  return {
    ...calculatePortfolio(
      accounts.results,
      instruments.results,
      ledger.results,
      prices.results,
      plans.results,
      targets.results,
    ),
    journal: journal.results,
    navSync: navSyncFromRows(navSyncRows.results),
  };
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

const journalDecisions = new Set(["BUY", "HOLD", "SELL", "WATCH", "REVIEW"]);
const journalMoods = new Set(["CALM", "CONFIDENT", "ANXIOUS", "FOMO"]);

function parseJournalPayload(body: Record<string, unknown>) {
  const optionalId = (key: string) => {
    const raw = String(body[key] ?? "").trim();
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0)
      throw new Error("复盘关联对象无效");
    return value;
  };
  const title = String(body.title ?? "").trim();
  if (!title) throw new Error("请填写复盘标题");
  const decision = String(body.decision ?? "REVIEW").toUpperCase();
  const mood = String(body.mood ?? "CALM").toUpperCase();
  if (!journalDecisions.has(decision)) throw new Error("复盘动作无效");
  if (!journalMoods.has(mood)) throw new Error("复盘情绪无效");
  const reviewDateInput = String(body.reviewDate ?? "").trim();
  return {
    accountId: optionalId("accountId"),
    instrumentId: optionalId("instrumentId"),
    entryDate: isoDate(body.entryDate),
    title: title.slice(0, 100),
    decision,
    mood,
    thesis: String(body.thesis ?? "")
      .trim()
      .slice(0, 4000),
    reviewDate: reviewDateInput ? isoDate(reviewDateInput) : "",
    reviewNote: String(body.reviewNote ?? "")
      .trim()
      .slice(0, 4000),
  };
}

async function assertJournalReferences(
  d1: D1Database,
  payload: ReturnType<typeof parseJournalPayload>,
) {
  const checks: Array<Promise<unknown>> = [];
  if (payload.accountId)
    checks.push(
      d1
        .prepare("SELECT id FROM accounts WHERE id = ?")
        .bind(payload.accountId)
        .first()
        .then((row) => {
          if (!row) throw new Error("关联账户不存在");
        }),
    );
  if (payload.instrumentId)
    checks.push(
      d1
        .prepare("SELECT id FROM instruments WHERE id = ?")
        .bind(payload.instrumentId)
        .first()
        .then((row) => {
          if (!row) throw new Error("关联产品不存在");
        }),
    );
  await Promise.all(checks);
}

async function assertAllocationTargetInstruments(
  d1: D1Database,
  targets: ParsedAllocationTarget[],
) {
  const instrumentIds = [
    ...new Set(
      targets
        .map((target) => target.instrumentId)
        .filter((instrumentId) => instrumentId > CASH_INSTRUMENT_ID),
    ),
  ];
  if (!instrumentIds.length) return;
  const placeholders = instrumentIds.map(() => "?").join(", ");
  const existing = await d1
    .prepare(`SELECT id FROM instruments WHERE id IN (${placeholders})`)
    .bind(...instrumentIds)
    .all<{ id: number }>();
  const existingIds = new Set(existing.results.map((row) => row.id));
  if (instrumentIds.some((instrumentId) => !existingIds.has(instrumentId)))
    throw new Error("配置目标包含不存在的产品");
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
    let mutationResult: Record<string, number> = {};

    if (action === "syncAllFunds") {
      const previousSync = await readNavSync(d1);
      const lastAttemptTime = Date.parse(previousSync.lastAttemptAt);
      const force = body.force === true;
      if (
        !force &&
        Number.isFinite(lastAttemptTime) &&
        Date.now() - lastAttemptTime < NAV_SYNC_COOLDOWN_MS
      ) {
        return Response.json({
          ...(await loadPortfolio()),
          catalogSync: {
            synced: previousSync.synced,
            total: previousSync.total,
            official: previousSync.official,
            skipped: true,
            cooldownSeconds: Math.ceil(NAV_SYNC_COOLDOWN_MS / 1000),
          },
        });
      }
      const instruments = await d1
        .prepare(`SELECT ${instrumentColumns} FROM instruments ORDER BY id`)
        .all<InstrumentRow>();
      let synced = 0;
      let official = 0;
      const syncable = instruments.results.filter(
        (instrument) =>
          ["FUND", "ETF"].includes(instrument.product_type) &&
          /^\d{6}$/.test(instrument.code),
      );
      const attemptAt = new Date().toISOString();
      await writeAppMeta(d1, {
        nav_sync_last_attempt_at: attemptAt,
        nav_sync_last_total: syncable.length,
        nav_sync_status: "running",
      });
      for (let index = 0; index < syncable.length; index += 3) {
        const batch = await Promise.allSettled(
          syncable
            .slice(index, index + 3)
            .map((instrument) => syncLatestFundNav(d1, instrument)),
        );
        for (const result of batch) {
          if (result.status === "fulfilled") {
            synced += 1;
            if (result.value.isOfficial) official += 1;
          }
        }
      }
      const completedAt = new Date().toISOString();
      const status: NavSyncStatus =
        syncable.length === 0
          ? "idle"
          : synced === syncable.length
            ? "success"
            : synced > 0
              ? "partial"
              : "error";
      await writeAppMeta(d1, {
        nav_sync_last_synced: synced,
        nav_sync_last_total: syncable.length,
        nav_sync_last_official: official,
        nav_sync_status: status,
        ...(synced > 0 ? { nav_sync_last_success_at: completedAt } : {}),
      });
      return Response.json({
        ...(await loadPortfolio()),
        catalogSync: {
          synced,
          total: syncable.length,
          official,
          skipped: false,
        },
      });
    }

    if (action === "lookupFund") {
      return Response.json(await fetchLiveFundData(String(body.code ?? "")));
    }

    if (action === "lookupInstrument") {
      const preferredProductType = parsePreferredProductType(
        body.preferredProductType,
      );
      const lookedUp = await lookupInvestmentInstrument(
        d1,
        String(body.code ?? ""),
        String(body.tradeDate ?? ""),
        preferredProductType,
      );
      return Response.json(lookedUp);
    }

    if (action === "resolveInstrument") {
      const preferredProductType = parsePreferredProductType(
        body.preferredProductType,
      );
      const resolved = await resolveInvestmentInstrument(
        d1,
        String(body.code ?? ""),
        String(body.tradeDate ?? ""),
        preferredProductType,
      );
      return Response.json(resolved);
    }

    if (action === "syncAccountNamesFromLatestBuys") {
      const latestBuys = await d1
        .prepare(
          `SELECT a.id AS account_id, a.name AS current_name,
                  l.instrument_id, i.name AS instrument_name
             FROM accounts a
             JOIN ledger_entries l ON l.id = (
               SELECT latest.id
                 FROM ledger_entries latest
                WHERE latest.account_id = a.id
                  AND latest.kind = 'BUY'
                  AND latest.instrument_id IS NOT NULL
                ORDER BY latest.trade_date DESC, latest.id DESC
                LIMIT 1
             )
             JOIN instruments i ON i.id = l.instrument_id
            ORDER BY a.id`,
        )
        .all<{
          account_id: number;
          current_name: string;
          instrument_id: number;
          instrument_name: string;
        }>();
      const updates = accountRenameUpdatesFromLatestBuys(
        latestBuys.results.map((row) => ({
          accountId: row.account_id,
          currentName: row.current_name,
          instrumentId: row.instrument_id,
          instrumentName: row.instrument_name,
        })),
      );
      if (updates.length)
        await d1.batch(
          updates.map((update) =>
            d1
              .prepare("UPDATE accounts SET name = ? WHERE id = ?")
              .bind(update.name, update.accountId),
          ),
        );
      return Response.json({
        ...(await loadPortfolio()),
        renamedCount: updates.length,
      });
    }

    if (action === "createEntry" || action === "updateEntry") {
      const entryId = action === "updateEntry" ? Number(body.id) : null;
      if (
        action === "updateEntry" &&
        (!Number.isInteger(entryId) || Number(entryId) <= 0)
      )
        throw new Error("流水不存在");
      if (entryId) {
        const existingEntry = await d1
          .prepare("SELECT id FROM ledger_entries WHERE id = ?")
          .bind(entryId)
          .first<{ id: number }>();
        if (!existingEntry) throw new Error("流水不存在");
      }
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
      const confirmationDate =
        ["BUY", "SELL"].includes(kind) &&
        String(body.confirmationDate ?? "").trim()
          ? isoDate(body.confirmationDate)
          : "";
      if (confirmationDate && confirmationDate < tradeDate)
        throw new Error("份额确认日期不能早于交易日期");
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
                "UPDATE instruments SET name = ?, asset_class = ?, product_type = ?, buy_fee_bps = ?, eastmoney_fee_bps = ?, min_purchase_units = ?, redemption_fee_json = CASE WHEN ? = 1 THEN ? ELSE redemption_fee_json END, data_source = ?, source_updated_at = ? WHERE id = ?",
              )
              .bind(
                live.name,
                live.assetClass,
                live.productType,
                live.standardBuyFeeBps,
                live.eastmoneyBuyFeeBps,
                decimalToUnits(live.minPurchase),
                live.redemptionFeeAvailable ? 1 : 0,
                JSON.stringify(live.redemptionTiers),
                live.source,
                live.updatedAt,
                instrumentId,
              )
              .run();
            if (live.latestNav && live.latestNavDate)
              await upsertSyncedPrice(
                d1,
                instrumentId,
                live.latestNavDate,
                live.latestNav,
                live.source,
              );
            instrument = {
              ...instrument,
              buy_fee_bps: live.standardBuyFeeBps,
              eastmoney_fee_bps: live.eastmoneyBuyFeeBps,
              redemption_fee_json: live.redemptionFeeAvailable
                ? JSON.stringify(live.redemptionTiers)
                : instrument.redemption_fee_json,
            };
          } catch {
            // Keep the last synchronized rules when the external source is unavailable.
          }
        }
        if (kind === "SELL" && instrument.product_type === "FUND") {
          const history = await d1
            .prepare(
              "SELECT kind, trade_date, quantity_units FROM ledger_entries WHERE account_id = ? AND instrument_id = ? AND trade_date <= ? AND kind IN ('BUY','SELL') AND (? IS NULL OR id <> ?) ORDER BY trade_date, id",
            )
            .bind(accountId, instrumentId, tradeDate, entryId, entryId)
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
            kind === "BUY" &&
            purchaseChannel === "EASTMONEY" &&
            instrument.eastmoney_fee_bps > 0
              ? instrument.eastmoney_fee_bps
              : instrument.buy_fee_bps;
          feeUnits = calculateTradingFeeUnits(
            kind === "SELL" ? "SELL" : "BUY",
            grossAmountUnits,
            {
              buyFeeBps: channelRate,
              buyDiscountBps: 10_000,
              sellFeeBps: instrument.sell_fee_bps,
              minFeeUnits: instrument.min_fee_units,
            },
          );
          feeSource =
            kind === "SELL"
              ? "PRODUCT_RULE"
              : purchaseChannel === "EASTMONEY"
                ? "LIVE_EASTMONEY"
                : "LIVE_STANDARD";
        }
      }
      if (kind === "SELL" && instrumentId) {
        const position = await d1
          .prepare(
            `SELECT COALESCE(SUM(CASE WHEN kind = 'BUY' THEN quantity_units WHEN kind = 'SELL' THEN -quantity_units ELSE 0 END), 0) AS available
             FROM ledger_entries WHERE account_id = ? AND instrument_id = ? AND trade_date <= ? AND (? IS NULL OR id <> ?)`,
          )
          .bind(accountId, instrumentId, tradeDate, entryId, entryId)
          .first<{ available: number }>();
        if (quantityUnits > Number(position?.available ?? 0))
          throw new Error("卖出份额超过该日期的可用持仓");
      }
      let officialAccountName: string | null = null;
      if (
        kind === "BUY" &&
        body.autoRenameAccount === true &&
        Number.isInteger(instrumentId) &&
        Number(instrumentId) > 0
      ) {
        const officialInstrument = await d1
          .prepare("SELECT name FROM instruments WHERE id = ?")
          .bind(instrumentId)
          .first<{ name: string }>();
        if (!officialInstrument) throw new Error("基金/证券代码不存在");
        officialAccountName = accountNameForEntry({
          kind,
          autoRenameAccount: body.autoRenameAccount,
          instrumentId,
          instrumentName: officialInstrument.name,
        });
        if (!officialAccountName) throw new Error("产品正式名称不能为空");
      }
      const entryValues = [
        accountId,
        instrumentId,
        kind,
        tradeDate,
        confirmationDate,
        quantityUnits,
        priceUnits,
        grossAmountUnits,
        feeUnits,
        decimalToUnits(body.tax),
        String(body.notes ?? "").slice(0, 200),
        String(body.externalRef ?? "").slice(0, 100),
        purchaseChannel.slice(0, 30),
        feeSource.slice(0, 40),
      ] as const;
      const entryStatement = entryId
        ? d1
            .prepare(
              `UPDATE ledger_entries
               SET account_id = ?, instrument_id = ?, kind = ?, trade_date = ?,
                   confirmation_date = ?, quantity_units = ?, price_units = ?,
                   gross_amount_units = ?, fee_units = ?, tax_units = ?,
                   notes = ?, external_ref = ?, purchase_channel = ?, fee_source = ?
               WHERE id = ?`,
            )
            .bind(...entryValues, entryId)
        : d1
            .prepare(
              `INSERT INTO ledger_entries
        (account_id, instrument_id, kind, trade_date, confirmation_date, quantity_units, price_units, gross_amount_units, fee_units, tax_units, notes, external_ref, purchase_channel, fee_source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(...entryValues);
      const entryStatements = [entryStatement];
      if (instrumentId && priceUnits) {
        entryStatements.push(
          d1
            .prepare(
              `INSERT INTO prices (instrument_id, price_date, price_units, source)
             VALUES (?, ?, ?, 'TRADE')
             ON CONFLICT(instrument_id, price_date) DO UPDATE SET
               price_units = excluded.price_units,
               source = excluded.source
             WHERE prices.source = 'TRADE'`,
            )
            .bind(instrumentId, isoDate(body.tradeDate), priceUnits),
        );
      }
      if (officialAccountName)
        entryStatements.push(
          d1
            .prepare("UPDATE accounts SET name = ? WHERE id = ?")
            .bind(officialAccountName, accountId),
        );
      await d1.batch(entryStatements);
    } else if (action === "createAccount") {
      const name = String(body.name ?? "").trim();
      if (!name) throw new Error("账户名称不能为空");
      await d1
        .prepare(
          "INSERT INTO accounts (name, currency, color) VALUES (?, 'CNY', ?)",
        )
        .bind(name.slice(0, 50), String(body.color ?? "#5B7CFA"))
        .run();
    } else if (action === "updateAccount") {
      const accountId = positiveIntegerId(body.id, "账户");
      const name = String(body.name ?? "").trim();
      const color = String(body.color ?? "#5B7CFA").trim();
      if (!name) throw new Error("账户名称不能为空");
      if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("账户颜色格式无效");
      const updated = await d1
        .prepare("UPDATE accounts SET name = ?, color = ? WHERE id = ?")
        .bind(name.slice(0, 50), color, accountId)
        .run();
      if (!Number(updated.meta.changes ?? 0)) throw new Error("账户不存在");
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
    } else if (action === "deleteAccountInstrument") {
      const accountId = positiveIntegerId(body.accountId, "账户");
      const instrumentId = positiveIntegerId(body.instrumentId, "产品");
      const [entryUsage, planUsage] = await Promise.all([
        d1
          .prepare(
            "SELECT COUNT(*) AS count FROM ledger_entries WHERE account_id = ? AND instrument_id = ?",
          )
          .bind(accountId, instrumentId)
          .first<{ count: number }>(),
        d1
          .prepare(
            "SELECT COUNT(*) AS count FROM recurring_plans WHERE account_id = ? AND instrument_id = ?",
          )
          .bind(accountId, instrumentId)
          .first<{ count: number }>(),
      ]);
      const deletedEntries = Number(entryUsage?.count ?? 0);
      const deletedPlans = Number(planUsage?.count ?? 0);
      if (!deletedEntries && !deletedPlans)
        throw new Error("该账户中不存在这个产品的流水或定投计划");

      await d1.batch([
        d1
          .prepare(
            "DELETE FROM ledger_entries WHERE account_id = ? AND instrument_id = ?",
          )
          .bind(accountId, instrumentId),
        d1
          .prepare(
            "DELETE FROM recurring_plans WHERE account_id = ? AND instrument_id = ?",
          )
          .bind(accountId, instrumentId),
        d1
          .prepare(
            `UPDATE accounts
             SET name = COALESCE(
               (SELECT substr(trim(i.name), 1, 50)
                  FROM ledger_entries l
                  JOIN instruments i ON i.id = l.instrument_id
                 WHERE l.account_id = accounts.id AND l.kind = 'BUY'
                 ORDER BY l.trade_date DESC, l.id DESC
                 LIMIT 1),
               name
             )
             WHERE id = ?`,
          )
          .bind(accountId),
      ]);
      mutationResult = { deletedEntries, deletedPlans };
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
    } else if (action === "updateInstrument") {
      const instrumentId = positiveIntegerId(body.id, "产品");
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
      const updated = await d1
        .prepare(
          `UPDATE instruments
           SET name = ?, code = ?, market = ?, asset_class = ?, currency = ?,
               product_type = ?, buy_fee_bps = ?, buy_discount_bps = ?,
               sell_fee_bps = ?, min_fee_units = ?, eastmoney_fee_bps = ?,
               min_purchase_units = ?, redemption_fee_json = ?,
               data_source = ?, source_updated_at = ?
           WHERE id = ?`,
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
          instrumentId,
        )
        .run();
      if (!Number(updated.meta.changes ?? 0)) throw new Error("产品不存在");
    } else if (action === "deleteInstrument") {
      const instrumentId = positiveIntegerId(body.id, "产品");
      const [ledgerUsage, planUsage, journalUsage, paperUsage] =
        await Promise.all([
          d1
            .prepare(
              "SELECT COUNT(*) AS count FROM ledger_entries WHERE instrument_id = ?",
            )
            .bind(instrumentId)
            .first<{ count: number }>(),
          d1
            .prepare(
              "SELECT COUNT(*) AS count FROM recurring_plans WHERE instrument_id = ?",
            )
            .bind(instrumentId)
            .first<{ count: number }>(),
          d1
            .prepare(
              "SELECT COUNT(*) AS count FROM investment_journal WHERE instrument_id = ?",
            )
            .bind(instrumentId)
            .first<{ count: number }>(),
          d1
            .prepare(
              "SELECT COUNT(*) AS count FROM paper_trades WHERE instrument_id = ?",
            )
            .bind(instrumentId)
            .first<{ count: number }>(),
        ]);
      const references = {
        流水: Number(ledgerUsage?.count ?? 0),
        定投: Number(planUsage?.count ?? 0),
        复盘: Number(journalUsage?.count ?? 0),
        模拟交易: Number(paperUsage?.count ?? 0),
      };
      const usedBy = Object.entries(references)
        .filter(([, count]) => count > 0)
        .map(([label, count]) => `${count} 条${label}`)
        .join("、");
      if (usedBy) throw new Error(`请先删除关联的${usedBy}`);
      const existing = await d1
        .prepare("SELECT id FROM instruments WHERE id = ?")
        .bind(instrumentId)
        .first<{ id: number }>();
      if (!existing) throw new Error("产品不存在");
      await d1.batch([
        d1
          .prepare("DELETE FROM prices WHERE instrument_id = ?")
          .bind(instrumentId),
        d1
          .prepare("DELETE FROM allocation_targets WHERE instrument_id = ?")
          .bind(instrumentId),
        d1.prepare("DELETE FROM instruments WHERE id = ?").bind(instrumentId),
      ]);
    } else if (action === "createPlan") {
      const accountId = Number(body.accountId);
      const instrumentId = Number(body.instrumentId);
      const amountUnits = decimalToUnits(body.amount);
      if (!Number.isInteger(accountId) || !Number.isInteger(instrumentId))
        throw new Error("请选择投资账户和产品");
      if (amountUnits <= 0) throw new Error("定投金额必须大于 0");
      const [account, instrument] = await Promise.all([
        d1
          .prepare("SELECT id FROM accounts WHERE id = ?")
          .bind(accountId)
          .first<{ id: number }>(),
        d1
          .prepare("SELECT id FROM instruments WHERE id = ?")
          .bind(instrumentId)
          .first<{ id: number }>(),
      ]);
      if (!account) throw new Error("投资账户不存在");
      if (!instrument) throw new Error("投资产品不存在，请先通过代码匹配产品");
      await d1
        .prepare(
          "INSERT INTO recurring_plans (account_id, instrument_id, amount_units, day_of_month, next_date) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(
          accountId,
          instrumentId,
          amountUnits,
          Math.min(28, Math.max(1, Number(body.dayOfMonth) || 1)),
          isoDate(body.nextDate),
        )
        .run();
    } else if (action === "updatePlan") {
      const planId = Number(body.id);
      const accountId = Number(body.accountId);
      const instrumentId = Number(body.instrumentId);
      const amountUnits = decimalToUnits(body.amount);
      if (!Number.isInteger(planId)) throw new Error("定投计划不存在");
      if (!Number.isInteger(accountId) || !Number.isInteger(instrumentId))
        throw new Error("请选择投资账户和产品");
      if (amountUnits <= 0) throw new Error("定投金额必须大于 0");
      const [account, instrument] = await Promise.all([
        d1
          .prepare("SELECT id FROM accounts WHERE id = ?")
          .bind(accountId)
          .first<{ id: number }>(),
        d1
          .prepare("SELECT id FROM instruments WHERE id = ?")
          .bind(instrumentId)
          .first<{ id: number }>(),
      ]);
      if (!account) throw new Error("投资账户不存在");
      if (!instrument) throw new Error("投资产品不存在，请先通过代码匹配产品");
      const updated = await d1
        .prepare(
          "UPDATE recurring_plans SET account_id = ?, instrument_id = ?, amount_units = ?, day_of_month = ?, next_date = ? WHERE id = ?",
        )
        .bind(
          accountId,
          instrumentId,
          amountUnits,
          Math.min(28, Math.max(1, Number(body.dayOfMonth) || 1)),
          isoDate(body.nextDate),
          planId,
        )
        .run();
      if (!updated.meta.changes) throw new Error("定投计划不存在");
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
      const target = parseAllocationTarget(body);
      await assertAllocationTargetInstruments(d1, [target]);
      const savedProducts = await d1
        .prepare(
          "SELECT instrument_id, target_bps FROM allocation_targets WHERE instrument_id > 0",
        )
        .all<{ instrument_id: number; target_bps: number }>();
      const productBps = new Map(
        savedProducts.results.map((row) => [row.instrument_id, row.target_bps]),
      );
      if (target.instrumentId > CASH_INSTRUMENT_ID)
        productBps.set(target.instrumentId, target.targetBps);
      const productTotalBps = [...productBps.values()].reduce(
        (sum, targetBps) => sum + targetBps,
        0,
      );
      if (productTotalBps > TOTAL_ALLOCATION_BPS)
        throw new Error("产品目标合计不能超过 10000 基点（100%）");
      const derivedCashBps = TOTAL_ALLOCATION_BPS - productTotalBps;
      if (
        target.instrumentId === CASH_INSTRUMENT_ID &&
        target.targetBps !== derivedCashBps
      )
        throw new Error("现金目标必须等于 100% 减去全部产品目标");

      const targetAlertBps = target.alertBps ?? DEFAULT_ALLOCATION_ALERT_BPS;
      const targetUpsert =
        target.alertBps === undefined
          ? d1
              .prepare(
                "INSERT INTO allocation_targets (instrument_id, target_bps, alert_bps) VALUES (?, ?, ?) ON CONFLICT(instrument_id) DO UPDATE SET target_bps = excluded.target_bps",
              )
              .bind(target.instrumentId, target.targetBps, targetAlertBps)
          : d1
              .prepare(
                "INSERT INTO allocation_targets (instrument_id, target_bps, alert_bps) VALUES (?, ?, ?) ON CONFLICT(instrument_id) DO UPDATE SET target_bps = excluded.target_bps, alert_bps = excluded.alert_bps",
              )
              .bind(target.instrumentId, target.targetBps, targetAlertBps);
      const cashUpsert = d1
        .prepare(
          "INSERT INTO allocation_targets (instrument_id, target_bps, alert_bps) VALUES (0, ?, 500) ON CONFLICT(instrument_id) DO UPDATE SET target_bps = excluded.target_bps",
        )
        .bind(derivedCashBps);
      await d1.batch(
        target.instrumentId === CASH_INSTRUMENT_ID
          ? [targetUpsert]
          : [targetUpsert, cashUpsert],
      );
    } else if (action === "updateTargets") {
      const targets = parseAllocationTargets(body.targets);
      await assertAllocationTargetInstruments(d1, targets);
      const ids = targets.map((target) => target.instrumentId);
      const placeholders = ids.map(() => "?").join(", ");
      await d1.batch([
        d1
          .prepare(
            `DELETE FROM allocation_targets WHERE instrument_id NOT IN (${placeholders})`,
          )
          .bind(...ids),
        ...targets.map((target) => {
          const statement =
            target.alertBps === undefined
              ? "INSERT INTO allocation_targets (instrument_id, target_bps, alert_bps) VALUES (?, ?, ?) ON CONFLICT(instrument_id) DO UPDATE SET target_bps = excluded.target_bps"
              : "INSERT INTO allocation_targets (instrument_id, target_bps, alert_bps) VALUES (?, ?, ?) ON CONFLICT(instrument_id) DO UPDATE SET target_bps = excluded.target_bps, alert_bps = excluded.alert_bps";
          return d1
            .prepare(statement)
            .bind(
              target.instrumentId,
              target.targetBps,
              target.alertBps ?? DEFAULT_ALLOCATION_ALERT_BPS,
            );
        }),
      ]);
    } else if (action === "clearTargets") {
      await d1.prepare("DELETE FROM allocation_targets").run();
    } else if (action === "createJournal") {
      const journal = parseJournalPayload(body);
      await assertJournalReferences(d1, journal);
      await d1
        .prepare(
          `INSERT INTO investment_journal
           (account_id, instrument_id, entry_date, title, decision, mood, thesis, review_date, review_note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          journal.accountId,
          journal.instrumentId,
          journal.entryDate,
          journal.title,
          journal.decision,
          journal.mood,
          journal.thesis,
          journal.reviewDate,
          journal.reviewNote,
        )
        .run();
    } else if (action === "updateJournal") {
      const journalId = Number(body.id);
      if (!Number.isInteger(journalId) || journalId <= 0)
        throw new Error("复盘记录不存在");
      const journal = parseJournalPayload(body);
      await assertJournalReferences(d1, journal);
      const updated = await d1
        .prepare(
          `UPDATE investment_journal
           SET account_id = ?, instrument_id = ?, entry_date = ?, title = ?,
               decision = ?, mood = ?, thesis = ?, review_date = ?, review_note = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(
          journal.accountId,
          journal.instrumentId,
          journal.entryDate,
          journal.title,
          journal.decision,
          journal.mood,
          journal.thesis,
          journal.reviewDate,
          journal.reviewNote,
          journalId,
        )
        .run();
      if (!Number(updated.meta.changes ?? 0)) throw new Error("复盘记录不存在");
    } else if (action === "deleteJournal") {
      const journalId = Number(body.id);
      if (!Number.isInteger(journalId) || journalId <= 0)
        throw new Error("复盘记录不存在");
      const deleted = await d1
        .prepare("DELETE FROM investment_journal WHERE id = ?")
        .bind(journalId)
        .run();
      if (!Number(deleted.meta.changes ?? 0)) throw new Error("复盘记录不存在");
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
      const instrumentId = positiveIntegerId(body.instrumentId, "产品");
      const priceUnits = decimalToUnits(body.price, PRICE_SCALE);
      if (priceUnits <= 0) throw new Error("价格 / 净值必须大于 0");
      await d1
        .prepare(
          "INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (?, ?, ?, 'MANUAL') ON CONFLICT(instrument_id, price_date) DO UPDATE SET price_units = excluded.price_units, source = excluded.source",
        )
        .bind(instrumentId, isoDate(body.priceDate), priceUnits)
        .run();
    } else if (action === "updatePrice") {
      const priceId = positiveIntegerId(body.id, "估值记录");
      const instrumentId = positiveIntegerId(body.instrumentId, "产品");
      const priceUnits = decimalToUnits(body.price, PRICE_SCALE);
      if (priceUnits <= 0) throw new Error("价格 / 净值必须大于 0");
      const updated = await d1
        .prepare(
          `UPDATE prices
           SET instrument_id = ?, price_date = ?, price_units = ?, source = 'MANUAL'
           WHERE id = ?`,
        )
        .bind(instrumentId, isoDate(body.priceDate), priceUnits, priceId)
        .run();
      if (!Number(updated.meta.changes ?? 0)) throw new Error("估值记录不存在");
    } else if (action === "deletePrice") {
      const priceId = positiveIntegerId(body.id, "估值记录");
      const deleted = await d1
        .prepare("DELETE FROM prices WHERE id = ?")
        .bind(priceId)
        .run();
      if (!Number(deleted.meta.changes ?? 0)) throw new Error("估值记录不存在");
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
        const tradeDate = isoDate(row.tradeDate);
        const confirmationDate =
          (kind === "BUY" || kind === "SELL") &&
          String(row.confirmationDate ?? "").trim()
            ? isoDate(row.confirmationDate)
            : "";
        if (confirmationDate && confirmationDate < tradeDate)
          throw new Error(`第 ${index + 2} 行确认日期不能早于交易日期`);
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
          (account_id, instrument_id, kind, trade_date, confirmation_date, quantity_units, price_units, gross_amount_units, fee_units, tax_units, notes, external_ref)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            accountId,
            instrumentId,
            kind,
            tradeDate,
            confirmationDate,
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
    return Response.json({ ...(await loadPortfolio()), ...mutationResult });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
