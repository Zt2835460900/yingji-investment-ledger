export const EXCHANGE_SCALE = 10000;

export interface ExchangeRateRow {
  from_currency: string;
  to_currency: string;
  rate: number;
  rate_date: string;
  source: string;
}

export async function fetchUsdCnyRate(): Promise<{ rate: number; date: string }> {
  const response = await fetch(
    "https://api.exchangerate-api.com/v4/latest/USD",
    { signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok) throw new Error("Rate API error: " + response.status);
  const data = (await response.json()) as {
    rates: Record<string, number>;
    date: string;
  };
  const cnyRate = data.rates["CNY"];
  if (!cnyRate || !Number.isFinite(cnyRate))
    throw new Error("Rate API returned no CNY rate");
  return { rate: cnyRate, date: data.date };
}

export function toExchangeUnits(rate: number): number {
  return Math.round(rate * EXCHANGE_SCALE);
}

export function fromExchangeUnits(units: number): number {
  return units / EXCHANGE_SCALE;
}
