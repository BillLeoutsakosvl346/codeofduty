import request from "supertest";
import { describe, expect, it } from "vitest";
import { RetentionImpactEnvelopeSchema } from "../shared/retention-contracts.js";
import {
  createApp,
  type ApiRepository,
  type AppDependencies,
  type StripeApi,
} from "../server/app.js";
import {
  buildSeededRetentionCohort,
  buildSeededRetentionImpact,
  calculateSeededFeatureStats,
} from "../server/retention-seed.js";

const unusedRepository: ApiRepository = {
  recordUsage() {
    throw new Error("Not used by retention route tests");
  },
  countDistinctFeatures() {
    return 0;
  },
  storeRevenueEvent() {
    throw new Error("Not used by retention route tests");
  },
  hasRevenueEvent() {
    return false;
  },
  getRevenueImpact() {
    return undefined;
  },
};

const unusedStripe = {
  checkout: {
    sessions: {
      create: async () => ({ id: "unused", url: null }),
    },
  },
  webhooks: {
    constructEvent() {
      throw new Error("Not used by retention route tests");
    },
  },
} as StripeApi;

function dependencies(): AppDependencies {
  return {
    repository: unusedRepository,
    stripe: unusedStripe,
    stripeWebhookSecret: "unused",
    appUrl: "http://localhost:5173",
    ensureRevenueImpact: async () => {
      throw new Error("Not used by retention route tests");
    },
    getRetentionImpact: buildSeededRetentionImpact,
  };
}

describe("seeded retention cohort", () => {
  it("contains the exact coherent customer, revenue, and feature facts", () => {
    const cohort = buildSeededRetentionCohort();
    const renewed = cohort.customers.filter(
      (customer) => customer.billing.renewed,
    );
    expect(cohort.customers).toHaveLength(180);
    expect(renewed).toHaveLength(123);
    expect(cohort.customers.length - renewed.length).toBe(57);
    expect(
      renewed.reduce(
        (sum, customer) => sum + customer.billing.contract_value_cents,
        0,
      ),
    ).toBe(1_000_000);

    const stats = calculateSeededFeatureStats(cohort);
    expect(stats).toEqual([
      expect.objectContaining({
        featureId: "search",
        adopters: 80,
        renewedAdopters: 68,
        nonAdopters: 100,
        renewedNonAdopters: 55,
        adopterRetentionRate: 0.85,
        nonAdopterRetentionRate: 0.55,
        retentionLiftPercentagePoints: 30,
      }),
      expect.objectContaining({
        featureId: "summary",
        adopters: 60,
        renewedAdopters: 45,
        nonAdopters: 120,
        renewedNonAdopters: 78,
        adopterRetentionRate: 0.75,
        nonAdopterRetentionRate: 0.65,
        retentionLiftPercentagePoints: 10,
      }),
      expect.objectContaining({
        featureId: "sharing",
        adopters: 75,
        renewedAdopters: 53,
        nonAdopters: 105,
        renewedNonAdopters: 70,
        retentionLiftPercentagePoints: expect.closeTo(4, 10),
      }),
    ]);
  });
});

describe("retention impact API", () => {
  it("returns a strict computed envelope from the seeded cohort", async () => {
    const response = await request(createApp(dependencies())).get(
      "/api/retention-impact",
    );

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("completed");
    const envelope = RetentionImpactEnvelopeSchema.parse(response.body.data);
    expect(envelope.run_id).toBe("ret_manematch_demo_2026_q3");
    expect(envelope.impact).toMatchObject({
      cohort_id: "manematch-demo-2026-q3",
      customer_count: 180,
      renewed_customer_count: 123,
      total_retained_revenue_cents: 1_000_000,
      methodology: "observed-retention-lift-v1",
      causality_notice: "Observed cohort correlation; not causal attribution.",
    });
    const byFeature = new Map(
      envelope.impact.features.map((feature) => [feature.feature_id, feature]),
    );
    expect(byFeature.get("search")).toMatchObject({
      adopter_count: 80,
      adopter_renewed_count: 68,
      non_adopter_count: 100,
      non_adopter_renewed_count: 55,
      renewal_rate_with_feature: 0.85,
      renewal_rate_without_feature: 0.55,
      observed_retention_lift: 0.3,
    });
    expect(byFeature.get("summary")).toMatchObject({
      adopter_count: 60,
      adopter_renewed_count: 45,
      non_adopter_count: 120,
      non_adopter_renewed_count: 78,
      renewal_rate_with_feature: 0.75,
      renewal_rate_without_feature: 0.65,
      observed_retention_lift: 0.1,
    });
    expect(byFeature.get("sharing")?.observed_retention_lift).toBe(0.04);
    expect(
      envelope.impact.features.reduce(
        (sum, feature) => sum + feature.retained_revenue_impact_cents,
        envelope.impact.unattributed_retained_revenue_cents,
      ),
    ).toBe(1_000_000);
  });

  it("returns the same deterministic record from GET and repeated runs", async () => {
    const app = createApp(dependencies());
    const getResponse = await request(app).get("/api/retention-impact");
    const firstRun = await request(app)
      .post("/api/retention-impact/run")
      .send({});
    const replay = await request(app)
      .post("/api/retention-impact/run")
      .send({});

    expect(getResponse.status).toBe(200);
    expect(firstRun.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(firstRun.body).toEqual(getResponse.body);
    expect(replay.body).toEqual(firstRun.body);
  });
});
