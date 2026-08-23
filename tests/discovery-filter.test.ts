import { describe, expect, it } from "vitest";

import { filterDiscoveryProfiles } from "../src/saas/features/search";

const horses = [
  { name: "Sienna", disciplines: ["Dressage", "Trail"], temperament: "Gentle · Curious · Steady" },
  { name: "Atlas", disciplines: ["Jumping", "Equitation"], temperament: "Bold · Focused · Athletic" },
];

describe("Horse Discovery filters", () => {
  it("returns the full deck when every filter is cleared", () => {
    expect(filterDiscoveryProfiles(horses, {})).toEqual(horses);
    expect(filterDiscoveryProfiles(horses, { disciplines: [], temperament: null })).toEqual(horses);
  });

  it("continues to filter by rider preferences", () => {
    expect(filterDiscoveryProfiles(horses, { disciplines: ["Trail"] }).map((horse) => horse.name)).toEqual(["Sienna"]);
    expect(filterDiscoveryProfiles(horses, { temperament: "focused" }).map((horse) => horse.name)).toEqual(["Atlas"]);
  });
});
