const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const FUND_ORDER_CUTOFF = "15:00";

export function normalizeOrderTime(value: unknown) {
  const time = String(value ?? "").trim();
  return TIME_PATTERN.test(time) ? time : "";
}

function utcDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function dateText(value: Date) {
  return value.toISOString().slice(0, 10);
}

function nextWeekday(value: string, includeCurrent: boolean) {
  const date = utcDate(value);
  if (!includeCurrent) date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6)
    date.setUTCDate(date.getUTCDate() + 1);
  return dateText(date);
}

/**
 * Return the earliest date whose published NAV can apply to an off-exchange
 * fund order. A provider lookup then selects the first published NAV on or
 * after this date, which also handles exchange holidays without guessing.
 */
export function fundOrderNavStartDate(tradeDate: string, orderTime: string) {
  if (!DATE_PATTERN.test(tradeDate)) return tradeDate;
  const normalizedTime = normalizeOrderTime(orderTime);
  const day = utcDate(tradeDate).getUTCDay();
  const isWeekend = day === 0 || day === 6;
  const afterCutoff = Boolean(
    normalizedTime && normalizedTime >= FUND_ORDER_CUTOFF,
  );
  return nextWeekday(tradeDate, !isWeekend && !afterCutoff);
}

export function fundOrderTimingLabel(tradeDate: string, orderTime: string) {
  const navStartDate = fundOrderNavStartDate(tradeDate, orderTime);
  const normalizedTime = normalizeOrderTime(orderTime);
  const afterCutoff = Boolean(
    normalizedTime && normalizedTime >= FUND_ORDER_CUTOFF,
  );
  return {
    navStartDate,
    afterCutoff,
    label: afterCutoff ? "15:00后，顺延下一净值日" : "15:00前，使用当日净值",
  };
}
