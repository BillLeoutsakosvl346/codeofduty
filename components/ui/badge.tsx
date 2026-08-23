import * as React from 'react';
import { cn } from '@/lib/utils';

export function Badge({ className, tone = 'muted', ...props }: React.ComponentProps<'span'> & { tone?: 'muted' | 'green' | 'cyan' | 'amber' | 'red' }) {
  const tones = {
    muted: 'border-white/12 bg-white/[0.035] text-white/45',
    green: 'border-[#b8ff38]/30 bg-[#b8ff38]/8 text-[#b8ff38]',
    cyan: 'border-[#51d9ff]/30 bg-[#51d9ff]/8 text-[#51d9ff]',
    amber: 'border-[#ffb547]/30 bg-[#ffb547]/8 text-[#ffb547]',
    red: 'border-[#ff7557]/30 bg-[#ff7557]/8 text-[#ff9078]',
  };
  return <span className={cn('inline-flex items-center border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em]', tones[tone], className)} {...props} />;
}
