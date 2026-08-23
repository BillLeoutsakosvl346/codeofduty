'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CircleDollarSign, Radio, TrendingUp } from 'lucide-react';
import type { ActivityItem, LeaderboardEntry } from '@/lib/data';
import { FEATURE_LABELS, type FeatureId } from '@/lib/constants';
import { ActivityFeed } from '@/components/activity-feed';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SourceBadge } from '@/components/source-badge';
import { formatCurrency, initials } from '@/lib/utils';

type DashboardData = {
  generatedAt: string;
  totals: { totalArrCents: number; attributedArrCents: number; unattributedArrCents: number; byFeature: Record<FeatureId, number>; sourceTotals: Record<string, number> };
  leaderboard: LeaderboardEntry[];
  activity: ActivityItem[];
  integrations: Array<{ provider: string; status: string; message: string; lastSuccessAt: string | null }>;
};

export function DashboardLive({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData);
  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch('/api/dashboard', { cache: 'no-store' });
        if (response.ok) setData(await response.json());
      } catch { /* keep the last good live snapshot */ }
    }, 2500);
    return () => window.clearInterval(timer);
  }, []);

  const maxFeature = Math.max(...Object.values(data.totals.byFeature), 1);
  return <>
    <section className="mb-8 grid gap-5 border-b border-white/10 pb-8 xl:grid-cols-[1fr_auto] xl:items-end">
      <div><p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[#b8ff38]">Season 01 · Engineering impact</p><h1 className="max-w-3xl text-5xl font-black uppercase leading-[0.89] tracking-[-0.055em] sm:text-7xl">Ship code.<br/><span className="text-white/30">Move revenue.</span></h1><p className="mt-5 max-w-xl text-sm leading-relaxed text-white/42">Subscription revenue allocated by product usage, then propagated to the engineers who own each feature.</p></div>
      <div className="grid grid-cols-3 divide-x divide-white/10 border border-white/10 bg-white/[0.025]">
        {[
          ['TOTAL ARR', data.totals.totalArrCents, 'text-white'],
          ['ATTRIBUTED', data.totals.attributedArrCents, 'text-[#b8ff38]'],
          ['UNATTRIBUTED', data.totals.unattributedArrCents, 'text-[#ffb547]'],
        ].map(([label,value,tone]) => <div key={String(label)} className="min-w-0 px-3 py-4 sm:px-6"><p className="truncate text-[8px] font-bold tracking-[0.16em] text-white/30 sm:text-[9px]">{label}</p><p className={`mt-2 font-mono text-base font-black sm:text-xl ${tone}`}>{formatCurrency(Number(value), { compact: true })}</p></div>)}
      </div>
    </section>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.42fr)_minmax(360px,.58fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4"><div><p className="eyebrow">Global rankings</p><h2 className="panel-title">ARR Impact Leaderboard</h2></div><Badge tone="green"><Radio size={10} /> Live + seed</Badge></CardHeader>
          <div>{data.leaderboard.map((player) => <Link href={`/player/${player.id}`} key={player.id} className="group grid grid-cols-[42px_1fr_auto] items-center gap-3 border-b border-white/[0.07] px-5 py-5 transition last:border-0 hover:bg-white/[0.03] sm:grid-cols-[52px_1fr_100px_130px]">
            <p className={`font-mono text-2xl font-black ${player.rank === 1 ? 'text-[#b8ff38]' : player.rank === 2 ? 'text-[#51d9ff]' : player.rank === 3 ? 'text-[#ffb547]' : 'text-white/25'}`}>{String(player.rank).padStart(2, '0')}</p>
            <div className="flex min-w-0 items-center gap-3"><div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border border-white/15 bg-gradient-to-br from-white/15 to-transparent font-mono text-xs font-bold">{player.avatarUrl ? <img src={player.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(player.name)}<span className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/10" /></div><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate font-bold group-hover:text-[#b8ff38]">{player.name}</p><SourceBadge source={player.source} /></div><p className="truncate text-xs text-white/32">@{player.githubLogin} · {player.role}</p><div className="mt-2 flex gap-3 text-[9px] uppercase tracking-wider text-white/28 sm:hidden"><span>{player.prCount} PRs</span><span>{player.featureCount} features</span></div></div></div>
            <div className="hidden text-right sm:block"><p className={`font-mono text-xs font-bold ${player.recentDeltaCents >= 0 ? 'text-[#b8ff38]' : 'text-[#ff7557]'}`}>{formatCurrency(player.recentDeltaCents, { signed: true, compact: true })}</p><p className="mt-1 text-[8px] uppercase tracking-widest text-white/25">24h delta</p></div>
            <div className="text-right"><p className="font-mono text-lg font-black sm:text-xl">{formatCurrency(player.arrImpactCents, { compact: true })}</p><p className="mt-1 text-[8px] uppercase tracking-widest text-white/25">ARR impact</p><p className="mt-1 hidden font-mono text-[9px] text-white/30 sm:block">{player.prCount} PR · {player.featureCount} FEAT</p></div>
          </Link>)}</div>
        </Card>

        <div className="grid gap-6 md:grid-cols-[1fr_.75fr]">
          <Card><CardHeader><p className="eyebrow">Revenue terrain</p><h2 className="panel-title">Feature Allocation</h2></CardHeader><CardContent className="space-y-5">{(Object.entries(data.totals.byFeature) as Array<[FeatureId, number]>).map(([id,cents]) => <div key={id}><div className="mb-2 flex items-center justify-between"><span className="text-sm font-bold">{FEATURE_LABELS[id]}</span><span className="font-mono text-sm font-black">{formatCurrency(cents, { compact: true })}</span></div><div className="h-2 overflow-hidden bg-white/[0.06]"><div className={`h-full ${id === 'search' ? 'bg-[#b8ff38]' : id === 'summary' ? 'bg-[#51d9ff]' : 'bg-[#ffb547]'}`} style={{ width: `${Math.max(2, (cents/maxFeature)*100)}%` }} /></div></div>)}</CardContent></Card>
          <Card><CardHeader><p className="eyebrow">ARR provenance</p><h2 className="panel-title">Revenue Sources</h2></CardHeader><CardContent className="space-y-4">{Object.entries(data.totals.sourceTotals).map(([source,cents]) => <div key={source} className="flex items-center justify-between border-b border-white/[0.07] pb-3"><SourceBadge source={source} /><span className="font-mono text-sm font-black">{formatCurrency(cents, { compact: true })}</span></div>)}<div className="flex items-start gap-3 pt-2 text-xs leading-relaxed text-white/34"><CircleDollarSign size={16} className="mt-0.5 shrink-0 text-[#b8ff38]" />Usage redistributes active ARR. It never creates new revenue.</div></CardContent></Card>
        </div>
      </div>

      <div className="space-y-6">
        <Card><CardHeader className="flex flex-row items-center justify-between"><div><p className="eyebrow text-[#ffb547]">Live operations</p><h2 className="panel-title">Kill Feed</h2></div><TrendingUp size={18} className="text-[#ffb547]" /></CardHeader><ActivityFeed items={data.activity.slice(0, 12)} /></Card>
        <Card><CardHeader><p className="eyebrow">Provider telemetry</p><h2 className="panel-title">Integration Status</h2></CardHeader><div>{data.integrations.map((integration) => <div key={integration.provider} className="flex items-start gap-3 border-b border-white/[0.07] px-5 py-3 last:border-0"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${integration.status === 'verified' ? 'bg-[#b8ff38] shadow-[0_0_10px_#b8ff38]' : integration.status === 'error' ? 'bg-[#ff7557]' : 'bg-[#ffb547]'}`} /><div className="min-w-0"><div className="flex items-center gap-2"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em]">{integration.provider}</p><Badge tone={integration.status === 'verified' ? 'green' : integration.status === 'error' ? 'red' : 'amber'}>{integration.status}</Badge></div><p className="mt-1 text-[11px] leading-relaxed text-white/32">{integration.message}</p></div></div>)}</div></Card>
        <Link href="/demo" className="group flex items-center justify-between border border-[#b8ff38]/25 bg-[#b8ff38]/[0.055] p-5 transition hover:bg-[#b8ff38]/10"><div><p className="eyebrow text-[#b8ff38]">Killer demo</p><p className="mt-1 font-black uppercase tracking-tight">Use a feature. Move the board.</p></div><ArrowUpRight className="text-[#b8ff38] transition group-hover:-translate-y-1 group-hover:translate-x-1" /></Link>
      </div>
    </div>
  </>;
}
