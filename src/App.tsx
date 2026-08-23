import { lazy, Suspense, useEffect, useState } from "react";
import { TopBar, type Tab } from "./TopBar";
import { bounties as seedBounties, clients, engineers, features, missions } from "./data/mock";
import { AttributionPage } from "./pages/Attribution";
import { BountiesPage } from "./pages/Bounties";
import { EngineersPage } from "./pages/Engineers";
import { OwnershipPage } from "./pages/Ownership";
import { RetentionPage } from "./pages/Retention";
import type { Bounty } from "./types";
import { liveStats } from "./types";
import { FONT, T } from "./ui/theme";

const ManeMatch = lazy(() => import("./saas/ManeMatch").then((module) => ({ default: module.ManeMatch })));

type Route =
  | { tab: "engineers" }
  | { tab: "bounties" }
  | { tab: "retention" }
  | { tab: "ownership" }
  | { tab: "attribution" }
  | { tab: "demo" };

function parseHash(): Route {
  const hash = window.location.hash.split("?")[0];
  if (hash === "#/engineers") return { tab: "engineers" };
  if (hash.startsWith("#/bounties")) return { tab: "bounties" };
  if (hash === "#/retention") return { tab: "retention" };
  if (hash === "#/ownership") return { tab: "ownership" };
  if (hash === "#/attribution") return { tab: "attribution" };
  if (hash === "#/demo") return { tab: "demo" };
  return { tab: "retention" };
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
  const stats = engineers.map((engineer) => liveStats(engineer, bounties, features, clients));
  if (route.tab === "demo") return <Suspense fallback={<div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f7f3e8", color: "#20311f", fontFamily: "Avenir Next, sans-serif" }}>Opening ManeMatch…</div>}><ManeMatch /></Suspense>;

  let content: React.ReactNode;
  if (route.tab === "engineers") content = <EngineersPage stats={stats} me={me} />;
  else if (route.tab === "bounties") content = <BountiesPage bounties={bounties} missions={missions} features={features} clients={clients} engineers={engineers} me={me} onClaim={claim} />;
  else if (route.tab === "ownership") content = <OwnershipPage />;
  else if (route.tab === "attribution") content = <AttributionPage />;
  else content = <RetentionPage />;

  return (
    <div className="cod-world" style={{ minHeight: "100vh", color: T.ink, fontFamily: FONT }}>
      <TopBar tab={route.tab as Tab} openCount={bounties.filter((bounty) => bounty.status === "open").length} />
      <main className="app-main">{content}</main>
    </div>
  );
}
