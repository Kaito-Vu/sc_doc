import { mapLimit } from './map-limit';

describe('mapLimit', () => {
  it('preserves order and respects the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const out = await mapLimit([30, 5, 20, 1, 10], 2, async (ms, i) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, ms));
      active--;
      return `${i}:${ms}`;
    });
    expect(out).toEqual(['0:30', '1:5', '2:20', '3:1', '4:10']);
    expect(peak).toBe(2);
  });

  it('handles empty input', async () => {
    expect(await mapLimit([], 4, async (x) => x)).toEqual([]);
  });
});
