import { useState } from "react";
import { bounties, clients, engineers, features } from "../data/mock";
import { bountyPoints, featureConversionValue, featureRevenue, featureValue } from "../types";
import { Bar, Big, Label, Panel, Tag } from "../ui/bits";
import { T, money } from "../ui/theme";

type DetailTab = "value" | "ownership" | "bounties";

export function FeatureDetail({ featureId }: { featureId: string }) {
  const [tab, setTab] = useState<DetailTab>("value");
  const feature = features.find((item) => item.id === featureId) ?? features[0];
  const carried = featureRevenue(feature, clients);
  const converted = featureConversionValue(feature);
  const value = featureValue(feature, clients);
  const related = bounties.filter((b) => b.featureId === feature.id);
  const shares = feature.owners.map((owner, index) => ({ owner, share: feature.owners.length === 1 ? 1 : index === 0 ? 0.6 : 0.4 }));
  const name = (login: string) => engineers.find((e) => e.login === login)?.callsign ?? login;
  return (
    <div>
      <a href="#/features" className="back-link">← FEATURE PORTFOLIO</a>
      <Panel color={T.cyan} className="sweep" style={{ margin: "14px 0 18px" }}>
        <div className="feature-hero">
          <div><div className="tag-row"><Tag color={T.cyan}>REVENUE RANK #{[...features].sort((a, b) => featureValue(b, clients) - featureValue(a, clients)).indexOf(feature) + 1}</Tag><Tag>POSTHOG + STRIPE</Tag></div><h1 className="display">{feature.name}</h1><p>{feature.weeklyUsers.toLocaleString()} weekly users · {related.filter((b) => b.status !== "killed").length} current bounties</p></div>
          <div><Label color={T.yellow}>Revenue impact</Label><Big color={T.yellow} size={78}>{money(Math.round(value))}</Big></div>
        </div>
      </Panel>

      <div className="detail-tabs" role="tablist" aria-label="Feature detail sections">
        {(["value", "ownership", "bounties"] as DetailTab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={`chamfer-sm ${tab === item ? "active" : ""}`}>{item}</button>)}
      </div>

      {tab === "value" && (
        <div className="detail-grid">
          <Panel color={T.yellow}>
            <Label color={T.yellow}>Value equation</Label>
            <div className="equation"><span><b>{money(Math.round(carried))}</b><small>Revenue carried</small></span><em>+</em><span><b>{money(Math.round(converted))}</b><small>Revenue converted</small></span><em>=</em><span><b style={{ color: T.yellow }}>{money(Math.round(value))}</b><small>Feature value</small></span></div>
            <p className="microcopy">Carried revenue is each customer’s Stripe ARR multiplied by their PostHog usage share. Converted revenue is new ARR multiplied by the share of paid trials that touched this feature.</p>
          </Panel>
          <Panel color={T.cyan}>
            <Label color={T.cyan}>Who relies on it</Label>
            <div className="reliance-list">
              {clients.filter((client) => feature.usageShare[client.id]).sort((a, b) => b.arr * feature.usageShare[b.id] - a.arr * feature.usageShare[a.id]).map((client) => {
                const usage = feature.usageShare[client.id];
                return <div key={client.id}><span><strong>{client.name}</strong><small>{Math.round(usage * 100)}% of product time · {money(client.arr)}/yr</small></span><span><Bar pct={usage * 100} color={T.cyan} /></span><b className="display">{money(Math.round(client.arr * usage))}</b></div>;
              })}
            </div>
          </Panel>
        </div>
      )}

      {tab === "ownership" && (
        <div className="detail-grid">
          <Panel color={T.cyan}>
            <div className="panel-title-row"><Label color={T.cyan}>Feature ownership</Label><Tag>SEEDED PREVIEW</Tag></div>
            {shares.map(({ owner, share }) => <div className="ownership-row" key={owner}><span className="display">{name(owner)}</span><Bar pct={share * 100} color={T.cyan} height={10} /><b>{Math.round(share * 100)}%</b></div>)}
            <p className="microcopy">Source preview: 14 merged GitHub PRs · Greptile semantic contribution analysis.</p>
          </Panel>
          <Panel color={T.yellow}>
            <Label color={T.yellow}>Latest $60 value pool preview</Label>
            {shares.map(({ owner, share }) => <div className="distribution-row" key={owner}><strong>{name(owner)}</strong><span>{Math.round(share * 100)}%</span><b style={{ color: T.yellow }}>+{money(60 * share)} impact</b><Tag color={T.cyan}>+{Math.round(60 * share)} FPS</Tag></div>)}
            <p className="microcopy">PostHog and Stripe size the pool. GitHub and Greptile will determine how it is divided among builders.</p>
          </Panel>
        </div>
      )}

      {tab === "bounties" && (
        <Panel color={T.magenta}>
          <div className="panel-title-row"><Label color={T.magenta}>PostHog-detected targets</Label><Tag>HIGHER VALUE → LARGER BOUNTY</Tag></div>
          {related.length === 0 && <p className="microcopy">No live targets on this feature.</p>}
          {related.map((bounty) => <a href={`#/bounties/${bounty.id}`} className="feature-bounty-row cod-row" key={bounty.id}><span><Tag color={bounty.status === "open" ? T.magenta : T.good}>{bounty.status}</Tag><strong>{bounty.title}</strong><small>{bounty.hits.reduce((sum, hit) => sum + hit.count, 0)} hits this week</small></span><b className="display" style={{ color: T.yellow }}>{bountyPoints(bounty, features, clients)} PTS</b></a>)}
        </Panel>
      )}
    </div>
  );
}
