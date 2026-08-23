import { randomUUID } from 'node:crypto';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { getDb, withTransaction, type DatabaseTransaction } from '@/db';
import {
  activityEvents,
  customers,
  engineerArrAllocations,
  engineers,
  featureArrAllocations,
  featureContributions,
  featureUsageEvents,
  pullRequests,
  subscriptions,
} from '@/db/schema';
import {
  ACTIVE_SUBSCRIPTION_STATUS,
  FEATURE_IDS,
  FEATURE_LABELS,
  type FeatureId,
} from '@/lib/constants';
import { calculateFeatureAllocations, largestRemainder, normalizeWeights, rollingUsageCutoff, sumValues } from '@/lib/allocation';
import { formatCurrency } from '@/lib/utils';

export type RecalculationResult = {
  userId: string;
  totalArrCents: number;
  unattributedArrCents: number;
  featureArrCents: Record<FeatureId, number>;
  engineerArrCents: Record<string, number>;
};

type AllocationRow = { engineerId: string; arrCents: number };

function aggregateEngineerRows(rows: AllocationRow[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.engineerId] = (acc[row.engineerId] ?? 0) + row.arrCents;
    return acc;
  }, {});
}

async function getLeader(tx: DatabaseTransaction) {
  const rows = await tx.select({ engineerId: engineerArrAllocations.engineerId, arrCents: engineerArrAllocations.arrCents }).from(engineerArrAllocations);
  const totals = aggregateEngineerRows(rows);
  return Object.entries(totals).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

export async function recalculateCustomerARR(userId: string): Promise<RecalculationResult | null> {
  return withTransaction(async (tx) => {
    const [customer] = await tx.select().from(customers).where(eq(customers.userId, userId)).limit(1);
    if (!customer) return null;

    await tx.execute(sql`select id from ${customers} where ${customers.id} = ${customer.id} for update`);
    const previousLeader = await getLeader(tx);
    const now = new Date();
    const cutoff = rollingUsageCutoff(now);

    const [subscriptionRows, usageRows, contributionRows, oldFeatureRows, oldEngineerRows, engineerRows] = await Promise.all([
      tx.select().from(subscriptions).where(and(
        eq(subscriptions.customerId, customer.id),
        eq(subscriptions.status, ACTIVE_SUBSCRIPTION_STATUS),
        eq(subscriptions.currency, 'usd'),
        eq(subscriptions.interval, 'month'),
        eq(subscriptions.intervalCount, 1),
      )),
      tx.select().from(featureUsageEvents).where(and(
        eq(featureUsageEvents.userId, userId),
        eq(featureUsageEvents.successful, true),
        gte(featureUsageEvents.createdAt, cutoff),
      )),
      tx.select({
        featureId: featureContributions.featureId,
        score: featureContributions.score,
        engineerId: pullRequests.engineerId,
      }).from(featureContributions).innerJoin(pullRequests, eq(featureContributions.pullRequestId, pullRequests.id)),
      tx.select().from(featureArrAllocations).where(eq(featureArrAllocations.customerId, customer.id)),
      tx.select().from(engineerArrAllocations).where(eq(engineerArrAllocations.customerId, customer.id)),
      tx.select().from(engineers),
    ]);

    const totalArrCents = subscriptionRows.reduce((sum: number, row: typeof subscriptions.$inferSelect) => sum + row.arrCents, 0);
    const usageCounts = Object.fromEntries(FEATURE_IDS.map((id) => [id, 0])) as Record<FeatureId, number>;
    for (const event of usageRows) {
      if (FEATURE_IDS.includes(event.featureId as FeatureId)) usageCounts[event.featureId as FeatureId] += 1;
    }

    const featureArrCents = calculateFeatureAllocations(totalArrCents, usageCounts) as Record<FeatureId, number>;
    const usageWeights = normalizeWeights(FEATURE_IDS.map((id) => ({ id, weight: usageCounts[id] })));
    const ownershipScores = new Map<FeatureId, Record<string, number>>();
    for (const featureId of FEATURE_IDS) ownershipScores.set(featureId, {});
    for (const contribution of contributionRows) {
      if (!contribution.engineerId || !FEATURE_IDS.includes(contribution.featureId as FeatureId)) continue;
      const scores = ownershipScores.get(contribution.featureId as FeatureId)!;
      scores[contribution.engineerId] = (scores[contribution.engineerId] ?? 0) + contribution.score;
    }

    const engineerArrCents: Record<string, number> = {};
    const newEngineerRows: Array<typeof engineerArrAllocations.$inferInsert> = [];
    for (const featureId of FEATURE_IDS) {
      const scores = ownershipScores.get(featureId)!;
      const weights = Object.entries(scores).map(([id, weight]) => ({ id, weight }));
      const ownership = normalizeWeights(weights);
      const allocation = calculateFeatureAllocations(
        featureArrCents[featureId],
        Object.fromEntries(FEATURE_IDS.map((id) => [id, id === featureId ? 1 : 0])) as Record<FeatureId, number>,
      );
      const featureCents = allocation[featureId];
      const byEngineer = Object.keys(scores).length ? largestRemainder(featureCents, weights) : {};
      for (const [engineerId, arrCents] of Object.entries(byEngineer)) {
        if (arrCents <= 0) continue;
        engineerArrCents[engineerId] = (engineerArrCents[engineerId] ?? 0) + arrCents;
        newEngineerRows.push({
          id: `engarr_${customer.id}_${featureId}_${engineerId}`,
          customerId: customer.id,
          featureId,
          engineerId,
          ownershipPpm: ownership[engineerId] ?? 0,
          arrCents,
          updatedAt: now,
        });
      }
    }

    const newFeatureRows = FEATURE_IDS.filter((featureId) => featureArrCents[featureId] > 0).map((featureId) => ({
      id: `featurearr_${customer.id}_${featureId}`,
      customerId: customer.id,
      featureId,
      usageCount: usageCounts[featureId],
      weightPpm: usageWeights[featureId] ?? 0,
      arrCents: featureArrCents[featureId],
      updatedAt: now,
    }));

    const oldestUsage = (usageRows as Array<typeof featureUsageEvents.$inferSelect>)
      .map((row) => row.createdAt.getTime()).sort((a, b) => a - b)[0];
    const nextUsageExpiryAt = oldestUsage ? new Date(oldestUsage + (now.getTime() - cutoff.getTime())) : null;
    const unattributedArrCents = totalArrCents - sumValues(featureArrCents);
    const oldFeatureMap = Object.fromEntries((oldFeatureRows as Array<typeof featureArrAllocations.$inferSelect>).map((row) => [row.featureId, row.arrCents]));
    const oldEngineerMap = aggregateEngineerRows(oldEngineerRows);
    const names = Object.fromEntries((engineerRows as Array<typeof engineers.$inferSelect>).map((row) => [row.id, row.name]));

    await tx.delete(engineerArrAllocations).where(eq(engineerArrAllocations.customerId, customer.id));
    await tx.delete(featureArrAllocations).where(eq(featureArrAllocations.customerId, customer.id));
    if (newFeatureRows.length) await tx.insert(featureArrAllocations).values(newFeatureRows);
    if (newEngineerRows.length) await tx.insert(engineerArrAllocations).values(newEngineerRows);
    await tx.update(customers).set({ unattributedArrCents, lastRecalculatedAt: now, nextUsageExpiryAt, updatedAt: now }).where(eq(customers.id, customer.id));

    const featureDeltas = FEATURE_IDS.map((featureId) => ({
      featureId,
      deltaArrCents: featureArrCents[featureId] - (oldFeatureMap[featureId] ?? 0),
    })).filter((item) => item.deltaArrCents !== 0);
    if (featureDeltas.length && oldFeatureRows.length > 0) {
      await tx.insert(activityEvents).values({
        id: `act_${randomUUID()}`,
        type: 'arr_shift',
        headline: 'ARR SHIFT',
        detail: featureDeltas.map((item) => `${FEATURE_LABELS[item.featureId]} ${formatCurrency(item.deltaArrCents, { signed: true, compact: true })}`).join(' · '),
        source: customer.source,
        customerId: customer.id,
        payload: { deltas: featureDeltas },
        createdAt: now,
      });
    }

    const allEngineerIds = new Set([...Object.keys(oldEngineerMap), ...Object.keys(engineerArrCents)]);
    for (const engineerId of allEngineerIds) {
      const delta = (engineerArrCents[engineerId] ?? 0) - (oldEngineerMap[engineerId] ?? 0);
      if (!delta || oldEngineerRows.length === 0) continue;
      await tx.insert(activityEvents).values({
        id: `act_${randomUUID()}`,
        type: 'engineer_arr_delta',
        headline: `${names[engineerId]?.toUpperCase() ?? 'ENGINEER'} IMPACT`,
        detail: `${names[engineerId] ?? 'Engineer'} ${formatCurrency(delta, { signed: true, compact: true })} ARR impact`,
        source: customer.source,
        engineerId,
        customerId: customer.id,
        deltaArrCents: delta,
        payload: {},
        createdAt: now,
      });
    }

    const nextLeader = await getLeader(tx);
    if (previousLeader && nextLeader && previousLeader !== nextLeader) {
      await tx.insert(activityEvents).values({
        id: `act_${randomUUID()}`,
        type: 'takes_lead',
        headline: 'NEW LEADER',
        detail: `${names[nextLeader]?.toUpperCase() ?? 'ENGINEER'} takes the lead`,
        source: customer.source,
        engineerId: nextLeader,
        payload: { previousLeader },
        createdAt: now,
      });
    }

    return { userId, totalArrCents, unattributedArrCents, featureArrCents, engineerArrCents };
  });
}

export async function recalculateAllActiveCustomers() {
  const db = getDb();
  const rows = await db.select({ userId: customers.userId }).from(customers)
    .innerJoin(subscriptions, eq(subscriptions.customerId, customers.id))
    .where(eq(subscriptions.status, ACTIVE_SUBSCRIPTION_STATUS));
  const userIds = [...new Set(rows.map((row) => row.userId))];
  const results = [];
  for (const userId of userIds) results.push(await recalculateCustomerARR(userId));
  return results;
}

export async function recalculateDueCustomers() {
  const db = getDb();
  const due = await db.select({ userId: customers.userId }).from(customers)
    .where(lte(customers.nextUsageExpiryAt, new Date()));
  for (const row of due) await recalculateCustomerARR(row.userId);
}

export async function recalculateCustomers(userIds: string[]) {
  const unique = [...new Set(userIds)];
  if (!unique.length) return [];
  const db = getDb();
  const existing = await db.select({ userId: customers.userId }).from(customers).where(inArray(customers.userId, unique));
  const results = [];
  for (const row of existing) results.push(await recalculateCustomerARR(row.userId));
  return results;
}
