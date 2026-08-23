import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { getDb } from '@/db';
import { activityEvents, customers, integrationSyncs, stripeWebhookEvents, subscriptions } from '@/db/schema';
import { calculateMonthlyRevenue } from '@/lib/allocation';
import { recalculateCustomerARR } from '@/lib/arr';
import { ensureCustomer } from '@/lib/usage';
import { formatCurrency } from '@/lib/utils';

export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured.');
  return new Stripe(key);
}

export async function createCheckout(userId: string, origin: string) {
  const db = getDb();
  const customer = await ensureCustomer(userId);
  const existing = await db.select().from(subscriptions).where(eq(subscriptions.customerId, customer.id));
  if (existing.some((row) => row.status === 'active' && row.source === 'stripe')) {
    throw new Error('This demo user already has an active Stripe subscription.');
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || origin;
  return stripeClient().checkout.sessions.create({
    mode: 'subscription',
    client_reference_id: userId,
    metadata: { user_id: userId },
    subscription_data: { metadata: { user_id: userId } },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: 10_000,
        recurring: { interval: 'month', interval_count: 1 },
        product_data: { name: 'Code of Duty Pro', description: '$100/month engineering impact subscription' },
      },
    }],
    success_url: `${baseUrl}/demo?checkout=success`,
    cancel_url: `${baseUrl}/demo?checkout=cancelled`,
  });
}

async function updateStripeStatus(status: string, message: string, success: boolean) {
  const db = getDb();
  const now = new Date();
  await db.insert(integrationSyncs).values({
    provider: 'stripe', status, message, lastAttemptAt: now, lastSuccessAt: success ? now : null,
  }).onConflictDoUpdate({
    target: integrationSyncs.provider,
    set: { status, message, lastAttemptAt: now, ...(success ? { lastSuccessAt: now } : {}) },
  });
}

async function syncSubscription(subscription: Stripe.Subscription, eventCreated: number, dedupeKey: string) {
  const db = getDb();
  const userId = subscription.metadata.user_id;
  let customer = userId ? await ensureCustomer(userId) : null;
  if (!customer && typeof subscription.customer === 'string') {
    [customer] = await db.select().from(customers).where(eq(customers.stripeCustomerId, subscription.customer)).limit(1);
  }
  if (!customer) throw new Error('Stripe subscription is missing the demo user mapping.');
  if (typeof subscription.customer === 'string' && customer.stripeCustomerId !== subscription.customer) {
    [customer] = await db.update(customers).set({ stripeCustomerId: subscription.customer, updatedAt: new Date() })
      .where(eq(customers.id, customer.id)).returning();
  }

  const item = subscription.items.data[0];
  const recurring = item?.price.recurring;
  if (!item || item.price.unit_amount === null || !recurring || recurring.interval !== 'month' || recurring.interval_count !== 1 || item.price.currency !== 'usd') {
    throw new Error('Only fixed USD monthly Stripe subscriptions are supported.');
  }
  const quantity = item.quantity ?? 1;
  const revenue = calculateMonthlyRevenue(item.price.unit_amount, quantity);
  const [previous] = await db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, subscription.id)).limit(1);
  const incomingTime = new Date(eventCreated * 1000);
  if (previous?.eventCreatedAt && previous.eventCreatedAt > incomingTime) return customer.userId;
  const previousActiveArr = previous?.status === 'active' ? previous.arrCents : 0;
  const nextActiveArr = subscription.status === 'active' ? revenue.arrCents : 0;

  await db.insert(subscriptions).values({
    id: `stripe_${subscription.id}`,
    customerId: customer.id,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    currency: item.price.currency,
    interval: recurring.interval,
    intervalCount: recurring.interval_count,
    unitAmountCents: item.price.unit_amount,
    quantity,
    ...revenue,
    source: 'stripe',
    eventCreatedAt: incomingTime,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: subscriptions.stripeSubscriptionId,
    set: {
      status: subscription.status,
      unitAmountCents: item.price.unit_amount,
      quantity,
      ...revenue,
      eventCreatedAt: incomingTime,
      updatedAt: new Date(),
    },
  });

  const delta = nextActiveArr - previousActiveArr;
  if (delta !== 0) {
    const type = previousActiveArr === 0 && delta > 0 ? 'new_subscription' : nextActiveArr === 0 ? 'subscription_cancelled' : 'subscription_changed';
    await db.insert(activityEvents).values({
      id: `act_${randomUUID()}`,
      type,
      headline: type === 'new_subscription' ? 'NEW SUBSCRIPTION' : type === 'subscription_cancelled' ? 'SUBSCRIPTION CANCELLED' : 'SUBSCRIPTION CHANGED',
      detail: `${formatCurrency(delta, { signed: true, compact: true })} ARR`,
      source: 'stripe',
      customerId: customer.id,
      deltaArrCents: delta,
      dedupeKey,
      payload: { stripeSubscriptionId: subscription.id, status: subscription.status },
    }).onConflictDoNothing({ target: activityEvents.dedupeKey });
  }
  await recalculateCustomerARR(customer.userId);
  return customer.userId;
}

export async function processStripeEvent(event: Stripe.Event) {
  const db = getDb();
  const inserted = await db.insert(stripeWebhookEvents).values({ eventId: event.id, type: event.type })
    .onConflictDoNothing().returning({ eventId: stripeWebhookEvents.eventId });
  if (!inserted.length) {
    const [existing] = await db.select().from(stripeWebhookEvents).where(eq(stripeWebhookEvents.eventId, event.id)).limit(1);
    if (existing?.status === 'processed' || existing?.status === 'processing') return { duplicate: true };
    const reclaimed = await db.update(stripeWebhookEvents)
      .set({ status: 'processing', error: null })
      .where(and(eq(stripeWebhookEvents.eventId, event.id), eq(stripeWebhookEvents.status, 'failed')))
      .returning({ eventId: stripeWebhookEvents.eventId });
    if (!reclaimed.length) return { duplicate: true };
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (typeof session.subscription === 'string') {
        const subscription = await stripeClient().subscriptions.retrieve(session.subscription);
        await syncSubscription(subscription, event.created, `stripe:${event.id}`);
      }
    }
    if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
      await syncSubscription(event.data.object as Stripe.Subscription, event.created, `stripe:${event.id}`);
    }
    await db.update(stripeWebhookEvents).set({ status: 'processed', processedAt: new Date(), error: null }).where(eq(stripeWebhookEvents.eventId, event.id));
    await updateStripeStatus('verified', `Processed ${event.type}.`, true);
    return { duplicate: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stripe webhook processing failed.';
    await db.update(stripeWebhookEvents).set({ status: 'failed', error: message }).where(eq(stripeWebhookEvents.eventId, event.id));
    await updateStripeStatus('error', message, false);
    throw error;
  }
}

export async function constructStripeEvent(rawBody: string, signature: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured.');
  return stripeClient().webhooks.constructEventAsync(rawBody, signature, secret);
}
