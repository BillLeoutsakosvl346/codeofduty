import { bounties, clients, features } from "../data/mock";
import { bountyPoints, featureConversionValue, featureRevenue, featureValue } from "../types";
import { Bar, Big, Button, Hud, Label, Panel, Tag } from "../ui/bits";
import { T, glow, money } from "../ui/theme";

export function OverviewPage() {
  const ranked = [...features].sort((a, b) => featureValue(b, clients) - featureValue(a, clients));
  const mapped = ranked.reduce((sum, feature) => sum + featureValue(feature, clients), 0);
  const topBounty = [...bounties].filter((b) => b.status === "open").sort((a, b) => bountyPoints(b, features, clients) - bountyPoints(a, features, clients))[0];
  const max = featureValue(ranked[0], clients);
  return (
    <div>
      <div className="page-intro">
        <div>
          <Label color={T.cyan}>Feature revenue command center</Label>
          <h1 className="display page-title">MONEY <span>MEETS</span> THE BUILD</h1>
          <p>Stripe tells us what customers pay. PostHog shows which features earn it.</p>
        </div>
        <div className="integration-stack">
          <Tag color={T.cyan}>POSTHOG · DEMO FEED</Tag>
          <Tag color={T.yellow}>STRIPE · TEST MODE</Tag>
          <Tag color={T.good}>AGENT · READY</Tag>
        </div>
      </div>

      <div className="hud-grid four">
        <Hud label="Revenue mapped" value={money(Math.round(mapped))} color={T.yellow} hint="current + converted ARR" />
        <Hud label="Features tracked" value={`${features.length}`} color={T.cyan} hint="PostHog feature keys" />
        <Hud label="Payments analyzed" value="42" color={T.violet} hint="100% reconciled" />
        <Hud label="Allocation health" value="100%" color={T.good} hint="no unattributed cents" />
      </div>

      <div className="overview-columns">
        <Panel color={T.yellow}>
          <div className="panel-title-row"><Label color={T.yellow}>Feature value · live rank</Label><Tag>STRIPE + POSTHOG</Tag></div>
          <div className="portfolio-list">
            {ranked.map((feature, index) => {
              const carried = featureRevenue(feature, clients);
              const converted = featureConversionValue(feature);
              const total = carried + converted;
              return (
                <a href={`#/features/${feature.id}`} className="portfolio-row cod-row" key={feature.id}>
                  <span className="display portfolio-rank">{String(index + 1).padStart(2, "0")}</span>
                  <span className="portfolio-name"><strong>{feature.name}</strong><small>{feature.weeklyUsers.toLocaleString()} weekly users</small></span>
                  <span className="portfolio-bar"><Bar pct={(total / max) * 100} color={index === 0 ? T.yellow : index === 1 ? T.cyan : T.violet} /></span>
                  <span className="portfolio-value display" style={{ color: index === 0 ? T.yellow : T.ink }}>{money(Math.round(total))}<small>{money(Math.round(carried))} carried · {money(Math.round(converted))} won</small></span>
                </a>
              );
            })}
          </div>
        </Panel>

        <div className="overview-side">
          <Panel color={T.cyan} className="sweep">
            <Label color={T.cyan}>Latest revenue impact</Label>
            <div className="latest-payment"><Big color={T.yellow} size={60}>$100</Big><Tag color={T.good}>CONSERVATION PASSED</Tag></div>
            <div className="allocation-line"><span style={{ width: "60%", background: T.cyan }} /><span style={{ width: "30%", background: T.magenta }} /><span style={{ width: "10%", background: T.violet }} /></div>
            <div className="allocation-rows">
              <div><span style={{ color: T.cyan }}>SEMANTIC SEARCH</span><b>$60</b></div>
              <div><span style={{ color: T.magenta }}>AI SUMMARY</span><b>$30</b></div>
              <div><span style={{ color: T.violet }}>SHARING</span><b>$10</b></div>
            </div>
            <Button href="#/attribution" color={T.cyan}>Inspect attribution</Button>
          </Panel>
          <Panel color={T.magenta}>
            <Label color={T.magenta}>Highest value target</Label>
            <a href={`#/bounties/${topBounty.id}`} className="target-callout">
              <strong>{topBounty.title}</strong>
              <span className="display" style={{ color: T.yellow, textShadow: glow(T.yellow) }}>{bountyPoints(topBounty, features, clients)} PTS</span>
            </a>
            <p className="microcopy">Semantic Search carries the largest revenue pool. Two customers hitting this are at risk in Stripe.</p>
          </Panel>
        </div>
      </div>

      <Panel style={{ marginTop: 14 }}>
        <div className="panel-title-row"><Label>Recent system activity</Label><Tag>SEED DATA + LATEST RUN</Tag></div>
        <div className="activity-grid">
          <div><span className="activity-pip" style={{ background: T.good, boxShadow: glow(T.good) }} /><strong>$100 PAYMENT ATTRIBUTED</strong><small>Search +$60 · AI Summary +$30 · Sharing +$10</small><time>JUST NOW</time></div>
          <div><span className="activity-pip" style={{ background: T.yellow }} /><strong>REPORTS MOVED TO TOP TARGET</strong><small>Customer urgency multiplier changed to ×2</small><time>18M</time></div>
          <div><span className="activity-pip" style={{ background: T.cyan }} /><strong>POSTHOG EVIDENCE LOADED</strong><small>10 successful events across 4 sessions</small><time>2H</time></div>
        </div>
      </Panel>
    </div>
  );
}
