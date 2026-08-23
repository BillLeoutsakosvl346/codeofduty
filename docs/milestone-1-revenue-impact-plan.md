# Milestone 1: Usage-to-Revenue Attribution Demo

Status: Approved for implementation

Last updated: 2026-08-23

Owner: Code of Duty team

## Goal

Prove one complete loop:

```text
User completes demo feature actions
        -> PostHog records feature usage
        -> SQLite mirrors the successful actions
        -> User completes a Stripe sandbox payment
        -> A signed webhook builds pre-payment evidence
        -> The attribution agent proposes feature weights
        -> Application code allocates the exact payment cents
        -> The UI and API expose validated revenue-impact JSON
```

The product claim for this milestone is:

> PostHog shows what a customer used. Stripe shows what they paid. The
> attribution agent turns that evidence into a structured revenue-impact record
> for every feature with qualifying pre-payment usage.

## Scope

### In scope

- A small Next.js and TypeScript demo application.
- Three visible, successful feature interactions:
  - Search returns results from a small in-memory fixture corpus.
  - AI Summary summarizes one preloaded document using deterministic demo logic.
  - Sharing generates a mock share URL.
- Browser-side PostHog `feature_used` events.
- Deterministic SQLite mirroring of the same successful actions.
- A $100 USD, card-only Stripe-hosted Checkout Session in sandbox mode.
- Raw-body Stripe signature verification.
- A seven-day, same-customer, pre-payment evidence packet.
- A deterministic baseline and a structured-output attribution agent.
- Exact cent allocation performed by normal code.
- A one-page result view with evidence, baseline, agent split, and raw JSON.
- A checked-in JSON Schema for the `revenue-impact/v1` envelope.
- An idempotent manual recovery route for demo-time attribution retries.
- Database and API replay safety for Stripe webhook delivery.

### Not in scope

- GitHub contribution ingestion.
- A Greptile API integration or Greptile-triggered analysis.
- Bounties or contributor payouts.
- Claude-mem.
- Authentication, production multi-tenancy, or authorization.
- Hosted Postgres, queues, workers, or deployment automation.
- A PostHog server API or automated PostHog dashboard creation.
- Real search infrastructure, document AI, or public share pages.
- Subscriptions, refunds, multiple currencies, or delayed payment methods.
- Versioned attribution reruns that overwrite or supersede an existing run.

Greptile is described below only as a future consumer of the milestone's JSON
contract. It is not part of the first build or its definition of done.

## Fixed product decisions

- Runtime: Next.js App Router with TypeScript.
- Database: local SQLite via `better-sqlite3`.
- Demo customer: a browser-generated `demo_user_<uuid>` stored in
  `localStorage`.
- Usage session: a tab-scoped UUID stored in `sessionStorage`.
- Attribution window: seven days ending at the Stripe event time.
- Checkout amount: 10,000 cents USD.
- Payment method: card only.
- Agent provider: OpenAI Responses API with strict structured output.
- Default model: configured by `OPENAI_MODEL`; use a small structured-output
  model for the demo.
- Unattributed revenue: forced to zero for Milestone 1.
- Webhook processing: synchronous and retryable; no queue.
- Agent timeout: short and bounded for the local demo.
- Agent fallback: deterministic baseline output is allowed during development,
  but it is visibly labeled and does not satisfy the final agent acceptance gate.

## User experience

The single `/demo` page contains:

```text
+--------------------------------------------------+
| Demo customer: demo_user_...                     |
+--------------------------------------------------+
| Search                                           |
| [query input] [Search]                           |
| Results appear below the input.                  |
|                                                  |
| AI Summary                                       |
| [Generate summary]                               |
| A summary of the preloaded document appears.     |
|                                                  |
| Sharing                                          |
| [Generate share link]                            |
| A mock URL appears with copy feedback.           |
|                                                  |
| SQLite mirror: 4 successful events               |
| [Pay $100 with Stripe]                           |
+--------------------------------------------------+
```

The payment button stays disabled until the customer has used at least two
distinct features successfully. The checkout API enforces the same rule so the
client cannot bypass it.

