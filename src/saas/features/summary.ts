export function compatibilityInsight<T extends { insight: string }>(profile: T) {
  return profile.insight;
}
