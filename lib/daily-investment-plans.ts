export interface DailyPlanDefinition {
  id: number;
  account_id: number;
  instrument_id: number;
  amount_units: number;
  execution_mode: string;
  manual_daily_cap_units: number;
  target_years?: number;
  status: string;
}

export interface DailyPlanLedgerEntry {
  account_id: number;
  instrument_id: number | null;
  kind: string;
  trade_date: string;
  gross_amount_units: number;
}

export interface DailyPlanPurchaseLimit {
  instrument_id: number;
  purchase_status: string;
  daily_limit_units: number;
}

export interface DailyPlanProgress {
  planId: number;
  month: string;
  targetUnits: number;
  investedUnits: number;
  remainingUnits: number;
  dailyCapUnits: number;
  todayUnits: number;
  daysNeeded: number;
  projectedCompletionDate: string | null;
  canCompleteThisMonth: boolean;
  targetYears: number;
  cumulativeInvestedUnits: number;
  goalTargetUnits: number;
  goalRemainingUnits: number;
  goalCompletionDays: number | null;
  goalCompletionDate: string | null;
  warning: "PAUSED" | "NO_CAP" | "MONTH_OVERFLOW" | "DONE" | "";
}

const addCalendarDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const lastDayOfMonth = (date: string) => {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};

export function calculateDailyPlanProgress(
  plans: DailyPlanDefinition[],
  ledger: DailyPlanLedgerEntry[],
  limits: DailyPlanPurchaseLimit[],
  today: string,
): DailyPlanProgress[] {
  const month = today.slice(0, 7);
  const monthEnd = lastDayOfMonth(today);
  const daysRemainingThisMonth =
    Math.round(
      (Date.parse(`${monthEnd}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
        86_400_000,
    ) + 1;

  return plans.map((plan) => {
    const matchingPurchases = ledger.filter(
      (entry) =>
        entry.kind === "BUY" &&
        entry.account_id === plan.account_id &&
        entry.instrument_id === plan.instrument_id,
    );
    const investedUnits = matchingPurchases
      .filter((entry) => entry.trade_date.startsWith(month))
      .reduce((sum, entry) => sum + entry.gross_amount_units, 0);
    const cumulativeInvestedUnits = matchingPurchases.reduce(
      (sum, entry) => sum + entry.gross_amount_units,
      0,
    );
    const remainingUnits = Math.max(0, plan.amount_units - investedUnits);
    const limit = limits.find(
      (item) => item.instrument_id === plan.instrument_id,
    );
    const syncedCapUnits = Math.max(0, limit?.daily_limit_units ?? 0);
    const manualCapUnits = Math.max(0, plan.manual_daily_cap_units);
    const dailyCapUnits =
      syncedCapUnits > 0 && manualCapUnits > 0
        ? Math.min(syncedCapUnits, manualCapUnits)
        : syncedCapUnits || manualCapUnits;
    const isDaily = plan.execution_mode === "DAILY_LIMIT";
    const isPaused =
      plan.status !== "ACTIVE" || limit?.purchase_status === "PAUSED";
    const todayUnits =
      isDaily && !isPaused && dailyCapUnits > 0
        ? Math.min(remainingUnits, dailyCapUnits)
        : 0;
    const daysNeeded =
      remainingUnits > 0 && dailyCapUnits > 0
        ? Math.ceil(remainingUnits / dailyCapUnits)
        : 0;
    const projectedCompletionDate =
      daysNeeded > 0 ? addCalendarDays(today, daysNeeded - 1) : null;
    const canCompleteThisMonth =
      remainingUnits === 0 ||
      (dailyCapUnits > 0 &&
        remainingUnits <= dailyCapUnits * daysRemainingThisMonth);
    const targetYears = Math.min(30, Math.max(1, plan.target_years || 10));
    const goalTargetUnits = plan.amount_units * targetYears * 12;
    const goalRemainingUnits = Math.max(
      0,
      goalTargetUnits - cumulativeInvestedUnits,
    );
    const averageCalendarDaysPerMonth = 365.25 / 12;
    const effectiveMonthlyUnits = isDaily
      ? Math.min(plan.amount_units, dailyCapUnits * averageCalendarDaysPerMonth)
      : plan.amount_units;
    const goalCompletionDays =
      goalRemainingUnits === 0
        ? 0
        : effectiveMonthlyUnits > 0
          ? Math.ceil(
              (goalRemainingUnits / effectiveMonthlyUnits) *
                averageCalendarDaysPerMonth,
            )
          : null;
    const goalCompletionDate =
      goalCompletionDays === null
        ? null
        : addCalendarDays(today, Math.max(0, goalCompletionDays - 1));
    const warning: DailyPlanProgress["warning"] =
      remainingUnits === 0
        ? "DONE"
        : limit?.purchase_status === "PAUSED"
          ? "PAUSED"
          : isDaily && dailyCapUnits <= 0
            ? "NO_CAP"
            : isDaily && !canCompleteThisMonth
              ? "MONTH_OVERFLOW"
              : "";

    return {
      planId: plan.id,
      month,
      targetUnits: plan.amount_units,
      investedUnits,
      remainingUnits,
      dailyCapUnits,
      todayUnits,
      daysNeeded,
      projectedCompletionDate,
      canCompleteThisMonth,
      targetYears,
      cumulativeInvestedUnits,
      goalTargetUnits,
      goalRemainingUnits,
      goalCompletionDays,
      goalCompletionDate,
      warning,
    };
  });
}
