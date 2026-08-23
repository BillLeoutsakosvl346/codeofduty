import Stripe from "stripe";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RevenueImpactEnvelope,
  UsageEventInput,
  UsageResponse,
} from "../shared/contracts.js";
import {
  createApp,
  type ApiRepository,
  type AppDependencies,
  type CompletedRevenueImpact,
  type RevenueEventRecord,
  type StripeApi,
} from "../server/app.js";

const webhookSecret = "whsec_test_only_not_a_real_secret";
const stripeSigner = new Stripe("sk_test_not_a_real_key");

function impact(paymentId: string): RevenueImpactEnvelope {
  return {
    schema_version: "revenue-impact/v1",
    run_id: `run_${paymentId}`,
    generated_at: "2026-08-23T20:00:00.000Z",
    impact: {
      payment_id: paymentId,
      user_id: "demo_user_123",
      total_revenue_cents: 10_000,
      currency: "usd",
      attribution_model: "agent-usage-v1",
      attribution_window_days: 7,
      allocations: [
        {
          feature_id: "search",
          weight: 0.6,
          revenue_impact_cents: 6_000,
          evidence: ["Used successfully twice"],
          reasoning: "Search was the most-used workflow.",
          confidence: 0.9,
        },
        {
          feature_id: "summary",
          weight: 0.4,
          revenue_impact_cents: 4_000,
          evidence: ["Used successfully once"],
          reasoning: "Summary completed the workflow.",
          confidence: 0.8,
        },
      ],
      unattributed_revenue_cents: 0,
    },
  };
}

class MemoryRepository implements ApiRepository {
  readonly usage = new Map<string, UsageEventInput>();
  readonly revenue = new Map<string, RevenueEventRecord>();
  readonly impacts = new Map<string, CompletedRevenueImpact>();

  recordUsage(input: UsageEventInput): UsageResponse {
    const duplicate = this.usage.has(input.usageEventId);
    this.usage.set(input.usageEventId, input);
    const totals = { search: 0, summary: 0, sharing: 0 };
    for (const event of this.usage.values()) {
      if (event.userId === input.userId) totals[event.featureId] += 1;
    }
    return {
      eventId: input.usageEventId,
      duplicate,
      mirroredEventCount: [...this.usage.values()].filter(
        (event) => event.userId === input.userId,
      ).length,
      totals,
    };
  }

  countDistinctFeatures(userId: string): number {
    return new Set(
      [...this.usage.values()]
        .filter((event) => event.userId === userId)
        .map((event) => event.featureId),
    ).size;
  }

  storeRevenueEvent(input: RevenueEventRecord): void {
    if (!this.revenue.has(input.stripeSessionId)) {
      this.revenue.set(input.stripeSessionId, input);
    }
  }

  hasRevenueEvent(paymentId: string): boolean {
    return this.revenue.has(paymentId);
  }

  getRevenueImpact(paymentId: string): CompletedRevenueImpact | undefined {
    return this.impacts.get(paymentId);
  }
}

function completedEvent(paymentId = "cs_test_paid_1") {
  return {
    id: "evt_test_completed_1",
    object: "event",
    api_version: "2026-08-27.basil",
    created: 1_787_515_200,
    data: {
      object: {
        id: paymentId,
        object: "checkout.session",
        amount_total: 10_000,
        currency: "usd",
        livemode: false,
        metadata: {
          app_user_id: "demo_user_123",
          attribution_model: "agent-usage-v1",
        },
        payment_status: "paid",
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: "checkout.session.completed",
  };
}

function signedPayload(event = completedEvent()) {
  const payload = JSON.stringify(event);
  const signature = stripeSigner.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
  });
  return { payload, signature };
}

