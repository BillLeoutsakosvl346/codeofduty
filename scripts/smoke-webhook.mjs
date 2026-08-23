import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import Stripe from 'stripe';

config({ path: '.env.local' });

async function main() {
  if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET is required.');
  const event = {
    id: `evt_acceptance_${randomUUID().replaceAll('-', '')}`,
    object: 'event',
    api_version: '2025-12-15.clover',
    created: Math.floor(Date.now() / 1000),
    data: { object: {} },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: 'codeofduty.acceptance',
  };
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  const options = {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    body: payload,
  };
  const first = await fetch('http://localhost:3000/api/stripe/webhook', options);
  const firstBody = await first.json();
  const second = await fetch('http://localhost:3000/api/stripe/webhook', options);
  const secondBody = await second.json();
  const bad = await fetch('http://localhost:3000/api/stripe/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': 'invalid' },
    body: payload,
  });
  console.log(`WEBHOOK_FIRST=${first.status};DUPLICATE_FIRST=${firstBody.duplicate};WEBHOOK_RETRY=${second.status};DUPLICATE_RETRY=${secondBody.duplicate};INVALID_SIGNATURE=${bad.status}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
