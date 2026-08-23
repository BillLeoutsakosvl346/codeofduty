import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { getDb } from '@/db';
import {
  activityEvents,
  customers,
  engineers,
  featureContributions,
  featureUsageEvents,
  features,
  integrationSyncs,
  missions,
  pullRequests,
  subscriptions,
} from '@/db/schema';
import { calculateMonthlyRevenue } from '@/lib/allocation';
import { recalculateCustomerARR } from '@/lib/arr';

const db = getDb();
const now = Date.now();
const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000);

const featureSeed = [
  { id: 'search', name: 'Semantic Search', description: 'Find relevant code and engineering knowledge by meaning, not exact keywords.' },
  { id: 'summary', name: 'AI Summary', description: 'Turn long engineering context into concise, actionable summaries.' },
  { id: 'sharing', name: 'Team Sharing', description: 'Generate links that let teammates share product context and results.' },
];

const engineerSeed = [
  { id: 'eng_maya', name: 'Maya Chen', githubLogin: 'maya-codeofduty', avatarUrl: 'https://github.com/identicons/maya-codeofduty.png', role: 'Search Systems', source: 'seed' },
  { id: 'eng_alex', name: 'Alex Rivera', githubLogin: 'alex-codeofduty', avatarUrl: 'https://github.com/identicons/alex-codeofduty.png', role: 'Platform Engineering', source: 'seed' },
  { id: 'eng_sam', name: 'Sam Okafor', githubLogin: 'sam-codeofduty', avatarUrl: 'https://github.com/identicons/sam-codeofduty.png', role: 'Collaboration', source: 'seed' },
];

const prSeed = [
  { id: 'seed_pr_42', repository: 'codeofduty/demo', number: 42, title: 'Build semantic search ranking', authorLogin: 'maya-codeofduty', engineerId: 'eng_maya', url: 'https://github.com/codeofduty/demo/pull/42', mergedAt: daysAgo(8), source: 'seed' },
  { id: 'seed_pr_38', repository: 'codeofduty/demo', number: 38, title: 'Improve search recall', authorLogin: 'maya-codeofduty', engineerId: 'eng_maya', url: 'https://github.com/codeofduty/demo/pull/38', mergedAt: daysAgo(16), source: 'seed' },
  { id: 'seed_pr_35', repository: 'codeofduty/demo', number: 35, title: 'Harden shared workspace state', authorLogin: 'alex-codeofduty', engineerId: 'eng_alex', url: 'https://github.com/codeofduty/demo/pull/35', mergedAt: daysAgo(20), source: 'seed' },
  { id: 'seed_pr_31', repository: 'codeofduty/demo', number: 31, title: 'Ship summary generation pipeline', authorLogin: 'alex-codeofduty', engineerId: 'eng_alex', url: 'https://github.com/codeofduty/demo/pull/31', mergedAt: daysAgo(28), source: 'seed' },
  { id: 'seed_pr_27', repository: 'codeofduty/demo', number: 27, title: 'Add expiring share links', authorLogin: 'sam-codeofduty', engineerId: 'eng_sam', url: 'https://github.com/codeofduty/demo/pull/27', mergedAt: daysAgo(36), source: 'seed' },
  { id: 'seed_pr_24', repository: 'codeofduty/demo', number: 24, title: 'Collaborative summary handoff', authorLogin: 'sam-codeofduty', engineerId: 'eng_sam', url: 'https://github.com/codeofduty/demo/pull/24', mergedAt: daysAgo(44), source: 'seed' },
];

const contributionSeed = [
  ['seed_pr_42', 'search', 80, 'Implements the core semantic ranking behavior.'],
  ['seed_pr_42', 'summary', 20, 'Adds reusable result condensation.'],
  ['seed_pr_38', 'search', 40, 'Improves retrieval quality and recall.'],
  ['seed_pr_35', 'search', 20, 'Connects search state to workspaces.'],
  ['seed_pr_35', 'sharing', 30, 'Stabilizes shared document state.'],
  ['seed_pr_31', 'summary', 80, 'Implements summary generation and rendering.'],
  ['seed_pr_27', 'sharing', 70, 'Implements share-link lifecycle.'],
  ['seed_pr_24', 'sharing', 30, 'Improves collaborative handoff.'],
  ['seed_pr_24', 'summary', 30, 'Adds summaries to shared artifacts.'],
] as const;

const customerSeed = [
  { id: 'cust_seed_acme', userId: 'seed_acme', displayName: 'Acme Systems', source: 'seed', monthlyCents: 300_000 },
  { id: 'cust_seed_northstar', userId: 'seed_northstar', displayName: 'Northstar Labs', source: 'seed', monthlyCents: 250_000 },
  { id: 'cust_seed_pixel', userId: 'seed_pixel', displayName: 'Pixel Forge', source: 'seed', monthlyCents: 200_000 },
];

const usageMix: Record<string, Record<'search' | 'summary' | 'sharing', number>> = {
  seed_acme: { search: 6, summary: 3, sharing: 1 },
  seed_northstar: { search: 2, summary: 5, sharing: 3 },
  seed_pixel: { search: 4, summary: 2, sharing: 4 },
};

