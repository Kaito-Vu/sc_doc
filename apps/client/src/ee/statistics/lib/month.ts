// Calendar-month helpers. Months are 'YYYY-MM'. The authoritative "current month" comes from the
// server (`currentMonth` in the stats responses, cut in its stats time zone); the local-time
// fallback below is only used until that data has loaded.
// MAX_MONTHS_BACK mirrors the server's history limit; keep both in sync.
export const MAX_MONTHS_BACK = 60;

const index = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return y * 12 + (m - 1);
};
const fromIndex = (i: number) =>
  `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;

/** Browser-local month; only a fallback until the server's `currentMonth` is known. */
export function localMonthKey(now = new Date()): string {
  return fromIndex(now.getFullYear() * 12 + now.getMonth());
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
