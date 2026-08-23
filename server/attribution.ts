import { randomUUID } from "node:crypto";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import {
  AgentProposalSchema,
  AttributionEvidenceSchema,
  RevenueImpactEnvelopeSchema,
  type AgentProposal,
  type AttributionEvidence,
  type FeatureId,
  type RevenueImpactEnvelope,
} from "../shared/contracts";
import {
  getRevenueEventByStripeSessionId,
  getRevenueImpactRunByRevenueEventId,
  insertRevenueImpactRun,
  type RevenueEvent,
  type SqliteDatabase,
} from "./db";

const ATTRIBUTION_WINDOW_DAYS = 7;
const ATTRIBUTION_WINDOW_MS =
  ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1_000;
const FEATURE_IDS: readonly FeatureId[] = ["search", "summary", "sharing"];

export const ATTRIBUTION_SYSTEM_PROMPT = `You are a revenue attribution agent.

You receive one completed payment and aggregated evidence describing which
product features the customer successfully used before paying.

Assign relative revenue-impact weights based only on the supplied evidence.
Consider successful-use frequency, unique sessions, recency, and whether usage
suggests completion of a meaningful workflow.

Rules:
- Do not invent feature usage or evidence.
- Do not include a feature that has no supplied evidence.
- Return each evidenced feature at most once.
- Weights must be finite numbers between 0 and 1.
- At least one weight must be positive.
- Explain every allocation using concrete facts from the input.
- Do not calculate or return currency amounts or revenue cents.
- Return only JSON matching AgentProposalSchema.`;

type EvidenceRow = {
  feature_id: FeatureId;
  successful_uses: number;
  unique_sessions: number;
  last_used_at: string;
};

export type BaselineAllocation = {
  feature_id: FeatureId;
  weight: number;
};

export type CentAllocationInput = {
  featureId: FeatureId;
  weight: number;
};

export type CentAllocation = {
  featureId: FeatureId;
  amountCents: number;
};

export type AttributionProposalResult = {
  proposal: AgentProposal;
  model: string;
};

export type AttributionProposalRunner = (
  evidence: AttributionEvidence,
) => Promise<AttributionProposalResult>;

export type EnsureRevenueImpactOptions = {
  proposalRunner?: AttributionProposalRunner;
  now?: Date | string;
  apiKey?: string;
  model?: string;
};

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid timestamp");
  }
  return date.toISOString();
}

export function buildAttributionEvidence(
  db: SqliteDatabase,
  revenue: RevenueEvent,
): AttributionEvidence {
  const paidAt = new Date(revenue.createdAt);
  if (Number.isNaN(paidAt.getTime())) {
    throw new Error("Revenue event has an invalid timestamp");
  }
  const windowStart = new Date(paidAt.getTime() - ATTRIBUTION_WINDOW_MS);

  const rows = db
    .prepare(
      `SELECT
         feature_id,
         COUNT(*) AS successful_uses,
         COUNT(DISTINCT session_id) AS unique_sessions,
         MAX(created_at) AS last_used_at
       FROM feature_usage_events
       WHERE user_id = ?
         AND created_at >= ?
         AND created_at <= ?
       GROUP BY feature_id
       ORDER BY CASE feature_id
         WHEN 'search' THEN 1
         WHEN 'summary' THEN 2
         WHEN 'sharing' THEN 3
       END`,
    )
    .all(
      revenue.userId,
      windowStart.toISOString(),
      paidAt.toISOString(),
    ) as EvidenceRow[];

  return AttributionEvidenceSchema.parse({
    payment: {
      id: revenue.stripeSessionId,
      user_id: revenue.userId,
      amount_cents: revenue.amountCents,
      currency: revenue.currency,
      paid_at: paidAt.toISOString(),
    },
    attribution_window: {
      start: windowStart.toISOString(),
      end: paidAt.toISOString(),
    },
    features: rows,
  });
}

export function calculateDeterministicBaseline(
  evidence: AttributionEvidence,
): BaselineAllocation[] {
  const sessionTotal = evidence.features.reduce(
    (sum, feature) => sum + feature.unique_sessions,
    0,
  );
  if (sessionTotal <= 0) {
    throw new Error("Cannot build baseline without feature sessions");
  }
  return evidence.features.map((feature) => ({
    feature_id: feature.feature_id,
    weight: feature.unique_sessions / sessionTotal,
  }));
}

