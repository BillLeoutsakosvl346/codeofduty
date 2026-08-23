import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ContributorCatalogSchema,
  FeatureCodeMapSchema,
} from "../../shared/ownership-contracts.js";
import {
  parseContributionManifest,
  validateManifestReferences,
} from "../../server/ownership.js";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const eventPath = process.env.GITHUB_EVENT_PATH;
const bodyFile = argument("--body-file");
const changedFilesPath = argument("--changed-files");
if (!eventPath && !bodyFile) {
  throw new Error("Provide GITHUB_EVENT_PATH or --body-file <path>");
}

const body = bodyFile
  ? readFileSync(resolve(bodyFile), "utf8")
  : (() => {
      const event = JSON.parse(readFileSync(resolve(eventPath!), "utf8")) as {
        pull_request?: { body?: string | null };
      };
      return event.pull_request?.body ?? "";
    })();
const changedFiles = changedFilesPath
  ? readFileSync(resolve(changedFilesPath), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  : [];

const manifest = parseContributionManifest(body);
const featureMap = FeatureCodeMapSchema.parse(
  JSON.parse(readFileSync("catalog/features.json", "utf8")),
);
const contributorCatalog = ContributorCatalogSchema.parse(
  JSON.parse(readFileSync("catalog/contributors.json", "utf8")),
);
validateManifestReferences({
  manifest,
  featureMap,
  contributorCatalog,
  changedFiles,
});

process.stdout.write(
  `Valid contribution manifest: ${manifest.features.join(", ")} · ${manifest.contributors.length} contributor(s) · ${manifest.impact}\n`,
);