After Stripe redirects back, the page polls for the impact record and renders:

```text
PAYMENT RECEIVED                                  $100

DETERMINISTIC BASELINE
Search 57%     AI Summary 29%     Sharing 14%

AGENT REVENUE IMPACT
Search $60     AI Summary $30     Sharing $10

[View evidence] [View raw JSON]
```

Polling has three explicit states: processing, completed, and timed out with a
retry button. The redirect is not treated as proof of payment; only the signed
webhook can create revenue.

## Event contract

Call `posthog.identify(userId)` once after restoring or creating the browser's
demo user. Every successful action then generates one `usageEventId` and sends
the same event identity to PostHog and SQLite:

```ts
posthog.identify(userId)

const usageEventId = crypto.randomUUID()

posthog.capture("feature_used", {
  usage_event_id: usageEventId,
  feature_id: "search",
  action: "search_completed",
  user_id: userId,
  session_id: sessionId,
})
```

```json
{
  "usageEventId": "usage_123",
  "userId": "demo_user_123",
  "featureId": "search",
  "action": "search_completed",
  "sessionId": "session_123"
}
```

The usage API accepts only these successful feature/action pairs:

| Feature | Successful action |
|---|---|
| `search` | `search_completed` |
| `summary` | `summary_generated` |
| `sharing` | `share_link_generated` |

`usageEventId` becomes `feature_usage_events.id`, and the usage route inserts it
idempotently. A retried request therefore refers to the same logical event
instead of incrementing usage twice. The browser records nothing when an
interaction fails. The visible usage count updates only after SQLite confirms
the mirrored event was saved.

## Database

Only three tables are required:

```text
feature_usage_events
  id                  TEXT PRIMARY KEY
  user_id             TEXT NOT NULL
  feature_id          TEXT NOT NULL
  action              TEXT NOT NULL
  session_id          TEXT NOT NULL
  created_at          TEXT NOT NULL
  INDEX(user_id, created_at)

revenue_events
  id                  TEXT PRIMARY KEY
  stripe_session_id   TEXT NOT NULL UNIQUE
  user_id             TEXT NOT NULL
  amount_cents        INTEGER NOT NULL
  currency            TEXT NOT NULL
  created_at          TEXT NOT NULL
  INDEX(user_id, created_at)

revenue_impact_runs
  id                  TEXT PRIMARY KEY
  revenue_event_id    TEXT NOT NULL UNIQUE
  model               TEXT NOT NULL
  input_json          TEXT NOT NULL
  output_json         TEXT NOT NULL
  created_at          TEXT NOT NULL
```

The two unique constraints are the webhook replay contract:

- One revenue event per Stripe Checkout Session.
- One stored attribution run per revenue event.

## API surface

```text
POST /api/usage
  Validate and store one successful feature action.

POST /api/checkout
  Require two distinct used features and create Stripe Checkout.

POST /api/stripe/webhook
  Verify the signature, store payment, and ensure attribution exists.

POST /api/revenue-impact/run
  Idempotently create a missing run for an already stored payment.

GET /api/revenue-impact/:paymentId
  Return processing/not-found status or the canonical versioned envelope.
```

The manual route is recovery, not versioning: it calls the same
`ensureRevenueImpact` function as the webhook and always returns the one stored
run when that run already exists. The UI retry button calls this route before it
resumes polling. It never overwrites or creates a second run.

### Revenue-impact state contract

`GET /api/revenue-impact/:paymentId` returns:

```json
{
  "status": "completed",
  "data": {
    "schema_version": "revenue-impact/v1",
    "run_id": "rir_123",
    "generated_at": "2026-08-23T19:42:10Z",
    "impact": {
      "payment_id": "cs_test_123",
      "user_id": "demo_user_123",
      "total_revenue_cents": 10000,
      "currency": "usd",
      "attribution_model": "agent-usage-v1",
      "attribution_window_days": 7,
      "allocations": [],
      "unattributed_revenue_cents": 0
    }
  }
}
```

