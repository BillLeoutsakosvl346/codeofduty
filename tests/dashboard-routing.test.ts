import { describe, expect, it } from "vitest";

import { parseHash } from "../src/dashboard-routing";

describe("dashboard hash routing", () => {
  it("opens bounty intelligence on its detail route", () => {
    expect(parseHash("#/bounties/b-305")).toEqual({ tab: "bounty", bountyId: "b-305" });
    expect(parseHash("#/bounties")).toEqual({ tab: "bounties" });
  });

  it("returns legacy and unknown dashboard links to Impact", () => {
    expect(parseHash("#/overview")).toEqual({ tab: "retention" });
    expect(parseHash("#/unknown")).toEqual({ tab: "retention" });
  });
});
