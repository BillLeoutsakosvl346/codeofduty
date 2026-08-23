'use client';

import { Button } from '@/components/ui/button';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-[#070908] px-6"><div className="max-w-md border border-[#ff7557]/30 bg-[#ff7557]/5 p-8 text-center"><p className="eyebrow text-[#ff9078]">Telemetry interrupted</p><h1 className="mt-3 text-2xl font-black uppercase">Revenue command is offline</h1><p className="mt-3 text-sm leading-relaxed text-white/42">The last request could not reach the attribution ledger. No revenue data was changed.</p><Button className="mt-6" onClick={reset}>Retry connection</Button></div></main>;
}
