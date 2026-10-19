import { mapLimit } from './map-limit';

describe('mapLimit', () => {
  it('never exceeds the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    await mapLimit([...Array(10).keys()], 3, async () => {
      peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
    });
    expect(peak).toBe(3);
  });

  it('stops starting new items after a failure', async () => {
    const started: number[] = [];
    await expect(
      mapLimit([1, 2, 3, 4, 5, 6], 1, async (n) => {
        started.push(n);
        if (n === 2) throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(started).toEqual([1, 2]);
  });
});
