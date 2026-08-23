import Link from 'next/link';
import { BarChart3, Boxes, Crosshair, FlaskConical } from 'lucide-react';

export function SiteHeader({ active }: { active?: 'leaderboard' | 'missions' | 'demo' }) {
  const links = [
    { href: '/', label: 'Leaderboard', id: 'leaderboard', icon: BarChart3 },
    { href: '/missions', label: 'Missions', id: 'missions', icon: Crosshair },
    { href: '/demo', label: 'Product Lab', id: 'demo', icon: FlaskConical },
  ] as const;
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070908]/92 px-5 py-4 backdrop-blur-xl md:px-10">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3" aria-label="Code of Duty home">
          <div className="grid h-9 w-9 place-items-center border border-[#b8ff38]/40 bg-[#b8ff38]/10 text-[#b8ff38]"><Boxes size={18} strokeWidth={2.4} /></div>
          <div><p className="text-sm font-black tracking-[0.18em]">CODE OF DUTY</p><p className="text-[9px] uppercase tracking-[0.22em] text-white/30">Revenue Command</p></div>
        </Link>
        <nav className="hidden items-center gap-2 md:flex">
          {links.map(({ href, label, id, icon: Icon }) => <Link key={href} href={href} className={`flex items-center gap-2 px-3 py-2 text-[10px] font-black uppercase tracking-[0.15em] transition ${active === id ? 'bg-[#b8ff38]/10 text-[#b8ff38]' : 'text-white/40 hover:bg-white/5 hover:text-white'}`}><Icon size={14} />{label}</Link>)}
        </nav>
        <div className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-wider text-[#b8ff38]"><span className="h-2 w-2 rounded-full bg-[#b8ff38] shadow-[0_0_14px_#b8ff38]" /> Live systems</div>
      </div>
      <nav className="mx-auto mt-3 grid max-w-[1480px] grid-cols-3 border border-white/10 md:hidden">
        {links.map(({ href, label, id }) => <Link key={href} href={href} className={`py-2 text-center text-[9px] font-black uppercase tracking-wider ${active === id ? 'bg-[#b8ff38]/10 text-[#b8ff38]' : 'text-white/40'}`}>{label}</Link>)}
      </nav>
    </header>
  );
}
