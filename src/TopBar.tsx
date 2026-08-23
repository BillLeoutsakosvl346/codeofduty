import type { Bounty, Client, Engineer, Feature, LiveStats } from "./types";
import { assistPoints, bountyPoints } from "./types";
import { T, glow } from "./ui/theme";

export type Tab = "overview" | "retention" | "features" | "engineers" | "bounties" | "attribution";

export function KillFeed({ bounties, engineers, features, clients }: { bounties: Bounty[]; engineers: Engineer[]; features: Feature[]; clients: Client[] }) {
  const name = (login?: string) => engineers.find((e) => e.login === login)?.callsign ?? login ?? "?";
  const items = bounties.filter((b) => b.status === "killed").slice().reverse().map((b) => {
    const points = bountyPoints(b, features, clients);
    return (
      <span key={b.id} className="feed-item">
        <span style={{ color: T.magenta, fontWeight: 900, letterSpacing: 1.5 }}>{name(b.claimedBy)}</span>
        <span style={{ color: T.ink3, letterSpacing: 1 }}>ELIMINATED</span>
        <span style={{ color: T.ink }}>{b.title}</span>
        <span className="display" style={{ color: T.yellow, fontSize: 15 }}>+{points}</span>
        {b.assists.map((a) => <span key={a} style={{ color: T.cyan, letterSpacing: 0.5 }}>ASSIST {name(a)} +{assistPoints(points)}</span>)}
        <span style={{ color: T.borderStrong }}>//</span>
      </span>
    );
  });
  return (
    <div className="kill-feed">
      <span className="kill-feed-label">KILL FEED</span>
      <div className="ticker-window"><div className="cod-ticker">{items}{items}</div></div>
    </div>
  );
}

export function TopBar({ tab, me, openCount }: { tab: Tab; me: LiveStats; openCount: number }) {
  const tabs: { id: Tab; label: string; href: string; color: string }[] = [
    { id: "overview", label: "Overview", href: "#/overview", color: T.cyan },
    { id: "retention", label: "Retention", href: "#/retention", color: T.good },
    { id: "features", label: "Features", href: "#/features", color: T.yellow },
    { id: "engineers", label: "Engineers", href: "#/engineers", color: T.violet },
    { id: "bounties", label: "Bounties", href: "#/bounties", color: T.magenta },
  ];
  return (
    <header className="top-bar">
      <a href="#/overview" className="brand display">
        CODE<span>/</span>OF<span>/</span>DUTY
      </a>
      <nav className="top-nav" aria-label="Primary navigation">
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <a key={item.id} href={item.href} className="chamfer-sm top-nav-link" style={{ color: active ? T.bg : T.ink2, background: active ? item.color : "transparent", boxShadow: active ? glow(item.color) : "none" }}>
              {item.label}{item.id === "bounties" && openCount ? ` ${openCount}` : ""}
            </a>
          );
        })}
      </nav>
      <a href="#/demo" className="chamfer-sm run-link">RUN LIVE DEMO</a>
      <div className="player-stats">
        <span className="display player-name">{me.callsign}</span>
        <span className="display" style={{ color: T.magenta, textShadow: glow(T.magenta) }}>{me.kills}<small>K</small></span>
        <span className="display" style={{ color: T.cyan, textShadow: glow(T.cyan) }}>{me.assists}<small>A</small></span>
        <span className="display" style={{ color: T.yellow, textShadow: glow(T.yellow) }}>{me.points.toLocaleString()}<small>PTS</small></span>
      </div>
    </header>
  );
}
