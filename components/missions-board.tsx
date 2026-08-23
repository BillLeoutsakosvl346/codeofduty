'use client';

import { useEffect, useState } from 'react';
import { Bug, Check, Crosshair, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { initials } from '@/lib/utils';

type Engineer = { id: string; name: string; role: string; avatarUrl: string | null };
type Mission = {
  id: string; title: string; description: string; type: string; status: string; claimedBy: string | null; linkedFeatureId: string | null; xpReward: number;
  claimedByEngineer: Engineer | null; claimedAt: string | null; completedAt: string | null; createdAt: string; updatedAt: string;
};
type MissionData = { engineers: Engineer[]; missions: Mission[] };

export function MissionsBoard({ initialData }: { initialData: MissionData }) {
  const [data, setData] = useState(initialData);
  const [activeEngineer, setActiveEngineer] = useState(initialData.engineers[0]?.id ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem('codeofduty_active_engineer');
    if (saved && initialData.engineers.some((engineer) => engineer.id === saved)) {
      queueMicrotask(() => setActiveEngineer(saved));
    }
  }, [initialData.engineers]);

  function chooseEngineer(id: string) {
    setActiveEngineer(id);
    window.localStorage.setItem('codeofduty_active_engineer', id);
  }

  async function refresh() {
    const response = await fetch('/api/missions', { cache: 'no-store' });
    if (response.ok) setData(await response.json());
  }

  async function mutate(mission: Mission, action: 'claim' | 'complete') {
    setBusy(mission.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/missions/${mission.id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ engineerId: activeEngineer }) });
      const result = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? 'Mission update failed.');
      await refresh();
      setMessage(action === 'claim' ? 'Challenge accepted. Mission added to your active queue.' : 'Mission complete. Impact logged to the kill feed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Mission update failed.');
    } finally { setBusy(null); }
  }

  const selected = data.engineers.find((engineer) => engineer.id === activeEngineer);
  const columns = [
    { id: 'open', label: 'Available', copy: 'Ready to claim', tone: 'green' as const },
    { id: 'claimed', label: 'In Progress', copy: 'Operators deployed', tone: 'cyan' as const },
    { id: 'completed', label: 'Completed', copy: 'Objectives secured', tone: 'muted' as const },
  ];

  return <>
    <section className="mb-8 grid gap-6 border-b border-white/10 pb-8 lg:grid-cols-[1fr_auto] lg:items-end">
      <div><p className="eyebrow text-[#b8ff38]">Challenge board</p><h1 className="mt-2 text-5xl font-black uppercase tracking-[-0.045em] sm:text-6xl">Choose your next objective.</h1><p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/42">Claim real engineering work, own the outcome, and watch shipped features move recurring revenue.</p></div>
      <Card className="min-w-[320px]"><CardContent><div className="mb-3 flex items-center gap-2"><UserRound size={14} className="text-[#b8ff38]" /><p className="eyebrow">Active operator</p></div><label className="sr-only" htmlFor="engineer-select">Active engineer</label><select id="engineer-select" value={activeEngineer} onChange={(event) => chooseEngineer(event.target.value)} className="h-11 w-full border border-white/15 bg-[#070908] px-3 text-sm font-bold text-white outline-none focus:border-[#b8ff38]">{data.engineers.map((engineer) => <option key={engineer.id} value={engineer.id}>{engineer.name} · {engineer.role}</option>)}</select><p className="mt-2 font-mono text-[9px] text-white/28">Demo persona persists on this device.</p></CardContent></Card>
    </section>
    {message && <div role="status" className="mb-5 border border-[#b8ff38]/20 bg-[#b8ff38]/5 px-4 py-3 text-sm text-[#d9ff96]">{message}</div>}
    <div className="grid gap-6 xl:grid-cols-3">{columns.map((column) => <Card key={column.id} className="self-start"><CardHeader className="flex flex-row items-start justify-between"><div><Badge tone={column.tone}>{column.label}</Badge><p className="mt-2 text-xs text-white/30">{column.copy}</p></div><span className="font-mono text-2xl font-black text-white/20">{String(data.missions.filter((mission) => mission.status === column.id).length).padStart(2, '0')}</span></CardHeader><div>{data.missions.filter((mission) => mission.status === column.id).map((mission) => {
      const TypeIcon = mission.type === 'bug' ? Bug : Sparkles;
      const mine = mission.claimedBy === activeEngineer;
      return <article key={mission.id} className="border-b border-white/[0.07] p-5 last:border-0"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><TypeIcon size={14} className={mission.type === 'bug' ? 'text-[#ff7557]' : 'text-[#51d9ff]'} /><span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">{mission.type}</span></div><Badge tone="amber">+{mission.xpReward} XP</Badge></div><h2 className="text-lg font-black tracking-tight">{mission.title}</h2><p className="mt-2 text-sm leading-relaxed text-white/38">{mission.description}</p><div className="mt-4 flex flex-wrap items-center gap-2">{mission.linkedFeatureId && <Badge>{mission.linkedFeatureId}</Badge>}{mission.claimedByEngineer && <span className="flex items-center gap-2 text-xs text-white/45"><span className="grid h-6 w-6 place-items-center rounded-full bg-white/10 font-mono text-[8px]">{initials(mission.claimedByEngineer.name)}</span>{mission.claimedByEngineer.name}</span>}</div>{column.id === 'open' && <Button className="mt-5 w-full" disabled={!activeEngineer || busy === mission.id} onClick={() => mutate(mission, 'claim')}><Crosshair size={14} />{busy === mission.id ? 'Claiming…' : 'Accept challenge'}</Button>}{column.id === 'claimed' && mine && <Button className="mt-5 w-full" variant="outline" disabled={busy === mission.id} onClick={() => mutate(mission, 'complete')}><ShieldCheck size={14} />{busy === mission.id ? 'Completing…' : 'Mark complete'}</Button>}{column.id === 'claimed' && !mine && <div className="mt-5 border border-white/10 px-3 py-2 text-center font-mono text-[9px] uppercase tracking-wider text-white/25">Assigned to another operator</div>}{column.id === 'completed' && <div className="mt-5 flex items-center justify-center gap-2 border border-[#b8ff38]/20 bg-[#b8ff38]/5 px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-[#b8ff38]"><Check size={12} /> Objective secured</div>}</article>;
    })}{data.missions.every((mission) => mission.status !== column.id) && <div className="p-8 text-center text-sm text-white/25">No missions in this sector.</div>}</div></Card>)}</div>
    {selected && <p className="mt-6 text-center font-mono text-[9px] uppercase tracking-[0.18em] text-white/24">Playing as {selected.name} · mission changes are persisted in Neon</p>}
  </>;
}
