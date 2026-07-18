export type EntryKind = "DEPOSIT" | "WITHDRAWAL" | "BUY" | "SELL" | "DIVIDEND" | "FEE";

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
}

export interface LedgerRow {
  id: number;
  account_id: number;
  instrument_id: number | null;
  kind: EntryKind;
  trade_date: string;
  quantity_units: number;
  price_units: number;
  gross_amount_units: number;
  fee_units: number;
  tax_units: number;
  notes: string;
  external_ref: string;
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
