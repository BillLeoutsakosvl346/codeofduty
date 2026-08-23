import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020";
import { afterEach, describe, expect, it } from "vitest";

import {
  apportionCents,
  buildAttributionEvidence,
  calculateDeterministicBaseline,
  canonicalizeRevenueImpact,
  ensureRevenueImpact,
  validateAgentProposal,
} from "../server/attribution";
import {
  createDatabase,
  getDistinctFeatureCount,
  getRevenueImpactRunByStripeSessionId,
  getUsageStats,
  getUsageTotals,
  saveUsageEvent,
  upsertRevenueEvent,
  type RevenueEvent,
  type SqliteDatabase,
} from "../server/db";
import {
  RevenueImpactEnvelopeSchema,
  type AgentProposal,
  type AttributionEvidence,
  type FeatureId,
} from "../shared/contracts";

const USER_A = "demo_user_a";
const USER_B = "demo_user_b";
const PAID_AT = "2026-08-23T19:42:00.000Z";

const openDatabases: SqliteDatabase[] = [];

function database(): SqliteDatabase {
  const db = createDatabase();
  openDatabases.push(db);
  return db;
}

function addUsage(
  db: SqliteDatabase,
  values: {
    id: string;
    userId?: string;
    featureId: FeatureId;
    sessionId: string;
    createdAt: string;
  },
) {
  const actions = {
    search: "search_completed",
    summary: "summary_generated",
    sharing: "share_link_generated",
  } as const;
  return saveUsageEvent(
    db,
    {
      usageEventId: values.id,
      userId: values.userId ?? USER_A,
      featureId: values.featureId,
      action: actions[values.featureId],
      sessionId: values.sessionId,
    },
    values.createdAt,
  );
}

function payment(db: SqliteDatabase): RevenueEvent {
  return upsertRevenueEvent(db, {
    id: "revenue-1",
    stripeSessionId: "cs_test_123",
    userId: USER_A,
    amountCents: 10_000,
    currency: "USD",
    createdAt: PAID_AT,
  }).event;
}

function evidenceFixture(): AttributionEvidence {
  return {
    payment: {
      id: "cs_test_123",
      user_id: USER_A,
      amount_cents: 10_000,
      currency: "usd",
      paid_at: PAID_AT,
    },
    attribution_window: {
      start: "2026-08-16T19:42:00.000Z",
      end: PAID_AT,
    },
    features: [
      {
        feature_id: "search",
        successful_uses: 8,
        unique_sessions: 4,
        last_used_at: "2026-08-23T19:31:00.000Z",
      },
      {
        feature_id: "summary",
        successful_uses: 4,
        unique_sessions: 2,
        last_used_at: "2026-08-22T17:10:00.000Z",
      },
      {
        feature_id: "sharing",
        successful_uses: 1,
        unique_sessions: 1,
        last_used_at: "2026-08-20T14:02:00.000Z",
      },
    ],
  };
}

function proposalFixture(): AgentProposal {
  return {
    allocations: [
      {
        feature_id: "search",
        weight: 0.6,
        evidence: ["Used successfully 8 times"],
        reasoning: "Most frequent workflow.",
        confidence: 0.9,
      },
      {
        feature_id: "summary",
        weight: 0.3,
        evidence: ["Used successfully 4 times"],
        reasoning: "Repeated useful workflow.",
        confidence: 0.8,
      },
      {
        feature_id: "sharing",
        weight: 0.1,
        evidence: ["Used successfully once"],
        reasoning: "Some evidence of value.",
        confidence: 0.6,
      },
    ],
  } as AgentProposal;
}

afterEach(() => {
  while (openDatabases.length > 0) {
    openDatabases.pop()?.close();
  }
});

describe("SQLite persistence", () => {
  it("creates exactly the three Milestone 1 tables", () => {
    const db = database();
    const rows = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all() as Array<{ name: string }>;
    expect(rows.map((row) => row.name)).toEqual([
      "feature_usage_events",
      "revenue_events",
      "revenue_impact_runs",
    ]);
  });

  it("mirrors a usage event idempotently and reports totals", () => {
    const db = database();
    const values = {
      id: "00000000-0000-4000-8000-000000000001",
      featureId: "search" as const,
      sessionId: "10000000-0000-4000-8000-000000000001",
      createdAt: "2026-08-23T18:00:00.000Z",
    };
    expect(addUsage(db, values).duplicate).toBe(false);
    expect(addUsage(db, values).duplicate).toBe(true);
    addUsage(db, {
      id: "00000000-0000-4000-8000-000000000002",
      featureId: "summary",
      sessionId: values.sessionId,
      createdAt: values.createdAt,
    });

    expect(getUsageTotals(db, USER_A)).toEqual({
      search: 1,
      summary: 1,
      sharing: 0,
    });
    expect(getDistinctFeatureCount(db, USER_A)).toBe(2);
    expect(getUsageStats(db, USER_A)).toEqual({
      eventCount: 2,
      distinctFeatureCount: 2,
      totals: { search: 1, summary: 1, sharing: 0 },
    });
  });

  it("rejects reuse of a usage ID for different data", () => {
    const db = database();
    const original = {
      id: "00000000-0000-4000-8000-000000000001",
      featureId: "search" as const,
      sessionId: "10000000-0000-4000-8000-000000000001",
      createdAt: "2026-08-23T18:00:00.000Z",
    };
    addUsage(db, original);
    expect(() =>
      addUsage(db, { ...original, featureId: "summary" }),
    ).toThrow("different data");
  });
});

