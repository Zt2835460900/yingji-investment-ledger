export type AccountInstrumentDeletionCounts = {
  deletedEntries: number;
  deletedPlans: number;
};

export function positiveIntegerId(value: unknown, label: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${label}不存在`);
  return id;
}

export function accountInstrumentDeletionConfirmation(
  accountName: string,
  instrumentName: string,
) {
  return `确认从账户“${accountName}”删除产品“${instrumentName}”吗？\n\n将删除该产品在当前账户内的全部买入、卖出、分红、费用等产品流水，以及该账户对应的定投计划。\n\n独立入金/出金、其他产品、其他账户、全局产品资料和目标配置都不会删除。此操作无法撤销。`;
}

export function accountInstrumentDeletionSuccess({
  deletedEntries,
  deletedPlans,
}: AccountInstrumentDeletionCounts) {
  return `产品已删除：${deletedEntries} 条流水、${deletedPlans} 个定投计划`;
}
