export const ACCOUNT_NAME_MAX_LENGTH = 50;

export type LatestBuyAccountNameRow = {
  accountId: number;
  currentName: string;
  instrumentId: number;
  instrumentName: string;
};

export function accountNameForEntry(input: {
  kind: unknown;
  autoRenameAccount: unknown;
  instrumentId: unknown;
  instrumentName: unknown;
}) {
  if (
    String(input.kind ?? "").toUpperCase() !== "BUY" ||
    input.autoRenameAccount !== true ||
    !Number.isInteger(Number(input.instrumentId)) ||
    Number(input.instrumentId) <= 0
  )
    return null;

  const officialName = String(input.instrumentName ?? "").trim();
  return officialName ? officialName.slice(0, ACCOUNT_NAME_MAX_LENGTH) : null;
}

export function accountRenameUpdatesFromLatestBuys(
  rows: LatestBuyAccountNameRow[],
) {
  return rows.flatMap((row) => {
    const name = accountNameForEntry({
      kind: "BUY",
      autoRenameAccount: true,
      instrumentId: row.instrumentId,
      instrumentName: row.instrumentName,
    });
    return name && name !== row.currentName
      ? [{ accountId: row.accountId, name }]
      : [];
  });
}
