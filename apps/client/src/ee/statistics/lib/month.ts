// Calendar-month helpers. Months are 'YYYY-MM' cut in the stats time zone (default UTC+7,
// same as the server's STATS_TIME_ZONE_OFFSET_MINUTES default).
const STATS_TZ_OFFSET_MINUTES = 420;
export const MAX_MONTHS_BACK = 60;

const index = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return y * 12 + (m - 1);
};
const fromIndex = (i: number) =>
  `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;

export function currentMonthKey(now = new Date()): string {
  const local = new Date(now.getTime() + STATS_TZ_OFFSET_MINUTES * 60_000);
  return fromIndex(local.getUTCFullYear() * 12 + local.getUTCMonth());
}

export const shiftMonth = (key: string, delta: number) =>
  fromIndex(index(key) + delta);

export const monthsBetween = (from: string, to: string) =>
  index(to) - index(from);

export function formatMonthLabel(key: string, locale?: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
