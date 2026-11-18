import { BadRequestException } from '@nestjs/common';
import {
  lastMonthKeys,
  mergeMonthly,
  monthBounds,
  monthKeyOf,
  resolveMonthRange,
} from './statistics.utils';

const VN = 420;

describe('monthKeyOf', () => {
  it('uses the local month, not UTC, around the boundary', () => {
    // 2026-10-31 17:00Z is already 2026-11-01 00:00 in UTC+7
    expect(monthKeyOf(new Date('2026-10-31T16:59:59Z'), VN)).toBe('2026-10');
    expect(monthKeyOf(new Date('2026-10-31T17:00:00Z'), VN)).toBe('2026-11');
  });
});

describe('monthBounds', () => {
  it('returns [first instant, first instant of next month) in UTC+7', () => {
    const { since, until } = monthBounds('2026-11', VN);
    expect(since.toISOString()).toBe('2026-10-31T17:00:00.000Z');
    expect(until.toISOString()).toBe('2026-11-30T17:00:00.000Z');
  });

  it('rolls December over into January', () => {
    const { since, until } = monthBounds('2026-12', VN);
    expect(since.toISOString()).toBe('2026-11-30T17:00:00.000Z');
    expect(until.toISOString()).toBe('2026-12-31T17:00:00.000Z');
    expect(monthBounds('2025-12', VN).until.toISOString()).toBe(
      '2025-12-31T17:00:00.000Z',
    );
  });

  it('handles leap-year February and a zero offset', () => {
    expect(monthBounds('2028-02', 0).until.toISOString()).toBe(
      '2028-03-01T00:00:00.000Z',
    );
    expect(monthBounds('2027-02', 0).until.toISOString()).toBe(
      '2027-03-01T00:00:00.000Z',
    );
  });
});

describe('resolveMonthRange', () => {
  const now = new Date('2026-11-18T10:00:00Z');

  it('defaults to the current month', () => {
    expect(resolveMonthRange(undefined, now, VN).month).toBe('2026-11');
  });

  it('accepts the current month and exactly 5 years back', () => {
    expect(resolveMonthRange('2026-11', now, VN).month).toBe('2026-11');
    expect(resolveMonthRange('2021-11', now, VN).month).toBe('2021-11');
  });

  it('rejects future months, >5 years old, and bad formats', () => {
    for (const bad of ['2026-12', '2021-10', '2026-00', '2026-1', '26-11', '']) {
      expect(() => resolveMonthRange(bad, now, VN)).toThrow(
        BadRequestException,
      );
    }
  });

  it('treats a UTC date that is already next month locally as the next month', () => {
    const edge = new Date('2026-11-30T17:30:00Z'); // 2026-12-01 in UTC+7
    expect(resolveMonthRange(undefined, edge, VN).month).toBe('2026-12');
    expect(() => resolveMonthRange('2026-12', new Date('2026-11-30T16:00:00Z'), VN)).toThrow(
      BadRequestException,
    );
  });
});

describe('lastMonthKeys / mergeMonthly', () => {
  it('lists 12 keys ending now across a year boundary', () => {
    const keys = lastMonthKeys(12, new Date('2026-02-10T00:00:00Z'), VN);
    expect(keys[0]).toBe('2025-03');
    expect(keys[11]).toBe('2026-02');
    expect(keys).toHaveLength(12);
  });

  it('zips sparse series into dense rows', () => {
    expect(
      mergeMonthly(['2026-01', '2026-02'], {
        a: [{ month: '2026-02', count: 2 }],
        b: [{ month: '2026-01', count: 5 }],
      }),
    ).toEqual([
      { month: '2026-01', a: 0, b: 5 },
      { month: '2026-02', a: 2, b: 0 },
    ]);
  });
});
