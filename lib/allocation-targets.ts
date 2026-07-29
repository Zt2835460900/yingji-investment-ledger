export const CASH_INSTRUMENT_ID = 0;
export const TOTAL_ALLOCATION_BPS = 10_000;
export const DEFAULT_ALLOCATION_ALERT_BPS = 500;

export interface ParsedAllocationTarget {
  instrumentId: number;
  targetBps: number;
  alertBps?: number;
}

function strictInteger(value: unknown, label: string) {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  )
    throw new Error(`${label}无效`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label}必须是整数`);
  return parsed;
}

function percentToBps(value: unknown, label: string) {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  )
    throw new Error(`${label}无效`);
  const percent = Number(value);
  const scaled = percent * 100;
  const rounded = Math.round(scaled);
  if (
    !Number.isFinite(percent) ||
    percent < 0 ||
    percent > 100 ||
    !Number.isSafeInteger(rounded) ||
    Math.abs(scaled - rounded) > 1e-8
  )
    throw new Error(`${label}必须是 0% 到 100% 之间、最多两位小数的数值`);
  return rounded;
}

function boundedBps(value: unknown, label: string) {
  const bps = strictInteger(value, label);
  if (bps < 0 || bps > TOTAL_ALLOCATION_BPS)
    throw new Error(`${label}必须在 0 到 ${TOTAL_ALLOCATION_BPS} 基点之间`);
  return bps;
}

function parseBpsOrPercent(
  target: Record<string, unknown>,
  bpsKey: string,
  percentKey: string,
  label: string,
) {
  const hasBps = target[bpsKey] !== undefined;
  const hasPercent = target[percentKey] !== undefined;
  if (!hasBps && !hasPercent) throw new Error(`${label}无效`);
  const bps = hasBps
    ? boundedBps(target[bpsKey], label)
    : percentToBps(target[percentKey], label);
  if (hasBps && hasPercent) {
    const percentBps = percentToBps(target[percentKey], label);
    if (percentBps !== bps) throw new Error(`${label}的百分比和基点不一致`);
  }
  return bps;
}

export function parseAllocationTarget(
  target: Record<string, unknown>,
): ParsedAllocationTarget {
  const instrumentId = strictInteger(target.instrumentId, "配置产品");
  if (instrumentId < CASH_INSTRUMENT_ID)
    throw new Error("配置产品必须是真实产品或现金");
  const targetBps = parseBpsOrPercent(
    target,
    "targetBps",
    "targetPercent",
    "目标比例",
  );
  const hasAlertBps = target.alertBps !== undefined;
  const hasAlertPercent = target.alertPercent !== undefined;
  const alertBps =
    hasAlertBps || hasAlertPercent
      ? parseBpsOrPercent(target, "alertBps", "alertPercent", "偏离提醒阈值")
      : undefined;
  return { instrumentId, targetBps, alertBps };
}

export function parseAllocationTargets(
  input: unknown,
): ParsedAllocationTarget[] {
  if (!Array.isArray(input) || input.length === 0)
    throw new Error("没有可保存的配置目标");
  if (input.length > 101)
    throw new Error("配置目标不能超过 100 个产品和 1 项现金");

  const parsed = input.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("配置目标数据无效");
    return parseAllocationTarget(value as Record<string, unknown>);
  });
  const ids = new Set<number>();
  let productCount = 0;
  for (const target of parsed) {
    if (ids.has(target.instrumentId))
      throw new Error(
        target.instrumentId === CASH_INSTRUMENT_ID
          ? "现金目标只能出现一次"
          : "同一产品的配置目标不能重复",
      );
    ids.add(target.instrumentId);
    if (target.instrumentId > CASH_INSTRUMENT_ID) productCount += 1;
  }
  if (productCount > 100) throw new Error("产品配置目标不能超过 100 项");
  const productTotalBps = parsed.reduce(
    (sum, target) =>
      sum + (target.instrumentId === CASH_INSTRUMENT_ID ? 0 : target.targetBps),
    0,
  );
  if (productTotalBps > TOTAL_ALLOCATION_BPS)
    throw new Error("产品目标合计不能超过 10000 基点（100%）");
  const derivedCashBps = TOTAL_ALLOCATION_BPS - productTotalBps;
  const requestedCash = parsed.find(
    (target) => target.instrumentId === CASH_INSTRUMENT_ID,
  );
  if (requestedCash && requestedCash.targetBps !== derivedCashBps)
    throw new Error("现金目标必须等于 100% 减去全部产品目标");

  const productTargets = parsed.filter(
    (target) => target.instrumentId !== CASH_INSTRUMENT_ID,
  );
  return [
    ...productTargets,
    requestedCash ?? {
      instrumentId: CASH_INSTRUMENT_ID,
      targetBps: derivedCashBps,
    },
  ];
}
