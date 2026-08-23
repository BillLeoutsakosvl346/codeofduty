export const FEATURE_IDS = ['search', 'summary', 'sharing'] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

export const FEATURE_ACTIONS: Record<FeatureId, string> = {
  search: 'search_completed',
  summary: 'summary_generated',
  sharing: 'share_link_generated',
};

export const FEATURE_LABELS: Record<FeatureId, string> = {
  search: 'Semantic Search',
  summary: 'AI Summary',
  sharing: 'Team Sharing',
};

export const ACTIVE_SUBSCRIPTION_STATUS = 'active';
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
export const RECENT_DELTA_MS = 24 * 60 * 60 * 1000;
export const OWNERSHIP_SCALE = 1_000_000;

export function isFeatureId(value: string): value is FeatureId {
  return (FEATURE_IDS as readonly string[]).includes(value);
}
