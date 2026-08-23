import { DemoLab } from '@/components/demo-lab';
import { SiteHeader } from '@/components/site-header';

export default function DemoPage() {
  return <main className="min-h-screen"><SiteHeader active="demo"/><div className="mx-auto max-w-[1480px] px-5 py-8 md:px-10 md:py-10"><DemoLab /></div></main>;
}
