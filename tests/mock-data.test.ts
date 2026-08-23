import { describe, expect, it } from "vitest";

import { bounties, clients, engineers, features, missions } from "../src/data/mock";

describe("ManeMatch dashboard fixtures", () => {
  it("keeps every cross-page customer, feature, and contributor reference valid", () => {
    const clientIds = new Set(clients.map((client) => client.id));
    const featureIds = new Set(features.map((feature) => feature.id));
    const engineerIds = new Set(engineers.map((engineer) => engineer.login));

    for (const feature of features) {
      expect(Object.keys(feature.usageShare).every((clientId) => clientIds.has(clientId))).toBe(true);
      expect(feature.owners.every((ownerId) => engineerIds.has(ownerId))).toBe(true);
    }
    for (const bounty of bounties) {
      expect(featureIds.has(bounty.featureId)).toBe(true);
      expect(bounty.hits.every((hit) => clientIds.has(hit.clientId))).toBe(true);
      if (bounty.claimedBy) expect(engineerIds.has(bounty.claimedBy)).toBe(true);
      expect(bounty.assists.every((engineerId) => engineerIds.has(engineerId))).toBe(true);
    }
    for (const mission of missions) {
      expect(featureIds.has(mission.featureId)).toBe(true);
      if (mission.claimedBy) expect(engineerIds.has(mission.claimedBy)).toBe(true);
    }
  });

  it("uses the same stable feature IDs as PostHog and retention attribution", () => {
    expect(features.map((feature) => feature.id)).toEqual(["search", "summary", "sharing"]);
  });
});