| Condition | HTTP | Body | UI behavior |
|---|---:|---|---|
| Run exists | `200` | `{ status: "completed", data: envelope }` | Stop polling and render |
| Payment exists, run missing | `202` | `{ status: "processing", paymentId }` | Continue polling |
| Payment not stored yet | `404` | `{ status: "payment_not_received", paymentId }` | Continue polling within deadline |
| Invalid payment ID | `400` | `{ status: "invalid_request" }` | Stop and show error |

`POST /api/revenue-impact/run` returns `200` with the completed envelope whether
it created or reused the run, `404` with `payment_not_received` when the webhook
has not stored revenue yet, and `503` with `retryable_error` when the bounded
model call fails. The UI resumes bounded polling after `404` or `503`; it never
interprets either response as payment success.

## Stripe flow

Create Checkout with inline price data so there is no Product or Price setup:

```ts
const checkoutSession = await stripe.checkout.sessions.create({
  mode: "payment",
  payment_method_types: ["card"],
  line_items: [
    {
      price_data: {
        currency: "usd",
        product_data: { name: "Code of Duty Pro" },
        unit_amount: 10_000,
      },
      quantity: 1,
    },
  ],
  success_url:
    `${appUrl}/demo?payment=success&session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${appUrl}/demo?payment=cancelled`,
  metadata: {
    app_user_id: userId,
    attribution_model: "agent-usage-v1",
  },
})
```

The webhook must call `request.text()` exactly once before signature
verification. It handles only `checkout.session.completed` and requires:

- `event.livemode === false`
- `session.payment_status === "paid"`
- `amount_total === 10_000`
- `currency === "usd"`
- A valid `metadata.app_user_id`
- `metadata.attribution_model === "agent-usage-v1"`

Use `event.created` as the replay-stable payment cutoff. Do not use the Checkout
Session's creation timestamp.

Webhook processing:

```text
Verify signature
  -> Validate the completed Checkout Session
  -> Insert or load revenue by stripe_session_id
  -> Return the existing impact run if present
  -> Query qualifying usage
  -> Build evidence and baseline
  -> Run and validate the agent proposal
  -> Recompute exact cents
  -> Insert the run with conflict-ignore
  -> Read and return the one canonical stored run
```

Use a short model timeout. If attribution fails after revenue was inserted,
return `500`. Stripe retries, and the manual recovery route lets the demo recover
immediately instead of waiting for Stripe's retry schedule. Both paths load the
payment and resume at the missing attribution step. Two simultaneous deliveries
may make two model calls, but the database can store only one result. Avoiding
even the duplicate call would require job/lease state and is intentionally
deferred. Running model work inside the webhook is a local-demo exception to
Stripe's normal recommendation to acknowledge webhooks quickly; production must
move attribution behind durable asynchronous work.

## Evidence packet

The agent never receives raw PostHog clickstream data. SQLite is the immediate,
deterministic evidence authority.

The query includes only usage where:

```text
user_id = payment.user_id
created_at >= payment.created_at - 7 days
created_at <= payment.created_at
```

It groups by feature and calculates successful uses, distinct sessions, and
last-use time. Query text, document contents, and generated share URLs are not
included.

```json
{
  "payment": {
    "id": "cs_test_123",
    "user_id": "demo_user_123",
    "amount_cents": 10000,
    "currency": "usd",
    "paid_at": "2026-08-23T19:42:00Z"
  },
  "attribution_window": {
    "start": "2026-08-16T19:42:00Z",
    "end": "2026-08-23T19:42:00Z"
  },
  "features": [
    {
      "feature_id": "search",
      "successful_uses": 8,
      "unique_sessions": 4,
      "last_used_at": "2026-08-23T19:31:00Z"
    }
  ]
}
```

## Attribution boundary

The deterministic baseline is:

```text
feature unique sessions / sum of per-feature unique sessions
```

The model proposes only judgment fields:

```ts
type AgentAllocationProposal = {
  feature_id: "search" | "summary" | "sharing"
  weight: number
  evidence: string[]
  reasoning: string
  confidence: number
}
```

