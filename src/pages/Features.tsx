import { bounties, clients, engineers, features } from "../data/mock";
import { featureConversionValue, featureRevenue, featureValue } from "../types";
import { Bar, Hud, Label, Panel, Tag } from "../ui/bits";
import { T, glow, money } from "../ui/theme";

function ownerName(login: string) { return engineers.find((e) => e.login === login)?.callsign ?? login; }

export function FeaturesPage() {
  const ranked = [...features].sort((a, b) => featureValue(b, clients) - featureValue(a, clients));
  const total = ranked.reduce((sum, feature) => sum + featureValue(feature, clients), 0);
  const critical = ranked.filter((feature) => featureValue(feature, clients) / total >= 0.2).length;
  return (
    <div>
      <div className="page-intro compact">
        <div><Label color={T.yellow}>Revenue portfolio</Label><h1 className="display page-title">FEATURES</h1><p>Every rank is traceable to money carried and money converted.</p></div>
        <Tag color={T.ink2}>HISTORICAL TOTALS · SEEDED</Tag>
      </div>
      <div className="hud-grid four">
        <Hud label="Feature value" value={money(Math.round(total))} color={T.yellow} hint="current + converted ARR" />
        <Hud label="Critical features" value={`${critical}`} color={T.magenta} hint="20%+ of portfolio value" />
        <Hud label="Weekly users" value={features.reduce((sum, f) => sum + f.weeklyUsers, 0).toLocaleString()} color={T.cyan} hint="PostHog usage" />
        <Hud label="Open bounties" value={`${bounties.filter((b) => b.status === "open").length}`} color={T.violet} hint="priced by feature value" />
      </div>
      <Panel color={T.yellow}>
        <div className="feature-table-heading"><span>Rank / feature</span><span>Evidence</span><span>Revenue impact</span><span>Tier</span></div>
        {ranked.map((feature, index) => {
          const carried = featureRevenue(feature, clients);
          const converted = featureConversionValue(feature);
          const value = carried + converted;
          const share = value / total;
          const tier = share >= 0.2 ? "CRITICAL" : share >= 0.05 ? "CORE" : "LOW";
          const tierColor = tier === "CRITICAL" ? T.magenta : tier === "CORE" ? T.cyan : T.ink3;
          return (
            <a href={`#/features/${feature.id}`} className="feature-table-row cod-row" key={feature.id}>
              <span className="feature-rank-block"><b className="display" style={{ color: index === 0 ? T.yellow : T.ink3, textShadow: index === 0 ? glow(T.yellow) : "none" }}>{String(index + 1).padStart(2, "0")}</b><span><strong>{feature.name}</strong><small>{feature.owners.map(ownerName).join(" + ")}</small></span></span>
              <span className="feature-evidence"><strong>{feature.weeklyUsers.toLocaleString()} WAU</strong><small>{Math.round(feature.conversionTouch * 100)}% of converted trials touched it</small></span>
              <span className="feature-impact"><b className="display" style={{ color: T.yellow }}>{money(Math.round(value))}</b><small>{money(Math.round(carried))} carried + {money(Math.round(converted))} converted</small><Bar pct={share * 100} color={tierColor} height={5} /></span>
              <Tag color={tierColor}>{tier} · {Math.round(share * 100)}%</Tag>
            </a>
          );
        })}
      </Panel>
    </div>
  );
}
