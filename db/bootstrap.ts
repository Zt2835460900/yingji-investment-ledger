import { getD1 } from "./index";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'CNY',
    cost_method TEXT NOT NULL DEFAULT 'MOVING_AVERAGE',
    color TEXT NOT NULL DEFAULT '#5B7CFA',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS instruments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    market TEXT NOT NULL DEFAULT 'CN',
    asset_class TEXT NOT NULL DEFAULT 'OTHER',
    currency TEXT NOT NULL DEFAULT 'CNY',
    product_type TEXT NOT NULL DEFAULT 'FUND',
    buy_fee_bps INTEGER NOT NULL DEFAULT 0,
    buy_discount_bps INTEGER NOT NULL DEFAULT 10000,
    sell_fee_bps INTEGER NOT NULL DEFAULT 0,
    min_fee_units INTEGER NOT NULL DEFAULT 0,
    eastmoney_fee_bps INTEGER NOT NULL DEFAULT 0,
    min_purchase_units INTEGER NOT NULL DEFAULT 0,
    redemption_fee_json TEXT NOT NULL DEFAULT '[]',
    data_source TEXT NOT NULL DEFAULT 'MANUAL',
    source_updated_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS fund_purchase_limits (
    instrument_id INTEGER PRIMARY KEY,
    purchase_status TEXT NOT NULL DEFAULT 'UNKNOWN',
    daily_limit_units INTEGER NOT NULL DEFAULT 0,
    auto_sync INTEGER NOT NULL DEFAULT 1,
    source TEXT NOT NULL DEFAULT 'MANUAL',
    source_updated_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS ledger_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    instrument_id INTEGER,
    kind TEXT NOT NULL,
    trade_date TEXT NOT NULL,
    confirmation_date TEXT NOT NULL DEFAULT '',
    quantity_units INTEGER NOT NULL DEFAULT 0,
    price_units INTEGER NOT NULL DEFAULT 0,
    gross_amount_units INTEGER NOT NULL DEFAULT 0,
    fee_units INTEGER NOT NULL DEFAULT 0,
    tax_units INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    external_ref TEXT NOT NULL DEFAULT '',
    purchase_channel TEXT NOT NULL DEFAULT 'MANUAL',
    fee_source TEXT NOT NULL DEFAULT 'MANUAL',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS ledger_account_date_idx ON ledger_entries(account_id, trade_date)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ledger_external_ref_idx ON ledger_entries(external_ref) WHERE external_ref <> ''`,
  `CREATE TABLE IF NOT EXISTS prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instrument_id INTEGER NOT NULL,
    price_date TEXT NOT NULL,
    price_units INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'MANUAL',
    UNIQUE(instrument_id, price_date)
  )`,
  `CREATE TABLE IF NOT EXISTS recurring_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    instrument_id INTEGER NOT NULL,
    amount_units INTEGER NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'MONTHLY',
    execution_mode TEXT NOT NULL DEFAULT 'MONTHLY_DATE',
    manual_daily_cap_units INTEGER NOT NULL DEFAULT 0,
    day_of_month INTEGER NOT NULL DEFAULT 1,
    next_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS allocation_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instrument_id INTEGER NOT NULL UNIQUE,
    target_bps INTEGER NOT NULL,
    alert_bps INTEGER NOT NULL DEFAULT 500
  )`,
  `CREATE TABLE IF NOT EXISTS investment_journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER,
    instrument_id INTEGER,
    entry_date TEXT NOT NULL,
    title TEXT NOT NULL,
    decision TEXT NOT NULL DEFAULT 'REVIEW',
    mood TEXT NOT NULL DEFAULT 'CALM',
    thesis TEXT NOT NULL DEFAULT '',
    review_date TEXT NOT NULL DEFAULT '',
    review_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS investment_journal_date_idx ON investment_journal(entry_date)`,
  `CREATE INDEX IF NOT EXISTS investment_journal_instrument_idx ON investment_journal(instrument_id)`,
  `CREATE TABLE IF NOT EXISTS paper_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    initial_cash_units INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS paper_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    instrument_id INTEGER NOT NULL,
    side TEXT NOT NULL,
    trade_date TEXT NOT NULL,
    quantity_units INTEGER NOT NULL,
    price_units INTEGER NOT NULL,
    fee_units INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS paper_trades_account_date_idx ON paper_trades(account_id, trade_date)`,
  `CREATE TABLE IF NOT EXISTS company_watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    market TEXT NOT NULL DEFAULT 'US',
    source TEXT NOT NULL DEFAULT 'AUTO',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    holding_rank INTEGER NOT NULL DEFAULT 0,
    estimated_weight_bps INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    last_discovered_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS company_watchlist_status_rank_idx ON company_watchlist(status, holding_rank)`,
  `CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];

