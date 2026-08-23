import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { rememberOwnershipEvent } from "../../server/ownership-memory.js";
import { OwnershipEventSchema } from "../../shared/ownership-contracts.js";

const eventIdIndex = process.argv.indexOf("--event-id");
const eventId = eventIdIndex === -1 ? undefined : process.argv[eventIdIndex + 1];
const ledgerPath = resolve("ledger/ownership-events.jsonl");
const events = readFileSync(ledgerPath, "utf8")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => OwnershipEventSchema.parse(JSON.parse(line)));
const event = eventId
  ? events.find((candidate) => candidate.event_id === eventId)
  : events.at(-1);
if (!event) throw new Error("No ownership event found to remember");
const result = await rememberOwnershipEvent(event);
process.stdout.write(`${JSON.stringify(result)}\n`);
if (result.status === "unavailable") process.exitCode = 2;
