import { useMemo, useState } from "react";

import { FEATURE_ACTIONS, type FeatureId, type UsageResponse } from "../../shared/contracts";
import { createCheckout, mirrorUsage } from "../lib/demoApi";
import { getDemoSessionId, getDemoUserId } from "../lib/demoIdentity";
import { captureFeatureUsed, identifyDemoUser, isPostHogConfigured } from "../lib/posthog";
import { nextDiscoveryIndex } from "./features/search";
import { stableProfileUrl } from "./features/sharing";
import { compatibilityInsight } from "./features/summary";
import "./mane-match.css";

type Horse = {
  slug: string;
  name: string;
  image: string;
  imagePosition?: string;
  breed: string;
  age: number;
  sex: string;
  location: string;
  distance: string;
  disciplines: string[];
  temperament: string;
  compatibility: number;
  insight: string;
};

type ObserverEvent = {
  id: string;
  featureId: FeatureId;
  action: string;
  horseName: string;
  occurredAt: Date;
  posthog: "captured" | "demo";
  mirror: "sending" | "synced" | "failed";
};

const HORSES: Horse[] = [
  {
    slug: "sienna-of-santa-ynez",
    name: "Sienna",
    image: "https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&w=1200&q=88",
    breed: "Andalusian",
    age: 7,
    sex: "Mare",
    location: "Santa Ynez, CA",
    distance: "12 miles away",
    disciplines: ["Dressage", "Trail"],
    temperament: "Gentle · Curious · Steady",
    compatibility: 94,
    insight: "Your preference for responsive, calm trail partners is an unusually strong match for Sienna’s steady temperament and dressage foundation.",
  },
  {
    slug: "atlas-of-ojai",
    name: "Atlas",
    image: "https://images.unsplash.com/photo-1598974357801-cbca100e65d3?auto=format&fit=crop&w=1200&q=88",
    imagePosition: "center 38%",
    breed: "Dutch Warmblood",
    age: 9,
    sex: "Gelding",
    location: "Ojai, CA",
    distance: "28 miles away",
    disciplines: ["Jumping", "Equitation"],
    temperament: "Bold · Focused · Athletic",
    compatibility: 87,
    insight: "Atlas fits your experience level and jumping goals. His forward energy is a better fit for structured arena work than relaxed weekend trails.",
  },
  {
    slug: "clover-of-temecula",
    name: "Clover",
    image: "https://images.unsplash.com/photo-1566251037378-5e04e3bec343?auto=format&fit=crop&w=1200&q=88",
    imagePosition: "center 45%",
    breed: "Connemara",
    age: 6,
    sex: "Mare",
    location: "Temecula, CA",
    distance: "41 miles away",
    disciplines: ["Eventing", "Trail"],
    temperament: "Brave · Social · Playful",
    compatibility: 82,
    insight: "Clover’s versatile eventing background aligns with your mixed-discipline interests, though her playful energy may ask for more consistent weekly work.",
  },
];

const FEATURE_NAMES: Record<FeatureId, string> = {
  search: "Discover swipe",
  summary: "AI compatibility",
  sharing: "Stable share link",
};

const EMPTY_TOTALS: UsageResponse["totals"] = { search: 0, summary: 0, sharing: 0 };