export function apportionCents(
  totalCents: number,
  weightedFeatures: readonly CentAllocationInput[],
): CentAllocation[] {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error("Total cents must be a nonnegative integer");
  }
  if (weightedFeatures.length === 0) {
    throw new Error("At least one weighted feature is required");
  }

  const seen = new Set<FeatureId>();
  let weightTotal = 0;
  for (const item of weightedFeatures) {
    if (seen.has(item.featureId)) {
      throw new Error(`Duplicate feature weight: ${item.featureId}`);
    }
    seen.add(item.featureId);
    if (!Number.isFinite(item.weight) || item.weight < 0) {
      throw new Error(`Invalid feature weight: ${item.featureId}`);
    }
    weightTotal += item.weight;
  }
  if (!Number.isFinite(weightTotal) || weightTotal <= 0) {
    throw new Error("At least one feature weight must be positive");
  }

  const working = weightedFeatures.map((item, index) => {
    const exact = (totalCents * item.weight) / weightTotal;
    const floor = Math.floor(exact);
    return {
      ...item,
      index,
      amountCents: floor,
      remainder: exact - floor,
    };
  });
  let centsLeft =
    totalCents - working.reduce((sum, item) => sum + item.amountCents, 0);
  const remainderOrder = [...working].sort(
    (a, b) =>
      b.remainder - a.remainder || a.featureId.localeCompare(b.featureId),
  );
  for (let index = 0; index < centsLeft; index += 1) {
    remainderOrder[index % remainderOrder.length].amountCents += 1;
  }
  centsLeft = 0;

  return working
    .sort((a, b) => a.index - b.index)
    .map(({ featureId, amountCents }) => ({ featureId, amountCents }));
}

export function validateAgentProposal(
  proposal: unknown,
  evidence: AttributionEvidence,
): AgentProposal {
  const parsed = AgentProposalSchema.parse(proposal);
  const evidenced = new Set(evidence.features.map((item) => item.feature_id));
  const seen = new Set<FeatureId>();
  let weightTotal = 0;

  for (const allocation of parsed.allocations) {
    if (!evidenced.has(allocation.feature_id)) {
      throw new Error(
        `Agent attributed a feature without evidence: ${allocation.feature_id}`,
      );
    }
    if (seen.has(allocation.feature_id)) {
      throw new Error(`Agent returned duplicate feature: ${allocation.feature_id}`);
    }
    seen.add(allocation.feature_id);
    weightTotal += allocation.weight;
  }
  if (!Number.isFinite(weightTotal) || weightTotal <= 0) {
    throw new Error("Agent returned no positive attribution weights");
  }
  return parsed;
}

export type CanonicalizeRevenueImpactInput = {
  runId: string;
  generatedAt: Date | string;
  revenue: RevenueEvent;
  evidence: AttributionEvidence;
  proposal: unknown;
};

export function canonicalizeRevenueImpact({
  runId,
  generatedAt,
  revenue,
  evidence,
  proposal,
}: CanonicalizeRevenueImpactInput): RevenueImpactEnvelope {
  const validProposal = validateAgentProposal(proposal, evidence);
  const weightTotal = validProposal.allocations.reduce(
    (sum, allocation) => sum + allocation.weight,
    0,
  );
  const normalized = validProposal.allocations.map((allocation) => ({
    ...allocation,
    weight: Number((allocation.weight / weightTotal).toFixed(12)),
  }));
  const cents = apportionCents(
    revenue.amountCents,
    normalized.map((allocation) => ({
      featureId: allocation.feature_id,
      weight: allocation.weight,
    })),
  );

  const envelope = RevenueImpactEnvelopeSchema.parse({
    schema_version: "revenue-impact/v1",
    run_id: runId,
    generated_at: toIso(generatedAt),
    impact: {
      payment_id: revenue.stripeSessionId,
      user_id: revenue.userId,
      total_revenue_cents: revenue.amountCents,
      currency: revenue.currency,
      attribution_model: "agent-usage-v1",
      attribution_window_days: ATTRIBUTION_WINDOW_DAYS,
      allocations: normalized.map((allocation) => ({
        ...allocation,
        revenue_impact_cents:
          cents.find((item) => item.featureId === allocation.feature_id)
            ?.amountCents ?? 0,
      })),
      unattributed_revenue_cents: 0,
    },
  });

  const allocatedCents = envelope.impact.allocations.reduce(
    (sum, allocation) => sum + allocation.revenue_impact_cents,
    0,
  );
  if (
    allocatedCents + envelope.impact.unattributed_revenue_cents !==
    envelope.impact.total_revenue_cents
  ) {
    throw new Error("Revenue allocation does not conserve payment cents");
  }
  return envelope;
}

