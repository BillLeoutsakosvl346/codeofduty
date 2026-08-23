# Code of Duty local setup

## Prerequisites

- Node.js 20 or newer and npm
- A Neon Postgres database
- Stripe test-mode keys and Stripe CLI
- A PostHog project key and host
- Optional GitHub and Greptile credentials for live PR ownership analysis

## Configure

Copy `env.example` to `.env.local` and fill the values. Keep `.env.local` private. The server-only values are `DATABASE_URL`, `ADMIN_API_TOKEN`, `GITHUB_TOKEN`, `GREPTILE_API_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET`.

`NEXT_PUBLIC_APP_URL` should be `http://localhost:3000` locally and the public Sites URL in production. The PostHog variables and Stripe publishable key are intentionally browser-visible.

## Install and initialize

```powershell
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. The seed is deterministic and idempotent: three engineers, three features, six synthetic PRs, six missions, and three active subscriptions totaling $90,000 ARR.

## Stripe test loop

In a second terminal, start webhook forwarding:

```powershell
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```

Copy the displayed `whsec_...` signing secret into `STRIPE_WEBHOOK_SECRET` in `.env.local`, restart the dev server, then:

1. Open `/demo` and use Search or AI Summary.
2. Select **Subscribe · $100/mo**.
3. Complete Stripe Checkout with test card `4242 4242 4242 4242`, any future expiry, and any CVC.
4. Return to `/`. The new subscription adds exactly $100 MRR / $1,200 ARR.
5. Use Summary again. Total ARR remains fixed while feature and engineer allocations shift.

The raw webhook body is signature-verified. A local signature and deduplication smoke test is also available while the dev server is running:

```powershell
node scripts/smoke-webhook.mjs
```

## Provider sync

All administrative routes require `Authorization: Bearer <ADMIN_API_TOKEN>`.

```powershell
$headers = @{ Authorization = "Bearer $env:ADMIN_API_TOKEN" }
Invoke-RestMethod http://localhost:3000/api/github/sync -Method Post -Headers $headers
Invoke-RestMethod http://localhost:3000/api/greptile/analyze -Method Post -Headers $headers -ContentType 'application/json' -Body '{}'
Invoke-RestMethod http://localhost:3000/api/arr/recalculate -Method Post -Headers $headers -ContentType 'application/json' -Body '{"all":true}'
```

GitHub sync is safe to repeat. Greptile analyzes at most five missing PRs per request, accepts an optional `{ "prNumbers": [123], "force": true }` body, validates strict feature-score JSON, and never creates fabricated ownership when the provider fails.

## Verification

```powershell
npm run typecheck
npm test
npm run lint
npm run build
```

Useful no-cache endpoints:

- `GET /api/dashboard`
- `GET /api/player/<engineerId>`
- `GET /api/missions`

The dashboard polls its real activity ledger every 2.5 seconds. Duplicate usage IDs, duplicate Stripe events, zero-value recalculations, and repeated syncs do not create duplicate feed entries.

## Production checklist

1. Run migrations and seed against the production Neon database.
2. Configure every required secret in Sites; do not bundle server secrets as public variables.
3. Set `NEXT_PUBLIC_APP_URL` to the deployed HTTPS origin and publish the site publicly.
4. Register `https://<site-host>/api/stripe/webhook` as a Stripe test webhook for Checkout and subscription create/update/delete events.
5. Replace `STRIPE_WEBHOOK_SECRET` with the signing secret for that hosted endpoint.
6. Run one non-destructive hosted smoke test and confirm dashboard provider statuses independently.
