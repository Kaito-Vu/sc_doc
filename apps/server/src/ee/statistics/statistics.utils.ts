import { BadRequestException } from '@nestjs/common';

// Fixed UTC offset used to cut calendar months (no DST). Default: Vietnam, UTC+7.
const envOffset = process.env.STATS_TIME_ZONE_OFFSET_MINUTES?.trim();
export const STATS_TZ_OFFSET_MINUTES =
  envOffset && Number.isFinite(Number(envOffset)) ? Number(envOffset) : 420;

export const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
export const MAX_MONTHS_BACK = 60; // 5 years

const MIN_MS = 60_000;

const monthIndex = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return y * 12 + (m - 1);
};
const keyFromIndex = (i: number) =>
  `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;

/** 'YYYY-MM' of the calendar month `date` falls in, in the stats time zone. */
export function monthKeyOf(
  date: Date,
  offsetMinutes = STATS_TZ_OFFSET_MINUTES,
): string {
  const local = new Date(date.getTime() + offsetMinutes * MIN_MS);
  return keyFromIndex(local.getUTCFullYear() * 12 + local.getUTCMonth());
}

/** [since, until) instants of a 'YYYY-MM' month in the stats time zone. */
export function monthBounds(
  key: string,
  offsetMinutes = STATS_TZ_OFFSET_MINUTES,
): { since: Date; until: Date } {
  const [y, m] = key.split('-').map(Number);
  return {
    since: new Date(Date.UTC(y, m - 1, 1) - offsetMinutes * MIN_MS),
    until: new Date(Date.UTC(y, m, 1) - offsetMinutes * MIN_MS), // m=12 rolls to Jan
  };
}

/** Validates an optional 'YYYY-MM' (default: current month) and returns its range. */
export function resolveMonthRange(
  month?: string,
  now = new Date(),
  offsetMinutes = STATS_TZ_OFFSET_MINUTES,
): { month: string; since: Date; until: Date } {
  const current = monthKeyOf(now, offsetMinutes);
  const key = month ?? current;
  if (!MONTH_REGEX.test(key)) {
    throw new BadRequestException('Invalid month, expected YYYY-MM');
  }
  const diff = monthIndex(current) - monthIndex(key);
  if (diff < 0) throw new BadRequestException('Month cannot be in the future');
  if (diff > MAX_MONTHS_BACK) {
    throw new BadRequestException('Month cannot be older than 5 years');
  }
  return { month: key, ...monthBounds(key, offsetMinutes) };
}

/** The last `n` month keys ending at the current month, oldest first. */
export function lastMonthKeys(
  n: number,
  now = new Date(),
  offsetMinutes = STATS_TZ_OFFSET_MINUTES,
): string[] {
  const cur = monthIndex(monthKeyOf(now, offsetMinutes));
  return Array.from({ length: n }, (_, i) => keyFromIndex(cur - (n - 1 - i)));
}

export interface MonthlyCount {
  month: string;
  count: number;
}

/** Zip several sparse per-month series into one dense row per key (missing = 0). */
export function mergeMonthly<K extends string>(
  keys: string[],
  series: Record<K, MonthlyCount[]>,
): ({ month: string } & Record<K, number>)[] {
  const maps = Object.entries(series).map(
    ([name, rows]) =>
      [name, new Map((rows as MonthlyCount[]).map((r) => [r.month, r.count]))] as const,
  );
  return keys.map((month) => {
    const row: any = { month };
    for (const [name, map] of maps) row[name] = map.get(month) ?? 0;
    return row;
  });
}