export function ManeMatch() {
  const userId = useMemo(getDemoUserId, []);
  const sessionId = useMemo(getDemoSessionId, []);
  const [horseIndex, setHorseIndex] = useState(0);
  const [selectedHorse, setSelectedHorse] = useState<Horse>(HORSES[0]);
  const [insightHorse, setInsightHorse] = useState<Horse | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [events, setEvents] = useState<ObserverEvent[]>([]);
  const [totals, setTotals] = useState<UsageResponse["totals"]>(EMPTY_TOTALS);
  const [mirroredCount, setMirroredCount] = useState(0);
  const [busy, setBusy] = useState<FeatureId | "checkout" | null>(null);
  const [notice, setNotice] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const posthogConfigured = isPostHogConfigured();
  const horse = HORSES[horseIndex];
  const confirmedFeatures = (Object.keys(totals) as FeatureId[]).filter((featureId) => totals[featureId] > 0).length;

  async function recordFeature(featureId: FeatureId, subject: Horse) {
    const usageEventId = crypto.randomUUID();
    const action = FEATURE_ACTIONS[featureId];
    const captured = identifyDemoUser(userId) && captureFeatureUsed({ usageEventId, featureId, action, userId, sessionId });
    const observerEvent: ObserverEvent = {
      id: usageEventId,
      featureId,
      action,
      horseName: subject.name,
      occurredAt: new Date(),
      posthog: captured ? "captured" : "demo",
      mirror: "sending",
    };
    setEvents((current) => [observerEvent, ...current]);
    try {
      const response = await mirrorUsage({ usageEventId, userId, featureId, action, sessionId });
      setTotals(response.totals);
      setMirroredCount(response.mirroredEventCount);
      setEvents((current) => current.map((item) => item.id === usageEventId ? { ...item, mirror: "synced" } : item));
      setNotice(`${FEATURE_NAMES[featureId]} complete · saved to the evidence trail`);
    } catch {
      setEvents((current) => current.map((item) => item.id === usageEventId ? { ...item, mirror: "failed" } : item));
      setNotice(`${FEATURE_NAMES[featureId]} worked · database mirror needs attention`);
    }
    window.setTimeout(() => setNotice(""), 3000);
  }

  async function swipe(direction: "pass" | "like") {
    if (busy) return;
    const swipedHorse = horse;
    setBusy("search");
    setSelectedHorse(swipedHorse);
    setInsightHorse(null);
    setShareUrl("");
    await new Promise((resolve) => window.setTimeout(resolve, 260));
    await recordFeature("search", swipedHorse);
    setHorseIndex((current) => nextDiscoveryIndex(current, HORSES.length));
    setNotice(`${direction === "like" ? "Saved" : "Passed on"} ${swipedHorse.name} · Discover event confirmed`);
    window.setTimeout(() => setNotice(""), 3000);
    setBusy(null);
  }

  async function generateInsight() {
    if (busy) return;
    setBusy("summary");
    await new Promise((resolve) => window.setTimeout(resolve, 520));
    setInsightHorse(selectedHorse);
    await recordFeature("summary", selectedHorse);
    setBusy(null);
  }

  async function generateShareLink() {
    if (busy) return;
    setBusy("sharing");
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    setShareUrl(stableProfileUrl(window.location.origin, selectedHorse.slug));
    await recordFeature("sharing", selectedHorse);
    setBusy(null);
  }

  async function checkout() {
    setBusy("checkout");
    setCheckoutError("");
    try {
      window.location.assign(await createCheckout(userId));
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Unable to open Stripe Checkout");
      setBusy(null);
    }
  }

  return (
    <div className="mane-match">
      <header className="mane-topbar">
        <a className="mane-brand" href="#/demo" aria-label="ManeMatch home"><span aria-hidden="true">M</span><strong>ManeMatch</strong></a>
        <nav aria-label="ManeMatch navigation"><a className="active" href="#/demo">Discover</a><a href="#/demo">Matches</a><a href="#/demo">Stable</a></nav>
        <div className="mane-user"><span>DEMO RIDER</span><span className="mane-avatar" aria-hidden="true">AS</span></div>
      </header>

      <div className="mane-demo-path" aria-label="Three-step demo path">
        <div className="active"><b>1</b><span><strong>Meet a horse</strong><small>Swipe a profile</small></span></div><i>→</i>
        <div className={confirmedFeatures >= 2 ? "active" : ""}><b>2</b><span><strong>Try 2 features</strong><small>{confirmedFeatures}/2 database-confirmed</small></span></div><i>→</i>
        <div className={confirmedFeatures >= 2 ? "active" : ""}><b>3</b><span><strong>Join ManeMatch+</strong><small>$100 Stripe test payment</small></span></div>
      </div>

      <div className="mane-layout">
        <main className="mane-discover">
          <div className="mane-heading"><div><span className="eyebrow">THE SWIPE APP FOR HORSES</span><h1>Find your<br /><em>perfect ride.</em></h1></div><p>Discover horses by temperament, discipline, and the kind of partnership you want to build.</p></div>

          <section className="horse-stage" aria-label="Horse discovery profile">
            <div className={`horse-card ${busy === "search" ? "is-swiping" : ""}`}>
              <img src={horse.image} style={{ objectPosition: horse.imagePosition ?? "center" }} alt={`${horse.name}, a ${horse.breed} ${horse.sex.toLowerCase()}`} />
              <div className="horse-photo-gradient" />
              <div className="horse-distance">⌖ {horse.distance}</div>
              <div className="horse-card-copy">
                <div><h2>{horse.name}<sup>{horse.age}</sup></h2><span className="verified" aria-label="Verified profile">✓</span></div>
                <p>{horse.breed} · {horse.sex}</p>
                <small>{horse.location}</small>
                <div className="horse-tags">{horse.disciplines.map((discipline) => <span key={discipline}>{discipline}</span>)}</div>
              </div>
            </div>
            <div className="swipe-actions" aria-label="Swipe actions">
              <button className="pass" onClick={() => void swipe("pass")} disabled={busy !== null} aria-label={`Pass on ${horse.name}`}><span aria-hidden="true">×</span><small>PASS</small></button>
              <button className="rewind" type="button" disabled aria-label="Undo unavailable in demo"><span aria-hidden="true">↶</span></button>
              <button className="like" onClick={() => void swipe("like")} disabled={busy !== null} aria-label={`Like ${horse.name}`}><span aria-hidden="true">♥</span><small>LIKE</small></button>
            </div>
            <p className="swipe-hint">Swipe actions are real demo interactions and emit <code>search_completed</code> after success.</p>
          </section>

          <section className="mane-tools" aria-labelledby="match-tools-title">
            <div className="mane-tools-head"><div><span className="eyebrow">YOUR LAST DISCOVERY</span><h2 id="match-tools-title">Go deeper with {selectedHorse.name}</h2></div><span className="compatibility-pill">{selectedHorse.compatibility}% FIT</span></div>
            <div className="selected-horse"><img src={selectedHorse.image} alt="" /><div><strong>{selectedHorse.name}</strong><small>{selectedHorse.temperament}</small></div></div>
            <div className="mane-tool-grid">
              <button className={insightHorse?.slug === selectedHorse.slug ? "complete" : ""} onClick={() => void generateInsight()} disabled={busy !== null} aria-describedby="compatibility-description"><span className="tool-icon ai" aria-hidden="true">✦</span><span><strong>{busy === "summary" ? "Reading your preferences…" : "AI compatibility insight"}</strong><small id="compatibility-description">Why this horse fits your riding life</small></span><b>{insightHorse?.slug === selectedHorse.slug ? "✓" : "→"}</b></button>
              <button className={shareUrl ? "complete" : ""} onClick={() => void generateShareLink()} disabled={busy !== null} aria-describedby="share-description"><span className="tool-icon share" aria-hidden="true">↗</span><span><strong>{busy === "sharing" ? "Preparing profile…" : "Share stable profile"}</strong><small id="share-description">Create a stable link for {selectedHorse.name}</small></span><b>{shareUrl ? "✓" : "→"}</b></button>
            </div>
            {insightHorse?.slug === selectedHorse.slug && <div className="insight-card" aria-live="polite"><div><span>✦ MANEMATCH INSIGHT</span><strong>{selectedHorse.compatibility}% compatibility</strong></div><p>{compatibilityInsight(selectedHorse)}</p></div>}
            {shareUrl && <div className="share-card" aria-live="polite"><span>STABLE PROFILE LINK</span><div><input value={shareUrl} readOnly aria-label={`${selectedHorse.name} stable profile link`} /><button onClick={() => void navigator.clipboard?.writeText(shareUrl)}>Copy</button></div></div>}
          </section>
        </main>

        <aside className="mane-observer" aria-label="Demo telemetry observer">
          <div className="mane-observer-head"><div><span className="observer-logo">M</span><span><strong>Demo Observer</strong><small>Feature evidence trail</small></span></div><i className={posthogConfigured ? "connected" : ""} /></div>
          <div className="mane-connection"><span><i />POSTHOG</span><strong>{posthogConfigured ? "CONNECTED" : "KEY NOT CONFIGURED"}</strong></div>
          <div className="mane-customer"><span>DEMO CUSTOMER</span><code>{userId.slice(0, 27)}</code><small>Session {sessionId.slice(0, 8)} · browser-scoped</small></div>

          <div className="mane-progress">
            <span>CHECKOUT GATE</span>
            <div><i className="done">✓</i><strong>Use ManeMatch</strong><small>Complete real interactions</small></div>
            <div><i className={confirmedFeatures >= 2 ? "done" : ""}>2</i><strong>Confirm 2 features</strong><small>{confirmedFeatures}/2 mirrored to database</small></div>
            <div><i>3</i><strong>Stripe test payment</strong><small>{confirmedFeatures >= 2 ? "Ready" : "Locked"}</small></div>
          </div>

          <div className="mane-checkout"><div><span>MANEMATCH+</span><strong>$100</strong><small>One-time demo purchase · Stripe test mode</small></div><button onClick={() => void checkout()} disabled={confirmedFeatures < 2 || busy === "checkout"}>{busy === "checkout" ? "Opening Stripe…" : confirmedFeatures < 2 ? `Use ${2 - confirmedFeatures} more feature${2 - confirmedFeatures === 1 ? "" : "s"}` : "Join ManeMatch+ →"}</button>{checkoutError && <p role="alert">{checkoutError}</p>}</div>

          <section className="mane-event-stream">
            <div className="observer-title"><span>SUCCESSFUL EVENTS</span><em>{events.length}</em></div>
            {events.length === 0 ? <div className="mane-observer-empty"><span aria-hidden="true">♞</span><strong>Waiting for your first swipe</strong><p>Successful product actions appear here with their stable backend IDs.</p></div> : events.map((event) => <div className="mane-event" key={event.id}><div><span className={`event-icon ${event.featureId}`}>{event.featureId === "search" ? "♥" : event.featureId === "summary" ? "✦" : "↗"}</span><span><strong>{FEATURE_NAMES[event.featureId]}</strong><small>{event.horseName}</small></span><time>{event.occurredAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></div><dl><div><dt>feature_id</dt><dd>{event.featureId}</dd></div><div><dt>action</dt><dd>{event.action}</dd></div><div><dt>PostHog</dt><dd className={event.posthog === "captured" ? "ok" : "muted"}>{event.posthog}</dd></div><div><dt>database</dt><dd className={event.mirror}>{event.mirror}</dd></div></dl></div>)}
          </section>

          <section className="mane-totals">
            <div className="observer-title"><span>DATABASE EVIDENCE</span><em>{mirroredCount} events</em></div>
            {(["search", "summary", "sharing"] as FeatureId[]).map((featureId) => <div key={featureId}><span><strong>{FEATURE_NAMES[featureId]}</strong><small>{FEATURE_ACTIONS[featureId]}</small></span><b>{totals[featureId]}</b></div>)}
          </section>
        </aside>
      </div>

      <div className="mane-back"><a href="#/overview">← Back to Code of Duty</a></div>
      {notice && <div className="mane-toast" role="status" aria-live="polite"><span>✓</span><div><strong>{notice.split(" · ")[0]}</strong><small>{notice.split(" · ")[1]}</small></div></div>}
    </div>
  );
}

export default ManeMatch;