describe("Stripe and revenue-impact API", () => {
  let repository: MemoryRepository;
  let createCheckout: ReturnType<typeof vi.fn>;
  let ensureRevenueImpact: ReturnType<
    typeof vi.fn<(paymentId: string) => Promise<RevenueImpactEnvelope>>
  >;
  let dependencies: AppDependencies;

  beforeEach(() => {
    repository = new MemoryRepository();
    createCheckout = vi.fn().mockResolvedValue({
      id: "cs_test_checkout_1",
      url: "https://checkout.stripe.test/session",
    });
    ensureRevenueImpact = vi.fn(async (paymentId: string) => {
      const envelope = impact(paymentId);
      repository.impacts.set(paymentId, {
        data: envelope,
        model: "gpt-5-mini",
        baseline: [
          { feature_id: "search", weight: 0.5 },
          { feature_id: "summary", weight: 0.5 },
        ],
      });
      return envelope;
    });
    dependencies = {
      repository,
      stripe: {
        checkout: { sessions: { create: createCheckout } },
        webhooks: stripeSigner.webhooks,
      } as StripeApi,
      stripeWebhookSecret: webhookSecret,
      appUrl: "http://localhost:5173",
      ensureRevenueImpact,
    };
  });

  it("rejects an invalid Stripe signature before writing revenue", async () => {
    const { payload } = signedPayload();
    const response = await request(createApp(dependencies))
      .post("/api/stripe/webhook")
      .set("content-type", "application/json")
      .set("stripe-signature", "t=1,v1=invalid")
      .send(payload);

    expect(response.status).toBe(400);
    expect(repository.revenue.size).toBe(0);
    expect(ensureRevenueImpact).not.toHaveBeenCalled();
  });

  it("stores a valid sandbox payment and returns validated impact", async () => {
    const { payload, signature } = signedPayload();
    const response = await request(createApp(dependencies))
      .post("/api/stripe/webhook")
      .set("content-type", "application/json")
      .set("stripe-signature", signature)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("completed");
    expect(response.body.data.impact.total_revenue_cents).toBe(10_000);
    expect(repository.revenue.size).toBe(1);
    expect(repository.revenue.get("cs_test_paid_1")).toMatchObject({
      amountCents: 10_000,
      currency: "usd",
      userId: "demo_user_123",
    });
    expect(ensureRevenueImpact).toHaveBeenCalledTimes(1);
  });

  it("is idempotent when Stripe replays a completed event", async () => {
    const { payload, signature } = signedPayload();
    const app = createApp(dependencies);

    expect(
      (await request(app)
        .post("/api/stripe/webhook")
        .set("content-type", "application/json")
        .set("stripe-signature", signature)
        .send(payload)).status,
    ).toBe(200);
    expect(
      (await request(app)
        .post("/api/stripe/webhook")
        .set("content-type", "application/json")
        .set("stripe-signature", signature)
        .send(payload)).status,
    ).toBe(200);

    expect(repository.revenue.size).toBe(1);
    expect(repository.impacts.size).toBe(1);
    expect(ensureRevenueImpact).toHaveBeenCalledTimes(1);
  });

  it("requires two distinct successfully used features before checkout", async () => {
    repository.recordUsage({
      usageEventId: "0f7e0ae1-2aca-4c74-a21d-d35210085da8",
      userId: "demo_user_123",
      featureId: "search",
      action: "search_completed",
      sessionId: "a78d39e4-1cf6-485f-9d68-033467aa7918",
    });
    let response = await request(createApp(dependencies))
      .post("/api/checkout")
      .send({ userId: "demo_user_123" });
    expect(response.status).toBe(409);
    expect(createCheckout).not.toHaveBeenCalled();

    repository.recordUsage({
      usageEventId: "12c68d7f-154e-459b-b514-dbb96b0d158c",
      userId: "demo_user_123",
      featureId: "summary",
      action: "summary_generated",
      sessionId: "a78d39e4-1cf6-485f-9d68-033467aa7918",
    });
    response = await request(createApp(dependencies))
      .post("/api/checkout")
      .send({ userId: "demo_user_123" });

    expect(response.status).toBe(200);
    expect(response.body.url).toBe("https://checkout.stripe.test/session");
    expect(createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        payment_method_types: ["card"],
        success_url:
          "http://localhost:5173/#/attribution?payment=success&session_id={CHECKOUT_SESSION_ID}",
        metadata: {
          app_user_id: "demo_user_123",
          attribution_model: "agent-usage-v1",
        },
      }),
    );
    const params = createCheckout.mock.calls[0]?.[0];
    expect(params.line_items[0].price_data.unit_amount).toBe(10_000);
    expect(params.line_items[0].price_data.currency).toBe("usd");
  });

  it("reports pending state and recovers a stored payment idempotently", async () => {
    repository.storeRevenueEvent({
      stripeSessionId: "cs_test_recovery_1",
      userId: "demo_user_123",
      amountCents: 10_000,
      currency: "usd",
      createdAt: "2026-08-23T19:42:00.000Z",
    });
    const app = createApp(dependencies);

    let response = await request(app).get(
      "/api/revenue-impact/cs_test_recovery_1",
    );
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("pending");

    response = await request(app)
      .post("/api/revenue-impact/run")
      .send({ paymentId: "cs_test_recovery_1" });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("completed");

    response = await request(app).get(
      "/api/revenue-impact/cs_test_recovery_1",
    );
    expect(response.status).toBe(200);
    expect(response.body.data.run_id).toBe("run_cs_test_recovery_1");

    await request(app)
      .post("/api/revenue-impact/run")
      .send({ paymentId: "cs_test_recovery_1" })
      .expect(200);
    expect(ensureRevenueImpact).toHaveBeenCalledTimes(1);
  });

  it("reports not_found for an unknown Checkout Session", async () => {
    const response = await request(createApp(dependencies)).get(
      "/api/revenue-impact/cs_test_missing_1",
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "not_found",
      paymentId: "cs_test_missing_1",
    });
  });
});