The exact trust-boundary schemas are:

```ts
import { z } from "zod"

const FeatureIdSchema = z.enum(["search", "summary", "sharing"])

export const AgentAllocationProposalSchema = z
  .object({
    feature_id: FeatureIdSchema,
    weight: z.number().finite().min(0).max(1),
    evidence: z.array(z.string().min(1)).min(1).max(5),
    reasoning: z.string().min(1),
    confidence: z.number().finite().min(0).max(1),
  })
  .strict()

export const AgentProposalSchema = z
  .object({
    allocations: z.array(AgentAllocationProposalSchema).min(1).max(3),
  })
  .strict()

export const RevenueImpactAllocationSchema = z
  .object({
    feature_id: FeatureIdSchema,
    weight: z.number().finite().min(0).max(1),
    revenue_impact_cents: z.number().int().nonnegative(),
    evidence: z.array(z.string().min(1)).min(1).max(5),
    reasoning: z.string().min(1),
    confidence: z.number().finite().min(0).max(1),
  })
  .strict()

export const RevenueImpactSchema = z
  .object({
    payment_id: z.string().min(1),
    user_id: z.string().min(1),
    total_revenue_cents: z.literal(10_000),
    currency: z.literal("usd"),
    attribution_model: z.literal("agent-usage-v1"),
    attribution_window_days: z.literal(7),
    allocations: z.array(RevenueImpactAllocationSchema).min(1).max(3),
    unattributed_revenue_cents: z.literal(0),
  })
  .strict()

export const RevenueImpactEnvelopeSchema = z
  .object({
    schema_version: z.literal("revenue-impact/v1"),
    run_id: z.string().min(1),
    generated_at: z.string().datetime(),
    impact: RevenueImpactSchema,
  })
  .strict()
```

Strict proposal parsing rejects extra fields, including model-proposed
`revenue_impact_cents`. The model never proposes cents, so there is no ambiguous
"accept and ignore" path.

Use this system prompt verbatim for Milestone 1:

```text
You are a revenue attribution agent.

You receive one completed payment and aggregated evidence describing which
product features the customer successfully used before paying.

Assign relative revenue-impact weights based only on the supplied evidence.
Consider successful-use frequency, unique sessions, recency, and whether usage
suggests completion of a meaningful workflow.

Rules:
- Do not invent feature usage or evidence.
- Do not include a feature that has no supplied evidence.
- Return each evidenced feature at most once.
- Weights must be finite numbers between 0 and 1.
- At least one weight must be positive.
- Explain every allocation using concrete facts from the input.
- Do not calculate or return currency amounts or revenue cents.
- Return only JSON matching AgentProposalSchema.
```

The model does not own payment identity or arithmetic. Application code:

1. Rejects unknown, duplicate, or no-evidence feature IDs.
2. Requires finite weights and at least one positive weight.
3. Normalizes positive weights.
4. Forces `unattributed_revenue_cents` to zero.
5. Allocates cents with largest remainder and a stable feature-ID tie-break.
6. Constructs and validates the final JSON.
7. Asserts exact conservation before saving.

Mandatory invariant:

```ts
sum(allocation.revenue_impact_cents) + unattributed_revenue_cents
  === total_revenue_cents
```

## Canonical JSON output

The API and `revenue_impact_runs.output_json` expose the same versioned envelope.
`RevenueImpactSchema` validates the inner business record, and
`RevenueImpactEnvelopeSchema` validates the stable wire contract:

