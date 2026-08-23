import { useCallback, useEffect, useMemo, useState } from "react";

import {
  FEATURE_ACTIONS,
  type FeatureId,
  type RevenueImpactEnvelope,
  type UsageResponse,
} from "../../shared/contracts";
import {
  createCheckout,
  getImpact,
  isConserved,
  mirrorUsage,
  parseCheckoutReturn,
  recoverImpact,
  type ImpactResult,
} from "../lib/demoApi";
import { getDemoSessionId, getDemoUserId } from "../lib/demoIdentity";
import { captureFeatureUsed, identifyDemoUser } from "../lib/posthog";
import { Bar, Big, Button, Label, Panel, Tag } from "../ui/bits";
import { T, glow } from "../ui/theme";

const FEATURES: Array<{ id: FeatureId; name: string; color: string }> = [
  { id: "search", name: "Horse Discovery", color: T.cyan },
  { id: "summary", name: "AI Compatibility", color: T.magenta },
  { id: "sharing", name: "Stable Sharing", color: T.violet },
];

const SEARCH_CORPUS = [
  "Juniper · 6-year-old Hanoverian · dressage · Bay Area",
  "Apollo · 8-year-old Thoroughbred · trail riding · Austin",
  "Clover · 5-year-old Connemara · eventing · Portland",
  "Marigold · 7-year-old Quarter Horse · western · Denver",
];

const PRELOADED_DOCUMENT = "Juniper prefers calm morning rides, dressage arenas, apple treats, and confident trail partners. She is social in turnout and travels well.";

type FeatureStatus = Partial<Record<FeatureId, string>>;
type Totals = Record<FeatureId, number>;
const EMPTY_TOTALS: Totals = { search: 0, summary: 0, sharing: 0 };
const TOTALS_STORAGE_KEY = "code-of-duty.db-confirmed-usage";
const fieldStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: T.bg, border: `1px solid ${T.borderStrong}`, color: T.ink, padding: "11px 12px", font: "inherit", marginTop: 10 };

function asTotals(value: UsageResponse["totals"]): Totals {
  return { search: value.search ?? 0, summary: value.summary ?? 0, sharing: value.sharing ?? 0 };
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function storedTotals(): Totals {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(TOTALS_STORAGE_KEY) ?? "null") as Partial<Totals> | null;
    return value ? { search: value.search ?? 0, summary: value.summary ?? 0, sharing: value.sharing ?? 0 } : EMPTY_TOTALS;
  } catch {
    return EMPTY_TOTALS;
  }
}

