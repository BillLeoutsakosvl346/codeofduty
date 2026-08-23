import { DashboardLive } from '@/components/dashboard-live';
import { SiteHeader } from '@/components/site-header';
import { getDashboardData } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const data = await getDashboardData();
  return <main className="min-h-screen"><SiteHeader active="leaderboard" /><div className="mx-auto max-w-[1480px] px-5 py-8 md:px-10 md:py-10"><DashboardLive initialData={data} /></div></main>;
}