```json
{
  "schema_version": "revenue-impact/v1",
  "run_id": "rir_123",
  "generated_at": "2026-08-23T19:42:10Z",
  "impact": {
    "payment_id": "cs_test_123",
    "user_id": "demo_user_123",
    "total_revenue_cents": 10000,
    "currency": "usd",
    "attribution_model": "agent-usage-v1",
    "attribution_window_days": 7,
    "allocations": [
      {
        "feature_id": "search",
        "weight": 0.6,
        "revenue_impact_cents": 6000,
        "evidence": [
          "Used successfully 8 times",
          "Used across 4 unique sessions",
          "Used 11 minutes before purchase"
        ],
        "reasoning": "Search was the customer's most frequent and recent successful workflow.",
        "confidence": 0.91
      },
      {
        "feature_id": "summary",
        "weight": 0.3,
        "revenue_impact_cents": 3000,
        "evidence": [
          "Used successfully 4 times",
          "Used across 2 unique sessions"
        ],
        "reasoning": "AI Summary showed repeated meaningful usage with less engagement than Search.",
        "confidence": 0.82
      },
      {
        "feature_id": "sharing",
        "weight": 0.1,
        "revenue_impact_cents": 1000,
        "evidence": [
          "Used successfully once",
          "Used several days before purchase"
        ],
        "reasoning": "Sharing contributed to the workflow, but the evidence is comparatively weak.",
        "confidence": 0.67
      }
    ],
    "unattributed_revenue_cents": 0
  }
}
```

This is the business record. The model's untrusted proposal is not exposed as
the canonical result; only the validated and recomputed payload is stored and
returned. `schema_version` lets later consumers reject incompatible changes
instead of silently interpreting the wrong shape.

Commit the wire schema as `contracts/revenue-impact.v1.schema.json`. The Zod
contract and checked-in JSON Schema must describe the same envelope; a contract
test validates the example above against both.

## Future Greptile handoff

Greptile is not documented as a runtime analytics database or as accepting an
arbitrary JSON document as review input. Its documented integration surface is
repository and pull-request analysis, with repository files and custom context
used to guide reviews. `greptile review --json` is machine-readable output from
Greptile, not a JSON input endpoint.

Therefore Milestone 2 should add a small adapter rather than coupling Milestone
1 directly to Greptile:

```text
Canonical RevenueImpact JSON
          +
Feature-to-code-path catalog
          |
          v
Greptile context exporter
          |
          +--> de-identified aggregate for other services
          |      artifacts/revenue-impact-summary.json
          |
          +--> human/reviewer context document
                 docs/generated/feature-revenue-context.md
                          |
                          v
                 Greptile PR review context
```

The stable join key is `feature_id`. A future catalog can map it to code:

```json
{
  "schema_version": "feature-code-map/v1",
  "features": [
    {
      "feature_id": "search",
      "paths": [
        "app/api/search/**",
        "app/search/**",
        "lib/search/**"
      ]
    }
  ]
}
```

The raw versioned envelopes stay in the application database and API. They are
not committed to Git because they contain customer and Stripe identifiers.

The future adapter emits a separate de-identified aggregate only when its cohort
contains at least five distinct customers. De-identification reduces disclosure
risk but is not an anonymity guarantee:

```json
{
  "schema_version": "greptile-revenue-context/v1",
  "period": {
    "start": "2026-08-01T00:00:00Z",
    "end": "2026-08-31T23:59:59Z"
  },
  "currency": "usd",
  "customer_count": 37,
  "run_count": 42,
  "features": [
    {
      "feature_id": "search",
      "code_paths": ["app/api/search/**", "app/search/**", "lib/search/**"],
      "revenue_share": 0.6,
      "revenue_impact_tier": "high",
      "evidence_summary": "High successful-use frequency across the cohort",
      "confidence_summary": 0.89
    }
  ]
}
```

The future exporter will:

1. Read only validated `revenue_impact_runs.output_json` records.
2. Validate every `revenue-impact/v1` envelope.
3. Require at least five distinct customers in the selected cohort.
4. Strip customer IDs, Stripe Session IDs, and per-customer evidence.
5. Join `feature_id` to the feature-to-code-path catalog.
6. Aggregate revenue by feature over an explicit time window.
7. Derive evidence summaries from allowlisted aggregate metrics, never model
   free text.
8. Convert exact revenue to relative share and an impact tier by default.
9. Validate `greptile-revenue-context/v1`.
10. Render a short repository document describing feature value and affected
   paths without including customer identifiers or raw usage.
