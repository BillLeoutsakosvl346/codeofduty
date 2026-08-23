import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import dotenv from "dotenv";
import Stripe from "stripe";
import {
  calculateDeterministicBaseline,
  ensureRevenueImpact as ensureStoredRevenueImpact,
} from "./attribution.js";
import { createApp, type ApiRepository } from "./app.js";
import {
  createDatabase,
  getDistinctFeatureCount,
  getRevenueEventByStripeSessionId,
  getRevenueImpactRunByStripeSessionId,
  getUsageTotals,
  saveUsageEvent,
  upsertRevenueEvent,
} from "./db.js";
import { buildSeededRetentionImpact } from "./retention-seed.js";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

function requireSandboxKey(value: string | undefined): string | undefined {
  const key = value?.trim();
  if (!key) return undefined;
  if (!/^(?:sk|rk)_test_/.test(key)) {
    throw new Error("A Stripe test/sandbox secret key is required");
  }
  return key;
}

export function loadStripeSandboxKey(): string {
  const environmentKey = requireSandboxKey(process.env.STRIPE_SECRET_KEY);
  if (environmentKey) return environmentKey;

  try {
    const config = readFileSync(
      join(homedir(), ".config", "stripe", "config.toml"),
      "utf8",
    );
    const match = config.match(
      /^\s*test_mode_api_key\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))/m,
    );
    const configKey = requireSandboxKey(match?.[1] ?? match?.[2] ?? match?.[3]);
    if (configKey) return configKey;
  } catch (error) {
    if (error instanceof Error && error.message.includes("test/sandbox")) {
      throw error;
    }
  }

  throw new Error(
    "Stripe sandbox credentials are unavailable; set STRIPE_SECRET_KEY or run stripe login",
  );
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const databasePath = resolve(
  process.env.DATABASE_PATH?.trim() || ".data/codeofduty.sqlite",
);
mkdirSync(dirname(databasePath), { recursive: true });
const database = createDatabase(databasePath);

const repository: ApiRepository = {
  recordUsage(input) {
    const { duplicate } = saveUsageEvent(database, input);
    const totals = getUsageTotals(database, input.userId);
    return {
      eventId: input.usageEventId,
      duplicate,
      mirroredEventCount: Object.values(totals).reduce(
        (sum, count) => sum + count,
        0,
      ),
      totals,
    };
  },
  countDistinctFeatures(userId) {
    return getDistinctFeatureCount(database, userId);
  },
  storeRevenueEvent(input) {
    upsertRevenueEvent(database, input);
  },
  hasRevenueEvent(paymentId) {
    return getRevenueEventByStripeSessionId(database, paymentId) !== null;
  },
  getRevenueImpact(paymentId) {
    const run = getRevenueImpactRunByStripeSessionId(database, paymentId);
    if (!run) return undefined;
    return {
      data: run.outputJson,
      model: run.model,
      baseline: calculateDeterministicBaseline(run.inputJson),
    };
  },
};

const stripe = new Stripe(loadStripeSandboxKey());
const app = createApp({
  repository,
  stripe,
  stripeWebhookSecret: requiredEnvironment("STRIPE_WEBHOOK_SECRET"),
  appUrl:
    process.env.APP_URL?.trim() ||
    process.env.VITE_APP_URL?.trim() ||
    "http://localhost:5173",
  ensureRevenueImpact(paymentId) {
    return ensureStoredRevenueImpact(database, paymentId);
  },
  getRetentionImpact: buildSeededRetentionImpact,
});

const port = Number.parseInt(process.env.API_PORT || "3001", 10);
app.listen(port, "127.0.0.1", () => {
  // Deliberately report only the non-sensitive local address.
  console.log(`Code of Duty API listening on http://127.0.0.1:${port}`);
});
