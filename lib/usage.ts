import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { activityEvents, customers, featureUsageEvents } from '@/db/schema';
import { FEATURE_ACTIONS, FEATURE_IDS, FEATURE_LABELS } from '@/lib/constants';
import { recalculateCustomerARR } from '@/lib/arr';
import { AppError } from '@/lib/errors';

export const usageSchema = z.object({
  usageEventId: z.string().uuid(),
  featureId: z.enum(FEATURE_IDS),
  action: z.string().min(1).max(64),
  userId: z.string().regex(/^demo_user_[a-f0-9-]{8,}$/i).max(80),
  sessionId: z.string().min(8).max(100),
});

export async function ensureCustomer(userId: string, source = 'live') {
  const db = getDb();
  const id = `cust_${userId.replace(/[^a-z0-9]/gi, '_').slice(0, 72)}`;
  const [customer] = await db.insert(customers).values({
    id,
    userId,
    displayName: userId,
    source,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: customers.userId,
    set: { updatedAt: new Date() },
  }).returning();
  return customer;
}

export async function recordUsage(input: z.infer<typeof usageSchema>) {
  if (FEATURE_ACTIONS[input.featureId] !== input.action) {
    throw new AppError('INVALID_USAGE_ACTION', 'Feature and action do not match.', 400);
  }
  const db = getDb();
  const customer = await ensureCustomer(input.userId);
  const inserted = await db.insert(featureUsageEvents).values({
    usageEventId: input.usageEventId,
    featureId: input.featureId,
    action: input.action,
    userId: input.userId,
    sessionId: input.sessionId,
    source: 'live',
  }).onConflictDoNothing().returning({ usageEventId: featureUsageEvents.usageEventId });

  await db.insert(activityEvents).values({
    id: `act_${randomUUID()}`,
    type: 'feature_used',
    headline: `${FEATURE_LABELS[input.featureId].toUpperCase()} USED`,
    detail: input.userId,
    source: 'live',
    customerId: customer.id,
    featureId: input.featureId,
    dedupeKey: `usage:${input.usageEventId}`,
    payload: { action: input.action, sessionId: input.sessionId },
  }).onConflictDoNothing({ target: activityEvents.dedupeKey });

  const attribution = await recalculateCustomerARR(input.userId);
  return { inserted: inserted.length > 0, attribution };
}

export async function getCustomerByUserId(userId: string) {
  return getDb().select().from(customers).where(eq(customers.userId, userId)).limit(1).then((rows) => rows[0] ?? null);
}