11. Reference that document through Greptile's repository context-file
   configuration so Greptile can use it while reviewing relevant pull requests.

Committing exact revenue totals requires explicit product-owner approval. The
default Greptile context contains shares and impact tiers because Greptile needs
review priority, not commercially sensitive payment totals.

Example derived reviewer context:

```text
Feature: Search
Affected paths: app/api/search/**, app/search/**, lib/search/**
Attributed revenue share in the selected window: 60% (high impact)
Evidence strength: high
Review instruction: Treat regressions in this feature as high business impact.
```

This separation is intentional:

- The application remains the system of record for revenue attribution.
- The raw JSON is the stable input to future adapters, not a direct Greptile API
  payload.
- Only cohort-gated, de-identified aggregates and reviewer context are written
  to Git.
- The aggregate remains machine-readable for bounty logic, dashboards, and
  future consumers.
- Greptile receives repository-scoped review context, not customer clickstream
  or payment records.
- No Greptile credential or API call is required in Milestone 1.

Greptile's repository configuration supports pointing it at existing files such
as schemas, API specifications, and architecture documentation. Durable coding
rules may later use custom context, but per-customer revenue records must never
be turned into organization-wide coding rules. The exact context-file path and
account configuration will be verified during Milestone 2.

## Environment contract

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000

NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

OPENAI_API_KEY=
OPENAI_MODEL=

DATABASE_PATH=.data/codeofduty.sqlite
```

No Stripe publishable key, Stripe Price ID, PostHog personal API key, GitHub
token, or Greptile key is needed.

Secrets belong only in `.env.local`, which must remain ignored. The PostHog
browser project token is intentionally public but should still be configured
through the environment rather than hard-coded.

## Proposed project structure

```text
app/
  layout.tsx
  globals.css
  demo/page.tsx
  api/
    usage/route.ts
    checkout/route.ts
    stripe/webhook/route.ts
    revenue-impact/run/route.ts
    revenue-impact/[paymentId]/route.ts

instrumentation-client.ts

contracts/
  revenue-impact.v1.schema.json

lib/
  db.ts
  integrations.ts
  attribution.ts

tests/
  attribution.test.ts
  api.test.ts
