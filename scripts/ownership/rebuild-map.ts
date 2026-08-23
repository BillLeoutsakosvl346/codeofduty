import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { OwnershipEventSchema } from "../../shared/ownership-contracts.js";
import { buildOwnershipMap } from "../../server/ownership.js";

function argument(name: string, fallback?: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? fallback : process.argv[index + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const ledgerPath = resolve(argument("--ledger", "ledger/ownership-events.jsonl"));
const outputPath = resolve(argument("--output", "generated/ownership-map.json"));
const repository = argument("--repository", "BillLeoutsakosvl346/codeofduty");
const raw = readFileSync(ledgerPath, "utf8").trim();
const events = raw
  ? raw.split(/\r?\n/).map((line) => OwnershipEventSchema.parse(JSON.parse(line)))
  : [];
const generatedAt = events.at(-1)?.merged_at ?? new Date().toISOString();
const map = buildOwnershipMap(events, { repository, generatedAt });
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(map, null, 2)}\n`, "utf8");
process.stdout.write(`Rebuilt ${map.features.length} feature ownership map(s) from ${map.through_event_count} event(s)\n`);
