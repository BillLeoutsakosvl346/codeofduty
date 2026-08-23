import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

import type {
  AttributionEvidence,
  FeatureId,
  RevenueImpactEnvelope,
  UsageEventInput,
} from "../shared/contracts";

export type SqliteDatabase = Database.Database;

export type FeatureUsageEvent = {
  id: string;
  userId: string;
  featureId: FeatureId;
  action: string;
  sessionId: string;
  createdAt: string;
};

export type RevenueEvent = {
  id: string;
  stripeSessionId: string;
  userId: string;
  amountCents: number;
  currency: string;
  createdAt: string;
};

export type RevenueImpactRun = {
  id: string;
  revenueEventId: string;
  model: string;
  inputJson: AttributionEvidence;
  outputJson: RevenueImpactEnvelope;
  createdAt: string;
};

type UsageRow = {
  id: string;
  user_id: string;
  feature_id: FeatureId;
  action: string;
  session_id: string;
  created_at: string;
};

type RevenueRow = {
  id: string;
  stripe_session_id: string;
  user_id: string;
  amount_cents: number;
  currency: string;
  created_at: string;
};

type ImpactRunRow = {
  id: string;
  revenue_event_id: string;
  model: string;
  input_json: string;
  output_json: string;
  created_at: string;
};

const FEATURE_IDS: readonly FeatureId[] = ["search", "summary", "sharing"];
let singleton: SqliteDatabase | undefined;

function iso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid timestamp");
  }
  return date.toISOString();
}

function mapUsage(row: UsageRow): FeatureUsageEvent {
  return {
    id: row.id,
    userId: row.user_id,
    featureId: row.feature_id,
    action: row.action,
    sessionId: row.session_id,
    createdAt: row.created_at,
  };
}

function mapRevenue(row: RevenueRow): RevenueEvent {
  return {
    id: row.id,
    stripeSessionId: row.stripe_session_id,
    userId: row.user_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    createdAt: row.created_at,
  };
}

function mapImpactRun(row: ImpactRunRow): RevenueImpactRun {
  return {
    id: row.id,
    revenueEventId: row.revenue_event_id,
    model: row.model,
    inputJson: JSON.parse(row.input_json) as AttributionEvidence,
    outputJson: JSON.parse(row.output_json) as RevenueImpactEnvelope,
    createdAt: row.created_at,
  };
}

