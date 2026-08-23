import { describe, expect, it } from 'vitest';
import { FEATURE_ACTIONS, FEATURE_IDS } from '@/lib/constants';
import { usageSchema } from '@/lib/usage';

describe('usage contract', () => {
  const valid = {
    usageEventId: '11111111-1111-4111-8111-111111111111',
    featureId: 'search' as const,
    action: 'search_completed',
    userId: 'demo_user_11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
  };

  it('exposes only the three exact feature/action mappings', () => {
    expect(FEATURE_IDS).toEqual(['search', 'summary', 'sharing']);
    expect(FEATURE_ACTIONS).toEqual({
      search: 'search_completed',
      summary: 'summary_generated',
      sharing: 'share_link_generated',
    });
  });

  it('rejects malformed event and demo user identifiers', () => {
    expect(usageSchema.safeParse(valid).success).toBe(true);
    expect(usageSchema.safeParse({ ...valid, usageEventId: 'retry-1' }).success).toBe(false);
    expect(usageSchema.safeParse({ ...valid, userId: 'anonymous' }).success).toBe(false);
  });
});