describe("evidence and baseline", () => {
  it("includes only the same user's pre-payment usage in the inclusive seven-day window", () => {
    const db = database();
    addUsage(db, {
      id: "00000000-0000-4000-8000-000000000001",
      featureId: "search",
      sessionId: "10000000-0000-4000-8000-000000000001",
      createdAt: "2026-08-23T19:00:00.000Z",
    });
    addUsage(db, {
      id: "00000000-0000-4000-8000-000000000002",
      featureId: "search",
      sessionId: "10000000-0000-4000-8000-000000000001",
      createdAt: PAID_AT,
    });
    addUsage(db, {
      id: "00000000-0000-4000-8000-000000000003",
      featureId: "summary",
      sessionId: "10000000-0000-4000-8000-000000000002",
      createdAt: "2026-08-16T19:42:00.000Z",
    });
    addUsage(db, {
      id: "00000000-0000-4000-8000-000000000004",
      userId: USER_B,
      featureId: "sharing",
      sessionId: "10000000-0000-4000-8000-000000000003",
      createdAt: "2026-08-23T19:10:00.000Z",
    });
    addUsage(db, {
      id: "00000000-0000-4000-8000-000000000005",
      featureId: "sharing",
      sessionId: "10000000-0000-4000-8000-000000000004",
      createdAt: "2026-08-23T19:42:00.001Z",
    });
    addUsage(db, {
      id: "00000000-0000-4000-8000-000000000006",
      featureId: "sharing",
      sessionId: "10000000-0000-4000-8000-000000000005",
      createdAt: "2026-08-16T19:41:59.999Z",
    });

    const evidence = buildAttributionEvidence(db, payment(db));
    expect(evidence.payment).toEqual({
      id: "cs_test_123",
      user_id: USER_A,
      amount_cents: 10_000,
      currency: "usd",
      paid_at: PAID_AT,
    });
    expect(evidence.features).toEqual([
      {
        feature_id: "search",
        successful_uses: 2,
        unique_sessions: 1,
        last_used_at: PAID_AT,
      },
      {
        feature_id: "summary",
        successful_uses: 1,
        unique_sessions: 1,
        last_used_at: "2026-08-16T19:42:00.000Z",
      },
    ]);
  });

  it("weights unique feature sessions, not raw event frequency", () => {
    const baseline = calculateDeterministicBaseline(evidenceFixture());
    expect(baseline.map((item) => item.weight)).toEqual([4 / 7, 2 / 7, 1 / 7]);
  });
});

describe("proposal trust boundary and cent allocation", () => {
  it("rejects duplicate, unused, zero-weight, and model-proposed cent fields", () => {
    const evidence = evidenceFixture();
    const valid = proposalFixture();
    expect(validateAgentProposal(valid, evidence)).toEqual(valid);

    expect(() =>
      validateAgentProposal(
        {
          allocations: [valid.allocations[0], valid.allocations[0]],
        },
        evidence,
      ),
    ).toThrow("duplicate feature");
    expect(() =>
      validateAgentProposal(
        {
          allocations: [
            { ...valid.allocations[0], feature_id: "nonexistent" },
          ],
        },
        evidence,
      ),
    ).toThrow();
    expect(() =>
      validateAgentProposal(
        {
          allocations: valid.allocations.map((item) => ({ ...item, weight: 0 })),
        },
        evidence,
      ),
    ).toThrow("no positive attribution weights");
    expect(() =>
      validateAgentProposal(
        {
          allocations: [
            { ...valid.allocations[0], revenue_impact_cents: 10_000 },
          ],
        },
        evidence,
      ),
    ).toThrow();
  });

  it("uses largest remainder with stable feature-ID tie-breaking", () => {
    expect(
      apportionCents(10_000, [
        { featureId: "search", weight: 1 },
        { featureId: "summary", weight: 1 },
        { featureId: "sharing", weight: 1 },
      ]),
    ).toEqual([
      { featureId: "search", amountCents: 3334 },
      { featureId: "summary", amountCents: 3333 },
      { featureId: "sharing", amountCents: 3333 },
    ]);
  });

  it("normalizes weights and conserves the exact Stripe payment", () => {
    const evidence = evidenceFixture();
    const revenue: RevenueEvent = {
      id: "revenue-1",
      stripeSessionId: "cs_test_123",
      userId: USER_A,
      amountCents: 10_000,
      currency: "usd",
      createdAt: PAID_AT,
    };
    const envelope = canonicalizeRevenueImpact({
      runId: "rir_123",
      generatedAt: "2026-08-23T19:42:10.000Z",
      revenue,
      evidence,
      proposal: proposalFixture(),
    });
    expect(envelope.impact.allocations.map((item) => item.weight)).toEqual([
      0.6, 0.3, 0.1,
    ]);
    expect(
      envelope.impact.allocations.map((item) => item.revenue_impact_cents),
    ).toEqual([6000, 3000, 1000]);
    expect(
      envelope.impact.allocations.reduce<number>(
        (sum, item) => sum + item.revenue_impact_cents,
        envelope.impact.unattributed_revenue_cents,
      ),
    ).toBe(envelope.impact.total_revenue_cents);
  });
});

