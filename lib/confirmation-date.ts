export interface ConfirmationEstimateOptions {
  /** The product's usual T+N business-day confirmation rule. */
  businessDays: number;
  /** Fund platforms usually use 15:00 China time as the same-day cut-off. */
  tradeTime?: string;
  /** Exchange-traded products settle on the trade date in this ledger. */
  isExchangeTraded?: boolean;
}

export interface ConfirmationEstimate {
  /** The fund valuation date (also commonly called the accepted date / T day). */
  acceptedDate: string;
  /** The estimated date on which shares are confirmed. */
  confirmationDate: string;
  cutoffPassed: boolean;
  rolledFromNonBusinessDay: boolean;
  businessDays: number;
  /** Whether the selected year has an official mainland market closure calendar. */
  calendarCovered: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/*
 * Mainland exchange closure dates published by SSE for 2026.  An explicit
 * calendar is safer than treating government make-up workdays as fund
 * valuation days.  New years intentionally fall back to weekends until the
 * relevant market calendar has been published and added here.
 */
const MAINLAND_MARKET_CLOSURES: Record<number, readonly string[]> = {
  2026: [
    "2026-01-01", "2026-01-02", "2026-01-03",
    "2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23",
    "2026-04-04", "2026-04-05", "2026-04-06",
    "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05",
    "2026-06-19", "2026-06-20", "2026-06-21",
    "2026-09-25", "2026-09-26", "2026-09-27",
    "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07",
  ],
};

function utcDate(dateText: string) {
  if (!ISO_DATE.test(dateText)) throw new Error("交易日期格式不正确");
  const date = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("交易日期格式不正确");
  return date;
}

function dateText(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function hasMainlandMarketCalendar(dateTextValue: string) {
  return Object.hasOwn(MAINLAND_MARKET_CLOSURES, utcDate(dateTextValue).getUTCFullYear());
}

export function isBusinessDay(dateTextValue: string) {
  const date = utcDate(dateTextValue);
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  return !MAINLAND_MARKET_CLOSURES[date.getUTCFullYear()]?.includes(dateTextValue);
}

export function nextBusinessDay(dateTextValue: string, days = 1) {
  if (!Number.isInteger(days) || days < 0)
    throw new Error("工作日天数必须是非负整数");
  const date = utcDate(dateTextValue);
  let remaining = days;
  while (remaining > 0 || !isBusinessDay(dateText(date))) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (isBusinessDay(dateText(date))) remaining -= 1;
  }
  return dateText(date);
}

/**
 * Estimate the lifecycle of an off-exchange fund order.  This deliberately
 * distinguishes the fund's valuation date (T) from the later share
 * confirmation date.  It is an estimate until the transfer agent's
 * confirmation notice arrives; QDII and fund-contract rules may differ.
 */
export function estimateFundConfirmationDate(
  tradeDate: string,
  options: ConfirmationEstimateOptions,
): ConfirmationEstimate {
  const businessDays = Math.max(0, Math.floor(options.businessDays || 0));
  const time = options.tradeTime?.trim() ?? "";
  if (time && !TIME.test(time)) throw new Error("交易时间格式不正确");
  const cutoffPassed = Boolean(time && time >= "15:00");
  const rolledFromNonBusinessDay = !isBusinessDay(tradeDate);

  if (options.isExchangeTraded) {
    return {
      acceptedDate: tradeDate,
      confirmationDate: tradeDate,
      cutoffPassed: false,
      rolledFromNonBusinessDay,
      businessDays: 0,
      calendarCovered: hasMainlandMarketCalendar(tradeDate),
    };
  }

  const acceptedDate =
    rolledFromNonBusinessDay || cutoffPassed
      ? nextBusinessDay(tradeDate, 1)
      : tradeDate;
  return {
    acceptedDate,
    confirmationDate: nextBusinessDay(acceptedDate, businessDays),
    cutoffPassed,
    rolledFromNonBusinessDay,
    businessDays,
    calendarCovered:
      hasMainlandMarketCalendar(tradeDate) &&
      hasMainlandMarketCalendar(acceptedDate),
  };
}
