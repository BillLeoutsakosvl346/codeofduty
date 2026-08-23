import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function PlayerNotFound() {
  return <main className="grid min-h-screen place-items-center px-6"><div className="text-center"><p className="eyebrow text-[#ff7557]">Player offline</p><h1 className="mt-3 text-4xl font-black uppercase">Operator not found</h1><Button className="mt-6" asChild><Link href="/">Return to leaderboard</Link></Button></div></main>;
}