export function buildDeterministicFallback(
  evidence: AttributionEvidence,
): AttributionProposalResult {
  const byFeature = new Map(
    evidence.features.map((feature) => [feature.feature_id, feature]),
  );
  const proposal = AgentProposalSchema.parse({
    allocations: calculateDeterministicBaseline(evidence).map((baseline) => {
      const feature = byFeature.get(baseline.feature_id);
      if (!feature) {
        throw new Error("Baseline feature is missing evidence");
      }
      return {
        feature_id: baseline.feature_id,
        weight: baseline.weight,
        evidence: [
          `[deterministic-baseline-v1 fallback] Used successfully ${feature.successful_uses} time${feature.successful_uses === 1 ? "" : "s"}`,
          `Used across ${feature.unique_sessions} unique session${feature.unique_sessions === 1 ? "" : "s"}`,
        ],
        reasoning:
          "Development fallback: weight equals this feature's unique sessions divided by total unique feature sessions.",
        confidence: 1,
      };
    }),
  });
  return { proposal, model: "deterministic-baseline-v1" };
}

export async function runAttributionAgent(
  evidence: AttributionEvidence,
  options: { apiKey?: string; model?: string } = {},
): Promise<AttributionProposalResult> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return buildDeterministicFallback(evidence);
  }

  const model = options.model ?? process.env.OPENAI_MODEL ?? "gpt-5-mini";
  const client = new OpenAI({
    apiKey,
    timeout: 15_000,
    maxRetries: 0,
  });
  const response = await client.responses.parse({
    model,
    instructions: ATTRIBUTION_SYSTEM_PROMPT,
    input: JSON.stringify(evidence),
    text: {
      format: zodTextFormat(AgentProposalSchema, "revenue_impact_proposal"),
    },
  });
  if (!response.output_parsed) {
    throw new Error("Attribution model returned no structured proposal");
  }
  return {
    proposal: validateAgentProposal(response.output_parsed, evidence),
    model,
  };
}

export async function ensureRevenueImpact(
  db: SqliteDatabase,
  revenueOrStripeSessionId: RevenueEvent | string,
  options: EnsureRevenueImpactOptions = {},
): Promise<RevenueImpactEnvelope> {
  const revenue =
    typeof revenueOrStripeSessionId === "string"
      ? getRevenueEventByStripeSessionId(db, revenueOrStripeSessionId)
      : revenueOrStripeSessionId;
  if (!revenue) {
    throw new Error("Payment has not been received");
  }

  const existing = getRevenueImpactRunByRevenueEventId(db, revenue.id);
  if (existing) {
    return RevenueImpactEnvelopeSchema.parse(existing.outputJson);
  }

  const evidence = buildAttributionEvidence(db, revenue);
  const runner =
    options.proposalRunner ??
    ((packet: AttributionEvidence) =>
      runAttributionAgent(packet, {
        apiKey: options.apiKey,
        model: options.model,
      }));
  const { proposal, model } = await runner(evidence);
  const generatedAt = toIso(options.now ?? new Date());
  const runId = `rir_${randomUUID()}`;
  const output = canonicalizeRevenueImpact({
    runId,
    generatedAt,
    revenue,
    evidence,
    proposal,
  });
  const { run } = insertRevenueImpactRun(db, {
    id: runId,
    revenueEventId: revenue.id,
    model,
    inputJson: evidence,
    outputJson: output,
    createdAt: generatedAt,
  });

  return RevenueImpactEnvelopeSchema.parse(run.outputJson);
}

export function isFeatureId(value: string): value is FeatureId {
  return FEATURE_IDS.includes(value as FeatureId);
}
