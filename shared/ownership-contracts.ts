import { z } from "zod";

export const CONTRIBUTION_BLOCK_START = "<!-- CODE_OF_DUTY_CONTRIBUTION_V1";
export const CONTRIBUTION_BLOCK_END = "CODE_OF_DUTY_CONTRIBUTION_V1 -->";

export const ContributionRoleSchema = z.enum([
  "architecture",
  "implementation",
  "product",
  "review",
  "testing",
]);

export const ContributionImpactSchema = z.enum([
  "patch",
  "feature",
  "foundation",
]);

export const IMPACT_POINTS = {
  patch: 1,
  feature: 3,
  foundation: 5,
} as const;

export const DeclaredContributorSchema = z
  .object({
    contributor_id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}$/),
    share_bps: z.number().int().min(1).max(10_000),
    roles: z.array(ContributionRoleSchema).min(1).max(5),
  })
  .strict();

export const PrContributionManifestSchema = z
  .object({
    schema_version: z.literal("pr-contribution/v1"),
    features: z
      .array(z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/))
      .min(1)
      .max(3),
    impact: ContributionImpactSchema,
    contributors: z.array(DeclaredContributorSchema).min(1).max(12),
    summary: z.string().trim().min(12).max(280),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (new Set(manifest.features).size !== manifest.features.length) {
      context.addIssue({ code: "custom", message: "Feature IDs must be unique" });
    }
    const contributorIds = manifest.contributors.map(
      (contributor) => contributor.contributor_id,
    );
    if (new Set(contributorIds).size !== contributorIds.length) {
      context.addIssue({ code: "custom", message: "Contributor IDs must be unique" });
    }
    const totalShare = manifest.contributors.reduce(
      (sum, contributor) => sum + contributor.share_bps,
      0,
    );
    if (totalShare !== 10_000) {
      context.addIssue({
        code: "custom",
        message: `Contributor shares must total 10000 basis points; received ${totalShare}`,
      });
    }
  });

export type PrContributionManifest = z.infer<
  typeof PrContributionManifestSchema
>;

export const OwnershipEventSchema = z
  .object({
    schema_version: z.literal("ownership-event/v1"),
    event_id: z.string().min(1).max(240),
    repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
    pull_request_number: z.number().int().positive(),
    merge_sha: z.string().regex(/^[a-f0-9]{40}$/),
    merged_at: z.string().datetime(),
    pusher_login: z.string().min(1).max(80),
    approved_by: z.string().min(1).max(80),
    manifest: PrContributionManifestSchema,
    impact_points: z.number().int().positive(),
    greptile: z
      .object({
        status: z.enum(["verified", "flagged", "not_available"]),
        review_id: z.string().min(1).max(160).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((event, context) => {
    if (event.impact_points !== IMPACT_POINTS[event.manifest.impact]) {
      context.addIssue({
        code: "custom",
        message: "impact_points must match the deterministic impact class",
      });
    }
  });

export type OwnershipEvent = z.infer<typeof OwnershipEventSchema>;

export const OwnershipShareSchema = z
  .object({
    contributor_id: z.string(),
    contribution_points: z.number().nonnegative(),
    ownership_bps: z.number().int().min(0).max(10_000),
    ownership_share: z.number().min(0).max(1),
  })
  .strict();

export const FeatureOwnershipSchema = z
  .object({
    feature_id: z.string(),
    total_contribution_points: z.number().positive(),
    owners: z.array(OwnershipShareSchema).min(1),
  })
  .strict()
  .superRefine((feature, context) => {
    const bps = feature.owners.reduce(
      (sum, owner) => sum + owner.ownership_bps,
      0,
    );
    if (bps !== 10_000) {
      context.addIssue({ code: "custom", message: "Ownership must total 10000 basis points" });
    }
  });

export const OwnershipMapSchema = z
  .object({
    schema_version: z.literal("feature-ownership/v1"),
    repository: z.string(),
    generated_at: z.string().datetime(),
    through_event_count: z.number().int().nonnegative(),
    features: z.array(FeatureOwnershipSchema),
  })
  .strict();

export type OwnershipMap = z.infer<typeof OwnershipMapSchema>;

export const FeatureCodeMapSchema = z
  .object({
    schema_version: z.literal("feature-code-map/v1"),
    features: z
      .array(
        z
          .object({
            feature_id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
            name: z.string().min(1).max(120),
            paths: z.array(z.string().min(1)).min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const ContributorCatalogSchema = z
  .object({
    schema_version: z.literal("contributors/v1"),
    contributors: z
      .array(
        z
          .object({
            contributor_id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}$/),
            display_name: z.string().min(1).max(120),
            github_login: z.string().min(1).max(80).nullable(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type FeatureCodeMap = z.infer<typeof FeatureCodeMapSchema>;
export type ContributorCatalog = z.infer<typeof ContributorCatalogSchema>;
