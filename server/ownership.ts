import {
  CONTRIBUTION_BLOCK_END,
  CONTRIBUTION_BLOCK_START,
  IMPACT_POINTS,
  OwnershipEventSchema,
  OwnershipMapSchema,
  PrContributionManifestSchema,
  type ContributorCatalog,
  type FeatureCodeMap,
  type OwnershipEvent,
  type OwnershipMap,
  type PrContributionManifest,
} from "../shared/ownership-contracts.js";

function pathMatches(pattern: string, filePath: string): boolean {
  if (!pattern.includes("*")) return pattern === filePath;
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${escaped}$`).test(filePath);
}

export function parseContributionManifest(body: string): PrContributionManifest {
  const start = body.indexOf(CONTRIBUTION_BLOCK_START);
  const end = body.indexOf(CONTRIBUTION_BLOCK_END);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("PR description is missing the Code of Duty contribution block");
  }
  if (body.indexOf(CONTRIBUTION_BLOCK_START, start + 1) !== -1) {
    throw new Error("PR description contains more than one contribution block");
  }

  const rawJson = body
    .slice(start + CONTRIBUTION_BLOCK_START.length, end)
    .trim();
  let candidate: unknown;
  try {
    candidate = JSON.parse(rawJson);
  } catch {
    throw new Error("Code of Duty contribution block is not valid JSON");
  }
  return PrContributionManifestSchema.parse(candidate);
}

export function createOwnershipEvent(input: {
  repository: string;
  pullRequestNumber: number;
  mergeSha: string;
  mergedAt: string;
  pusherLogin: string;
  approvedBy: string;
  manifest: PrContributionManifest;
  greptile?: { status: "verified" | "flagged" | "not_available"; review_id?: string };
}): OwnershipEvent {
  return OwnershipEventSchema.parse({
    schema_version: "ownership-event/v1",
    event_id: `github:${input.repository}#${input.pullRequestNumber}@${input.mergeSha}`,
    repository: input.repository,
    pull_request_number: input.pullRequestNumber,
    merge_sha: input.mergeSha,
    merged_at: input.mergedAt,
    pusher_login: input.pusherLogin,
    approved_by: input.approvedBy,
    manifest: input.manifest,
    impact_points: IMPACT_POINTS[input.manifest.impact],
    greptile: input.greptile ?? { status: "not_available" },
  });
}

export function validateManifestReferences(input: {
  manifest: PrContributionManifest;
  featureMap: FeatureCodeMap;
  contributorCatalog: ContributorCatalog;
  changedFiles: string[];
}): void {
  const knownContributors = new Set(
    input.contributorCatalog.contributors.map(
      (contributor) => contributor.contributor_id,
    ),
  );
  for (const contributor of input.manifest.contributors) {
    if (!knownContributors.has(contributor.contributor_id)) {
      throw new Error(`Unknown contributor_id: ${contributor.contributor_id}`);
    }
  }

  const features = new Map(
    input.featureMap.features.map((feature) => [feature.feature_id, feature]),
  );
  for (const featureId of input.manifest.features) {
    const feature = features.get(featureId);
    if (!feature) throw new Error(`Unknown feature_id: ${featureId}`);
    if (
      input.changedFiles.length > 0 &&
      !input.changedFiles.some((filePath) =>
        feature.paths.some((pattern) => pathMatches(pattern, filePath)),
      )
    ) {
      throw new Error(`No changed file maps to declared feature_id: ${featureId}`);
    }
  }

  for (const feature of input.featureMap.features) {
    const changed = input.changedFiles.some((filePath) =>
      feature.paths.some((pattern) => pathMatches(pattern, filePath)),
    );
    if (changed && !input.manifest.features.includes(feature.feature_id)) {
      throw new Error(`Changed files map to undeclared feature_id: ${feature.feature_id}`);
    }
  }
}

function allocateBasisPoints(
  weights: Array<{ id: string; units: number }>,
): Map<string, number> {
  const total = weights.reduce((sum, item) => sum + item.units, 0);
  if (total <= 0) return new Map();
  const allocations = weights.map((item) => {
    const exact = (item.units * 10_000) / total;
    const floor = Math.floor(exact);
    return { ...item, bps: floor, remainder: exact - floor };
  });
  let remaining = 10_000 - allocations.reduce((sum, item) => sum + item.bps, 0);
  allocations.sort(
    (left, right) =>
      right.remainder - left.remainder || left.id.localeCompare(right.id),
  );
  for (let index = 0; index < remaining; index += 1) {
    allocations[index % allocations.length].bps += 1;
  }
  return new Map(allocations.map((item) => [item.id, item.bps]));
}

export function buildOwnershipMap(
  rawEvents: OwnershipEvent[],
  options: { repository: string; generatedAt?: string },
): OwnershipMap {
  const events = rawEvents.map((event) => OwnershipEventSchema.parse(event));
  const eventIds = new Set<string>();
  const featureUnits = new Map<string, Map<string, number>>();

  for (const event of events) {
    if (event.repository !== options.repository) continue;
    if (eventIds.has(event.event_id)) continue;
    eventIds.add(event.event_id);
    for (const featureId of event.manifest.features) {
      const contributors = featureUnits.get(featureId) ?? new Map<string, number>();
      for (const contributor of event.manifest.contributors) {
        const units = event.impact_points * contributor.share_bps;
        contributors.set(
          contributor.contributor_id,
          (contributors.get(contributor.contributor_id) ?? 0) + units,
        );
      }
      featureUnits.set(featureId, contributors);
    }
  }

  const features = [...featureUnits.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([featureId, contributors]) => {
      const weights = [...contributors.entries()].map(([id, units]) => ({ id, units }));
      const bps = allocateBasisPoints(weights);
      const owners = weights
        .map(({ id, units }) => ({
          contributor_id: id,
          contribution_points: units / 10_000,
          ownership_bps: bps.get(id) ?? 0,
          ownership_share: (bps.get(id) ?? 0) / 10_000,
        }))
        .sort(
          (left, right) =>
            right.ownership_bps - left.ownership_bps ||
            left.contributor_id.localeCompare(right.contributor_id),
        );
      return {
        feature_id: featureId,
        total_contribution_points: weights.reduce((sum, item) => sum + item.units, 0) / 10_000,
        owners,
      };
    });

  return OwnershipMapSchema.parse({
    schema_version: "feature-ownership/v1",
    repository: options.repository,
    generated_at: options.generatedAt ?? new Date().toISOString(),
    through_event_count: eventIds.size,
    features,
  });
}

export function buildOwnershipTimeline(
  events: OwnershipEvent[],
  options: { repository: string; generatedAt?: string },
): OwnershipMap[] {
  return events.map((_, index) =>
    buildOwnershipMap(events.slice(0, index + 1), options),
  );
}