```

Keep all three fake feature implementations in the demo component. Do not add
separate feature services until their behavior becomes real.

## Parallel implementation plan

First complete one short sequential foundation step:

- Scaffold Next.js and TypeScript.
- Install all dependencies once.
- Add the environment contract and shared feature/action types.
- Add stable, mockable interfaces for usage storage and
  `ensureRevenueImpact`, with temporary stubs that throw until Lane B lands.
- Expand `.gitignore` for `.env*`, `.next`, `node_modules`, and local SQLite.

Then launch three lanes:

| Lane | Work | Modules | Depends on |
|---|---|---|---|
| A | Demo UI, three interactions, PostHog, result polling | `app/demo`, client instrumentation | Foundation |
| B | SQLite schema, evidence, baseline, schemas, apportionment | `lib/db`, `lib/attribution`, unit tests | Foundation |
| C | Checkout, webhook, recovery, result endpoint, route tests against mocks | `app/api`, `lib/integrations` | Foundation interfaces |

After all lanes merge, one integration pass runs the automated suite and the
manual Stripe/PostHog acceptance flow. Keeping dependency installation in the
foundation step prevents parallel branches from fighting over `package.json` or
the lockfile.

## Test plan

### Usage

- A successful feature interaction captures one matching PostHog event and
  mirrored usage request.
- PostHog receives the browser user as its identified `distinct_id`.
- Retrying one `usageEventId` leaves one SQLite row.
- A failed interaction records neither.
- Invalid feature/action pairs return `400` and create no row.
- The payment button and checkout API require two distinct used features.

### Evidence

- Excludes another customer.
- Excludes events after payment.
- Excludes events older than seven days.
- Counts total successful uses and distinct sessions correctly.
- Does not include query text, document content, or share URLs.

### Attribution

- Rejects unknown and duplicate feature IDs.
- Rejects missing evidence and zero/invalid weights.
- Rejects model output that contains proposed cents or other extra fields.
- Handles thirds, ties, and awkward rounding deterministically.
- Always conserves exactly 10,000 cents in the standard demo.
- Parses the final result through the canonical Zod schema.
- Validates the canonical example against the checked-in JSON Schema.

### Webhook

- Invalid or missing signature returns `400` and creates zero rows.
- Unrelated event returns `200` and creates zero rows.
- Live-mode, unpaid, or malformed Checkout is rejected.
- Valid completed payment creates one revenue row and one run.
- Replaying the same payload leaves row counts at one and one.
- A stored payment with a missing run is completed by a retry.
- Repeating the manual recovery request returns the same stored run.
- Concurrent delivery can store only one impact run.

### Manual end-to-end acceptance

1. Start the app and Stripe CLI listener.
2. Open a fresh private browser window.
3. Use at least two features successfully.
4. Confirm `feature_used` events in PostHog Live Events.
5. Confirm the page reports the mirrored SQLite events.
6. Complete Checkout with a Stripe sandbox test card.
7. Confirm the signed webhook returns `200`.
8. Confirm the UI renders the baseline, agent split, evidence, and raw JSON.
9. Confirm allocated cents total exactly 10,000.
10. Replay the webhook and confirm there is still one revenue event and one run.
11. Exercise manual recovery and confirm it returns the same run rather than
    creating another.

## Failure behavior

| Failure | Handling | User-visible result |
|---|---|---|
| PostHog blocked | SQLite mirror still records evidence | Mirrored usage succeeds; PostHog is checked manually |
| Usage database write fails | Do not increment visible count | Recoverable usage-sync error |
| Checkout before sufficient usage | Client disables; server returns `400` | Prompt to use two features |
| Invalid Stripe signature | Create nothing and return `400` | Stripe CLI shows failure |
| Duplicate webhook | Return existing canonical run | Same result, no duplicate rows |
| Agent timeout/failure | Keep revenue, return `500`; allow idempotent manual recovery | Processing state with recovery button |
| Redirect beats webhook | Poll result endpoint | Processing indicator, then result |
| Polling timeout | Stop polling; retry calls recovery then resumes polling | Retry button, no false payment claim |
| Missing model key | Development fallback only | Visible `deterministic fallback` badge |

## Definition of done

Milestone 1 is complete when, from a fresh browser session:

1. A demo customer successfully uses at least two features.
2. Those events appear in PostHog.
3. The same successful actions exist in SQLite.
4. The customer completes a Stripe sandbox payment.
5. The signed webhook stores exactly one revenue event.
6. Evidence contains only that customer's qualifying pre-payment usage.
7. A real model returns a schema-valid attribution proposal.
8. Application code produces the canonical `revenue-impact/v1` envelope.
9. Allocated cents equal the Stripe payment exactly.
10. The UI renders the split, evidence, baseline, and raw JSON.
11. Replaying the webhook creates neither another revenue event nor another
    stored attribution run.

## References

- [PostHog Next.js SDK](https://posthog.com/docs/libraries/next-js)
- [PostHog custom event capture](https://posthog.com/docs/product-analytics/capture-events)
- [Stripe Checkout Session creation](https://docs.stripe.com/api/checkout/sessions/create)
- [Stripe Checkout success-page session ID](https://docs.stripe.com/payments/checkout/custom-success-page?payment-ui=stripe-hosted)
- [Stripe webhook handling and signature verification](https://docs.stripe.com/webhooks)
- [OpenAI structured outputs with Zod](https://github.com/openai/openai-node/blob/main/docs/structured-outputs.md)
- [Greptile custom context](https://www.greptile.com/docs/code-review-bot/custom-context)
- [Greptile repository context-file configuration](https://www.greptile.com/docs/code-review/greptile-config-reference)
- [Greptile MCP tools](https://www.greptile.com/docs/mcp-v2/tools)
- [Greptile developer essentials](https://www.greptile.com/docs/code-review/developer-essentials)
