import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * All monetary values are stored as signed integers in 1/10,000 CNY units.
 * Prices and quantities use 1/1,000,000 units. This avoids binary floating-point
 * drift while remaining well inside JavaScript's safe integer range for a
 * personal portfolio.
 */
export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("CNY"),
  costMethod: text("cost_method").notNull().default("MOVING_AVERAGE"),
  color: text("color").notNull().default("#5B7CFA"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const instruments = sqliteTable(
  "instruments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    code: text("code").notNull(),
    market: text("market").notNull().default("CN"),
    assetClass: text("asset_class").notNull().default("OTHER"),
    currency: text("currency").notNull().default("CNY"),
    productType: text("product_type").notNull().default("FUND"),
    buyFeeBps: integer("buy_fee_bps").notNull().default(0),
    buyDiscountBps: integer("buy_discount_bps").notNull().default(10000),
    sellFeeBps: integer("sell_fee_bps").notNull().default(0),
    minFeeUnits: integer("min_fee_units").notNull().default(0),
    eastmoneyFeeBps: integer("eastmoney_fee_bps").notNull().default(0),
    minPurchaseUnits: integer("min_purchase_units").notNull().default(0),
    redemptionFeeJson: text("redemption_fee_json").notNull().default("[]"),
    dataSource: text("data_source").notNull().default("MANUAL"),
    sourceUpdatedAt: text("source_updated_at").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("instruments_code_idx").on(table.code)],
);

export const ledgerEntries = sqliteTable(
  "ledger_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id").notNull(),
    instrumentId: integer("instrument_id"),
    kind: text("kind").notNull(),
    tradeDate: text("trade_date").notNull(),
    quantityUnits: integer("quantity_units").notNull().default(0),
    priceUnits: integer("price_units").notNull().default(0),
    grossAmountUnits: integer("gross_amount_units").notNull().default(0),
    feeUnits: integer("fee_units").notNull().default(0),
    taxUnits: integer("tax_units").notNull().default(0),
    notes: text("notes").notNull().default(""),
    externalRef: text("external_ref").notNull().default(""),
    purchaseChannel: text("purchase_channel").notNull().default("MANUAL"),
    feeSource: text("fee_source").notNull().default("MANUAL"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("ledger_account_date_idx").on(table.accountId, table.tradeDate),
    uniqueIndex("ledger_external_ref_idx")
      .on(table.externalRef)
      .where(sql`${table.externalRef} <> ''`),
  ],
);

export const prices = sqliteTable(
  "prices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    instrumentId: integer("instrument_id").notNull(),
    priceDate: text("price_date").notNull(),
    priceUnits: integer("price_units").notNull(),
    source: text("source").notNull().default("MANUAL"),
  },
  (table) => [
    uniqueIndex("prices_instrument_date_idx").on(
      table.instrumentId,
      table.priceDate,
    ),
  ],
);

export const recurringPlans = sqliteTable("recurring_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull(),
  instrumentId: integer("instrument_id").notNull(),
  amountUnits: integer("amount_units").notNull(),
  frequency: text("frequency").notNull().default("MONTHLY"),
  dayOfMonth: integer("day_of_month").notNull().default(1),
  nextDate: text("next_date").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const allocationTargets = sqliteTable(
  "allocation_targets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    instrumentId: integer("instrument_id").notNull(),
    targetBps: integer("target_bps").notNull(),
    alertBps: integer("alert_bps").notNull().default(500),
  },
  (table) => [uniqueIndex("allocation_instrument_idx").on(table.instrumentId)],
);

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
