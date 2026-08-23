import { useMemo, useState } from "react";
import { FEATURE_ACTIONS, type FeatureId, type UsageResponse } from "../../shared/contracts";
import { createCheckout, mirrorUsage } from "../lib/demoApi";
import { getDemoSessionId, getDemoUserId } from "../lib/demoIdentity";
import { captureFeatureUsed, identifyDemoUser, isPostHogConfigured } from "../lib/posthog";
import "./orbit-docs.css";

type ObserverEvent = {
  id: string;
  featureId: FeatureId;
  action: string;
  occurredAt: Date;
  posthog: "captured" | "demo";
  mirror: "sending" | "synced" | "failed";
};

const featureNames: Record<FeatureId, string> = {
  search: "Semantic Search",
  summary: "AI Summary",
  sharing: "Share Link",
};

const emptyTotals: UsageResponse["totals"] = { search: 0, summary: 0, sharing: 0 };

export function OrbitDocs() {
  const [query, setQuery] = useState("What is our enterprise plan?");
  const [searchResults, setSearchResults] = useState(false);
  const [summary, setSummary] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [events, setEvents] = useState<ObserverEvent[]>([]);
  const [totals, setTotals] = useState<UsageResponse["totals"]>(emptyTotals);
  const [mirroredCount, setMirroredCount] = useState(0);
  const [busy, setBusy] = useState<FeatureId | "checkout" | null>(null);
  const [notice, setNotice] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const userId = useMemo(getDemoUserId, []);
  const sessionId = useMemo(getDemoSessionId, []);
  const posthogConfigured = isPostHogConfigured();
  const usedFeatures = new Set(events.map((event) => event.featureId));

  async function recordFeature(featureId: FeatureId) {
    const usageEventId = crypto.randomUUID();
    const action = FEATURE_ACTIONS[featureId];
    const captured = identifyDemoUser(userId) && captureFeatureUsed({ usageEventId, featureId, action, userId, sessionId });
    const event: ObserverEvent = { id: usageEventId, featureId, action, occurredAt: new Date(), posthog: captured ? "captured" : "demo", mirror: "sending" };
    setEvents((current) => [event, ...current]);
    try {
      const response = await mirrorUsage({ usageEventId, userId, featureId, action, sessionId });
      setTotals(response.totals);
      setMirroredCount(response.mirroredEventCount);
      setEvents((current) => current.map((item) => item.id === usageEventId ? { ...item, mirror: "synced" } : item));
    } catch {
      setEvents((current) => current.map((item) => item.id === usageEventId ? { ...item, mirror: "failed" } : item));
    }
    setNotice(`${featureNames[featureId]} completed · feature_used logged`);
    window.setTimeout(() => setNotice(""), 2600);
  }

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy("search");
    await new Promise((resolve) => window.setTimeout(resolve, 260));
    setSearchResults(true);
    await recordFeature("search");
    setBusy(null);
  }

  async function generateSummary() {
    setBusy("summary");
    await new Promise((resolve) => window.setTimeout(resolve, 420));
    setSummary(true);
    await recordFeature("summary");
    setBusy(null);
  }

  async function createShareLink() {
    setBusy("sharing");
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    setShareUrl("orbitdocs.app/share/qd83ks");
    await recordFeature("sharing");
    setBusy(null);
  }

  async function upgrade() {
    setBusy("checkout");
    setCheckoutError("");
    try {
      const url = await createCheckout(userId);
      window.location.assign(url);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Unable to open Stripe Checkout");
      setBusy(null);
    }
  }

  return (
    <div className="orbit-app">
      <header className="orbit-topbar">
        <div className="orbit-brand"><span className="orbit-logo">O</span><strong>Orbit Docs</strong><span className="orbit-plan">PRO TRIAL</span></div>
        <div className="orbit-doc-title"><span>Q3 Product Strategy</span><em>Saved</em></div>
        <div className="orbit-account"><span className="orbit-mode">LIVE DEMO</span><span className="orbit-avatar">CC</span><span><strong>Casey Chen</strong><small>Acme Workspace</small></span></div>
      </header>

      <div className="orbit-layout">
        <aside className="orbit-sidebar">
          <a className="back-to-cod" href="#/overview">← Code of Duty</a>
          <button className="new-doc">＋ New document</button>
          <nav>
            <span>WORKSPACE</span>
            <a className="active" href="#/demo">▤ All documents</a>
            <a href="#/demo">⌕ Search</a>
            <a href="#/demo">☆ Favorites</a>
            <span>RECENT</span>
            <a className="active-doc" href="#/demo"><i className="doc-purple" />Q3 Product Strategy</a>
            <a href="#/demo"><i className="doc-blue" />Enterprise rollout</a>
            <a href="#/demo"><i className="doc-green" />Customer research</a>
          </nav>
          <div className="orbit-sidebar-foot"><span>3 of 10 members</span><div><i /><i /><i /></div></div>
        </aside>

        <main className="orbit-document">
          <div className="document-meta"><span className="doc-icon">▤</span><div><span>Product / Strategy</span><small>Edited just now</small></div><button>•••</button></div>
          <div className="demo-path" aria-label="Demo flow">
            <div className="active"><b>1</b><span><strong>Use 2 features</strong><small>Successful actions only</small></span></div>
            <i>→</i>
            <div className={usedFeatures.size >= 2 ? "active" : ""}><b>2</b><span><strong>Pay $100</strong><small>Stripe test mode</small></span></div>
            <i>→</i>
            <div><b>3</b><span><strong>See revenue impact</strong><small>Code of Duty result</small></span></div>
          </div>
          <article>
            <h1>Q3 Product Strategy</h1>
            <p className="document-lede">Our enterprise strategy makes institutional knowledge easier to find, understand, and share.</p>
          </article>

          <section className="orbit-tools">
            <div className="orbit-tools-head"><div><span>ORBIT INTELLIGENCE</span><h2>Work with this document</h2></div><span className="beta-pill">BETA</span></div>
            <form className="search-tool" onSubmit={runSearch}>
              <label htmlFor="orbit-search">Search your workspace</label>
              <div><span>⌕</span><input id="orbit-search" value={query} onChange={(event) => setQuery(event.target.value)} /><button disabled={busy === "search"}>{busy === "search" ? "Searching…" : "Search"}</button></div>
            </form>
            {searchResults && <div className="search-results"><div><span>Q3 Product Strategy</span><strong>Enterprise expansion</strong><p>Focus institutional knowledge around search, summaries, and reliable cross-team sharing.</p></div><div><span>Enterprise rollout</span><strong>Rollout sequence</strong><p>Begin with design partners, validate retrieval quality, then expand by workspace.</p></div></div>}

            <div className="feature-actions">
              <button className={summary ? "is-complete" : ""} onClick={generateSummary} disabled={busy === "summary"}><span className="action-icon summary-icon">✦</span><span><strong>{busy === "summary" ? "Generating summary…" : "Generate AI summary"}</strong><small>Condense this document into three sentences</small></span><em>{summary ? "✓" : "→"}</em></button>
              <button className={shareUrl ? "is-complete" : ""} onClick={createShareLink} disabled={busy === "sharing"}><span className="action-icon share-icon">↗</span><span><strong>{shareUrl || "Create share link"}</strong><small>{shareUrl ? "Anyone with the link can view" : "Publish a read-only version"}</small></span><em>{shareUrl ? "✓" : "→"}</em></button>
            </div>
            {summary && <div className="summary-output"><span>AI SUMMARY</span><p>Orbit Docs is expanding into enterprise teams by making knowledge easier to retrieve and act on. The Q3 plan centers on semantic search, concise summaries, and simple sharing. The rollout begins with design partners before expanding workspace by workspace.</p></div>}
          </section>
        </main>

        <aside className="observer-panel">
          <div className="observer-head"><div><span className="observer-mark">C/D</span><span><strong>Code of Duty Observer</strong><small>Live product telemetry</small></span></div><i className={posthogConfigured ? "connected" : "demo"} /></div>
          <div className="observer-connection"><span><i />POSTHOG</span><strong>{posthogConfigured ? "CONNECTED" : "DEMO FEED"}</strong></div>
          <div className="observer-customer"><span>CUSTOMER</span><strong>{userId.replace(/^demo_user_/, "demo_user_").slice(0, 24)}</strong><small>Session {sessionId.slice(0, 8)}</small></div>

          <div className="observer-next-step">
            <span>DEMO PROGRESS</span>
            <div><i className="complete">✓</i><strong>Use features</strong><small>{usedFeatures.size}/2 required</small></div>
            <div><i className={usedFeatures.size >= 2 ? "ready" : ""}>2</i><strong>Upgrade</strong><small>{usedFeatures.size >= 2 ? "Ready for Stripe" : "Locked"}</small></div>
            <div><i>3</i><strong>View impact</strong><small>After payment</small></div>
          </div>

          <div className="upgrade-card"><div><span>ORBIT DOCS PRO</span><strong>$100</strong><small>One-time demo purchase · Stripe test mode</small></div><button onClick={upgrade} disabled={usedFeatures.size < 2 || busy === "checkout"}>{busy === "checkout" ? "Opening Stripe…" : usedFeatures.size < 2 ? `Use ${2 - usedFeatures.size} more feature${2 - usedFeatures.size === 1 ? "" : "s"}` : "Upgrade — $100 →"}</button>{checkoutError && <p>{checkoutError}</p>}</div>

          <section className="event-stream">
            <div className="observer-section-title"><span>LIVE EVENTS</span><em>{events.length}</em></div>
            {events.length === 0 ? <div className="observer-empty"><span>◎</span><strong>Waiting for product usage</strong><p>Successful feature actions will appear here as PostHog events.</p></div> : events.map((event) => <div className="observer-event" key={event.id}><div><span className={`event-feature feature-${event.featureId}`}>{event.featureId === "search" ? "⌕" : event.featureId === "summary" ? "✦" : "↗"}</span><span><strong>{featureNames[event.featureId]}</strong><code>feature_used</code></span><time>{event.occurredAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></div><dl><div><dt>feature_id</dt><dd>{event.featureId}</dd></div><div><dt>action</dt><dd>{event.action}</dd></div><div><dt>delivery</dt><dd className={event.posthog === "captured" ? "ok" : "demo-status"}>{event.posthog === "captured" ? "captured" : "demo feed"}</dd></div><div><dt>mirror</dt><dd className={event.mirror}>{event.mirror}</dd></div></dl></div>)}
          </section>

          <section className="session-totals">
            <div className="observer-section-title"><span>SESSION EVIDENCE</span><em>{mirroredCount} events</em></div>
            {(["search", "summary", "sharing"] as FeatureId[]).map((featureId) => <div key={featureId}><span><strong>{featureNames[featureId]}</strong><small>{totals[featureId]} successful uses</small></span><b>{totals[featureId]}</b></div>)}
          </section>
        </aside>
      </div>
      {notice && <div className="orbit-toast"><span>✓</span><div><strong>{notice.split(" · ")[0]}</strong><small>{notice.split(" · ")[1]}</small></div></div>}
    </div>
  );
}
