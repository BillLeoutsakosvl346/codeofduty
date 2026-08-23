import { randomUUID } from "node:crypto";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import type { FeatureId } from "../shared/contracts";
import {
  RetentionEvidencePacketSchema,
  RetentionImpactEnvelopeSchema,
  RetentionNarrativeProposalSchema,
  SeededRetentionCohortSchema,
  type RetentionEvidencePacket,
  type RetentionImpactEnvelope,
  type RetentionNarrativeProposal,
  type SeededRetentionCohort,
} from "../shared/retention-contracts";
import { apportionCents } from "./attribution";

const FEATURE_IDS: readonly FeatureId[] = ["search", "summary", "sharing"];

export const RETENTION_CAUSALITY_NOTICE =
  "Observed cohort correlation; not causal attribution." as const;

export const RETENTION_NARRATIVE_SYSTEM_PROMPT = `You are a product retention evidence analyst.

You receive deterministic cohort metrics comparing customer renewal rates with
and without adoption of each product feature. Application code already owns all
rates, lift, weights, and currency arithmetic. Your only job is to rank the
features and explain the supplied evidence.

Rules:
- Treat the results as observed correlation, never causal attribution.
- Do not invent customers, rates, revenue, usage, or evidence.
- Return every supplied feature exactly once.
- Assign each feature a unique contiguous rank beginning at 1.
- Explain each rank using concrete values from the input.
- Do not calculate or return weights or currency amounts.
- Return only JSON matching RetentionNarrativeProposalSchema.`;

export type RetentionNarrativeResult = {
  proposal: RetentionNarrativeProposal;
  model: string;
};

export type RetentionNarrativeRunner = (
  evidence: RetentionEvidencePacket,
) => Promise<RetentionNarrativeResult>;

export type BuildRetentionImpactOptions = {
  narrativeRunner?: RetentionNarrativeRunner;
  now?: Date | string;
  runId?: string;
  apiKey?: string;
  model?: string;
};

export type CanonicalizeRetentionImpactInput = {
  evidence: RetentionEvidencePacket;
  proposal: unknown;
  runId: string;
  generatedAt: Date | string;
};

function round(value: number): number {
  return Number(value.toFixed(12));
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid retention impact timestamp");
  }
  return date.toISOString();
}

export function computeRetentionEvidence(
  input: SeededRetentionCohort,
): RetentionEvidencePacket {
  const cohort = SeededRetentionCohortSchema.parse(input);
  const customerCount = cohort.customers.length;
  const renewedCustomerCount = cohort.customers.filter(
    (customer) => customer.billing.renewed,
  ).length;
  const totalRetainedRevenueCents = cohort.customers.reduce(
    (total, customer) =>
      total +
      (customer.billing.renewed
        ? customer.billing.contract_value_cents
        : 0),
    0,
  );

  const features = FEATURE_IDS.flatMap((featureId) => {
    const adopters = cohort.customers.filter((customer) =>
      customer.adopted_features.includes(featureId),
    );
    const nonAdopters = cohort.customers.filter(
      (customer) => !customer.adopted_features.includes(featureId),
    );
    if (adopters.length === 0 || nonAdopters.length === 0) {
      return [];
    }
    const adopterRenewedCount = adopters.filter(
      (customer) => customer.billing.renewed,
    ).length;
    const nonAdopterRenewedCount = nonAdopters.filter(
      (customer) => customer.billing.renewed,
    ).length;
    const withRate = adopterRenewedCount / adopters.length;
    const withoutRate = nonAdopterRenewedCount / nonAdopters.length;
    const lift = withRate - withoutRate;

    return [
      {
        feature_id: featureId,
        adopter_count: adopters.length,
        adopter_renewed_count: adopterRenewedCount,
        non_adopter_count: nonAdopters.length,
        non_adopter_renewed_count: nonAdopterRenewedCount,
        renewal_rate_with_feature: round(withRate),
        renewal_rate_without_feature: round(withoutRate),
        observed_retention_lift: round(lift),
        positive_influence_score: round(Math.max(0, lift) * adopters.length),
      },
    ];
  });

  if (features.length === 0) {
    throw new Error(
      "Retention cohort has no feature with both adopters and non-adopters",
    );
  }

  return RetentionEvidencePacketSchema.parse({
    cohort: {
      id: cohort.cohort_id,
      label: cohort.label,
      source: cohort.source,
      customer_count: customerCount,
      renewed_customer_count: renewedCustomerCount,
      total_retained_revenue_cents: totalRetainedRevenueCents,
      currency: cohort.currency,
      observation_window: cohort.observation_window,
    },
    features,
  });
}

