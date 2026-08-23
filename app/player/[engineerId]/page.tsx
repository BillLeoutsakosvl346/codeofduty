/* eslint-disable @next/next/no-img-element, @next/next/no-html-link-for-pages -- Provider avatars are dynamic; hard navigation is required on Sites. */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, CircleDollarSign, GitPullRequest, Layers3, Target, TrendingUp, Trophy } from 'lucide-react';
import { ActivityFeed } from '@/components/activity-feed';
import { SiteHeader } from '@/components/site-header';
import { SourceBadge } from '@/components/source-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { getPlayerData } from '@/lib/data';
import { formatCurrency, formatPercent, initials } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ engineerId: string }> }): Promise<Metadata> {
  const { engineerId } = await params;
  const player = await getPlayerData(engineerId).catch(() => null);
  if (!player) return { title: 'Player not found · Code of Duty', openGraph: { images: [] }, twitter: { card: 'summary', images: [] } };
  const title = `${player.engineer.name} · #${player.engineer.rank} · Code of Duty`;
  const description = `${formatCurrency(player.engineer.arrImpactCents, { compact: true })} ARR impact across ${player.engineer.featureCount} features.`;
  return { title, description, openGraph: { title, description, images: [] }, twitter: { card: 'summary', title, description, images: [] } };
}

