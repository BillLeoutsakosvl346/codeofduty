import type { Bounty, Client, Engineer, Feature, Mission } from "../types";
import { bountyPoints, bountyUrgency, featureConversionValue, featureRevenue, hitArr } from "../types";
import { Big, Button, Hud, Label, Panel, Tag } from "../ui/bits";
import { T, glow, money } from "../ui/theme";

const SIGNAL = { exception: "errors", rage_click: "rage clicks", replay: "replays" } as const;

export function BountiesPage({ bounties, missions, features, clients, engineers, me, onClaim }: { bounties: Bounty[]; missions: Mission[]; features: Feature[]; clients: Client[]; engineers: Engineer[]; me: string; onClaim: (id: string) => void }) {
  const name = (login?: string) => engineers.find((e) => e.login === login)?.callsign ?? login;
  const client = (id: string) => clients.find((c) => c.id === id)!;
  const open = bounties.filter((b) => b.status === "open");
  const ranked = [...bounties].sort((a, b) => (a.status === "killed" ? 1 : 0) - (b.status === "killed" ? 1 : 0) || bountyPoints(b, features, clients) - bountyPoints(a, features, clients));
  const top = ranked[0];
  const topFeature = features.find((f) => f.id === top.featureId)!;
  const topPoints = bountyPoints(top, features, clients);
  const topUrgency = bountyUrgency(top, clients);
  return (
    <div>
      <div className="page-intro compact"><div><Label color={T.magenta}>Human missions + detected bugs</Label><h1 className="display page-title">TARGETS</h1><p>People declare missions. PostHog detects bounties. Revenue decides what matters.</p></div><Tag color={T.ink2}>STRIPE + POSTHOG ONLY</Tag></div>
      <Panel color={T.yellow} className="sweep" style={{ marginBottom: 18 }}>
        <div className="target-hero"><div><div className="tag-row"><Tag color={T.yellow}>HIGH VALUE TARGET</Tag><Tag>{topFeature.name}</Tag>{topUrgency > 1 && <Tag color={T.bad}>{topUrgency}× · CUSTOMER AT RISK</Tag>}</div><h2 className="display">{top.title}</h2><p>{topFeature.name} carries <b style={{ color: T.yellow }}>{money(Math.round(featureRevenue(topFeature, clients)))}</b> and converted <b style={{ color: T.yellow }}>{money(Math.round(featureConversionValue(topFeature)))}</b> of new signups. Stripe says a customer hitting this is about to leave, so the bounty is ×{topUrgency}.</p><div className="action-row">{top.status === "open" && <Button color={T.magenta} onClick={() => onClaim(top.id)}>Claim target</Button>}<a href={`#/bounties/${top.id}`} className="intel-link">INTEL →</a></div></div><div><Label color={T.yellow}>Bounty</Label><Big color={T.yellow} size={96}>{topPoints.toLocaleString()}</Big><span className="points-label">POINTS</span></div></div>
      </Panel>
      <div className="hud-grid four"><Hud label="Open bounties" value={`${open.length}`} color={T.magenta} /><Hud label="Open missions" value={`${missions.filter((m) => m.status === "open").length}`} color={T.violet} /><Hud label="Points on board" value={open.reduce((sum, b) => sum + bountyPoints(b, features, clients), 0).toLocaleString()} color={T.yellow} /><Hud label="ARR hitting bugs" value={money(clients.filter((c) => open.some((b) => b.hits.some((h) => h.clientId === c.id))).reduce((sum, c) => sum + c.arr, 0))} color={T.cyan} /></div>

      <div className="section-title"><div><Label color={T.violet}>Missions</Label><p>Feedback from customers or a CEO decision. Deadline matters.</p></div><Tag color={T.violet}>HUMAN DECLARED</Tag></div>
      <div className="mission-grid">
        {missions.map((mission) => {
          const feature = features.find((f) => f.id === mission.featureId)!;
          return <div className="chamfer mission-card" key={mission.id}><div><div className="tag-row"><Tag color={mission.source === "ceo" ? T.yellow : T.cyan}>{mission.source === "ceo" ? "CEO MISSION" : "CUSTOMER MISSION"}</Tag><Tag>{feature.name}</Tag></div><h3>{mission.title}</h3><p>{mission.source === "ceo" ? `Set by ${mission.requestedBy}` : `Asked by ${mission.requestedBy}`}</p></div><div className="mission-points"><b className="display" style={{ color: T.violet, textShadow: glow(T.violet) }}>{mission.points}</b><small>PTS · {mission.deadline}</small></div></div>;
        })}
      </div>

      <div className="section-title"><div><Label color={T.magenta}>Bounties</Label><p>Error groups, rage-click clusters, and replay sets detected by PostHog.</p></div><Tag color={T.magenta}>AUTO DETECTED</Tag></div>
      <div className="bounty-list">
        {ranked.map((bounty) => {
          const feature = features.find((x) => x.id === bounty.featureId)!;
          const points = bountyPoints(bounty, features, clients);
          const urgency = bountyUrgency(bounty, clients);
          const mine = feature.owners.includes(me);
          const dead = bounty.status === "killed";
          const edge = dead ? T.border : bounty.status === "claimed" ? T.warn : urgency > 1 ? T.bad : mine ? T.cyan : T.borderStrong;
          const total = bounty.hits.reduce((sum, hit) => sum + hit.count, 0);
          return <div key={bounty.id} className="chamfer cod-row bounty-card" style={{ background: `linear-gradient(90deg, ${edge}, ${edge}22 30%, transparent)`, opacity: dead ? 0.45 : 1 }}><div className="chamfer bounty-card-inner"><div><b className="display" style={{ color: dead ? T.ink3 : T.yellow, textShadow: dead ? "none" : glow(T.yellow) }}>{points.toLocaleString()}</b><small>PTS{urgency > 1 && <span style={{ color: T.bad }}> · {urgency}×</span>}</small></div><div><a href={`#/bounties/${bounty.id}`}>{bounty.title}</a><span><Tag color={mine ? T.cyan : undefined}>{feature.name}{mine ? " · YOUR TURF" : ""}</Tag>{total} {SIGNAL[bounty.hits[0].signal]}/wk · {bounty.hits.map((h) => client(h.clientId).name).join(", ")} · {money(hitArr(bounty, clients))}/yr</span></div><div>{bounty.status === "claimed" && <Tag color={T.warn}>{name(bounty.claimedBy)} ENGAGED</Tag>}{dead && <Tag color={T.good}>KILLED BY {name(bounty.claimedBy)}</Tag>}</div><div>{bounty.status === "open" && <Button color={T.magenta} small onClick={() => onClaim(bounty.id)}>Claim</Button>}</div></div></div>;
        })}
      </div>
    </div>
  );
}