export function validateRetentionNarrativeProposal(
  proposal: unknown,
  evidence: RetentionEvidencePacket,
): RetentionNarrativeProposal {
  const parsed = RetentionNarrativeProposalSchema.parse(proposal);
  const expected = new Set(evidence.features.map((feature) => feature.feature_id));
  const received = new Set<FeatureId>();
  const ranks = new Set<number>();

  for (const feature of parsed.features) {
    if (!expected.has(feature.feature_id)) {
      throw new Error(
        `Narrative included a feature without cohort evidence: ${feature.feature_id}`,
      );
    }
    if (received.has(feature.feature_id)) {
      throw new Error(`Narrative duplicated feature: ${feature.feature_id}`);
    }
    if (ranks.has(feature.rank)) {
      throw new Error(`Narrative duplicated rank: ${feature.rank}`);
    }
    received.add(feature.feature_id);
    ranks.add(feature.rank);
  }
  if (received.size !== expected.size) {
    throw new Error("Narrative must include every feature with cohort evidence");
  }
  for (let rank = 1; rank <= parsed.features.length; rank += 1) {
    if (!ranks.has(rank)) {
      throw new Error("Narrative ranks must be contiguous and begin at 1");
    }
  }
  return parsed;
}

export function buildDeterministicRetentionNarrative(
  evidence: RetentionEvidencePacket,
): RetentionNarrativeResult {
  const ranked = [...evidence.features].sort(
    (left, right) =>
      right.positive_influence_score - left.positive_influence_score ||
      right.observed_retention_lift - left.observed_retention_lift ||
      left.feature_id.localeCompare(right.feature_id),
  );
  const proposal = RetentionNarrativeProposalSchema.parse({
    features: ranked.map((feature, index) => ({
      feature_id: feature.feature_id,
      rank: index + 1,
      evidence: [
        `[deterministic-retention-explainer-v1 fallback] ${feature.adopter_renewed_count} of ${feature.adopter_count} adopters renewed`,
        `${feature.non_adopter_renewed_count} of ${feature.non_adopter_count} non-adopters renewed`,
        `Observed retention lift was ${round(feature.observed_retention_lift * 100)} percentage points`,
      ],
      reasoning:
        `${RETENTION_CAUSALITY_NOTICE} Ranked from the supplied positive influence score and observed lift.`,
      confidence: 1,
    })),
  });
  return { proposal, model: "deterministic-retention-explainer-v1" };
}

export async function runRetentionNarrativeAgent(
  evidence: RetentionEvidencePacket,
  options: { apiKey?: string; model?: string } = {},
): Promise<RetentionNarrativeResult> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return buildDeterministicRetentionNarrative(evidence);
  }
  const model = options.model ?? process.env.OPENAI_MODEL ?? "gpt-5-mini";
  const client = new OpenAI({
    apiKey,
    timeout: 15_000,
    maxRetries: 0,
  });
  const response = await client.responses.parse({
    model,
    instructions: RETENTION_NARRATIVE_SYSTEM_PROMPT,
    input: JSON.stringify(evidence),
    text: {
      format: zodTextFormat(
        RetentionNarrativeProposalSchema,
        "retention_narrative_proposal",
      ),
    },
  });
  if (!response.output_parsed) {
    throw new Error("Retention narrative model returned no structured proposal");
  }
  return {
    proposal: validateRetentionNarrativeProposal(
      response.output_parsed,
      evidence,
    ),
    model,
  };
}

