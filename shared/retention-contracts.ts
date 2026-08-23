import { z } from "zod";

import { FeatureIdSchema } from "./contracts";

export const RetentionBillingOutcomeSchema = z
  .object({
    contract_value_cents: z.number().int().positive(),
    renewed: z.boolean(),
  })
  .strict();

export const RetentionCustomerSchema = z
  .object({
    customer_id: z.string().min(1).max(128),
    adopted_features: z.array(FeatureIdSchema).max(3),
    billing: RetentionBillingOutcomeSchema,
  })
  .strict()
  .superRefine((customer, context) => {
    const unique = new Set(customer.adopted_features);
    if (unique.size !== customer.adopted_features.length) {
      context.addIssue({
        code: "custom",
        path: ["adopted_features"],
        message: "Customer feature adoption must not contain duplicates",
      });
    }
  });

export const SeededRetentionCohortSchema = z
  .object({
    cohort_id: z.string().min(1).max(128),
    label: z.string().min(1).max(200),
    source: z.literal("seeded-demo"),
    currency: z.literal("usd"),
    observation_window: z
      .object({
        start: z.string().datetime(),
        end: z.string().datetime(),
      })
      .strict(),
    customers: z.array(RetentionCustomerSchema).min(2),
  })
  .strict()
  .superRefine((cohort, context) => {
    if (
      new Date(cohort.observation_window.start).getTime() >=
      new Date(cohort.observation_window.end).getTime()
    ) {
      context.addIssue({
        code: "custom",
        path: ["observation_window", "end"],
        message: "Observation window end must be after its start",
      });
    }
    const customerIds = new Set<string>();
    cohort.customers.forEach((customer, index) => {
      if (customerIds.has(customer.customer_id)) {
        context.addIssue({
          code: "custom",
          path: ["customers", index, "customer_id"],
          message: "Customer IDs must be unique within a cohort",
        });
      }
      customerIds.add(customer.customer_id);
    });
  });

export type SeededRetentionCohort = z.infer<
  typeof SeededRetentionCohortSchema
>;

export const RetentionFeatureEvidenceSchema = z
  .object({
    feature_id: FeatureIdSchema,
    adopter_count: z.number().int().positive(),
    adopter_renewed_count: z.number().int().nonnegative(),
    non_adopter_count: z.number().int().positive(),
    non_adopter_renewed_count: z.number().int().nonnegative(),
    renewal_rate_with_feature: z.number().finite().min(0).max(1),
    renewal_rate_without_feature: z.number().finite().min(0).max(1),
    observed_retention_lift: z.number().finite().min(-1).max(1),
    positive_influence_score: z.number().finite().nonnegative(),
  })
  .strict();

export const RetentionEvidencePacketSchema = z
  .object({
    cohort: z
      .object({
        id: z.string().min(1),
        label: z.string().min(1),
        source: z.literal("seeded-demo"),
        customer_count: z.number().int().positive(),
        renewed_customer_count: z.number().int().nonnegative(),
        total_retained_revenue_cents: z.number().int().nonnegative(),
        currency: z.literal("usd"),
        observation_window: z
          .object({
            start: z.string().datetime(),
            end: z.string().datetime(),
          })
          .strict(),
      })
      .strict(),
    features: z.array(RetentionFeatureEvidenceSchema).min(1).max(3),
  })
  .strict();

export type RetentionEvidencePacket = z.infer<
  typeof RetentionEvidencePacketSchema
>;

export const RetentionNarrativeAllocationSchema = z
  .object({
    feature_id: FeatureIdSchema,
    rank: z.number().int().positive().max(3),
    evidence: z.array(z.string().min(1)).min(1).max(5),
    reasoning: z.string().min(1),
    confidence: z.number().finite().min(0).max(1),
  })
  .strict();

export const RetentionNarrativeProposalSchema = z
  .object({
    features: z.array(RetentionNarrativeAllocationSchema).min(1).max(3),
  })
  .strict();

export type RetentionNarrativeProposal = z.infer<
  typeof RetentionNarrativeProposalSchema
>;

export const RetentionFeatureImpactSchema = RetentionFeatureEvidenceSchema.extend(
  {
    normalized_weight: z.number().finite().min(0).max(1),
    retained_revenue_impact_cents: z.number().int().nonnegative(),
    rank: z.number().int().positive().max(3),
    evidence: z.array(z.string().min(1)).min(1).max(5),
    reasoning: z.string().min(1),
    confidence: z.number().finite().min(0).max(1),
  },
).strict();

export const RetentionImpactSchema = z
  .object({
    cohort_id: z.string().min(1),
    customer_count: z.number().int().positive(),
    renewed_customer_count: z.number().int().nonnegative(),
    total_retained_revenue_cents: z.number().int().nonnegative(),
    currency: z.literal("usd"),
    methodology: z.literal("observed-retention-lift-v1"),
    causality_notice: z.literal(
      "Observed cohort correlation; not causal attribution.",
    ),
    features: z.array(RetentionFeatureImpactSchema).min(1).max(3),
    unattributed_retained_revenue_cents: z.number().int().nonnegative(),
  })
  .strict();

export type RetentionImpact = z.infer<typeof RetentionImpactSchema>;

export const RetentionImpactEnvelopeSchema = z
  .object({
    schema_version: z.literal("retention-impact/v1"),
    run_id: z.string().min(1),
    generated_at: z.string().datetime(),
    impact: RetentionImpactSchema,
  })
  .strict();

export type RetentionImpactEnvelope = z.infer<
  typeof RetentionImpactEnvelopeSchema
>;
