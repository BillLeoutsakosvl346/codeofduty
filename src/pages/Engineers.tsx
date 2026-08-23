import type { LiveStats } from "../types";
import { Bar, Hud, Label, Panel, Tag } from "../ui/bits";
import { T, glow } from "../ui/theme";

export function EngineersPage({ stats, me }: { stats: LiveStats[]; me: string }) {
  const ranked = [...stats].sort((a, b) => b.points - a.points);
  const top = ranked[0];
  const podium = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
  const heights = [150, 200, 120];
  const colors = [T.cyan, T.magenta, T.violet];
  const place = (stat: LiveStats) => ranked.indexOf(stat) + 1;
  const streak = [...stats].sort((a, b) => b.streakDays - a.streakDays)[0];
  return (
    <div>
      <div className="page-intro compact"><div><Label color={T.violet}>Engineer impact</Label><h1 className="display page-title">STANDINGS</h1><p>Feature points, bounty kills, assists, and completed missions.</p></div><Tag color={T.ink2}>OWNERSHIP · SEEDED PREVIEW</Tag></div>
      <div className="standings-hero">
        <div className="podium-wrap">
          <Label>Season 3 · top builders</Label>
          <div className="podium">
            {podium.map((stat, index) => {
              const color = colors[index];
              return <div key={stat.login}><div className="display podium-name" style={{ textShadow: glow(color) }}>{stat.callsign}</div><div className="podium-stats"><b>{stat.points.toLocaleString()}</b> · {stat.kills}K {stat.assists}A · {stat.missions}M</div><div className="chamfer podium-block" style={{ height: heights[index], background: `linear-gradient(180deg, ${color}, ${color}22)`, boxShadow: glow(color) }}><span className="display">{place(stat)}</span></div></div>;
            })}
          </div>
        </div>
        <div className="standings-huds"><Hud label="Team kills" value={`${stats.reduce((sum, stat) => sum + stat.kills, 0)}`} color={T.magenta} /><Hud label="Team missions" value={`${stats.reduce((sum, stat) => sum + stat.missions, 0)}`} color={T.violet} /><Hud label="Longest streak" value={`${streak.streakDays} DAYS`} color={T.yellow} hint={streak.callsign} /></div>
      </div>
      <Panel>
        <div className="standing-table-head"><span>Rank</span><span>Player</span><span>Feature points</span><span>K</span><span>A</span><span>Missions</span><span>Streak</span></div>
        {ranked.map((engineer, index) => {
          const isMe = engineer.login === me;
          return <div key={engineer.login} className="standing-row cod-row" style={{ background: isMe ? `${T.cyan}0d` : "transparent" }}><b className="display" style={{ color: index === 0 ? T.magenta : T.ink3, textShadow: index === 0 ? glow(T.magenta) : "none" }}>{String(index + 1).padStart(2, "0")}</b><span className="display callsign">{engineer.callsign}{isMe && <Tag color={T.cyan}>YOU</Tag>}</span><span className="points-cell"><Bar pct={(engineer.points / top.points) * 100} color={index === 0 ? T.magenta : T.violet} height={10} /><b className="display" style={{ color: T.yellow }}>{engineer.points.toLocaleString()}</b></span><b className="display" style={{ color: T.magenta }}>{engineer.kills}</b><b className="display" style={{ color: T.cyan }}>{engineer.assists}</b><b className="display" style={{ color: T.violet }}>{engineer.missions}</b><span className="streak">{engineer.streakDays > 0 ? `${engineer.streakDays} DAY` : "—"}</span></div>;
        })}
      </Panel>
    </div>
  );
}
