import { useEffect, useMemo, useState } from "react";

import { Bar, Big, Button, Label, Panel, Tag } from "../ui/bits";
import { T, glow } from "../ui/theme";
import "./retention.css";

type FeatureId = "search" | "summary" | "sharing";

type RetentionFeature = {
  feature_id: FeatureId;
  name: string;
  retained_revenue_cents: number;
  retention_lift_pp: number;
  adopter_renewal_rate: number;
  non_adopter_renewal_rate: number;
  confidence: number;
  evidence: string[];
  reasoning: string;
};

type RetentionImpact = {
  schema_version: "retention-impact/v1";
  cohort: {
    label: string;
    customers: number;
    renewals: number;
    churns: number;
    retained_revenue_cents: number;
  };
  features: RetentionFeature[];
  validation: {
    allocated_revenue_cents: number;
    revenue_conserved: boolean;
  };
};

type RetentionImpactEnvelope = {
  schema_version: "retention-impact/v1";
  run_id: string;
  generated_at: string;
  impact: {
    cohort_id: string;
    customer_count: number;
    renewed_customer_count: number;
    total_retained_revenue_cents: number;
    currency: "usd";
    methodology: "observed-retention-lift-v1";
    causality_notice: string;
    features: Array<{
      feature_id: FeatureId;
      renewal_rate_with_feature: number;
      renewal_rate_without_feature: number;
      observed_retention_lift: number;
      retained_revenue_impact_cents: number;
      evidence: string[];
      reasoning: string;
      confidence: number;
    }>;
    unattributed_retained_revenue_cents: number;
  };
};

const FEATURE_NAMES: Record<FeatureId, string> = {
  search: "Horse Discovery",
  summary: "AI Compatibility",
  sharing: "Stable Sharing",
};

const SEED: RetentionImpact = {
  schema_version: "retention-impact/v1",
  cohort: {
    label: "ManeMatch seeded Q3 renewal cohort",
    customers: 180,
    renewals: 123,
    churns: 57,
    retained_revenue_cents: 1_000_000,
  },
  features: [
    {
      feature_id: "search",
      name: FEATURE_NAMES.search,
      retained_revenue_cents: 727_273,
      retention_lift_pp: 30,
      adopter_renewal_rate: 85,
      non_adopter_renewal_rate: 55,
      confidence: 0.91,
      evidence: ["85% of Horse Discovery adopters renewed", "Adopters renewed 30 percentage points more often", "Strongest repeated workflow in the seeded cohort"],
      reasoning: "Horse Discovery has the largest observed renewal-rate separation and receives the largest retained-revenue allocation.",
    },
    {
      feature_id: "summary",
      name: FEATURE_NAMES.summary,
      retained_revenue_cents: 181_818,
      retention_lift_pp: 10,
      adopter_renewal_rate: 75,
      non_adopter_renewal_rate: 65,
      confidence: 0.82,
      evidence: ["75% of AI Compatibility adopters renewed", "Adopters renewed 10 percentage points more often", "Repeated use appeared in retained customer workflows"],
      reasoning: "AI Compatibility shows a meaningful but smaller renewal association than Horse Discovery.",
    },
    {
      feature_id: "sharing",
      name: FEATURE_NAMES.sharing,
      retained_revenue_cents: 90_909,
      retention_lift_pp: 4,
      adopter_renewal_rate: 70.7,
      non_adopter_renewal_rate: 66.7,
      confidence: 0.67,
      evidence: ["70.7% of Stable Sharing adopters renewed", "Observed renewal difference was 4 percentage points", "Weakest separation among the three feature cohorts"],
      reasoning: "Stable Sharing remains associated with retained revenue, but the cohort separation is comparatively weak.",
    },
  ],
  validation: { allocated_revenue_cents: 1_000_000, revenue_conserved: true },
};

const COLORS: Record<FeatureId, string> = { search: T.cyan, summary: T.magenta, sharing: T.violet };

