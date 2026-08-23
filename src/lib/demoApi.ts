import {
  RevenueImpactEnvelopeSchema,
  UsageResponseSchema,
  FeatureIdSchema,
  type FeatureId,
  type RevenueImpactEnvelope,
  type UsageEventInput,
  type UsageResponse,
} from "../../shared/contracts";

async function jsonRequest(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "error" in payload
      ? String(payload.error)
      : `Request failed (${response.status})`;
    throw new Error(detail);
  }
  return payload;
}

export async function mirrorUsage(input: UsageEventInput): Promise<UsageResponse> {
  const payload = await jsonRequest("/api/usage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return UsageResponseSchema.parse(payload);
}

export async function createCheckout(userId: string): Promise<string> {
  const payload = await jsonRequest("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!payload || typeof payload !== "object" || !("url" in payload) || typeof payload.url !== "string") {
    throw new Error("Checkout API did not return a redirect URL");
  }
  return payload.url;
}

type ApiImpactStatus =
  | { status: "completed"; data: RevenueImpactEnvelope; model: string; baseline: Array<{ feature_id: FeatureId; weight: number }> }
  | { status: "pending" }
  | { status: "not_found" }
  | { status: "error"; error: string };

function parseImpactStatus(payload: unknown): ApiImpactStatus {
  if (!payload || typeof payload !== "object" || !("status" in payload)) {
    throw new Error("Impact API returned an invalid status");
  }
  const value = payload as Record<string, unknown>;
  const status = value.status;
  if (status === "completed") {
    if (typeof value.model !== "string" || !Array.isArray(value.baseline)) {
      throw new Error("Completed impact response is missing provenance");
    }
    const baseline = value.baseline.map((item) => {
      if (!item || typeof item !== "object") throw new Error("Impact baseline is invalid");
      const entry = item as Record<string, unknown>;
      const feature_id = FeatureIdSchema.parse(entry.feature_id);
      if (typeof entry.weight !== "number" || !Number.isFinite(entry.weight) || entry.weight < 0 || entry.weight > 1) {
        throw new Error("Impact baseline weight is invalid");
      }
      return { feature_id, weight: entry.weight };
    });
    return { status, data: RevenueImpactEnvelopeSchema.parse(value.data), model: value.model, baseline };
  }
  if (status === "pending" || status === "not_found") {
    return { status };
  }
  if (status === "error" && typeof value.error === "string") {
    return { status, error: value.error };
  }
  throw new Error("Impact API returned an invalid status payload");
}

export type ImpactResult = {
  status: ApiImpactStatus;
};

export async function getImpact(paymentId: string, signal?: AbortSignal): Promise<ImpactResult> {
  const payload = await jsonRequest(`/api/revenue-impact/${encodeURIComponent(paymentId)}`, { signal });
  return { status: parseImpactStatus(payload) };
}

export async function recoverImpact(paymentId: string): Promise<ImpactResult> {
  const payload = await jsonRequest("/api/revenue-impact/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentId }),
  });
  return { status: parseImpactStatus(payload) };
}

export function parseCheckoutReturn(): { payment: string | null; paymentId: string | null } {
  const query = new URLSearchParams(window.location.search);
  const hashQuery = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  return {
    payment: hashQuery.get("payment") ?? query.get("payment"),
    paymentId: hashQuery.get("session_id") ?? query.get("session_id"),
  };
}

export function isConserved(envelope: RevenueImpactEnvelope): boolean {
  const impact = envelope.impact;
  const allocated = impact.allocations.reduce((sum, item) => sum + item.revenue_impact_cents, 0);
  return allocated + impact.unattributed_revenue_cents === impact.total_revenue_cents;
}
