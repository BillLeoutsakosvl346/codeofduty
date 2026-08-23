export type Route =
  | { tab: "engineers" }
  | { tab: "bounties" }
  | { tab: "bounty"; bountyId: string }
  | { tab: "retention" }
  | { tab: "ownership" }
  | { tab: "attribution" }
  | { tab: "demo" };

export function parseHash(hashValue: string): Route {
  const hash = hashValue.split("?")[0];
  if (hash === "#/engineers") return { tab: "engineers" };
  const bountyMatch = hash.match(/^#\/bounties\/([^/]+)$/);
  if (bountyMatch) return { tab: "bounty", bountyId: bountyMatch[1] };
  if (hash === "#/bounties") return { tab: "bounties" };
  if (hash === "#/retention") return { tab: "retention" };
  if (hash === "#/ownership") return { tab: "ownership" };
  if (hash === "#/attribution") return { tab: "attribution" };
  if (hash === "#/demo") return { tab: "demo" };
  return { tab: "retention" };
}