const upgradeStatements = [
  `ALTER TABLE instruments ADD COLUMN product_type TEXT NOT NULL DEFAULT 'FUND'`,
  `ALTER TABLE instruments ADD COLUMN buy_fee_bps INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE instruments ADD COLUMN buy_discount_bps INTEGER NOT NULL DEFAULT 10000`,
  `ALTER TABLE instruments ADD COLUMN sell_fee_bps INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE instruments ADD COLUMN min_fee_units INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE instruments ADD COLUMN eastmoney_fee_bps INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE instruments ADD COLUMN min_purchase_units INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE instruments ADD COLUMN redemption_fee_json TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE instruments ADD COLUMN data_source TEXT NOT NULL DEFAULT 'MANUAL'`,
  `ALTER TABLE instruments ADD COLUMN source_updated_at TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE ledger_entries ADD COLUMN purchase_channel TEXT NOT NULL DEFAULT 'MANUAL'`,
  `ALTER TABLE ledger_entries ADD COLUMN fee_source TEXT NOT NULL DEFAULT 'MANUAL'`,
  `ALTER TABLE ledger_entries ADD COLUMN confirmation_date TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE recurring_plans ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'MONTHLY_DATE'`,
  `ALTER TABLE recurring_plans ADD COLUMN manual_daily_cap_units INTEGER NOT NULL DEFAULT 0`,
];

