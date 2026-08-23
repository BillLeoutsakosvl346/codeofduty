import { MissionsBoard } from '@/components/missions-board';
import { SiteHeader } from '@/components/site-header';
import { getMissionsData } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function MissionsPage() {
  const data = await getMissionsData();
  return <main className="min-h-screen"><SiteHeader active="missions" /><div className="mx-auto max-w-[1480px] px-5 py-8 md:px-10 md:py-10"><MissionsBoard initialData={data} /></div></main>;
}