export function createDatabase(filename = ":memory:"): SqliteDatabase {
  if (filename !== ":memory:") {
    mkdirSync(dirname(resolve(filename)), { recursive: true });
  }

  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS feature_usage_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      feature_id TEXT NOT NULL CHECK (feature_id IN ('search', 'summary', 'sharing')),
      action TEXT NOT NULL,
      session_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS feature_usage_events_user_created_at
      ON feature_usage_events (user_id, created_at);

    CREATE TABLE IF NOT EXISTS revenue_events (
      id TEXT PRIMARY KEY,
      stripe_session_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS revenue_events_user_created_at
      ON revenue_events (user_id, created_at);

    CREATE TABLE IF NOT EXISTS revenue_impact_runs (
      id TEXT PRIMARY KEY,
      revenue_event_id TEXT NOT NULL UNIQUE,
      model TEXT NOT NULL,
      input_json TEXT NOT NULL,
      output_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (revenue_event_id) REFERENCES revenue_events(id)
    );
  `);

  return db;
}

export function getDatabase(): SqliteDatabase {
  if (!singleton) {
    singleton = createDatabase(
      process.env.DATABASE_PATH ?? resolve(process.cwd(), "data/codeofduty.sqlite"),
    );
  }
  return singleton;
}

export function saveUsageEvent(
  db: SqliteDatabase,
  input: UsageEventInput,
  createdAt: Date | string = new Date(),
): { event: FeatureUsageEvent; duplicate: boolean } {
  const timestamp = iso(createdAt);
  const result = db
    .prepare(
      `INSERT INTO feature_usage_events
        (id, user_id, feature_id, action, session_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .run(
      input.usageEventId,
      input.userId,
      input.featureId,
      input.action,
      input.sessionId,
      timestamp,
    );

  const row = db
    .prepare("SELECT * FROM feature_usage_events WHERE id = ?")
    .get(input.usageEventId) as UsageRow | undefined;
  if (!row) {
    throw new Error("Usage event was not stored");
  }

  const event = mapUsage(row);
  if (
    result.changes === 0 &&
    (event.userId !== input.userId ||
      event.featureId !== input.featureId ||
      event.action !== input.action ||
      event.sessionId !== input.sessionId)
  ) {
    throw new Error("Usage event ID already exists with different data");
  }

  return { event, duplicate: result.changes === 0 };
}

export function getUsageTotals(
  db: SqliteDatabase,
  userId: string,
): Record<FeatureId, number> {
  const totals: Record<FeatureId, number> = {
    search: 0,
    summary: 0,
    sharing: 0,
  };
  const rows = db
    .prepare(
      `SELECT feature_id, COUNT(*) AS event_count
       FROM feature_usage_events
       WHERE user_id = ?
       GROUP BY feature_id`,
    )
    .all(userId) as Array<{ feature_id: FeatureId; event_count: number }>;
  for (const row of rows) {
    if (FEATURE_IDS.includes(row.feature_id)) {
      totals[row.feature_id] = row.event_count;
    }
  }
  return totals;
}

export function getDistinctFeatureCount(
  db: SqliteDatabase,
  userId: string,
): number {
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT feature_id) AS feature_count
       FROM feature_usage_events
       WHERE user_id = ?`,
    )
    .get(userId) as { feature_count: number };
  return row.feature_count;
}

export function getUsageStats(
  db: SqliteDatabase,
  userId: string,
): {
  eventCount: number;
  distinctFeatureCount: number;
  totals: Record<FeatureId, number>;
} {
  const totals = getUsageTotals(db, userId);
  return {
    eventCount: Object.values(totals).reduce((sum, count) => sum + count, 0),
    distinctFeatureCount: getDistinctFeatureCount(db, userId),
    totals,
  };
}

export type RevenueEventInput = {
  id?: string;
  stripeSessionId: string;
  userId: string;
  amountCents: number;
  currency: string;
  createdAt: Date | string;
};

export function upsertRevenueEvent(
  db: SqliteDatabase,
  input: RevenueEventInput,
): { event: RevenueEvent; duplicate: boolean } {
  const timestamp = iso(input.createdAt);
  const id = input.id ?? randomUUID();
  const currency = input.currency.toLowerCase();
  const result = db
    .prepare(
      `INSERT INTO revenue_events
        (id, stripe_session_id, user_id, amount_cents, currency, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(stripe_session_id) DO NOTHING`,
    )
    .run(
      id,
      input.stripeSessionId,
      input.userId,
      input.amountCents,
      currency,
      timestamp,
    );

  const event = getRevenueEventByStripeSessionId(db, input.stripeSessionId);
  if (!event) {
    throw new Error("Revenue event was not stored");
  }
  if (
    result.changes === 0 &&
    (event.userId !== input.userId ||
      event.amountCents !== input.amountCents ||
      event.currency !== currency ||
      event.createdAt !== timestamp)
  ) {
    throw new Error("Stripe session already exists with different revenue data");
  }

  return { event, duplicate: result.changes === 0 };
}

export function getRevenueEventByStripeSessionId(
  db: SqliteDatabase,
  stripeSessionId: string,
): RevenueEvent | null {
  const row = db
    .prepare("SELECT * FROM revenue_events WHERE stripe_session_id = ?")
    .get(stripeSessionId) as RevenueRow | undefined;
  return row ? mapRevenue(row) : null;
}

export function getRevenueEventById(
  db: SqliteDatabase,
  revenueEventId: string,
): RevenueEvent | null {
  const row = db
    .prepare("SELECT * FROM revenue_events WHERE id = ?")
    .get(revenueEventId) as RevenueRow | undefined;
  return row ? mapRevenue(row) : null;
}

export type RevenueImpactRunInput = {
  id: string;
  revenueEventId: string;
  model: string;
  inputJson: AttributionEvidence;
  outputJson: RevenueImpactEnvelope;
  createdAt: Date | string;
};

export function insertRevenueImpactRun(
  db: SqliteDatabase,
  input: RevenueImpactRunInput,
): { run: RevenueImpactRun; duplicate: boolean } {
  const result = db
    .prepare(
      `INSERT INTO revenue_impact_runs
        (id, revenue_event_id, model, input_json, output_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(revenue_event_id) DO NOTHING`,
    )
    .run(
      input.id,
      input.revenueEventId,
      input.model,
      JSON.stringify(input.inputJson),
      JSON.stringify(input.outputJson),
      iso(input.createdAt),
    );
  const run = getRevenueImpactRunByRevenueEventId(db, input.revenueEventId);
  if (!run) {
    throw new Error("Revenue impact run was not stored");
  }
  return { run, duplicate: result.changes === 0 };
}

export function getRevenueImpactRunByRevenueEventId(
  db: SqliteDatabase,
  revenueEventId: string,
): RevenueImpactRun | null {
  const row = db
    .prepare("SELECT * FROM revenue_impact_runs WHERE revenue_event_id = ?")
    .get(revenueEventId) as ImpactRunRow | undefined;
  return row ? mapImpactRun(row) : null;
}

export function getRevenueImpactRunByStripeSessionId(
  db: SqliteDatabase,
  stripeSessionId: string,
): RevenueImpactRun | null {
  const row = db
    .prepare(
      `SELECT runs.*
       FROM revenue_impact_runs AS runs
       JOIN revenue_events AS revenue ON revenue.id = runs.revenue_event_id
       WHERE revenue.stripe_session_id = ?`,
    )
    .get(stripeSessionId) as ImpactRunRow | undefined;
  return row ? mapImpactRun(row) : null;
}