const seedStatements = [
  `INSERT INTO accounts (id, name, currency, color) VALUES (1, '纳斯达克100ETF', 'CNY', '#5B7CFA')`,
  `INSERT INTO accounts (id, name, currency, color) VALUES (2, '标普500ETF', 'CNY', '#19A974')`,
  `INSERT INTO accounts (id, name, currency, color) VALUES (3, '中国科技基金', 'CNY', '#F59E0B')`,
  `INSERT INTO instruments (id, name, code, market, asset_class, currency) VALUES (1, '纳斯达克100ETF', '513100', 'CN', '美国股票', 'CNY')`,
  `INSERT INTO instruments (id, name, code, market, asset_class, currency) VALUES (2, '标普500ETF', '513500', 'CN', '美国股票', 'CNY')`,
  `INSERT INTO instruments (id, name, code, market, asset_class, currency) VALUES (3, '中国科技基金', 'TECH-CN', 'CN', '中国股票', 'CNY')`,
  `INSERT INTO ledger_entries (account_id, kind, trade_date, gross_amount_units, notes) VALUES (1, 'DEPOSIT', '2025-08-01', 2600000000, '初始入金')`,
  `INSERT INTO ledger_entries (account_id, instrument_id, kind, trade_date, quantity_units, price_units, gross_amount_units, fee_units, notes) VALUES (1, 1, 'BUY', '2025-08-01', 110000000000, 2180000, 2398000000, 120000, '首笔建仓')`,
  `INSERT INTO ledger_entries (account_id, kind, trade_date, gross_amount_units, notes) VALUES (2, 'DEPOSIT', '2025-08-01', 900000000, '初始入金')`,
  `INSERT INTO ledger_entries (account_id, instrument_id, kind, trade_date, quantity_units, price_units, gross_amount_units, fee_units, notes) VALUES (2, 2, 'BUY', '2025-08-01', 50000000000, 1720000, 860000000, 50000, '首笔建仓')`,
  `INSERT INTO ledger_entries (account_id, kind, trade_date, gross_amount_units, notes) VALUES (3, 'DEPOSIT', '2025-09-10', 500000000, '初始入金')`,
  `INSERT INTO ledger_entries (account_id, instrument_id, kind, trade_date, quantity_units, price_units, gross_amount_units, fee_units, notes) VALUES (3, 3, 'BUY', '2025-09-10', 36000000000, 1320000, 475200000, 60000, '首笔建仓')`,
  `INSERT INTO ledger_entries (account_id, kind, trade_date, gross_amount_units, notes) VALUES (1, 'DEPOSIT', '2025-11-05', 300000000, '追加资金')`,
  `INSERT INTO ledger_entries (account_id, instrument_id, kind, trade_date, quantity_units, price_units, gross_amount_units, fee_units, notes) VALUES (1, 1, 'BUY', '2025-11-05', 12000000000, 2410000, 289200000, 20000, '定投')`,
  `INSERT INTO ledger_entries (account_id, kind, trade_date, gross_amount_units, notes) VALUES (2, 'DEPOSIT', '2026-01-08', 100000000, '追加资金')`,
  `INSERT INTO ledger_entries (account_id, instrument_id, kind, trade_date, quantity_units, price_units, gross_amount_units, fee_units, notes) VALUES (2, 2, 'BUY', '2026-01-08', 5200000000, 1840000, 95680000, 10000, '定投')`,
  `INSERT INTO ledger_entries (account_id, instrument_id, kind, trade_date, gross_amount_units, fee_units, notes) VALUES (1, 1, 'DIVIDEND', '2026-03-18', 3800000, 0, '现金分红')`,
  `INSERT INTO ledger_entries (account_id, instrument_id, kind, trade_date, quantity_units, price_units, gross_amount_units, fee_units, notes) VALUES (3, 3, 'SELL', '2026-05-12', 6000000000, 1460000, 87600000, 10000, '部分止盈')`,
  `INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (1, '2025-08-01', 2180000, 'DEMO')`,
  `INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (1, '2025-11-05', 2410000, 'DEMO')`,
  `INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (1, '2026-01-31', 2520000, 'DEMO')`,
  `INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (1, '2026-03-31', 2460000, 'DEMO')`,
  `INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (1, '2026-05-31', 2710000, 'DEMO')`,
  `INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (1, '2026-07-18', 2846000, 'DEMO')`,
  `INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (2, '2025-08-01', 1720000, 'DEMO')`,
  `INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (2, '2025-11-30', 1790000, 'DEMO')`,
  `INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (2, '2026-01-08', 1840000, 'DEMO')`,
  `INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (2, '2026-03-31', 1810000, 'DEMO')`,
  `INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (2, '2026-05-31', 1930000, 'DEMO')`,
  `INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (2, '2026-07-18', 2015000, 'DEMO')`,
  `INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (3, '2025-09-10', 1320000, 'DEMO')`,
  `INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (3, '2025-11-30', 1380000, 'DEMO')`,
  `INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (3, '2026-01-31', 1290000, 'DEMO')`,
  `INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (3, '2026-03-31', 1410000, 'DEMO')`,
  `INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (3, '2026-05-12', 1460000, 'DEMO')`,
  `INSERT INTO prices (instrument_id, price_date, price_units, source) VALUES (3, '2026-07-18', 1510000, 'DEMO')`,
  `INSERT INTO recurring_plans (account_id, instrument_id, amount_units, day_of_month, next_date) VALUES (1, 1, 30000000, 5, '2026-08-05')`,
  `INSERT INTO recurring_plans (account_id, instrument_id, amount_units, day_of_month, next_date) VALUES (2, 2, 10000000, 8, '2026-08-08')`,
  `INSERT INTO recurring_plans (account_id, instrument_id, amount_units, day_of_month, next_date) VALUES (3, 3, 5000000, 10, '2026-08-10')`,
  `INSERT INTO allocation_targets (instrument_id, target_bps, alert_bps) VALUES (1, 6700, 500)`,
  `INSERT INTO allocation_targets (instrument_id, target_bps, alert_bps) VALUES (2, 2200, 500)`,
  `INSERT INTO allocation_targets (instrument_id, target_bps, alert_bps) VALUES (3, 1100, 500)`,
  `INSERT INTO app_meta (key, value) VALUES ('seed_version', '1')`,
];

let initialized = false;

export async function ensureDatabase() {
  if (initialized) return;
  const d1 = getD1();
  await d1.batch(schemaStatements.map((statement) => d1.prepare(statement)));
  for (const statement of upgradeStatements) {
    try {
      await d1.prepare(statement).run();
    } catch (error) {
      if (!String(error).toLowerCase().includes("duplicate column"))
        throw error;
    }
  }
  const seeded = await d1
    .prepare("SELECT value FROM app_meta WHERE key = ?")
    .bind("seed_version")
    .first();
  if (!seeded) {
    const demoEnabled = await d1
      .prepare("SELECT value FROM app_meta WHERE key = ?")
      .bind("demo_seed_enabled")
      .first<{ value: string }>();
    if (demoEnabled?.value === "1")
      await d1.batch(seedStatements.map((statement) => d1.prepare(statement)));
    else
      await d1
        .prepare(
          "INSERT INTO app_meta (key, value) VALUES ('seed_version', 'production-empty')",
        )
        .run();
  }
  initialized = true;
}
