import express, { type Request, type Response } from "express";
import type Stripe from "stripe";
import { z } from "zod";
import {
  RevenueImpactEnvelopeSchema,
  UsageEventInputSchema,
  type RevenueImpactEnvelope,
  type BaselineAllocation,
  type UsageEventInput,
  type UsageResponse,
} from "../shared/contracts.js";
import {
  RetentionImpactEnvelopeSchema,
  type RetentionImpactEnvelope,
} from "../shared/retention-contracts.js";

export type RevenueEventRecord = {
  stripeSessionId: string;
  userId: string;
  amountCents: 10_000;
  currency: "usd";
  createdAt: string;
};

export type CompletedRevenueImpact = {
  data: RevenueImpactEnvelope;
  model: string;
  baseline: BaselineAllocation[];
};

export interface ApiRepository {
  recordUsage(input: UsageEventInput): UsageResponse;
  countDistinctFeatures(userId: string): number;
  storeRevenueEvent(input: RevenueEventRecord): void;
  hasRevenueEvent(paymentId: string): boolean;
  getRevenueImpact(paymentId: string): CompletedRevenueImpact | undefined;
}

export interface StripeApi {
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
      ): Promise<Pick<Stripe.Checkout.Session, "id" | "url">>;
    };
  };
  webhooks: {
    constructEvent(
      payload: Buffer,
      signature: string,
      secret: string,
    ): Stripe.Event;
  };
}

export type AppDependencies = {
  repository: ApiRepository;
  stripe: StripeApi;
  stripeWebhookSecret: string;
  appUrl: string;
  ensureRevenueImpact(paymentId: string): Promise<RevenueImpactEnvelope>;
  getRetentionImpact?: () =>
    | RetentionImpactEnvelope
    | Promise<RetentionImpactEnvelope>;
};

const CheckoutInputSchema = z
  .object({ userId: z.string().min(1).max(128) })
  .strict();

const PaymentInputSchema = z
  .object({ paymentId: z.string().min(1).max(255) })
  .strict();

function invalidRequest(response: Response, error: string) {
  return response.status(400).json({ status: "invalid_request", error });
}

function paymentIdIsValid(paymentId: string): boolean {
  return /^cs_(?:test|live)_[A-Za-z0-9_]+$/.test(paymentId);
}

async function runImpact(
  dependencies: AppDependencies,
  paymentId: string,
): Promise<CompletedRevenueImpact | undefined> {
  try {
    RevenueImpactEnvelopeSchema.parse(
      await dependencies.ensureRevenueImpact(paymentId),
    );
    return dependencies.repository.getRevenueImpact(paymentId);
  } catch {
    return undefined;
  }
}

