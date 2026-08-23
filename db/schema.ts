import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const engineers = pgTable('engineers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  githubLogin: text('github_login').notNull(),
  avatarUrl: text('avatar_url'),
  role: text('role').notNull().default('Software Engineer'),
  source: text('source').notNull().default('seed'),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex('engineers_github_login_uq').on(table.githubLogin)]);

export const features = pgTable('features', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  createdAt,
});

export const pullRequests = pgTable('pull_requests', {
  id: text('id').primaryKey(),
  repository: text('repository').notNull(),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  authorLogin: text('author_login').notNull(),
  engineerId: text('engineer_id').references(() => engineers.id),
  url: text('url').notNull(),
  mergedAt: timestamp('merged_at', { withTimezone: true }).notNull(),
  source: text('source').notNull().default('github'),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex('pull_requests_repo_number_uq').on(table.repository, table.number)]);

export const featureContributions = pgTable('feature_contributions', {
  id: text('id').primaryKey(),
  pullRequestId: text('pull_request_id').notNull().references(() => pullRequests.id, { onDelete: 'cascade' }),
  featureId: text('feature_id').notNull().references(() => features.id),
  score: integer('score').notNull(),
  reason: text('reason').notNull(),
  source: text('source').notNull().default('greptile'),
  analyzedAt: timestamp('analyzed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('feature_contributions_pr_feature_uq').on(table.pullRequestId, table.featureId)]);

export const featureUsageEvents = pgTable('feature_usage_events', {
  usageEventId: text('usage_event_id').primaryKey(),
  featureId: text('feature_id').notNull().references(() => features.id),
  action: text('action').notNull(),
  userId: text('user_id').notNull(),
  sessionId: text('session_id').notNull(),
  source: text('source').notNull().default('live'),
  successful: boolean('successful').notNull().default(true),
  createdAt,
}, (table) => [index('feature_usage_user_window_idx').on(table.userId, table.createdAt)]);

export const customers = pgTable('customers', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  displayName: text('display_name').notNull(),
  source: text('source').notNull().default('live'),
  unattributedArrCents: bigint('unattributed_arr_cents', { mode: 'number' }).notNull().default(0),
  lastRecalculatedAt: timestamp('last_recalculated_at', { withTimezone: true }),
  nextUsageExpiryAt: timestamp('next_usage_expiry_at', { withTimezone: true }),
  createdAt,
  updatedAt,
}, (table) => [
  uniqueIndex('customers_user_id_uq').on(table.userId),
  uniqueIndex('customers_stripe_customer_id_uq').on(table.stripeCustomerId),
]);

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  stripeSubscriptionId: text('stripe_subscription_id'),
  status: text('status').notNull(),
  currency: text('currency').notNull().default('usd'),
  interval: text('interval').notNull().default('month'),
  intervalCount: integer('interval_count').notNull().default(1),
  unitAmountCents: integer('unit_amount_cents').notNull(),
  quantity: integer('quantity').notNull().default(1),
  mrrCents: bigint('mrr_cents', { mode: 'number' }).notNull(),
  arrCents: bigint('arr_cents', { mode: 'number' }).notNull(),
  source: text('source').notNull().default('stripe'),
  eventCreatedAt: timestamp('event_created_at', { withTimezone: true }),
  createdAt,
  updatedAt,
}, (table) => [uniqueIndex('subscriptions_stripe_id_uq').on(table.stripeSubscriptionId)]);

export const featureArrAllocations = pgTable('feature_arr_allocations', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  featureId: text('feature_id').notNull().references(() => features.id),
  usageCount: integer('usage_count').notNull(),
  weightPpm: integer('weight_ppm').notNull(),
  arrCents: bigint('arr_cents', { mode: 'number' }).notNull(),
  updatedAt,
}, (table) => [uniqueIndex('feature_arr_customer_feature_uq').on(table.customerId, table.featureId)]);

export const engineerArrAllocations = pgTable('engineer_arr_allocations', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  featureId: text('feature_id').notNull().references(() => features.id),
  engineerId: text('engineer_id').notNull().references(() => engineers.id),
  ownershipPpm: integer('ownership_ppm').notNull(),
  arrCents: bigint('arr_cents', { mode: 'number' }).notNull(),
  updatedAt,
}, (table) => [uniqueIndex('engineer_arr_customer_feature_engineer_uq').on(table.customerId, table.featureId, table.engineerId)]);

export const missions = pgTable('missions', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull().default('open'),
  claimedBy: text('claimed_by').references(() => engineers.id),
  linkedFeatureId: text('linked_feature_id').references(() => features.id),
  xpReward: integer('xp_reward').notNull().default(500),
  source: text('source').notNull().default('seed'),
  createdAt,
  updatedAt,
});

export const missionClaims = pgTable('mission_claims', {
  id: text('id').primaryKey(),
  missionId: text('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  engineerId: text('engineer_id').notNull().references(() => engineers.id),
  status: text('status').notNull().default('claimed'),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [uniqueIndex('mission_claims_mission_uq').on(table.missionId)]);

export const activityEvents = pgTable('activity_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  headline: text('headline').notNull(),
  detail: text('detail').notNull(),
  source: text('source').notNull().default('live'),
  engineerId: text('engineer_id').references(() => engineers.id),
  customerId: text('customer_id').references(() => customers.id),
  featureId: text('feature_id').references(() => features.id),
  deltaArrCents: bigint('delta_arr_cents', { mode: 'number' }),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  dedupeKey: text('dedupe_key'),
  createdAt,
}, (table) => [
  uniqueIndex('activity_events_dedupe_key_uq').on(table.dedupeKey),
  index('activity_events_created_idx').on(table.createdAt),
]);

export const stripeWebhookEvents = pgTable('stripe_webhook_events', {
  eventId: text('event_id').primaryKey(),
  type: text('type').notNull(),
  status: text('status').notNull().default('processing'),
  error: text('error'),
  createdAt,
  processedAt: timestamp('processed_at', { withTimezone: true }),
});

export const integrationSyncs = pgTable('integration_syncs', {
  provider: text('provider').primaryKey(),
  status: text('status').notNull(),
  message: text('message').notNull(),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
});
