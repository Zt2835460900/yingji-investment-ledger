export type EntryKind =
  "DEPOSIT" | "WITHDRAWAL" | "BUY" | "SELL" | "DIVIDEND" | "FEE";

export interface AccountRow {
  id: number;
  name: string;
  currency: string;
  color: string;
  cost_method: string;
}

export interface InstrumentRow {
  id: number;
  name: string;
  code: string;
  market: string;
  asset_class: string;
  currency: string;
  product_type: string;
  buy_fee_bps: number;
  buy_discount_bps: number;
  sell_fee_bps: number;
  min_fee_units: number;
  eastmoney_fee_bps: number;
  min_purchase_units: number;
  redemption_fee_json: string;
  data_source: string;
  source_updated_at: string;
}

export interface FundPurchaseLimitRow {
  instrument_id: number;
  purchase_status: string;
  daily_limit_units: number;
  auto_sync: number;
  source: string;
  source_updated_at: string;
}

export interface LedgerRow {
  id: number;
  account_id: number;
  instrument_id: number | null;
  kind: EntryKind;
  trade_date: string;
  confirmation_date: string;
  quantity_units: number;
  price_units: number;
  gross_amount_units: number;
  fee_units: number;
  tax_units: number;
  notes: string;
  external_ref: string;
  purchase_channel: string;
  fee_source: string;
}

export interface PriceRow {
  id: number;
  instrument_id: number;
  price_date: string;
  price_units: number;
  source: string;
}

export interface PlanRow {
  id: number;
  account_id: number;
  instrument_id: number;
  amount_units: number;
  frequency: string;
  execution_mode: string;
  manual_daily_cap_units: number;
  day_of_month: number;
  next_date: string;
  status: string;
}

export interface TargetRow {
  id: number;
  instrument_id: number;
  target_bps: number;
  alert_bps: number;
}

export interface JournalRow {
  id: number;
  account_id: number | null;
  instrument_id: number | null;
  entry_date: string;
  title: string;
  decision: string;
  mood: string;
  thesis: string;
  review_date: string;
  review_note: string;
  created_at: string;
  updated_at: string;
  account_name: string | null;
  instrument_name: string | null;
  instrument_code: string | null;
}
