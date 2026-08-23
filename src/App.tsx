import { lazy, Suspense, useEffect, useState } from "react";
import { KillFeed, TopBar, type Tab } from "./TopBar";
import { bounties as seedBounties, clients, engineers, features, missions } from "./data/mock";
import { AttributionPage } from "./pages/Attribution";
import { BountiesPage } from "./pages/Bounties";
import { BountyDetail } from "./pages/BountyDetail";
import { EngineersPage } from "./pages/Engineers";
import { FeatureDetail } from "./pages/FeatureDetail";
import { FeaturesPage } from "./pages/Features";
import { OverviewPage } from "./pages/Overview";
import { RetentionPage } from "./pages/Retention";
import type { Bounty } from "./types";
import { SESSION_DATE, liveStats } from "./types";
import { FONT, T } from "./ui/theme";

const ManeMatch = lazy(() => import("./saas/ManeMatch").then((module) => ({ default: module.ManeMatch })));

type Route =
  | { tab: "overview" }
  | { tab: "features"; id?: string }
  | { tab: "engineers" }
  | { tab: "bounties"; id?: string }
  | { tab: "retention" }
  | { tab: "attribution" }
  | { tab: "demo" };

function parseHash(): Route {
  const hash = window.location.hash.split("?")[0];
  const feature = hash.match(/^#\/features\/([a-z0-9-]+)$/);
  const bounty = hash.match(/^#\/bounties\/([a-z0-9-]+)$/);
  if (feature) return { tab: "features", id: feature[1] };
  if (bounty) return { tab: "bounties", id: bounty[1] };
  if (hash === "#/features") return { tab: "features" };
  if (hash === "#/engineers") return { tab: "engineers" };
  if (hash === "#/bounties") return { tab: "bounties" };
  if (hash === "#/retention") return { tab: "retention" };
  if (hash === "#/attribution") return { tab: "attribution" };
  if (hash === "#/demo") return { tab: "demo" };
  return { tab: "overview" };
}

function parseMe(): string {
  const me = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("me");
  return engineers.some((engineer) => engineer.login === me) ? me! : "priya";
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [me, setMe] = useState(parseMe);
  const [bounties, setBounties] = useState<Bounty[]>(seedBounties);

  useEffect(() => {
    const onHashChange = () => { setRoute(parseHash()); setMe(parseMe()); window.scrollTo({ top: 0, behavior: "instant" }); };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const claim = (id: string) => setBounties((items) => items.map((bounty) => bounty.id === id && bounty.status === "open" ? { ...bounty, status: "claimed", claimedBy: me } : bounty));
  const kill = (id: string) => setBounties((items) => items.map((bounty) => bounty.id === id && bounty.status === "claimed" ? { ...bounty, status: "killed", killedOn: SESSION_DATE } : bounty));
  const stats = engineers.map((engineer) => liveStats(engineer, bounties, features, clients));
  const mine = stats.find((stat) => stat.login === me)!;

  if (route.tab === "demo") return <Suspense fallback={<div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f7f3e8", color: "#20311f", fontFamily: "Avenir Next, sans-serif" }}>Opening ManeMatch…</div>}><ManeMatch /></Suspense>;

  let content: React.ReactNode;
  if (route.tab === "overview") content = <OverviewPage />;
  else if (route.tab === "features") content = route.id ? <FeatureDetail featureId={route.id} /> : <FeaturesPage />;
  else if (route.tab === "engineers") content = <EngineersPage stats={stats} me={me} />;
  else if (route.tab === "bounties") content = route.id ? <BountyDetail bounty={bounties.find((item) => item.id === route.id) ?? bounties[0]} me={me} onClaim={claim} onKill={kill} /> : <BountiesPage bounties={bounties} missions={missions} features={features} clients={clients} engineers={engineers} me={me} onClaim={claim} />;
  else if (route.tab === "retention") content = <RetentionPage />;
  else content = <AttributionPage />;

  return (
    <div className="cod-world" style={{ minHeight: "100vh", color: T.ink, fontFamily: FONT }}>
      <KillFeed bounties={bounties} engineers={engineers} features={features} clients={clients} />
      <TopBar tab={route.tab as Tab} me={mine} openCount={bounties.filter((bounty) => bounty.status === "open").length} />
      <main className="app-main">{content}</main>
    </div>
  );
}