export function AttributionPage() {
  const identity = useMemo(() => ({ userId: getDemoUserId(), sessionId: getDemoSessionId() }), []);
  const checkoutReturn = useMemo(parseCheckoutReturn, []);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [totals, setTotals] = useState<Totals>(storedTotals);
  const [featureStatus, setFeatureStatus] = useState<FeatureStatus>({});
  const [busyFeature, setBusyFeature] = useState<FeatureId | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [impact, setImpact] = useState<RevenueImpactEnvelope | null>(null);
  const [impactMeta, setImpactMeta] = useState<{ model?: string; baseline?: Array<{ feature_id: FeatureId; weight: number }> }>({});
  const [impactState, setImpactState] = useState<"idle" | "polling" | "waiting" | "error" | "completed">(checkoutReturn.paymentId ? "polling" : "idle");
  const [impactError, setImpactError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [posthogEnabled] = useState(() => identifyDemoUser(identity.userId));

  const distinctFeatures = FEATURES.filter((feature) => totals[feature.id] > 0).length;
  const canCheckout = distinctFeatures >= 2 && !checkoutBusy;

  const acceptImpact = useCallback((result: ImpactResult): boolean => {
    if (result.status.status === "completed") {
      setImpactMeta({ model: result.status.model, baseline: result.status.baseline });
      setImpact(result.status.data);
      setImpactState("completed");
      setImpactError(null);
      return true;
    }
    if (result.status.status === "error") {
      setImpactState("error");
      setImpactError(result.status.error);
      return true;
    }
    // A Stripe redirect can beat webhook delivery. Keep polling through an
    // initial 404 and only surface the recovery state after the retry budget.
    setImpactState("polling");
    return false;
  }, []);

  useEffect(() => {
    if (!checkoutReturn.paymentId || impactState !== "polling") return;
    const controller = new AbortController();
    let attempts = 0;
    let timer = 0;
    const poll = async () => {
      try {
        attempts += 1;
        const result = await getImpact(checkoutReturn.paymentId!, controller.signal);
        if (acceptImpact(result)) return;
        if (attempts >= 25) {
          setImpactState("waiting");
          return;
        }
        timer = window.setTimeout(poll, 1200);
      } catch (error) {
        if (controller.signal.aborted) return;
        setImpactState("error");
        setImpactError(error instanceof Error ? error.message : "Unable to load revenue impact");
      }
    };
    void poll();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [acceptImpact, checkoutReturn.paymentId, impactState]);

  const recordSuccess = async (featureId: FeatureId) => {
    const usageEventId = crypto.randomUUID();
    const action = FEATURE_ACTIONS[featureId];
    captureFeatureUsed({ usageEventId, featureId, action, userId: identity.userId, sessionId: identity.sessionId });
    setBusyFeature(featureId);
    setFeatureStatus((current) => ({ ...current, [featureId]: "Sending matching event to PostHog + database…" }));
    try {
      const response = await mirrorUsage({ usageEventId, featureId, action, userId: identity.userId, sessionId: identity.sessionId });
      const confirmedTotals = asTotals(response.totals);
      setTotals(confirmedTotals);
      window.sessionStorage.setItem(TOTALS_STORAGE_KEY, JSON.stringify(confirmedTotals));
      setFeatureStatus((current) => ({ ...current, [featureId]: `Database confirmed event ${response.eventId.slice(0, 8)}…` }));
    } catch (error) {
      setFeatureStatus((current) => ({ ...current, [featureId]: `Interaction succeeded; database mirror failed: ${error instanceof Error ? error.message : "unknown error"}` }));
    } finally {
      setBusyFeature(null);
    }
  };

  const runSearch = () => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      setFeatureStatus((current) => ({ ...current, search: "Enter a query first." }));
      return;
    }
    const words = normalized.split(/\s+/);
    const matches = SEARCH_CORPUS.filter((item) => words.some((word) => item.toLowerCase().includes(word)));
    setSearchResults(matches.length ? matches : SEARCH_CORPUS.slice(0, 2));
    void recordSuccess("search");
  };

  const generateSummary = () => {
    setSummary("Strong compatibility: both profiles favor calm morning exercise, structured arena work, and social turnout. Suggested first meet: a low-pressure parallel trail walk.");
    void recordSuccess("summary");
  };

  const generateShareLink = () => {
    setShareLink(`${window.location.origin}/stable/juniper-${crypto.randomUUID().slice(0, 8)}`);
    void recordSuccess("sharing");
  };

  const startCheckout = async () => {
    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      window.location.assign(await createCheckout(identity.userId));
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Unable to create Stripe Checkout");
      setCheckoutBusy(false);
    }
  };

  const recover = async () => {
    if (!checkoutReturn.paymentId) return;
    setImpactState("polling");
    setImpactError(null);
    try {
      acceptImpact(await recoverImpact(checkoutReturn.paymentId));
    } catch (error) {
      setImpactState("error");
      setImpactError(error instanceof Error ? error.message : "Unable to rerun attribution");
    }
  };

  const allocationColors: Record<FeatureId, string> = { search: T.cyan, summary: T.magenta, sharing: T.violet };
  const allocationNames: Record<FeatureId, string> = { search: "Horse Discovery", summary: "AI Compatibility", sharing: "Stable Sharing" };
  const fallback = impactMeta.model === "deterministic-baseline-v1";
  const impactJson = impact ? JSON.stringify(impact, null, 2) : "";
  const baseline = Object.fromEntries((impactMeta.baseline ?? []).map((item) => [item.feature_id, item.weight])) as Partial<Record<FeatureId, number>>;

  if (impact) {
    const output = impact.impact;
    const conserved = isConserved(impact);
    return (
      <div className="narrow-page attribution-page">
        <a href="#/retention" className="back-link">← IMPACT</a>
        <div className="page-intro compact"><div><Label color={T.good}>Live revenue attribution</Label><h1 className="display page-title">IMPACT COMMITTED</h1><p>Stripe payment and pre-payment feature evidence produced a validated JSON record.</p></div><Tag color={conserved ? T.good : T.bad}>{conserved ? "REVENUE CONSERVED" : "VALIDATION FAILED"}</Tag></div>
        {fallback && <Panel color={T.warn} style={{ marginBottom: 14 }}><Label color={T.warn}>Deterministic fallback</Label><p className="decision-copy">The model provider was unavailable, so this run used the explicitly labeled deterministic attribution fallback.</p></Panel>}
        <Panel color={T.good} className="sweep">
          <div className="result-head"><div><Label color={T.good}>Revenue impact · {output.payment_id}</Label><h2 className="display">ALLOCATION PASSED</h2><p>{impactMeta.model ? `Run model: ${impactMeta.model}` : "Schema-validated agent-usage-v1 output"}</p></div><div><Big color={T.yellow} size={76}>{money(output.total_revenue_cents)}</Big><Tag color={T.good}>{impact.schema_version}</Tag></div></div>
        </Panel>
        <Panel color={T.cyan} style={{ marginTop: 14 }}>
          <Label color={T.cyan}>Deterministic baseline vs agent attribution</Label>
          <div className="allocation-result-list">{output.allocations.map((item) => {
            const color = allocationColors[item.feature_id];
            const pct = item.weight * 100;
            const baselinePct = (baseline[item.feature_id] ?? 0) * 100;
            return <div key={item.feature_id}><span><strong>{allocationNames[item.feature_id]}</strong><small>Baseline {baselinePct.toFixed(0)}% · confidence {(item.confidence * 100).toFixed(0)}%</small></span><Bar pct={pct} color={color} height={12} /><b className="display" style={{ color, textShadow: glow(color) }}>{pct.toFixed(0)}%</b><b className="display" style={{ color: T.yellow }}>{money(item.revenue_impact_cents)}</b></div>;
          })}</div>
          <div className="result-total"><span>TOTAL ATTRIBUTED + UNATTRIBUTED</span><b className="display">{money(output.allocations.reduce((sum, item) => sum + item.revenue_impact_cents, 0) + output.unattributed_revenue_cents)} / {money(output.total_revenue_cents)}</b></div>
        </Panel>
        <div className="detail-grid attribution-evidence">
          <Panel><Label>Evidence returned by agent</Label><div className="evidence-copy">{output.allocations.map((item) => <div key={item.feature_id}><p><b>{allocationNames[item.feature_id]}</b> — {item.reasoning}</p><ul>{item.evidence.map((line) => <li key={line}>{line}</li>)}</ul></div>)}</div></Panel>
          <Panel color={T.violet}><Label color={T.violet}>Machine-readable output</Label><p className="decision-copy">This exact versioned envelope is the stable input for a future Greptile adapter. Milestone 1 does not send customer records to Greptile, and the UI never recomputes cents.</p><div className="confidence"><span>RUN ID</span><b className="display" style={{ fontSize: 18 }}>{impact.run_id.slice(0, 12)}</b></div><Button color={T.violet} onClick={() => setShowJson(true)}>View raw JSON</Button></Panel>
        </div>
        <div className="result-actions"><Button href="#/retention" color={T.cyan}>View updated impact</Button></div>
        {showJson && <div className="drawer-backdrop" onClick={() => setShowJson(false)}><aside className="json-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-head"><div><Label color={T.cyan}>Validated output envelope</Label><h2 className="display">RAW JSON</h2></div><button onClick={() => setShowJson(false)}>CLOSE ×</button></div><div className="drawer-tabs"><Tag color={T.cyan}>{impact.schema_version}</Tag><Tag color={T.good}>SCHEMA VALID</Tag></div><pre>{impactJson}</pre><div className="drawer-validation"><span>✓</span><div><b>REVENUE CONSERVATION {conserved ? "PASSED" : "FAILED"}</b><small>{output.total_revenue_cents.toLocaleString()} total cents · {output.unattributed_revenue_cents} unattributed</small></div></div></aside></div>}
      </div>
    );
  }

  return (
    <div className="narrow-page attribution-page">
      <a href="#/retention" className="back-link">← IMPACT</a>
      <div className="page-intro compact"><div><Label color={T.cyan}>Milestone 1 · live integration</Label><h1 className="display page-title">USE FEATURES. GET PAID.</h1><p>Complete two real demo workflows, then make a $100 Stripe test payment.</p></div><div className="tag-row"><Tag color={posthogEnabled ? T.good : T.warn}>{posthogEnabled ? "POSTHOG READY" : "POSTHOG KEY MISSING"}</Tag><Tag color={T.cyan}>DB · {Object.values(totals).reduce((a, b) => a + b, 0)} EVENTS</Tag></div></div>

      {checkoutReturn.payment === "cancelled" && <Panel color={T.warn} style={{ marginBottom: 14 }}><Label color={T.warn}>Checkout cancelled</Label><p className="decision-copy">No payment was recorded. Your feature usage remains available for another test checkout.</p></Panel>}
      {checkoutReturn.paymentId && <Panel color={impactState === "error" ? T.bad : T.cyan} className={impactState === "polling" ? "sweep" : undefined} style={{ marginBottom: 14 }}><div className="pipeline-head" style={{ marginBottom: 0 }}><div><Label color={impactState === "error" ? T.bad : T.cyan}>Stripe return · {checkoutReturn.paymentId}</Label><h2 className="display" style={{ margin: "8px 0 4px" }}>{impactState === "polling" ? "WAITING FOR SIGNED WEBHOOK" : impactState === "waiting" ? "PAYMENT NOT READY" : "ATTRIBUTION NEEDS RECOVERY"}</h2><p className="decision-copy" style={{ margin: 0 }}>{impactError ?? "The page is polling for the validated revenue-impact envelope."}</p></div>{(impactState === "waiting" || impactState === "error") && <Button color={T.warn} onClick={() => void recover()}>Run recovery</Button>}</div></Panel>}

      <div className="detail-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <Panel color={T.cyan}><Label color={T.cyan}>01 · Horse Discovery</Label><h2 className="display" style={{ margin: "8px 0" }}>FIND A MATCH</h2><p className="microcopy">Filter the ManeMatch herd and reveal compatible profiles.</p><input aria-label="Horse discovery query" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") runSearch(); }} placeholder="Try: dressage" style={fieldStyle} /><div className="action-row"><Button small color={T.cyan} onClick={runSearch}>{busyFeature === "search" ? "Saving…" : "Discover"}</Button><Tag color={T.cyan}>{totals.search} DB</Tag></div>{searchResults.length > 0 && <div className="evidence-copy">{searchResults.map((result) => <p key={result}>{result}</p>)}</div>}<p className="microcopy">{featureStatus.search}</p></Panel>
        <Panel color={T.magenta}><Label color={T.magenta}>02 · AI Compatibility</Label><h2 className="display" style={{ margin: "8px 0" }}>MATCH NOTE</h2><p className="microcopy">{PRELOADED_DOCUMENT}</p><div className="action-row"><Button small color={T.magenta} onClick={generateSummary}>{busyFeature === "summary" ? "Saving…" : "Generate insight"}</Button><Tag color={T.magenta}>{totals.summary} DB</Tag></div>{summary && <p className="decision-copy">{summary}</p>}<p className="microcopy">{featureStatus.summary}</p></Panel>
        <Panel color={T.violet}><Label color={T.violet}>03 · Stable Sharing</Label><h2 className="display" style={{ margin: "8px 0" }}>PROFILE LINK</h2><p className="microcopy">Generate a stable-safe link for Juniper's profile.</p><div className="action-row"><Button small color={T.violet} onClick={generateShareLink}>{busyFeature === "sharing" ? "Saving…" : "Share profile"}</Button><Tag color={T.violet}>{totals.sharing} DB</Tag></div>{shareLink && <input aria-label="Generated stable profile link" readOnly value={shareLink} style={fieldStyle} />}<p className="microcopy">{featureStatus.sharing}</p></Panel>
      </div>

      <Panel color={canCheckout ? T.good : T.yellow} style={{ marginTop: 14 }}>
        <div className="result-head"><div><Label color={canCheckout ? T.good : T.yellow}>Stripe test payment</Label><h2 className="display">MANEMATCH+</h2><p>{canCheckout ? "Two distinct features are database-confirmed. Checkout is unlocked." : `Use ${Math.max(0, 2 - distinctFeatures)} more distinct feature${2 - distinctFeatures === 1 ? "" : "s"} to unlock checkout.`}</p>{checkoutError && <p style={{ color: T.bad }}>{checkoutError}</p>}</div><div><Big color={T.yellow} size={64}>$100.00</Big><button className="chamfer-sm cod-button" disabled={!canCheckout} onClick={() => void startCheckout()} style={{ background: canCheckout ? T.good : T.borderStrong, border: 0, color: T.bg, padding: "12px 20px", fontWeight: 900, letterSpacing: 1.4, cursor: canCheckout ? "pointer" : "not-allowed", marginTop: 10 }}>{checkoutBusy ? "OPENING STRIPE…" : "PAY IN STRIPE TEST MODE"}</button></div></div>
      </Panel>
      <p className="microcopy">Demo customer: {identity.userId} · browser session: {identity.sessionId}</p>
    </div>
  );
}