export function canonicalizeRetentionImpact({
  evidence: rawEvidence,
  proposal,
  runId,
  generatedAt,
}: CanonicalizeRetentionImpactInput): RetentionImpactEnvelope {
  const evidence = RetentionEvidencePacketSchema.parse(rawEvidence);
  const narrative = validateRetentionNarrativeProposal(proposal, evidence);
  const positiveScoreTotal = evidence.features.reduce(
    (total, feature) => total + feature.positive_influence_score,
    0,
  );
  const weights = new Map<FeatureId, number>(
    evidence.features.map((feature) => [
      feature.feature_id,
      positiveScoreTotal > 0
        ? round(feature.positive_influence_score / positiveScoreTotal)
        : 0,
    ]),
  );
  const cents =
    positiveScoreTotal > 0
      ? apportionCents(
          evidence.cohort.total_retained_revenue_cents,
          evidence.features.map((feature) => ({
            featureId: feature.feature_id,
            weight: feature.positive_influence_score,
          })),
        )
      : evidence.features.map((feature) => ({
          featureId: feature.feature_id,
          amountCents: 0,
        }));
  const narrativeByFeature = new Map(
    narrative.features.map((feature) => [feature.feature_id, feature]),
  );

  const envelope = RetentionImpactEnvelopeSchema.parse({
    schema_version: "retention-impact/v1",
    run_id: runId,
    generated_at: toIso(generatedAt),
    impact: {
      cohort_id: evidence.cohort.id,
      customer_count: evidence.cohort.customer_count,
      renewed_customer_count: evidence.cohort.renewed_customer_count,
      total_retained_revenue_cents:
        evidence.cohort.total_retained_revenue_cents,
      currency: evidence.cohort.currency,
      methodology: "observed-retention-lift-v1",
      causality_notice: RETENTION_CAUSALITY_NOTICE,
      features: evidence.features
        .map((feature) => {
          const explanation = narrativeByFeature.get(feature.feature_id);
          if (!explanation) {
            throw new Error("Validated narrative feature is missing");
          }
          return {
            ...feature,
            normalized_weight: weights.get(feature.feature_id) ?? 0,
            retained_revenue_impact_cents:
              cents.find((item) => item.featureId === feature.feature_id)
                ?.amountCents ?? 0,
            rank: explanation.rank,
            evidence: explanation.evidence,
            reasoning: explanation.reasoning,
            confidence: explanation.confidence,
          };
        })
        .sort((left, right) => left.rank - right.rank),
      unattributed_retained_revenue_cents:
        positiveScoreTotal > 0
          ? 0
          : evidence.cohort.total_retained_revenue_cents,
    },
  });
  const allocated = envelope.impact.features.reduce(
    (total, feature) => total + feature.retained_revenue_impact_cents,
    envelope.impact.unattributed_retained_revenue_cents,
  );
  if (allocated !== envelope.impact.total_retained_revenue_cents) {
    throw new Error("Retention impact does not conserve retained revenue cents");
  }
  return envelope;
}

export async function buildRetentionImpact(
  cohort: SeededRetentionCohort,
  options: BuildRetentionImpactOptions = {},
): Promise<RetentionImpactEnvelope> {
  const evidence = computeRetentionEvidence(cohort);
  const runner =
    options.narrativeRunner ??
    ((packet: RetentionEvidencePacket) =>
      runRetentionNarrativeAgent(packet, {
        apiKey: options.apiKey,
        model: options.model,
      }));
  const { proposal } = await runner(evidence);
  return canonicalizeRetentionImpact({
    evidence,
    proposal,
    runId: options.runId ?? `ret_${randomUUID()}`,
    generatedAt: options.now ?? new Date(),
  });
}
