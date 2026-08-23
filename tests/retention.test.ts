import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

import {
  RetentionImpactEnvelopeSchema,
  SeededRetentionCohortSchema,
  type RetentionNarrativeProposal,
  type SeededRetentionCohort,
} from "../shared/retention-contracts";
import {
  RETENTION_CAUSALITY_NOTICE,
  buildDeterministicRetentionNarrative,
  buildRetentionImpact,
  canonicalizeRetentionImpact,
  computeRetentionEvidence,
  validateRetentionNarrativeProposal,
} from "../server/retention";

function seededCohort(): SeededRetentionCohort {
  const renewed = new Set(["customer-1", "customer-2", "customer-3", "customer-4", "customer-5"]);
  const featureSets = [
    ["search", "summary", "sharing"],
    ["search", "summary"],
    ["search", "summary", "sharing"],
    ["search", "summary"],
    ["search", "sharing"],
    ["search", "summary"],
    ["sharing"],
    [],
  ] as const;
  return {
    cohort_id: "seed-2026-q3",
    label: "Synthetic Q3 renewal cohort",
    source: "seeded-demo",
    currency: "usd",
    observation_window: {
      start: "2026-07-01T00:00:00.000Z",
      end: "2026-08-01T00:00:00.000Z",
    },
    customers: featureSets.map((adoptedFeatures, index) => {
      const customerId = `customer-${index + 1}`;
      return {
        customer_id: customerId,
        adopted_features: [...adoptedFeatures],
        billing: {
          contract_value_cents: 10_000,
          renewed: renewed.has(customerId),
        },
      };
    }),
  };
}

function proposal(): RetentionNarrativeProposal {
  return {
    features: [
      {
        feature_id: "search",
        rank: 1,
        evidence: ["Five of six adopters renewed"],
        reasoning: "Strongest observed cohort lift; correlation only.",
        confidence: 0.9,
      },
      {
        feature_id: "summary",
        rank: 2,
        evidence: ["Four of five adopters renewed"],
        reasoning: "Second-highest observed cohort lift; correlation only.",
        confidence: 0.8,
      },
      {
        feature_id: "sharing",
        rank: 3,
        evidence: ["Three of four adopters renewed"],
        reasoning: "Positive but smaller observed cohort lift; correlation only.",
        confidence: 0.7,
      },
    ],
  };
}

describe("seeded cohort contract", () => {
  it("accepts customer-feature adoption and billing outcomes", () => {
    expect(SeededRetentionCohortSchema.parse(seededCohort()).customers).toHaveLength(8);
  });

  it("rejects duplicate customers, duplicate adoption, and reversed windows", () => {
    const duplicateCustomer = seededCohort();
    duplicateCustomer.customers[1].customer_id = "customer-1";
    expect(() => SeededRetentionCohortSchema.parse(duplicateCustomer)).toThrow();

    const duplicateFeature = seededCohort();
    duplicateFeature.customers[0].adopted_features = ["search", "search"];
    expect(() => SeededRetentionCohortSchema.parse(duplicateFeature)).toThrow();

    const reversed = seededCohort();
    reversed.observation_window.end = reversed.observation_window.start;
    expect(() => SeededRetentionCohortSchema.parse(reversed)).toThrow();
  });
});

