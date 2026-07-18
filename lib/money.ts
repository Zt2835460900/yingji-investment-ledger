export const MONEY_SCALE = 10_000;
export const QUANTITY_SCALE = 1_000_000;
export const PRICE_SCALE = 1_000_000;

export function decimalToUnits(value: unknown, scale = MONEY_SCALE): number {
  const text = String(value ?? "0").trim().replace(/,/g, "");
  if (!text) return 0;
  const sign = text.startsWith("-") ? -1 : 1;
  const unsigned = text.replace(/^[+-]/, "");
  if (!/^\d*(\.\d*)?$/.test(unsigned)) throw new Error(`无效数字：${text}`);
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const decimals = Math.round(Math.log10(scale));
  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  const result = Number(BigInt(whole || "0") * BigInt(scale) + BigInt(padded || "0"));
  if (!Number.isSafeInteger(result)) throw new Error("金额超出安全范围");
  return result * sign;
}

export function unitsToNumber(value: number, scale = MONEY_SCALE): number {
  return value / scale;
}

export function tradeGrossUnits(quantityUnits: number, priceUnits: number): number {
  const numerator = BigInt(quantityUnits) * BigInt(priceUnits) * BigInt(MONEY_SCALE);
  const result = numerator / (BigInt(QUANTITY_SCALE) * BigInt(PRICE_SCALE));
  const number = Number(result);
  if (!Number.isSafeInteger(number)) throw new Error("成交金额超出安全范围");
  return number;
}

export function isoDate(value: unknown): string {
  const text = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new Error(`无效日期：${text || "空"}`);
  }
  return text;
}
