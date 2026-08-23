import type { Bounty } from "../types";
import { bountyPoints, bountyUrgency, featureConversionValue, featureRevenue, hitArr, urgency } from "../types";
import { clients, engineers, features } from "../data/mock";
import { Bar, Big, Button, Label, Panel, Tag } from "../ui/bits";
import { T, money } from "../ui/theme";

const SIGNAL = { exception: "errors", rage_click: "rage clicks", replay: "session replays" } as const;

export function BountyDetail({ bounty, me, onClaim, onKill }: { bounty: Bounty; me: string; onClaim: (id: string) => void; onKill: (id: string) => void }) {
  const feature = features.find((item) => item.id === bounty.featureId)!;
  const points = bountyPoints(bounty, features, clients);
  const urgencyMultiplier = bountyUrgency(bounty, clients);
  const name = (login?: string) => engineers.find((e) => e.login === login)?.callsign ?? login;
  const carried = featureRevenue(feature, clients);
  const converted = featureConversionValue(feature);
  const edge = bounty.status === "killed" ? T.good : bounty.status === "claimed" ? T.warn : T.magenta;
  return (
    <div className="narrow-page">
      <a href="#/bounties" className="back-link">← TARGET LIST</a>
      <Panel color={edge} style={{ margin: "14px 0 18px" }}>
        <div className="target-hero"><div><div className="tag-row"><Tag color={edge}>{bounty.status === "open" ? "OPEN TARGET" : bounty.status === "claimed" ? `${name(bounty.claimedBy)} ENGAGED` : `KILLED BY ${name(bounty.claimedBy)}`}</Tag><Tag color={feature.owners.includes(me) ? T.cyan : undefined}>{feature.name}</Tag>{urgencyMultiplier > 1 && <Tag color={T.bad}>{urgencyMultiplier}× URGENCY</Tag>}</div><h1 className="display detail-title">{bounty.title}</h1><div className="action-row">{bounty.status === "open" && <Button color={T.magenta} onClick={() => onClaim(bounty.id)}>Claim target</Button>}{bounty.status === "claimed" && <Button color={T.magenta} onClick={() => onKill(bounty.id)}>Confirm kill</Button>}<span className="microcopy">FIRST SEEN {bounty.firstSeen.toUpperCase()}</span></div></div><div><Label color={T.yellow}>Bounty</Label><Big color={T.yellow} size={88}>{points.toLocaleString()}</Big><span className="points-label">POINTS</span></div></div>
      </Panel>
      <div className="detail-grid">
        <Panel color={T.yellow}>
          <Label color={T.yellow}>Why the bounty is {points.toLocaleString()}</Label>
          <p className="formula-copy"><b>{feature.name}</b> carries <b style={{ color: T.yellow }}>{money(Math.round(carried))}</b> and converted <b style={{ color: T.yellow }}>{money(Math.round(converted))}</b> of new signups. One point per $100 of feature value.<br />Stripe urgency multiplies the pool by <b style={{ color: T.bad }}>×{urgencyMultiplier}</b>.<br />Affected customers add one point per $1,000 ARR: <b style={{ color: T.yellow }}>{money(hitArr(bounty, clients))}</b>.</p>
        </Panel>
        <Panel color={T.magenta}>
          <Label color={T.magenta}>Who it is hitting · PostHog</Label>
          <div className="hit-list">{bounty.hits.map((hit) => { const client = clients.find((item) => item.id === hit.clientId)!; return <div key={hit.clientId}><span><strong>{client.name}</strong><small>{client.plan} · {client.seats} seats · {money(client.arr)}/yr</small></span><b className="display" style={{ color: T.magenta }}>{hit.count}<small>{SIGNAL[hit.signal].toUpperCase()}/WK</small></b>{urgency(client) > 1 && <Tag color={T.bad}>{client.status.replace("_", " ")} · ×{urgency(client)}</Tag>}</div>; })}</div>
          <code className="error-summary">{bounty.summary}</code>
        </Panel>
      </div>
      <Panel style={{ marginTop: 14 }}>
        <Label>Who relies on {feature.name} · PostHog usage × Stripe ARR</Label>
        <div className="reliance-list">{clients.filter((client) => feature.usageShare[client.id]).map((client) => { const share = feature.usageShare[client.id]; return <div key={client.id}><span><strong>{client.name}</strong><small>{Math.round(share * 100)}% of product time</small></span><span><Bar pct={share * 100} color={T.cyan} /></span><b className="display">{money(Math.round(client.arr * share))}</b></div>; })}</div>
      </Panel>
    </div>
  );
}
