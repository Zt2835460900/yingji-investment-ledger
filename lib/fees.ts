import { MONEY_SCALE } from "./money";
import type { RedemptionFeeTier } from "./fund-data";

export interface FeeRule {
  buyFeeBps: number;
  buyDiscountBps: number;
  sellFeeBps: number;
  minFeeUnits: number;
}

/**
 * Estimates a transaction fee using integer money units.
 *
 * BUY uses the product's published subscription rate multiplied by the
 * platform discount. SELL uses the configured redemption/commission rate.
 * The result is rounded to the nearest 1/10,000 CNY and respects the optional
 * minimum fee. A broker's final statement can always override this estimate.
 */
export function calculateTradingFeeUnits(
  kind: "BUY" | "SELL",
  grossAmountUnits: number,
  rule: FeeRule,
): number {
  if (!Number.isSafeInteger(grossAmountUnits) || grossAmountUnits <= 0) return 0;
  const baseBps = kind === "BUY" ? rule.buyFeeBps : rule.sellFeeBps;
  const discountBps = kind === "BUY" ? rule.buyDiscountBps : 10_000;
  const rateNumerator = Math.max(0, baseBps) * Math.max(0, discountBps);
  const estimated = Math.round(
    (grossAmountUnits * rateNumerator) / 100_000_000,
  );
  return estimated > 0 ? Math.max(estimated, Math.max(0, rule.minFeeUnits)) : 0;
}

export function feeRuleFromInput(input: Record<string, unknown>): FeeRule {
  return {
    buyFeeBps: Math.round(Number(input.buyFeePercent ?? 0) * 100),
    buyDiscountBps: Math.round(Number(input.buyDiscountPercent ?? 100) * 100),
    sellFeeBps: Math.round(Number(input.sellFeePercent ?? 0) * 100),
    minFeeUnits: Math.round(Number(input.minFee ?? 0) * MONEY_SCALE),
  };
}

export function calculateFifoRedemptionFeeUnits(
  lots: Array<{ tradeDate: string; quantityUnits: number }>,
  quantityUnits: number,
  grossAmountUnits: number,
  tradeDate: string,
  tiers: RedemptionFeeTier[],
): number {
  if (quantityUnits <= 0 || grossAmountUnits <= 0 || !tiers.length) return 0;
  let remaining = quantityUnits;
  let fee = 0;
  const sellTime = Date.parse(`${tradeDate}T00:00:00Z`);
  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Math.max(0, lot.quantityUnits));
    if (!take) continue;
    const heldDays = Math.max(
      0,
      Math.floor((sellTime - Date.parse(`${lot.tradeDate}T00:00:00Z`)) / 86_400_000),
    );
    const tier = tiers.find(
      (item) => heldDays >= item.minDays && (item.maxDays === null || heldDays < item.maxDays),
    );
    if (tier) fee += Number(BigInt(grossAmountUnits) * BigInt(take) * BigInt(tier.rateBps) / (BigInt(quantityUnits) * BigInt(10000)));
    remaining -= take;
  }
  return Math.round(fee);
}