describe("idempotent attribution", () => {
  it("uses a visibly labeled fallback without an API key and stores one run on replay", async () => {
    const db = database();
    addUsage(db, {
      id: "00000000-0000-4000-8000-000000000001",
      featureId: "search",
      sessionId: "10000000-0000-4000-8000-000000000001",
      createdAt: "2026-08-23T19:00:00.000Z",
    });
    addUsage(db, {
      id: "00000000-0000-4000-8000-000000000002",
      featureId: "summary",
      sessionId: "10000000-0000-4000-8000-000000000002",
      createdAt: "2026-08-23T19:10:00.000Z",
    });
    const revenue = payment(db);

    const first = await ensureRevenueImpact(db, revenue, {
      apiKey: "",
      now: "2026-08-23T19:42:10.000Z",
    });
    const replay = await ensureRevenueImpact(db, "cs_test_123", {
      proposalRunner: async () => {
        throw new Error("A replay must not invoke the model");
      },
    });

    expect(replay).toEqual(first);
    expect(first.impact.allocations[0].evidence[0]).toContain(
      "deterministic-baseline-v1 fallback",
    );
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM revenue_impact_runs").get(),
    ).toEqual({ count: 1 });
    expect(
      getRevenueImpactRunByStripeSessionId(db, "cs_test_123")?.model,
    ).toBe("deterministic-baseline-v1");
  });

  it("runs a configured proposal runner once and preserves its canonical result", async () => {
    const db = database();
    addUsage(db, {
      id: "00000000-0000-4000-8000-000000000001",
      featureId: "search",
      sessionId: "10000000-0000-4000-8000-000000000001",
      createdAt: "2026-08-23T19:00:00.000Z",
    });
    const revenue = payment(db);
    let calls = 0;
    const result = await ensureRevenueImpact(db, revenue, {
      now: "2026-08-23T19:42:10.000Z",
      proposalRunner: async () => {
        calls += 1;
        return {
          model: "test-structured-model",
          proposal: {
            allocations: [
              {
                feature_id: "search",
                weight: 0.25,
                evidence: ["Used before payment"],
                reasoning: "Only evidenced feature.",
                confidence: 0.9,
              },
            ],
          },
        };
      },
    });
    await ensureRevenueImpact(db, revenue);
    expect(calls).toBe(1);
    expect(result.impact.allocations[0]).toMatchObject({
      feature_id: "search",
      weight: 1,
      revenue_impact_cents: 10_000,
    });
  });
});

describe("checked-in JSON contract", () => {
  it("accepts the same canonical envelope as the Zod wire contract", () => {
    const schemaPath = fileURLToPath(
      new URL("../contracts/revenue-impact.v1.schema.json", import.meta.url),
    );
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as object;
    const ajv = new Ajv2020({ strict: true });
    ajv.addFormat("date-time", {
      type: "string",
      validate: (value: string) => !Number.isNaN(Date.parse(value)),
    });
    const validate = ajv.compile(schema);
    const envelope = canonicalizeRevenueImpact({
      runId: "rir_123",
      generatedAt: "2026-08-23T19:42:10.000Z",
      revenue: {
        id: "revenue-1",
        stripeSessionId: "cs_test_123",
        userId: USER_A,
        amountCents: 10_000,
        currency: "usd",
        createdAt: PAID_AT,
      },
      evidence: evidenceFixture(),
      proposal: proposalFixture(),
    });

    expect(RevenueImpactEnvelopeSchema.parse(envelope)).toEqual(envelope);
    expect(validate(envelope), validate.errors?.map(String).join("\n")).toBe(
      true,
    );
  });
});
