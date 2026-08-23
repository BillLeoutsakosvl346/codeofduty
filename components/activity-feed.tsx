import { Activity, Crown, DollarSign, Search, Target, Zap } from 'lucide-react';
import { type ActivityItem } from '@/lib/data';
import { SourceBadge } from '@/components/source-badge';

const icons = { new_subscription: DollarSign, subscription_changed: DollarSign, subscription_cancelled: DollarSign, feature_used: Search, arr_shift: Zap, engineer_arr_delta: Activity, takes_lead: Crown, mission_claimed: Target, mission_completed: Target };
const tones: Record<string, string> = { new_subscription: '#b8ff38', feature_used: '#51d9ff', arr_shift: '#ffb547', engineer_arr_delta: '#b8ff38', takes_lead: '#ffb547', mission_claimed: '#51d9ff', mission_completed: '#b8ff38', subscription_cancelled: '#ff7557' };

function relativeTime(iso: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function ActivityFeed({ items, compact = false }: { items: ActivityItem[]; compact?: boolean }) {
  return <div>{items.map((item) => {
    const Icon = icons[item.type as keyof typeof icons] ?? Activity;
    const tone = tones[item.type] ?? '#718078';
    return <article key={item.id} className="grid grid-cols-[30px_1fr_auto] gap-3 border-b border-white/[0.07] px-5 py-4 last:border-0">
      <div className="grid h-7 w-7 place-items-center border" style={{ color: tone, borderColor: `${tone}44`, background: `${tone}10` }}><Icon size={13} /></div>
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-[9px] font-bold uppercase tracking-[0.17em] text-white/35">{item.headline}</p>{!compact && <SourceBadge source={item.source} />}</div><p className="mt-1 truncate text-sm text-white/75">{item.detail}</p></div>
      <time className="font-mono text-[9px] text-white/25">{relativeTime(item.createdAt)}</time>
    </article>;
  })}</div>;
}