function dollars(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function readPayload(payload: unknown): { view: RetentionImpact; artifact: RetentionImpactEnvelope } {
  const candidate = payload && typeof payload === "object" && "data" in payload
    ? (payload as { data: unknown }).data
    : payload;
  if (!candidate || typeof candidate !== "object") throw new Error("Retention API returned an unsupported JSON shape");
  const envelope = candidate as RetentionImpactEnvelope;
  const core = envelope.impact;
  if (envelope.schema_version !== "retention-impact/v1" || !core || !Array.isArray(core.features) || core.features.length !== 3) {
    throw new Error("Retention API returned an unsupported JSON shape");
  }
  const view: RetentionImpact = {
    schema_version: envelope.schema_version,
    cohort: {
      label: core.cohort_id,
      customers: core.customer_count,
      renewals: core.renewed_customer_count,
      churns: core.customer_count - core.renewed_customer_count,
      retained_revenue_cents: core.total_retained_revenue_cents,
    },
    features: core.features.map((feature) => ({
      feature_id: feature.feature_id,
      name: FEATURE_NAMES[feature.feature_id],
      retained_revenue_cents: feature.retained_revenue_impact_cents,
      retention_lift_pp: feature.observed_retention_lift * 100,
      adopter_renewal_rate: feature.renewal_rate_with_feature * 100,
      non_adopter_renewal_rate: feature.renewal_rate_without_feature * 100,
      confidence: feature.confidence,
      evidence: feature.evidence,
      reasoning: feature.reasoning,
    })),
    validation: {
      allocated_revenue_cents: core.features.reduce((sum, feature) => sum + feature.retained_revenue_impact_cents, core.unattributed_retained_revenue_cents),
      revenue_conserved: core.features.reduce((sum, feature) => sum + feature.retained_revenue_impact_cents, core.unattributed_retained_revenue_cents) === core.total_retained_revenue_cents,
    },
  };
  return { view, artifact: envelope };
}

export function RetentionPage() {
  const [impact, setImpact] = useState<RetentionImpact>(SEED);
  const [artifact, setArtifact] = useState<unknown>(SEED);
  const [source, setSource] = useState<"loading" | "api" | "seeded">("loading");
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<FeatureId>("search");
  const [showJson, setShowJson] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setSource("loading");
    setError(null);
    void fetch("/api/retention-impact", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as unknown;
        if (!response.ok) throw new Error(`Retention API unavailable (${response.status})`);
        return readPayload(payload);
      })
      .then(({ view, artifact: validatedArtifact }) => {
        setImpact(view);
        setArtifact(validatedArtifact);
        setSource("api");
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setImpact(SEED);
        setArtifact(SEED);
        setSource("seeded");
        setError(requestError instanceof Error ? requestError.message : "Retention API unavailable");
      });
    return () => controller.abort();
  }, [refreshKey]);

  const selected = impact.features.find((feature) => feature.feature_id === selectedId) ?? impact.features[0];
  const renewalRate = impact.cohort.customers > 0 ? (impact.cohort.renewals / impact.cohort.customers) * 100 : 0;
  const allocated = impact.features.reduce((sum, feature) => sum + feature.retained_revenue_cents, 0);
  const conserved = allocated === impact.cohort.retained_revenue_cents && impact.validation.revenue_conserved;
  const rawJson = useMemo(() => JSON.stringify(artifact, null, 2), [artifact]);

  return (
    <div className="narrow-page retention-page">
      <nav className="retention-tabs" aria-label="Impact analysis mode">
        <span className="active">Retention · Cohorts</span>
        <a href="#/attribution">Acquisition · Single payment</a>
      </nav>

      <header className="retention-hero">
        <div>
          <Label color={T.good}>Revenue survival system</Label>
          <h1 className="display">WHAT FEATURES ARE<br /><em>KEEPING REVENUE ALIVE?</em></h1>
          <p>Compare feature-adoption cohorts with Stripe renewal outcomes, then allocate retained revenue through a validated, inspectable JSON record.</p>
        </div>
        <div className="retention-source">
          <Tag color={source === "api" ? T.good : source === "loading" ? T.cyan : T.warn}>
            {source === "api" ? "SEEDED API RESPONSE" : source === "loading" ? "CHECKING API" : "SEEDED DEMO DATA"}
          </Tag>
          <small>{impact.cohort.label}</small>
        </div>
      </header>

      {source === "loading" && <Panel color={T.cyan} className="retention-notice sweep"><Label color={T.cyan}>Loading</Label><p>Requesting <code>GET /api/retention-impact</code>…</p></Panel>}
      {source === "seeded" && <Panel color={T.warn} className="retention-notice"><div><Label color={T.warn}>API unavailable · showing explicit fixture</Label><p>{error}. These numbers are seeded demonstration data, not a live PostHog or Stripe claim.</p></div><Button small color={T.warn} onClick={() => setRefreshKey((value) => value + 1)}>Retry API</Button></Panel>}

      <section className="retention-pipeline" aria-label="Retention impact pipeline">
        <div><i style={{ color: T.cyan }}>01</i><b>POSTHOG ADOPTION</b><small>Successful feature use by customer</small></div>
        <span>→</span>
        <div><i style={{ color: T.yellow }}>02</i><b>STRIPE OUTCOMES</b><small>Renewed versus churned revenue</small></div>
        <span>→</span>
        <div><i style={{ color: T.magenta }}>03</i><b>COHORT COMPARISON</b><small>Adopters versus non-adopters</small></div>
        <span>→</span>
        <div><i style={{ color: T.good }}>04</i><b>VALIDATED JSON</b><small>Exact revenue conservation</small></div>
        <span>→</span>
        <div><i style={{ color: T.violet }}>05</i><b>LEADERBOARD</b><small>Features ranked by impact</small></div>
      </section>

      <section className="retention-huds">
        <Panel color={T.cyan}><Label>Cohort customers</Label><Big color={T.cyan} size={48}>{impact.cohort.customers}</Big><small>Observed in cohort</small></Panel>
        <Panel color={T.good}><Label>Renewals</Label><Big color={T.good} size={48}>{impact.cohort.renewals}</Big><small>{renewalRate.toFixed(1)}% renewed</small></Panel>
        <Panel color={T.bad}><Label>Churns</Label><Big color={T.bad} size={48}>{impact.cohort.churns}</Big><small>{(100 - renewalRate).toFixed(1)}% churned</small></Panel>
        <Panel color={T.yellow}><Label>Retained revenue</Label><Big color={T.yellow} size={48}>{dollars(impact.cohort.retained_revenue_cents)}</Big><small>Exactly allocated below</small></Panel>
      </section>

      <div className="retention-main-grid">
        <Panel color={T.cyan} className="retention-leaderboard">
          <div className="retention-panel-head"><div><Label color={T.cyan}>Feature survival leaderboard</Label><h2 className="display">RETAINED REVENUE</h2></div><Tag color={conserved ? T.good : T.bad}>{conserved ? "CONSERVATION PASSED" : "CONSERVATION FAILED"}</Tag></div>
          <div className="retention-table-head"><span>Rank / feature</span><span>Cohort lift</span><span>Renewal</span><span>Confidence</span><span>Revenue kept</span></div>
          {impact.features.map((feature, index) => {
            const color = COLORS[feature.feature_id];
            const active = feature.feature_id === selected.feature_id;
            return (
              <button key={feature.feature_id} className={active ? "active" : ""} onClick={() => setSelectedId(feature.feature_id)} style={{ ["--feature-color" as string]: color }}>
                <span className="retention-feature-name"><i className="display">0{index + 1}</i><b>{feature.name}</b><small>{Math.round((feature.retained_revenue_cents / impact.cohort.retained_revenue_cents) * 100)}% of retained revenue</small></span>
                <strong style={{ color }}>+{feature.retention_lift_pp.toFixed(1).replace(".0", "")}pp</strong>
                <strong>{feature.adopter_renewal_rate.toFixed(1).replace(".0", "")}%</strong>
                <span><Bar pct={feature.confidence * 100} color={color} /><small>{Math.round(feature.confidence * 100)}%</small></span>
                <strong className="display revenue" style={{ color, textShadow: glow(color) }}>{dollars(feature.retained_revenue_cents)}</strong>
              </button>
            );
          })}
          <div className="retention-total"><span>ALLOCATED RETAINED REVENUE</span><b className="display">{dollars(allocated)} / {dollars(impact.cohort.retained_revenue_cents)}</b></div>
        </Panel>

        <Panel color={COLORS[selected.feature_id]} className="retention-detail">
          <Label color={COLORS[selected.feature_id]}>Feature detail · {selected.feature_id}</Label>
          <h2 className="display">{selected.name}</h2>
          <Big color={COLORS[selected.feature_id]} size={54}>{dollars(selected.retained_revenue_cents)}</Big>
          <div className="cohort-comparison">
            <div><span>Feature adopters</span><b style={{ color: COLORS[selected.feature_id] }}>{selected.adopter_renewal_rate.toFixed(1).replace(".0", "")}%</b><Bar pct={selected.adopter_renewal_rate} color={COLORS[selected.feature_id]} /></div>
            <div><span>Non-adopters</span><b>{selected.non_adopter_renewal_rate.toFixed(1).replace(".0", "")}%</b><Bar pct={selected.non_adopter_renewal_rate} color={T.ink3} /></div>
          </div>
          <p className="retention-reasoning">{selected.reasoning}</p>
          <ul>{selected.evidence.map((line) => <li key={line}>{line}</li>)}</ul>
          <div className="correlation-caution"><b>CORRELATION CAUTION</b><p>This cohort comparison shows association, not causal proof. Customer intent, plan, tenure, and other feature usage may affect both adoption and renewal.</p></div>
          <Button color={COLORS[selected.feature_id]} onClick={() => setShowJson(true)}>Inspect raw JSON</Button>
        </Panel>
      </div>

      {showJson && <div className="retention-drawer-backdrop" onClick={() => setShowJson(false)}><aside className="retention-json-drawer" onClick={(event) => event.stopPropagation()}><div className="retention-drawer-head"><div><Label color={T.good}>Validated retention artifact</Label><h2 className="display">RAW JSON</h2></div><button onClick={() => setShowJson(false)}>CLOSE ×</button></div><div className="retention-json-tags"><Tag color={T.cyan}>{impact.schema_version}</Tag><Tag color={source === "api" ? T.good : T.warn}>{source === "api" ? "API SOURCE" : "SEEDED FIXTURE"}</Tag><Tag color={conserved ? T.good : T.bad}>{conserved ? "EXACT TOTAL" : "INVALID TOTAL"}</Tag></div><pre>{rawJson}</pre></aside></div>}
    </div>
  );
}

export default RetentionPage;
