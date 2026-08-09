import { MONEY_SCALE, tradeGrossUnits } from "./money";

export interface ReconciliationEntry {
  kind: string;
  quantity_units: number;
  price_units: number;
  gross_amount_units: number;
  fee_units: number;
  tax_units: number;
}

export interface TradeReconciliation {
  recordedAmount: number;
  calculatedAmount: number;
  gap: number;
  tolerance: number;
  needsReview: boolean;
}

export function reconcileTradeEntry(
  entry: ReconciliationEntry,
): TradeReconciliation | null {
  if (
    !["BUY", "SELL"].includes(entry.kind) ||
    entry.quantity_units <= 0 ||
    entry.price_units <= 0
  )
    return null;

  const recordedAmount = entry.gross_amount_units / MONEY_SCALE;
  const calculatedAmount =
    tradeGrossUnits(entry.quantity_units, entry.price_units) / MONEY_SCALE;
  const gap = calculatedAmount - recordedAmount;
  const fees = (entry.fee_units + entry.tax_units) / MONEY_SCALE;
  const tolerance = Math.max(0.02, fees + 0.02);

  return {
    recordedAmount,
    calculatedAmount,
    gap,
    tolerance,
    needsReview: Math.abs(gap) > tolerance,
  };
}
