import { OWNERSHIP_SCALE, THIRTY_DAYS_MS, type FeatureId } from '@/lib/constants';

export type WeightedItem = { id: string; weight: number };

export function largestRemainder(totalCents: number, input: WeightedItem[]): Record<string, number> {
  const positive = input.filter((item) => item.weight > 0).sort((a, b) => a.id.localeCompare(b.id));
  const result = Object.fromEntries(input.map((item) => [item.id, 0]));
  if (totalCents <= 0 || positive.length === 0) return result;

  const totalWeight = positive.reduce((sum, item) => sum + BigInt(item.weight), BigInt(0));
  const total = BigInt(totalCents);
  let allocated = 0;
  const remainders = positive.map((item) => {
    const numerator = total * BigInt(item.weight);
    const floor = Number(numerator / totalWeight);
    result[item.id] = floor;
    allocated += floor;
    return { id: item.id, remainder: numerator % totalWeight };
  });

  remainders.sort((a, b) => {
    if (a.remainder === b.remainder) return a.id.localeCompare(b.id);
    return a.remainder > b.remainder ? -1 : 1;
  });
  for (let i = 0; i < totalCents - allocated; i += 1) {
    result[remainders[i % remainders.length].id] += 1;
  }
  return result;
}

export function normalizeWeights(input: WeightedItem[]) {
  return largestRemainder(OWNERSHIP_SCALE, input);
}

export function calculateMonthlyRevenue(unitAmountCents: number, quantity: number) {
  const mrrCents = unitAmountCents * quantity;
  return { mrrCents, arrCents: mrrCents * 12 };
}

export function calculateFeatureAllocations(
  arrCents: number,
  usageCounts: Record<FeatureId, number>,
) {
  const weights = Object.entries(usageCounts).map(([id, weight]) => ({ id, weight }));
  return largestRemainder(arrCents, weights);
}

export function sumValues(record: Record<string, number>) {
  return Object.values(record).reduce((sum, value) => sum + value, 0);
}

export function rollingUsageCutoff(now: Date) {
  return new Date(now.getTime() - THIRTY_DAYS_MS);
}

export function isUsageInRollingWindow(occurredAt: Date, now: Date) {
  return occurredAt.getTime() >= rollingUsageCutoff(now).getTime() && occurredAt.getTime() <= now.getTime();
}
