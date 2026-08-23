import { spawn, spawnSync } from "node:child_process";

import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

function stripeListenerSecret(): string {
  const configured = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (configured) return configured;

  const result = spawnSync("stripe", ["listen", "--print-secret"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const secret = result.stdout.trim();
  if (result.status !== 0 || !/^whsec_[A-Za-z0-9]+$/.test(secret)) {
    throw new Error(
      "Could not obtain a Stripe webhook secret. Run `stripe login` and retry.",
    );
  }
  return secret;
}

process.env.STRIPE_WEBHOOK_SECRET = stripeListenerSecret();

const listener = spawn(
  "stripe",
  ["listen", "--forward-to", "http://127.0.0.1:3001/api/stripe/webhook"],
  { stdio: "ignore" },
);

listener.once("spawn", () => {
  console.log("Stripe sandbox listener forwarding signed webhooks to the API");
});
listener.once("error", () => {
  console.error("Stripe listener could not start; run `stripe login` and retry");
  process.exitCode = 1;
});
listener.once("exit", (code) => {
  if (code && code !== 0) {
    console.error(`Stripe listener exited with code ${code}`);
  }
});

function stop() {
  if (!listener.killed) listener.kill("SIGTERM");
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

await import("../server/index.js");
