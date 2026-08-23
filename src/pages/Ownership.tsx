import ownershipArtifact from "../../generated/ownership-map.json";
import ownershipEventsRaw from "../../ledger/ownership-events.jsonl?raw";
import { OwnershipEventSchema, OwnershipMapSchema } from "../../shared/ownership-contracts";
import { Bar, Big, Label, Panel, Tag } from "../ui/bits";
import { T } from "../ui/theme";
import "./ownership.css";

const ownership = OwnershipMapSchema.parse(ownershipArtifact);
const events = ownershipEventsRaw
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => OwnershipEventSchema.parse(JSON.parse(line)));

const CONTRIBUTOR_NAMES: Record<string, string> = {
  aanishs: "Aanish",
  bill: "Bill",
  claude: "Claude",
};

const IMPACT_LABEL: Record<string, string> = {
  patch: "1 PT PATCH",
  feature: "3 PT FEATURE",
  foundation: "5 PT FOUNDATION",
};

const FEATURE_NAMES: Record<string, string> = {
  search: "HORSE DISCOVERY",
  summary: "AI COMPATIBILITY",
  sharing: "STABLE SHARING",
};

export function OwnershipPage() {
  const feature = ownership.features.find((candidate) => candidate.feature_id === "search");
  return (
    <div className="narrow-page ownership-page">
      <header className="ownership-hero">
        <div>
          <Label color={T.violet}>Builder attribution</Label>
          <h1 className="display">WHO BUILT THE<br /><em>FEATURE?</em></h1>
          <p>The PR says who contributed. Greptile checks the claim. Code of Duty updates ownership after merge.</p>
        </div>
        <div className="ownership-integrations">
          <Tag color={T.cyan}>GITHUB · DECLARATIONS</Tag>
          <Tag color={T.good}>GREPTILE · REVIEW RULES</Tag>
          <Tag color={T.violet}>CLAUDE-MEM · CONTEXT</Tag>
        </div>
      </header>

      <section className="ownership-pipeline" aria-label="Ownership calculation pipeline">
        <div><i>01</i><span><b>PR DESCRIPTION</b><small>People + agreed shares</small></span></div>
        <strong>→</strong>
        <div><i>02</i><span><b>GREPTILE CHECK</b><small>Claim compared with diff</small></span></div>
        <strong>→</strong>
        <div><i>03</i><span><b>HUMAN APPROVAL</b><small>No self-awarded credit</small></span></div>
        <strong>→</strong>
        <div><i>04</i><span><b>OWNERSHIP MAP</b><small>Exact 100% normalization</small></span></div>
      </section>

      <div className="ownership-grid">
        <Panel color={T.violet}>
          <div className="ownership-panel-head">
            <div><Label color={T.violet}>Horse Discovery</Label><h2 className="display">CURRENT OWNERSHIP</h2></div>
            <Tag color={T.good}>3 MERGED PRS</Tag>
          </div>
          <div className="ownership-total"><span><small>CUMULATIVE CONTRIBUTION</small><Big color={T.yellow} size={48}>{feature?.total_contribution_points ?? 0} PTS</Big></span><span><small>CONSERVATION</small><b>100.00%</b></span></div>
          <div className="ownership-builders">
            {feature?.owners.map((owner, index) => {
              const color = [T.cyan, T.magenta, T.violet][index] ?? T.ink2;
              return <div key={owner.contributor_id}><span><strong>{CONTRIBUTOR_NAMES[owner.contributor_id] ?? owner.contributor_id}</strong><small>{owner.contribution_points} contribution points</small></span><Bar pct={owner.ownership_bps / 100} color={color} height={10} /><b className="display" style={{ color }}>{(owner.ownership_bps / 100).toFixed(2)}%</b></div>;
            })}
          </div>
          <p className="ownership-rule">The branch pusher receives <b>0% automatically</b>. Only approved contributors in the PR declaration enter this map.</p>
        </Panel>

        <Panel color={T.cyan}>
          <Label color={T.cyan}>What Greptile does</Label>
          <h2 className="display ownership-side-title">CHECKS THE CLAIM</h2>
          <ul className="ownership-checks">
            <li><b>Feature match</b><span>Does the diff touch Horse Discovery?</span></li>
            <li><b>Role consistency</b><span>Does visible evidence support the declared roles?</span></li>
            <li><b>Missing work</b><span>Does the declaration conflict with tests or discussion?</span></li>
          </ul>
          <div className="ownership-boundary"><Tag color={T.yellow}>IMPORTANT</Tag><p>Greptile reports mismatches. It never invents people or changes their numeric split.</p></div>
        </Panel>
      </div>

      <Panel color={T.yellow} className="ownership-history">
        <div className="ownership-panel-head"><div><Label color={T.yellow}>Ownership over time</Label><h2 className="display">MERGE LEDGER</h2></div><Tag>PUSHER · DEMO-BOT · 0% CREDIT</Tag></div>
        <div className="ownership-history-head"><span>PR</span><span>Declared work</span><span>Contributors</span><span>Greptile</span><span>Impact</span></div>
        {events.map((event) => <div className="ownership-history-row" key={event.event_id}><b>#{event.pull_request_number}</b><span><strong>{event.manifest.summary}</strong><small>{event.manifest.features.map((featureId) => FEATURE_NAMES[featureId] ?? featureId.toUpperCase()).join(" + ")}</small></span><span className="ownership-contributors">{event.manifest.contributors.map((contributor) => <Tag key={contributor.contributor_id} color={T.cyan}>{CONTRIBUTOR_NAMES[contributor.contributor_id] ?? contributor.contributor_id} {contributor.share_bps / 100}%</Tag>)}</span><Tag color={event.greptile.status === "verified" ? T.good : T.warn}>{event.greptile.status}</Tag><b className="impact-label">{IMPACT_LABEL[event.manifest.impact]}</b></div>)}
      </Panel>
    </div>
  );
}

export default OwnershipPage;