export default async function PlayerPage({ params }: { params: Promise<{ engineerId: string }> }) {
  const { engineerId } = await params;
  const data = await getPlayerData(engineerId);
  if (!data) notFound();
  const player = data.engineer;
  const stats = [
    { label: 'Rank', value: `#${player.rank}`, icon: Trophy },
    { label: 'ARR impact', value: formatCurrency(player.arrImpactCents, { compact: true }), icon: CircleDollarSign },
    { label: 'MRR impact', value: formatCurrency(player.mrrImpactCents, { compact: true }), icon: TrendingUp },
    { label: '24h delta', value: formatCurrency(player.recentDeltaCents, { signed: true, compact: true }), icon: TrendingUp },
    { label: 'Pull requests', value: String(player.prCount), icon: GitPullRequest },
    { label: 'Features', value: String(player.featureCount), icon: Layers3 },
  ];

  return <main className="min-h-screen"><SiteHeader /><div className="mx-auto max-w-[1320px] px-5 py-8 md:px-10 md:py-10">
    <a href="/" className="mb-6 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-white/35 transition hover:text-[#b8ff38]"><ArrowLeft size={14} /> Back to leaderboard</a>
    <section className="relative overflow-hidden border border-white/10 bg-[#0a0d0b] p-6 sm:p-8">
      <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[#b8ff38]/8 blur-3xl" />
      <div className="relative grid gap-8 lg:grid-cols-[1fr_1.45fr] lg:items-end">
        <div className="flex items-center gap-5"><div className="relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-[#b8ff38]/45 bg-white/5 font-mono text-2xl font-black text-[#b8ff38]">{player.avatarUrl ? <img src={player.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(player.name)}<span className="absolute inset-0 rounded-full ring-4 ring-inset ring-black/40" /></div><div><div className="flex flex-wrap items-center gap-2"><Badge tone="green">Rank #{player.rank}</Badge><SourceBadge source={player.source} /></div><h1 className="mt-3 text-4xl font-black uppercase tracking-[-0.04em] sm:text-5xl">{player.name}</h1><p className="mt-1 text-sm text-white/38">@{player.githubLogin} · {player.role}</p></div></div>
        <div className="grid grid-cols-2 border border-white/10 sm:grid-cols-3">{stats.map(({ label, value, icon: Icon }) => <div key={label} className="border-b border-r border-white/[0.07] p-4 even:border-r-0 sm:[&:nth-child(3n)]:border-r-0"><div className="flex items-center gap-2 text-white/28"><Icon size={13}/><p className="text-[8px] font-bold uppercase tracking-[0.16em]">{label}</p></div><p className={`mt-2 font-mono text-xl font-black ${label === '24h delta' ? (player.recentDeltaCents >= 0 ? 'text-[#b8ff38]' : 'text-[#ff7557]') : ''}`}>{value}</p></div>)}</div>
      </div>
    </section>

    <div className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
      <div className="space-y-6">
        <Card><CardHeader><p className="eyebrow">Ownership map</p><h2 className="panel-title">Feature Impact</h2></CardHeader><CardContent className="space-y-6">{data.featureImpact.map((feature) => <div key={feature.id}><div className="mb-2 grid grid-cols-[1fr_auto_auto] items-end gap-4"><div><p className="font-bold">{feature.name}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-white/28">{feature.id}</p></div><div className="text-right"><p className="font-mono text-sm font-black">{formatPercent(feature.ownershipPpm)}</p><p className="text-[8px] uppercase tracking-wider text-white/25">ownership</p></div><div className="min-w-24 text-right"><p className="font-mono text-sm font-black text-[#b8ff38]">{formatCurrency(feature.arrImpactCents, { compact: true })}</p><p className="text-[8px] uppercase tracking-wider text-white/25">ARR impact</p></div></div><div className="h-2 bg-white/[0.06]"><div className={`h-full ${feature.id === 'search' ? 'bg-[#b8ff38]' : feature.id === 'summary' ? 'bg-[#51d9ff]' : 'bg-[#ffb547]'}`} style={{ width: `${feature.ownershipPpm / 10_000}%` }} /></div></div>)}</CardContent></Card>
        <Card><CardHeader><p className="eyebrow">Deployment history</p><h2 className="panel-title">Recent Pull Requests</h2></CardHeader><div>{data.pullRequests.map((pr) => <a key={pr.id} href={pr.url} target="_blank" rel="noreferrer" className="group flex items-center justify-between gap-4 border-b border-white/[0.07] px-5 py-4 transition last:border-0 hover:bg-white/[0.03]"><div className="flex min-w-0 items-center gap-3"><GitPullRequest size={16} className="shrink-0 text-[#51d9ff]" /><div className="min-w-0"><p className="truncate text-sm font-bold group-hover:text-[#51d9ff]">#{pr.number} {pr.title}</p><p className="mt-1 text-[9px] text-white/28">Merged {new Date(pr.mergedAt).toLocaleDateString()}</p></div></div><SourceBadge source={pr.source} /></a>)}{data.pullRequests.length === 0 && <p className="p-6 text-sm text-white/28">No synced pull requests for this player.</p>}</div></Card>
      </div>
      <div className="space-y-6">
        <Card><CardHeader><p className="eyebrow">Objectives</p><h2 className="panel-title">Missions</h2></CardHeader><div>{data.missions.map((mission) => <div key={mission.id} className="flex items-start gap-3 border-b border-white/[0.07] px-5 py-4 last:border-0"><div className={`grid h-8 w-8 shrink-0 place-items-center border ${mission.status === 'completed' ? 'border-[#b8ff38]/30 bg-[#b8ff38]/8 text-[#b8ff38]' : 'border-[#51d9ff]/30 bg-[#51d9ff]/8 text-[#51d9ff]'}`}><Target size={14}/></div><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold">{mission.title}</p><Badge tone={mission.status === 'completed' ? 'green' : 'cyan'}>{mission.status}</Badge></div><p className="mt-1 text-xs text-white/32">{mission.xpReward} XP · {mission.type}</p></div></div>)}{data.missions.length === 0 && <p className="p-6 text-sm text-white/28">No active or completed missions yet.</p>}</div></Card>
        <Card><CardHeader><p className="eyebrow text-[#ffb547]">Player telemetry</p><h2 className="panel-title">Recent Activity</h2></CardHeader><ActivityFeed items={data.activity} compact />{data.activity.length === 0 && <p className="p-6 text-sm text-white/28">No player-specific activity yet.</p>}</Card>
      </div>
    </div>
  </div></main>;
}