function validateCheckoutSession(
  event: Stripe.Event,
): RevenueEventRecord | undefined {
  if (event.type !== "checkout.session.completed" || event.livemode) {
    return undefined;
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.metadata?.app_user_id;
  const attributionModel = session.metadata?.attribution_model;
  if (
    session.object !== "checkout.session" ||
    session.livemode !== false ||
    session.payment_status !== "paid" ||
    session.amount_total !== 10_000 ||
    session.currency !== "usd" ||
    !userId ||
    userId.length > 128 ||
    attributionModel !== "agent-usage-v1" ||
    !paymentIdIsValid(session.id) ||
    !Number.isSafeInteger(event.created) ||
    event.created <= 0
  ) {
    return undefined;
  }

  return {
    stripeSessionId: session.id,
    userId,
    amountCents: 10_000,
    currency: "usd",
    createdAt: new Date(event.created * 1000).toISOString(),
  };
}

export function createApp(dependencies: AppDependencies) {
  const app = express();

  // This route intentionally precedes express.json(). Stripe signs the exact
  // bytes received over the wire, so parsing and re-serializing would invalidate
  // the signature.
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (request: Request, response: Response) => {
      const signature = request.get("stripe-signature");
      if (!signature || !Buffer.isBuffer(request.body)) {
        return invalidRequest(response, "Invalid Stripe signature");
      }

      let event: Stripe.Event;
      try {
        event = dependencies.stripe.webhooks.constructEvent(
          request.body,
          signature,
          dependencies.stripeWebhookSecret,
        );
      } catch {
        return invalidRequest(response, "Invalid Stripe signature");
      }

      if (event.type !== "checkout.session.completed") {
        return response.status(200).json({ received: true, ignored: true });
      }

      const revenue = validateCheckoutSession(event);
      if (!revenue) {
        return invalidRequest(response, "Invalid completed Checkout Session");
      }

      dependencies.repository.storeRevenueEvent(revenue);
      const existing = dependencies.repository.getRevenueImpact(
        revenue.stripeSessionId,
      );
      if (existing) {
        return response
          .status(200)
          .json({ status: "completed", ...existing });
      }

      const result = await runImpact(dependencies, revenue.stripeSessionId);
      if (!result) {
        return response.status(500).json({
          status: "retryable_error",
          error: "Revenue attribution could not be completed yet",
        });
      }
      return response.status(200).json({ status: "completed", ...result });
    },
  );

  app.use(express.json({ limit: "32kb", strict: true }));

  app.post("/api/usage", (request: Request, response: Response) => {
    const parsed = UsageEventInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return invalidRequest(response, "Invalid usage event");
    }

    const result = dependencies.repository.recordUsage(parsed.data);
    return response.status(result.duplicate ? 200 : 201).json(result);
  });

  app.post(
    "/api/checkout",
    async (request: Request, response: Response) => {
      const parsed = CheckoutInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return invalidRequest(response, "Invalid checkout request");
      }

      if (
        dependencies.repository.countDistinctFeatures(parsed.data.userId) < 2
      ) {
        return response.status(409).json({
          error: "Use at least two distinct features before checkout",
        });
      }

      try {
        const session = await dependencies.stripe.checkout.sessions.create({
          mode: "payment",
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: { name: "ManeMatch+" },
                unit_amount: 10_000,
              },
              quantity: 1,
            },
          ],
          success_url: `${dependencies.appUrl}/#/attribution?payment=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${dependencies.appUrl}/#/attribution?payment=cancelled`,
          metadata: {
            app_user_id: parsed.data.userId,
            attribution_model: "agent-usage-v1",
          },
        });

        if (!session.url) {
          return response
            .status(502)
            .json({ error: "Stripe did not return a Checkout URL" });
        }
        return response.status(200).json({
          checkoutSessionId: session.id,
          url: session.url,
        });
      } catch {
        return response
          .status(502)
          .json({ error: "Unable to create Stripe Checkout Session" });
      }
    },
  );

  app.post(
    "/api/revenue-impact/run",
    async (request: Request, response: Response) => {
      const parsed = PaymentInputSchema.safeParse(request.body);
      if (!parsed.success || !paymentIdIsValid(parsed.data.paymentId)) {
        return response
          .status(400)
          .json({ status: "error", error: "Invalid payment ID" });
      }
      if (!dependencies.repository.hasRevenueEvent(parsed.data.paymentId)) {
        return response.status(404).json({
          status: "not_found",
          paymentId: parsed.data.paymentId,
        });
      }

      const existing = dependencies.repository.getRevenueImpact(
        parsed.data.paymentId,
      );
      if (existing) {
        return response
          .status(200)
          .json({ status: "completed", ...existing });
      }
      const result = await runImpact(dependencies, parsed.data.paymentId);
      if (!result) {
        return response.status(503).json({
          status: "error",
          error: "Revenue attribution could not be completed yet",
        });
      }
      return response.status(200).json({ status: "completed", ...result });
    },
  );

  app.get(
    "/api/revenue-impact/:paymentId",
    (request: Request, response: Response) => {
      const rawPaymentId = request.params.paymentId;
      if (
        typeof rawPaymentId !== "string" ||
        !paymentIdIsValid(rawPaymentId)
      ) {
        return response
          .status(400)
          .json({ status: "error", error: "Invalid payment ID" });
      }
      const paymentId = rawPaymentId;

      const existing = dependencies.repository.getRevenueImpact(paymentId);
      if (existing) {
        return response
          .status(200)
          .json({ status: "completed", ...existing });
      }
      if (dependencies.repository.hasRevenueEvent(paymentId)) {
        return response
          .status(200)
          .json({ status: "pending", paymentId });
      }
      return response
        .status(200)
        .json({ status: "not_found", paymentId });
    },
  );

  async function sendRetentionImpact(response: Response) {
    if (!dependencies.getRetentionImpact) {
      return response.status(503).json({
        status: "error",
        error: "Retention impact is not configured",
      });
    }
    try {
      const data = RetentionImpactEnvelopeSchema.parse(
        await dependencies.getRetentionImpact(),
      );
      return response.status(200).json({ status: "completed", data });
    } catch {
      return response.status(503).json({
        status: "error",
        error: "Retention impact could not be computed",
      });
    }
  }

  app.get(
    "/api/retention-impact",
    (_request: Request, response: Response) => sendRetentionImpact(response),
  );

  app.post(
    "/api/retention-impact/run",
    (_request: Request, response: Response) => sendRetentionImpact(response),
  );

  app.use(
    (
      _error: unknown,
      _request: Request,
      response: Response,
      _next: express.NextFunction,
    ) => {
      response.status(400).json({
        status: "invalid_request",
        error: "Invalid JSON request",
      });
    },
  );

  return app;
}
