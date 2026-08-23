export function stableProfileUrl(origin: string, slug: string) {
  return `${origin.replace(/\/$/, "")}/#/stable/${encodeURIComponent(slug)}`;
}