describe("ordinary-code retention computation", () => {
  it("computes with/without renewal rates, observed lift, and positive influence", () => {
    const packet = computeRetentionEvidence(seededCohort());
    expect(packet.cohort).toMatchObject({
      customer_count: 8,
      renewed_customer_count: 5,
      total_retained_revenue_cents: 50_000,
    });
    expect(packet.features).toEqual([
      {
        feature_id: "search",
        adopter_count: 6,
        adopter_renewed_count: 5,
        non_adopter_count: 2,
        non_adopter_renewed_count: 0,
        renewal_rate_with_feature: 0.833333333333,
        renewal_rate_without_feature: 0,
        observed_retention_lift: 0.833333333333,
        positive_influence_score: 5,
      },
      {
        feature_id: "summary",
        adopter_count: 5,
        adopter_renewed_count: 4,
        non_adopter_count: 3,
        non_adopter_renewed_count: 1,
        renewal_rate_with_feature: 0.8,
        renewal_rate_without_feature: 0.333333333333,
        observed_retention_lift: 0.466666666667,
        positive_influence_score: 2.333333333333,
      },
      {
        feature_id: "sharing",
        adopter_count: 4,
        adopter_renewed_count: 3,
        non_adopter_count: 4,
        non_adopter_renewed_count: 2,
        renewal_rate_with_feature: 0.75,
        renewal_rate_without_feature: 0.5,
        observed_retention_lift: 0.25,
        positive_influence_score: 1,
      },
    ]);
  });

  it("normalizes influence weights and conserves retained revenue exactly", () => {
    const evidence = computeRetentionEvidence(seededCohort());
    const envelope = canonicalizeRetentionImpact({
      evidence,
      proposal: proposal(),
      runId: "ret_test",
      generatedAt: "2026-08-23T20:00:00.000Z",
    });
    expect(envelope.impact.features.map((feature) => feature.normalized_weight)).toEqual([
      0.6,
      0.28,
      0.12,
    ]);
    expect(
      envelope.impact.features.map(
        (feature) => feature.retained_revenue_impact_cents,
      ),
    ).toEqual([30_000, 14_000, 6_000]);
    expect(
      envelope.impact.features.reduce(
        (sum, feature) => sum + feature.retained_revenue_impact_cents,
        envelope.impact.unattributed_retained_revenue_cents,
      ),
    ).toBe(50_000);
  });

  it("clamps negative influence to zero and leaves revenue unattributed when no lift is positive", () => {
    const cohort: SeededRetentionCohort = {
      cohort_id: "zero-lift",
      label: "Zero lift",
      source: "seeded-demo",
      currency: "usd",
      observation_window: {
        start: "2026-07-01T00:00:00.000Z",
        end: "2026-08-01T00:00:00.000Z",
      },
      customers: [
        { customer_id: "a", adopted_features: ["search"], billing: { contract_value_cents: 10_000, renewed: true } },
        { customer_id: "b", adopted_features: ["search"], billing: { contract_value_cents: 10_000, renewed: false } },
        { customer_id: "c", adopted_features: [], billing: { contract_value_cents: 10_000, renewed: true } },
        { customer_id: "d", adopted_features: [], billing: { contract_value_cents: 10_000, renewed: false } },
      ],
    };
    const evidence = computeRetentionEvidence(cohort);
    const fallback = buildDeterministicRetentionNarrative(evidence);
    const envelope = canonicalizeRetentionImpact({
      evidence,
      proposal: fallback.proposal,
      runId: "ret_zero",
      generatedAt: "2026-08-23T20:00:00.000Z",
    });
    expect(envelope.impact.features[0]).toMatchObject({
      positive_influence_score: 0,
      normalized_weight: 0,
      retained_revenue_impact_cents: 0,
    });
    expect(envelope.impact.unattributed_retained_revenue_cents).toBe(20_000);
  });
});

describe("agent narrative boundary", () => {
  it("requires one explanation per evidenced feature and unique contiguous ranks", () => {
    const evidence = computeRetentionEvidence(seededCohort());
    expect(validateRetentionNarrativeProposal(proposal(), evidence)).toEqual(proposal());
    expect(() =>
      validateRetentionNarrativeProposal(
        { features: proposal().features.slice(0, 2) },
        evidence,
      ),
    ).toThrow("every feature");
    const duplicateRank = proposal();
    duplicateRank.features[1].rank = 1;
    expect(() => validateRetentionNarrativeProposal(duplicateRank, evidence)).toThrow(
      "duplicated rank",
    );
    expect(() =>
      validateRetentionNarrativeProposal(
        {
          features: proposal().features.map((feature) => ({
            ...feature,
            normalized_weight: 1,
          })),
        },
        evidence,
      ),
    ).toThrow();
  });

  it("uses the visibly labeled fallback only for rank and explanation", async () => {
    const result = await buildRetentionImpact(seededCohort(), {
      apiKey: "",
      runId: "ret_fallback",
      now: "2026-08-23T20:00:00.000Z",
    });
    expect(result.impact.features[0].evidence[0]).toContain(
      "deterministic-retention-explainer-v1 fallback",
    );
    expect(result.impact.features[0].retained_revenue_impact_cents).toBe(30_000);
  });

  it("does not let an injected narrative runner change deterministic math", async () => {
    const reversed = proposal();
    reversed.features = [
      { ...reversed.features[2], rank: 1 },
      { ...reversed.features[1], rank: 2 },
      { ...reversed.features[0], rank: 3 },
    ];
    const result = await buildRetentionImpact(seededCohort(), {
      runId: "ret_agent",
      now: "2026-08-23T20:00:00.000Z",
      narrativeRunner: async () => ({
        model: "test-model",
        proposal: reversed,
      }),
    });
    const impacts = Object.fromEntries(
      result.impact.features.map((feature) => [
        feature.feature_id,
        feature.retained_revenue_impact_cents,
      ]),
    );
    expect(impacts).toEqual({ sharing: 6_000, summary: 14_000, search: 30_000 });
  });
});

describe("retention-impact/v1 wire contract", () => {
  it("is strict, versioned, and explicitly correlation rather than causality", () => {
    const evidence = computeRetentionEvidence(seededCohort());
    const envelope = canonicalizeRetentionImpact({
      evidence,
      proposal: proposal(),
      runId: "ret_contract",
      generatedAt: "2026-08-23T20:00:00.000Z",
    });
    expect(envelope.impact.causality_notice).toBe(RETENTION_CAUSALITY_NOTICE);
    expect(RetentionImpactEnvelopeSchema.parse(envelope)).toEqual(envelope);

    const schemaPath = fileURLToPath(
      new URL("../contracts/retention-impact.v1.schema.json", import.meta.url),
    );
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as object;
    const ajv = new Ajv2020({ strict: true });
    ajv.addFormat("date-time", {
      type: "string",
      validate: (value: string) => !Number.isNaN(Date.parse(value)),
    });
    const validate = ajv.compile(schema);
    expect(validate(envelope), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...envelope, unexpected: true })).toBe(false);
  });
});
