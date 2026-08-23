import { readFileSync } from "node:fs";

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it, vi } from "vitest";

import {
  ContributorCatalogSchema,
  FeatureCodeMapSchema,
  OwnershipEventSchema,
} from "../shared/ownership-contracts";
import {
  buildOwnershipMap,
  buildOwnershipTimeline,
  createOwnershipEvent,
  parseContributionManifest,
  validateManifestReferences,
} from "../server/ownership";
import { rememberOwnershipEvent } from "../server/ownership-memory";

const prBody = `## Contribution declaration

<!-- CODE_OF_DUTY_CONTRIBUTION_V1
{
  "schema_version": "pr-contribution/v1",
  "features": ["search"],
  "impact": "feature",
  "contributors": [
    { "contributor_id": "aanishs", "share_bps": 6000, "roles": ["implementation"] },
    { "contributor_id": "bill", "share_bps": 4000, "roles": ["product", "review"] }
  ],
  "summary": "Aanish implemented discovery while Bill defined and reviewed the workflow."
}
CODE_OF_DUTY_CONTRIBUTION_V1 -->`;

const featureMap = FeatureCodeMapSchema.parse(
  JSON.parse(readFileSync("catalog/features.json", "utf8")),
);
const contributorCatalog = ContributorCatalogSchema.parse(
  JSON.parse(readFileSync("catalog/contributors.json", "utf8")),
);

function ledgerEvents() {
  return readFileSync("ledger/ownership-events.jsonl", "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => OwnershipEventSchema.parse(JSON.parse(line)));
}

describe("PR contributor declaration", () => {
  it("parses declared contributors independently of the pusher", () => {
    const manifest = parseContributionManifest(prBody);
    const event = createOwnershipEvent({
      repository: "BillLeoutsakosvl346/codeofduty",
      pullRequestNumber: 104,
      mergeSha: "4".repeat(40),
      mergedAt: "2026-08-23T18:00:00.000Z",
      pusherLogin: "totally-different-pusher",
      approvedBy: "reviewer",
      manifest,
    });
    expect(event.pusher_login).toBe("totally-different-pusher");
    expect(event.manifest.contributors.map((contributor) => contributor.contributor_id)).toEqual([
      "aanishs",
      "bill",
    ]);
  });

  it("rejects malformed shares and multiple contribution blocks", () => {
    expect(() => parseContributionManifest(prBody.replace("4000", "3000"))).toThrow(
      "10000 basis points",
    );
    expect(() => parseContributionManifest(`${prBody}\n${prBody}`)).toThrow(
      "more than one",
    );
  });

  it("requires declared features and contributors to match the catalogs", () => {
    const manifest = parseContributionManifest(prBody);
    expect(() =>
      validateManifestReferences({
        manifest,
        featureMap,
        contributorCatalog,
        changedFiles: ["src/saas/features/search.ts"],
      }),
    ).not.toThrow();
    expect(() =>
      validateManifestReferences({
        manifest,
        featureMap,
        contributorCatalog,
        changedFiles: ["src/saas/features/summary.ts"],
      }),
    ).toThrow("No changed file maps");
  });

  it("matches the checked-in JSON schema", () => {
    const schema = JSON.parse(
      readFileSync("contracts/pr-contribution.v1.schema.json", "utf8"),
    );
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    expect(ajv.compile(schema)(parseContributionManifest(prBody))).toBe(true);
  });
});

describe("ownership accumulated over merged PRs", () => {
  it("moves the map over time without crediting the pusher", () => {
    const timeline = buildOwnershipTimeline(ledgerEvents(), {
      repository: "BillLeoutsakosvl346/codeofduty",
      generatedAt: "2026-08-23T20:00:00.000Z",
    });
    expect(timeline[0].features[0].owners.map((owner) => [owner.contributor_id, owner.ownership_bps])).toEqual([
      ["aanishs", 6000],
      ["bill", 4000],
    ]);
    expect(timeline[1].features[0].owners.map((owner) => [owner.contributor_id, owner.ownership_bps])).toEqual([
      ["aanishs", 5000],
      ["bill", 5000],
    ]);
    expect(timeline[2].features[0].owners.map((owner) => [owner.contributor_id, owner.ownership_bps])).toEqual([
      ["aanishs", 3334],
      ["bill", 3333],
      ["claude", 3333],
    ]);
    expect(timeline.at(-1)?.features[0].owners.some((owner) => owner.contributor_id === "demo-bot")).toBe(false);
  });

  it("deduplicates replayed merge events", () => {
    const events = ledgerEvents();
    const map = buildOwnershipMap([...events, events[0]], {
      repository: "BillLeoutsakosvl346/codeofduty",
      generatedAt: "2026-08-23T20:00:00.000Z",
    });
    expect(map.through_event_count).toBe(3);
    expect(map.features[0].total_contribution_points).toBe(9);
  });
});

describe("claude-mem boundary", () => {
  it("sends only normalized post-merge context and omits raw narrative and pusher identity", async () => {
    const event = ledgerEvents()[0];
    let callCount = 0;
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      callCount += 1;
      if (callCount === 1) {
        expect(String(_url)).toContain("/api/sessions/init");
        expect(payload.contentSessionId).toBe(`codeofduty-ownership-${event.merge_sha}`);
        expect(payload.prompt).not.toContain(event.manifest.summary);
        return new Response(JSON.stringify({ status: "initialized" }), { status: 200 });
      }
      expect(String(_url)).toContain("/api/sessions/observations");
      expect(payload.tool_input.summary).toBeUndefined();
      expect(payload.tool_input.pusher_login).toBeUndefined();
      expect(payload.tool_input.contributors).toEqual(event.manifest.contributors);
      expect(payload.contentSessionId).toBe(`codeofduty-ownership-${event.merge_sha}`);
      expect(payload.claudeSessionId).toBeUndefined();
      return new Response(JSON.stringify({ status: "queued" }), { status: 200 });
    });
    await expect(
      rememberOwnershipEvent(event, { fetchImpl, workerPort: 39999 }),
    ).resolves.toEqual({ status: "queued" });
  });

  it("does not block ownership when claude-mem is unavailable", async () => {
    const result = await rememberOwnershipEvent(ledgerEvents()[0], {
      fetchImpl: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    expect(result).toEqual({ status: "unavailable", reason: "offline" });
  });

  it("returns the worker validation response when a request is rejected", async () => {
    let callCount = 0;
    const result = await rememberOwnershipEvent(ledgerEvents()[0], {
      fetchImpl: vi.fn(async () => {
        callCount += 1;
        return callCount === 1
          ? new Response(JSON.stringify({ status: "initialized" }), { status: 200 })
          : new Response(JSON.stringify({ error: "ValidationError" }), { status: 400 });
      }),
    });
    expect(result).toEqual({
      status: "unavailable",
      reason: 'worker returned HTTP 400: {"error":"ValidationError"}',
    });
  });
});
