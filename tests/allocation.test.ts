import { describe, expect, it } from 'vitest';
import { calculateFeatureAllocations, calculateMonthlyRevenue, isUsageInRollingWindow, largestRemainder, normalizeWeights, sumValues } from '@/lib/allocation';

describe('ARR allocation', () => {
  it('converts $100 monthly to $1,200 annual recurring revenue', () => {
    expect(calculateMonthlyRevenue(10_000, 1)).toEqual({ mrrCents: 10_000, arrCents: 120_000 });
  });

  it('uses deterministic largest-remainder rounding', () => {
    expect(largestRemainder(10, [{ id: 'b', weight: 1 }, { id: 'a', weight: 1 }, { id: 'c', weight: 1 }]))
      .toEqual({ b: 3, a: 4, c: 3 });
  });

  it('allocates feature ARR without changing total ARR', () => {
    const first = calculateFeatureAllocations(120_000, { search: 6, summary: 3, sharing: 1 });
    const second = calculateFeatureAllocations(120_000, { search: 4, summary: 5, sharing: 1 });
    expect(first).toEqual({ search: 72_000, summary: 36_000, sharing: 12_000 });
    expect(second).toEqual({ search: 48_000, summary: 60_000, sharing: 12_000 });
    expect(sumValues(first)).toBe(120_000);
    expect(sumValues(second)).toBe(120_000);
    expect(second.search - first.search).toBe(-24_000);
    expect(second.summary - first.summary).toBe(24_000);
  });

  it('leaves all ARR unattributed when there is no usage', () => {
    const allocation = calculateFeatureAllocations(120_000, { search: 0, summary: 0, sharing: 0 });
    expect(sumValues(allocation)).toBe(0);
  });

  it('normalizes engineer ownership to exactly 100%', () => {
    const ownership = normalizeWeights([{ id: 'maya', weight: 80 }, { id: 'alex', weight: 20 }]);
    expect(ownership).toEqual({ maya: 800_000, alex: 200_000 });
    expect(sumValues(ownership)).toBe(1_000_000);
  });

  it('aggregates multiple PR scores by the same engineer before normalization', () => {
    const maya = [80, 40].reduce((sum, score) => sum + score, 0);
    const ownership = normalizeWeights([{ id: 'maya', weight: maya }, { id: 'alex', weight: 20 }]);
    expect(ownership.maya).toBeGreaterThan(ownership.alex);
    expect(sumValues(ownership)).toBe(1_000_000);
  });

  it('includes the exact 30-day boundary and excludes older or future usage', () => {
    const now = new Date('2026-08-23T12:00:00.000Z');
    expect(isUsageInRollingWindow(new Date('2026-07-24T12:00:00.000Z'), now)).toBe(true);
    expect(isUsageInRollingWindow(new Date('2026-07-24T11:59:59.999Z'), now)).toBe(false);
    expect(isUsageInRollingWindow(new Date('2026-08-23T12:00:00.001Z'), now)).toBe(false);
  });

  it('conserves feature ARR again when distributing it to engineers', () => {
    const features = calculateFeatureAllocations(120_000, { search: 3, summary: 2, sharing: 1 });
    const engineerTotals = { maya: 0, alex: 0, sam: 0 };
    for (const cents of Object.values(features)) {
      const allocation = largestRemainder(cents, [
        { id: 'maya', weight: 5 },
        { id: 'alex', weight: 3 },
        { id: 'sam', weight: 2 },
      ]);
      engineerTotals.maya += allocation.maya;
      engineerTotals.alex += allocation.alex;
      engineerTotals.sam += allocation.sam;
    }
    expect(sumValues(engineerTotals)).toBe(120_000);
  });

  it('models upgrades, downgrades, and cancellation without changing allocation math', () => {
    expect(calculateMonthlyRevenue(20_000, 1).arrCents - calculateMonthlyRevenue(10_000, 1).arrCents).toBe(120_000);
    expect(calculateMonthlyRevenue(5_000, 1).arrCents - calculateMonthlyRevenue(10_000, 1).arrCents).toBe(-60_000);
    expect(0 - calculateMonthlyRevenue(10_000, 1).arrCents).toBe(-120_000);
  });
});