const missionSeed = [
  { id: 'mission_semantic_search', title: 'Build Semantic Search', description: 'Ship query understanding, ranking, and high-signal result previews.', type: 'feature', status: 'open', linkedFeatureId: 'search', xpReward: 1200, source: 'seed' },
  { id: 'mission_invite_flow', title: 'Fix broken invite flow', description: 'Repair the edge case that drops invites when a workspace is renamed.', type: 'bug', status: 'open', linkedFeatureId: 'sharing', xpReward: 700, source: 'seed' },
  { id: 'mission_bulk_export', title: 'Add bulk export', description: 'Give teams a fast path to export selected engineering results.', type: 'feature', status: 'open', linkedFeatureId: 'sharing', xpReward: 900, source: 'seed' },
  { id: 'mission_checkout_race', title: 'Fix checkout race condition', description: 'Make duplicate checkout completions safe and deterministic.', type: 'bug', status: 'open', linkedFeatureId: null, xpReward: 800, source: 'seed' },
  { id: 'mission_summary_citations', title: 'Add summary citations', description: 'Connect generated summaries to their source engineering context.', type: 'feature', status: 'open', linkedFeatureId: 'summary', xpReward: 1100, source: 'seed' },
  { id: 'mission_search_latency', title: 'Reduce search latency', description: 'Cut p95 semantic search latency without reducing result quality.', type: 'bug', status: 'open', linkedFeatureId: 'search', xpReward: 1000, source: 'seed' },
];

async function seed() {
  for (const feature of featureSeed) await db.insert(features).values(feature).onConflictDoUpdate({ target: features.id, set: { name: feature.name, description: feature.description } });
  for (const engineer of engineerSeed) await db.insert(engineers).values(engineer).onConflictDoUpdate({ target: engineers.githubLogin, set: { name: engineer.name, avatarUrl: engineer.avatarUrl, role: engineer.role, updatedAt: new Date() } });
  for (const pr of prSeed) await db.insert(pullRequests).values(pr).onConflictDoUpdate({ target: [pullRequests.repository, pullRequests.number], set: { title: pr.title, engineerId: pr.engineerId, updatedAt: new Date() } });
  for (const [prId, featureId, score, reason] of contributionSeed) {
    await db.insert(featureContributions).values({ id: `seed_contrib_${prId}_${featureId}`, pullRequestId: prId, featureId, score, reason, source: 'seed' })
      .onConflictDoUpdate({ target: [featureContributions.pullRequestId, featureContributions.featureId], set: { score, reason } });
  }
  for (const customer of customerSeed) {
    await db.insert(customers).values({ id: customer.id, userId: customer.userId, displayName: customer.displayName, source: customer.source })
      .onConflictDoUpdate({ target: customers.userId, set: { displayName: customer.displayName, updatedAt: new Date() } });
    const revenue = calculateMonthlyRevenue(customer.monthlyCents, 1);
    await db.insert(subscriptions).values({ id: `seed_sub_${customer.id}`, customerId: customer.id, status: 'active', unitAmountCents: customer.monthlyCents, quantity: 1, ...revenue, source: 'seed' })
      .onConflictDoUpdate({ target: subscriptions.id, set: { status: 'active', unitAmountCents: customer.monthlyCents, ...revenue, updatedAt: new Date() } });
    let index = 0;
    for (const featureId of ['search', 'summary', 'sharing'] as const) {
      for (let count = 0; count < usageMix[customer.userId][featureId]; count += 1) {
        index += 1;
        await db.insert(featureUsageEvents).values({
          usageEventId: `seed_usage_${customer.userId}_${featureId}_${count}`,
          featureId,
          action: featureId === 'search' ? 'search_completed' : featureId === 'summary' ? 'summary_generated' : 'share_link_generated',
          userId: customer.userId,
          sessionId: `seed_session_${customer.userId}`,
          source: 'seed',
          createdAt: daysAgo(1 + (index % 20)),
        }).onConflictDoNothing();
      }
    }
  }
  for (const mission of missionSeed) await db.insert(missions).values(mission).onConflictDoUpdate({ target: missions.id, set: { title: mission.title, description: mission.description, xpReward: mission.xpReward } });

  for (const customer of customerSeed) await recalculateCustomerARR(customer.userId);

  const history = [
    { id: 'seed_activity_1', type: 'new_subscription', headline: 'NEW SUBSCRIPTION', detail: '+$36,000 ARR · Acme Systems', source: 'seed', deltaArrCents: 3_600_000, createdAt: daysAgo(4) },
    { id: 'seed_activity_2', type: 'arr_shift', headline: 'ARR SHIFT', detail: 'Semantic Search +$2,400 · AI Summary −$2,400', source: 'seed', deltaArrCents: null, createdAt: daysAgo(3) },
    { id: 'seed_activity_3', type: 'engineer_arr_delta', headline: 'MAYA CHEN IMPACT', detail: 'Maya Chen +$1,420 ARR impact', source: 'seed', engineerId: 'eng_maya', deltaArrCents: 142_000, createdAt: daysAgo(2) },
    { id: 'seed_activity_4', type: 'takes_lead', headline: 'NEW LEADER', detail: 'MAYA CHEN takes the lead', source: 'seed', engineerId: 'eng_maya', deltaArrCents: null, createdAt: daysAgo(1) },
  ];
  for (const event of history) await db.insert(activityEvents).values({ ...event, dedupeKey: event.id, payload: {} }).onConflictDoNothing({ target: activityEvents.dedupeKey });
  await db.insert(integrationSyncs).values({ provider: 'neon', status: 'verified', message: 'Migrations and seed data are persisted in Neon.', lastSuccessAt: new Date() })
    .onConflictDoUpdate({ target: integrationSyncs.provider, set: { status: 'verified', message: 'Migrations and seed data are persisted in Neon.', lastAttemptAt: new Date(), lastSuccessAt: new Date() } });
  console.log('Seed complete: 3 engineers, 3 features, 6 PRs, $90,000 ARR, 6 missions.');
}

seed().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
