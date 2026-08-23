import { T, glow } from "./ui/theme";

export type Tab = "retention" | "ownership" | "engineers" | "bounties" | "attribution";

export function TopBar({ tab, openCount }: { tab: Tab; openCount: number }) {
  const tabs: { id: Tab; label: string; href: string; color: string }[] = [
    { id: "retention", label: "Impact", href: "#/retention", color: T.good },
    { id: "ownership", label: "Ownership", href: "#/ownership", color: T.cyan },
    { id: "engineers", label: "Leaderboard", href: "#/engineers", color: T.violet },
    { id: "bounties", label: "Bounties", href: "#/bounties", color: T.magenta },
  ];
  return (
    <header className="top-bar">
      <a href="#/retention" className="brand display">
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
      <a href="#/demo" className="chamfer-sm run-link">OPEN MANEMATCH</a>
    </header>
  );
}
