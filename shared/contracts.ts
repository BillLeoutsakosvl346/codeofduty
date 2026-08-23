import { z } from "zod";

export const FEATURE_ACTIONS = {
  search: "search_completed",
  summary: "summary_generated",
  sharing: "share_link_generated",
} as const;

export const FeatureIdSchema = z.enum(["search", "summary", "sharing"]);
export type FeatureId = z.infer<typeof FeatureIdSchema>;

export const UsageEventInputSchema = z
  .object({
    usageEventId: z.string().uuid(),
    userId: z.string().min(1).max(128),
    featureId: FeatureIdSchema,
    action: z.string().min(1).max(128),
    sessionId: z.string().uuid(),
  })
  .strict()
  .superRefine((value, context) => {
    if (FEATURE_ACTIONS[value.featureId] !== value.action) {
      context.addIssue({
        code: "custom",
        path: ["action"],
        message: `Action does not match feature ${value.featureId}`,
      });
    }
  });

export type UsageEventInput = z.infer<typeof UsageEventInputSchema>;

export const FeatureEvidenceSchema = z
  .object({
    feature_id: FeatureIdSchema,
    successful_uses: z.number().int().positive(),
    unique_sessions: z.number().int().positive(),
    last_used_at: z.string().datetime(),
  })
  .strict();

export const AttributionEvidenceSchema = z
  .object({
    payment: z
      .object({
        id: z.string().min(1),
        user_id: z.string().min(1),
        amount_cents: z.literal(10_000),
        currency: z.literal("usd"),
        paid_at: z.string().datetime(),
      })
      .strict(),
    attribution_window: z
      .object({
        start: z.string().datetime(),
        end: z.string().datetime(),
      })
      .strict(),
    features: z.array(FeatureEvidenceSchema).min(1).max(3),
  })
  .strict();

export type AttributionEvidence = z.infer<typeof AttributionEvidenceSchema>;

export const AgentAllocationProposalSchema = z
  .object({
    feature_id: FeatureIdSchema,
    weight: z.number().finite().min(0).max(1),
    evidence: z.array(z.string().min(1)).min(1).max(5),
    reasoning: z.string().min(1),
    confidence: z.number().finite().min(0).max(1),
  })
  .strict();

export const AgentProposalSchema = z
  .object({
    allocations: z.array(AgentAllocationProposalSchema).min(1).max(3),
  })
  .strict();

export type AgentProposal = z.infer<typeof AgentProposalSchema>;

export const RevenueImpactAllocationSchema = z
  .object({
    feature_id: FeatureIdSchema,
    weight: z.number().finite().min(0).max(1),
    revenue_impact_cents: z.number().int().nonnegative(),
    evidence: z.array(z.string().min(1)).min(1).max(5),
    reasoning: z.string().min(1),
    confidence: z.number().finite().min(0).max(1),
  })
  .strict();

export const RevenueImpactSchema = z
  .object({
    payment_id: z.string().min(1),
    user_id: z.string().min(1),
    total_revenue_cents: z.literal(10_000),
    currency: z.literal("usd"),
    attribution_model: z.literal("agent-usage-v1"),
    attribution_window_days: z.literal(7),
    allocations: z.array(RevenueImpactAllocationSchema).min(1).max(3),
    unattributed_revenue_cents: z.literal(0),
  })
  .strict();

export type RevenueImpact = z.infer<typeof RevenueImpactSchema>;

export const RevenueImpactEnvelopeSchema = z
  .object({
    schema_version: z.literal("revenue-impact/v1"),
    run_id: z.string().min(1),
    generated_at: z.string().datetime(),
    impact: RevenueImpactSchema,
  })
  .strict();

export type RevenueImpactEnvelope = z.infer<
  typeof RevenueImpactEnvelopeSchema
>;

export const UsageTotalsSchema = z.record(FeatureIdSchema, z.number().int().nonnegative());

export const UsageResponseSchema = z
  .object({
    eventId: z.string().uuid(),
    duplicate: z.boolean(),
    mirroredEventCount: z.number().int().nonnegative(),
    totals: UsageTotalsSchema,
  })
  .strict();

export type UsageResponse = z.infer<typeof UsageResponseSchema>;

export const BaselineAllocationSchema = z
  .object({
    feature_id: FeatureIdSchema,
    weight: z.number().finite().min(0).max(1),
  })
  .strict();

export type BaselineAllocation = z.infer<typeof BaselineAllocationSchema>;

export type ImpactStatusResponse =
  | {
      status: "completed";
      data: RevenueImpactEnvelope;
      model: string;
      baseline: BaselineAllocation[];
    }
  | { status: "pending" }
  | { status: "not_found" }
  | { status: "error"; error: string };
