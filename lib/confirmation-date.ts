export interface ConfirmationEstimateOptions {
  /** The product's usual T+N business-day confirmation rule. */
  businessDays: number;
  /** Fund platforms usually use 15:00 China time as the same-day cut-off. */
  tradeTime?: string;
  /** Exchange-traded products settle on the trade date in this ledger. */
  isExchangeTraded?: boolean;
}

export interface ConfirmationEstimate {
  acceptedDate: string;
  confirmationDate: string;
  cutoffPassed: boolean;
  rolledFromNonBusinessDay: boolean;
  businessDays: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function utcDate(dateText: string) {
  if (!ISO_DATE.test(dateText)) throw new Error("交易日期格式不正确");
  const date = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("交易日期格式不正确");
  return date;
}

function dateText(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function isBusinessDay(dateTextValue: string) {
  const day = utcDate(dateTextValue).getUTCDay();
  return day !== 0 && day !== 6;
}

export function nextBusinessDay(dateTextValue: string, days = 1) {
  if (!Number.isInteger(days) || days < 0)
    throw new Error("工作日天数必须是非负整数");
  const date = utcDate(dateTextValue);
  let remaining = days;
  while (remaining > 0 || date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) remaining -= 1;
  }
  return dateText(date);
}

/**
 * Estimate a fund share-confirmation date. It intentionally only automates
 * rules common across mainland fund platforms: weekends roll to the next
 * business day and orders at/after 15:00 are accepted on the next business
 * day. Fund contracts and exchange holidays can still override the estimate.
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
    };
  }

  let acceptedDate = tradeDate;
  if (rolledFromNonBusinessDay || cutoffPassed)
    acceptedDate = nextBusinessDay(tradeDate, 1);

  return {
    acceptedDate,
    confirmationDate: nextBusinessDay(acceptedDate, businessDays),
    cutoffPassed,
    rolledFromNonBusinessDay,
    businessDays,
  };
}
