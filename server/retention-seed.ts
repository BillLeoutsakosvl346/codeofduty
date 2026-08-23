import type { FeatureId } from "../shared/contracts.js";
import {
  SeededRetentionCohortSchema,
  type SeededRetentionCohort as CoreSeededRetentionCohort,
} from "../shared/retention-contracts.js";
import {
  buildDeterministicRetentionNarrative,
  buildRetentionImpact,
} from "./retention.js";

export type SeededRetentionCohort = CoreSeededRetentionCohort;

export type SeededFeatureStats = {
  featureId: FeatureId;
  adopters: number;
  renewedAdopters: number;
  nonAdopters: number;
  renewedNonAdopters: number;
  adopterRetentionRate: number;
  nonAdopterRetentionRate: number;
  retentionLiftPercentagePoints: number;
};

const FEATURES: readonly FeatureId[] = ["search", "summary", "sharing"];

function isAdopter(
  featureId: FeatureId,
  customerNumber: number,
  renewed: boolean,
): boolean {
  // Each feature's adopter group is intentionally selected from both outcome
  // groups. This makes the aggregate demo facts exact while still producing a
  // concrete customer-level packet for the retention computation.
  if (featureId === "search") {
    return renewed ? customerNumber <= 68 : customerNumber <= 123 + 12;
  }
  if (featureId === "summary") {
    return renewed ? customerNumber <= 45 : customerNumber <= 123 + 15;
  }
  // 53 / 75 adopters renew versus 70 / 105 non-adopters: exactly +4pp.
  return renewed ? customerNumber <= 53 : customerNumber <= 123 + 22;
}

export function calculateSeededFeatureStats(
  cohort: SeededRetentionCohort,
): SeededFeatureStats[] {
  return FEATURES.map((featureId) => {
    const adopters = cohort.customers.filter((customer) =>
      customer.adopted_features.includes(featureId),
    );
    const nonAdopters = cohort.customers.filter(
      (customer) => !customer.adopted_features.includes(featureId),
    );
    const renewedAdopters = adopters.filter(
      (customer) => customer.billing.renewed,
    ).length;
    const renewedNonAdopters = nonAdopters.filter(
      (customer) => customer.billing.renewed,
    ).length;
    const adopterRetentionRate = renewedAdopters / adopters.length;
    const nonAdopterRetentionRate =
      renewedNonAdopters / nonAdopters.length;
    return {
      featureId,
      adopters: adopters.length,
      renewedAdopters,
      nonAdopters: nonAdopters.length,
      renewedNonAdopters,
      adopterRetentionRate,
      nonAdopterRetentionRate,
      retentionLiftPercentagePoints: Number(
        (
          (adopterRetentionRate - nonAdopterRetentionRate) *
          100
        ).toFixed(10),
      ),
    };
  });
}

function assertSeed(cohort: SeededRetentionCohort): void {
  const renewed = cohort.customers.filter(
    (customer) => customer.billing.renewed,
  );
  const retainedRevenueCents = renewed.reduce(
    (sum, customer) => sum + customer.billing.contract_value_cents,
    0,
  );
  if (
    cohort.customers.length !== 180 ||
    renewed.length !== 123 ||
    cohort.customers.length - renewed.length !== 57 ||
    retainedRevenueCents !== 1_000_000
  ) {
    throw new Error("Seeded retention cohort totals drifted");
  }

  const stats = calculateSeededFeatureStats(cohort);
  const [search, summary, sharing] = stats;
  if (
    !search ||
    search.adopters !== 80 ||
    search.renewedAdopters !== 68 ||
    search.nonAdopters !== 100 ||
    search.renewedNonAdopters !== 55 ||
    !summary ||
    summary.adopters !== 60 ||
    summary.renewedAdopters !== 45 ||
    summary.nonAdopters !== 120 ||
    summary.renewedNonAdopters !== 78 ||
    !sharing ||
    sharing.adopters !== 75 ||
    sharing.renewedAdopters !== 53 ||
    sharing.nonAdopters !== 105 ||
    sharing.renewedNonAdopters !== 70
  ) {
    throw new Error("Seeded retention feature facts drifted");
  }
}

export function buildSeededRetentionCohort(): SeededRetentionCohort {
  const customers = Array.from({ length: 180 }, (_, index) => {
    const customerNumber = index + 1;
    const renewed = customerNumber <= 123;
    const adoptedFeatures = FEATURES.filter((featureId) =>
      isAdopter(featureId, customerNumber, renewed),
    );
    return {
      customer_id: `customer_${String(customerNumber).padStart(3, "0")}`,
      adopted_features: adoptedFeatures,
      billing: {
        // 122 * 8,130 + 8,140 = exactly 1,000,000 retained cents.
        // Churned contracts retain positive value-at-risk context but contribute
        // no retained revenue to the core computation.
        contract_value_cents: renewed
          ? customerNumber === 123
            ? 8_140
            : 8_130
          : 1_000,
        renewed,
      },
    };
  });
  const cohort: SeededRetentionCohort = {
    cohort_id: "manematch-demo-2026-q3",
    label: "ManeMatch Q3 renewal cohort",
    source: "seeded-demo",
    currency: "usd",
    observation_window: {
      start: "2026-05-01T00:00:00.000Z",
      end: "2026-07-31T23:59:59.000Z",
    },
    customers,
  };
  assertSeed(cohort);
  return SeededRetentionCohortSchema.parse(cohort);
}

export function buildSeededRetentionImpact() {
  return buildRetentionImpact(buildSeededRetentionCohort(), {
    runId: "ret_manematch_demo_2026_q3",
    now: "2026-08-23T20:00:00.000Z",
    narrativeRunner: async (evidence) =>
      buildDeterministicRetentionNarrative(evidence),
  });
}
