import { Badge } from '@/components/ui/badge';

export function SourceBadge({ source }: { source: string }) {
  const live = ['live', 'stripe', 'github', 'greptile'].includes(source);
  return <Badge tone={live ? 'green' : 'muted'}>{live ? source : 'seeded'}</Badge>;
}
