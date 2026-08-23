import { and, desc, eq, gte } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  activityEvents,
  customers,
  engineerArrAllocations,
  engineers,
  featureArrAllocations,
  featureContributions,
  features,
  integrationSyncs,
  missionClaims,
  missions,
  pullRequests,
  subscriptions,
} from '@/db/schema';
import { ACTIVE_SUBSCRIPTION_STATUS, FEATURE_IDS, RECENT_DELTA_MS, type FeatureId } from '@/lib/constants';
import { recalculateDueCustomers } from '@/lib/arr';

export type ActivityItem = {
  id: string;
  type: string;
  headline: string;
  detail: string;
  source: string;
  engineerId: string | null;
  featureId: string | null;
  deltaArrCents: number | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type LeaderboardEntry = {
  id: string;
  rank: number;
  name: string;
  githubLogin: string;
  avatarUrl: string | null;
  role: string;
  source: string;
  arrImpactCents: number;
  mrrImpactCents: number;
  recentDeltaCents: number;
  prCount: number;
  featureCount: number;
};

export async function getDashboardData() {
  await recalculateDueCustomers().catch(() => undefined);
  const db = getDb();
  const [engineerRows, allocationRows, featureRows, customerRows, subscriptionRows, prRows, recentDeltas, activities, syncRows] = await Promise.all([
    db.select().from(engineers),
    db.select().from(engineerArrAllocations),
    db.select().from(featureArrAllocations),
    db.select().from(customers),
    db.select().from(subscriptions).where(eq(subscriptions.status, ACTIVE_SUBSCRIPTION_STATUS)),
    db.select().from(pullRequests),
    db.select().from(activityEvents).where(and(
      eq(activityEvents.type, 'engineer_arr_delta'),
      gte(activityEvents.createdAt, new Date(Date.now() - RECENT_DELTA_MS)),
    )),
    db.select().from(activityEvents).orderBy(desc(activityEvents.createdAt)).limit(40),
    db.select().from(integrationSyncs),
  ]);

  const leaderboard: LeaderboardEntry[] = engineerRows.map((engineer) => {
    const ownAllocations = allocationRows.filter((row) => row.engineerId === engineer.id);
    const arrImpactCents = ownAllocations.reduce((sum, row) => sum + row.arrCents, 0);
    return {
      id: engineer.id,
      rank: 0,
      name: engineer.name,
      githubLogin: engineer.githubLogin,
      avatarUrl: engineer.avatarUrl,
      role: engineer.role,
      source: engineer.source,
      arrImpactCents,
      mrrImpactCents: Math.round(arrImpactCents / 12),
      recentDeltaCents: recentDeltas.filter((row) => row.engineerId === engineer.id).reduce((sum, row) => sum + (row.deltaArrCents ?? 0), 0),
      prCount: new Set(prRows.filter((row) => row.engineerId === engineer.id).map((row) => row.id)).size,
      featureCount: new Set(ownAllocations.filter((row) => row.arrCents > 0).map((row) => row.featureId)).size,
    };
  }).sort((a, b) => b.arrImpactCents - a.arrImpactCents || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  const totalArrCents = subscriptionRows.reduce((sum, row) => sum + row.arrCents, 0);
  const attributedArrCents = featureRows.reduce((sum, row) => sum + row.arrCents, 0);
  const unattributedArrCents = customerRows.reduce((sum, row) => sum + row.unattributedArrCents, 0);
  const byFeature = Object.fromEntries(FEATURE_IDS.map((id) => [id, featureRows.filter((row) => row.featureId === id).reduce((sum, row) => sum + row.arrCents, 0)])) as Record<FeatureId, number>;
  const sourceTotals = subscriptionRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.source] = (acc[row.source] ?? 0) + row.arrCents;
    return acc;
  }, {});
  const syncByProvider = Object.fromEntries(syncRows.map((row) => [row.provider, row]));
  const provider = (id: string, configured: boolean) => ({
    provider: id,
    status: syncByProvider[id]?.status ?? (configured ? 'configured' : 'missing'),
    message: syncByProvider[id]?.message ?? (configured ? 'Credentials configured; live action not yet verified.' : 'Credentials missing.'),
    lastSuccessAt: syncByProvider[id]?.lastSuccessAt?.toISOString() ?? null,
  });

  return {
    generatedAt: new Date().toISOString(),
    totals: { totalArrCents, attributedArrCents, unattributedArrCents, byFeature, sourceTotals },
    leaderboard,
    activity: activities.map((row): ActivityItem => ({
      ...row,
      payload: row.payload as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    })),
    integrations: [
      provider('neon', Boolean(process.env.DATABASE_URL)),
      provider('github', Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO)),
      provider('greptile', Boolean(process.env.GREPTILE_API_KEY)),
      provider('posthog', Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST)),
      provider('stripe', Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)),
    ],
  };
}

export async function getPlayerData(engineerId: string) {
  const db = getDb();
  const [engineer] = await db.select().from(engineers).where(eq(engineers.id, engineerId)).limit(1);
  if (!engineer) return null;
  const dashboard = await getDashboardData();
  const leaderboardEntry = dashboard.leaderboard.find((entry) => entry.id === engineerId)!;
  const [allocationRows, contributionRows, prRows, missionRows, claimRows, activities, featureRows] = await Promise.all([
    db.select().from(engineerArrAllocations).where(eq(engineerArrAllocations.engineerId, engineerId)),
    db.select({ featureId: featureContributions.featureId, score: featureContributions.score, engineerId: pullRequests.engineerId })
      .from(featureContributions).innerJoin(pullRequests, eq(featureContributions.pullRequestId, pullRequests.id)),
    db.select().from(pullRequests).where(eq(pullRequests.engineerId, engineerId)).orderBy(desc(pullRequests.mergedAt)).limit(12),
    db.select().from(missions),
    db.select().from(missionClaims).where(eq(missionClaims.engineerId, engineerId)),
    db.select().from(activityEvents).where(eq(activityEvents.engineerId, engineerId)).orderBy(desc(activityEvents.createdAt)).limit(20),
    db.select().from(features),
  ]);

  const scoreByFeature = Object.fromEntries(FEATURE_IDS.map((id) => [id, { own: 0, total: 0 }]));
  for (const row of contributionRows) {
    if (!FEATURE_IDS.includes(row.featureId as FeatureId)) continue;
    const score = scoreByFeature[row.featureId];
    score.total += row.score;
    if (row.engineerId === engineerId) score.own += row.score;
  }
  const featureImpact = FEATURE_IDS.map((featureId) => ({
    id: featureId,
    name: featureRows.find((row) => row.id === featureId)?.name ?? featureId,
    ownershipPpm: scoreByFeature[featureId].total ? Math.round((scoreByFeature[featureId].own / scoreByFeature[featureId].total) * 1_000_000) : 0,
    arrImpactCents: allocationRows.filter((row) => row.featureId === featureId).reduce((sum, row) => sum + row.arrCents, 0),
  }));
  const claimByMission = Object.fromEntries(claimRows.map((claim) => [claim.missionId, claim]));

  return {
    engineer: leaderboardEntry,
    featureImpact,
    pullRequests: prRows.map((row) => ({ ...row, mergedAt: row.mergedAt.toISOString(), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })),
    missions: missionRows.filter((mission) => mission.claimedBy === engineerId).map((mission) => ({
      ...mission,
      claimedAt: claimByMission[mission.id]?.claimedAt?.toISOString() ?? null,
      completedAt: claimByMission[mission.id]?.completedAt?.toISOString() ?? null,
    })),
    activity: activities.map((row): ActivityItem => ({ ...row, payload: row.payload as Record<string, unknown>, createdAt: row.createdAt.toISOString() })),
  };
}

export async function getMissionsData() {
  const db = getDb();
  const [missionRows, engineerRows, claimRows] = await Promise.all([
    db.select().from(missions).orderBy(desc(missions.createdAt)),
    db.select().from(engineers),
    db.select().from(missionClaims),
  ]);
  const engineerById = Object.fromEntries(engineerRows.map((row) => [row.id, row]));
  const claimByMission = Object.fromEntries(claimRows.map((row) => [row.missionId, row]));
  return {
    engineers: engineerRows,
    missions: missionRows.map((mission) => ({
      ...mission,
      claimedByEngineer: mission.claimedBy ? engineerById[mission.claimedBy] ?? null : null,
      claimedAt: claimByMission[mission.id]?.claimedAt?.toISOString() ?? null,
      completedAt: claimByMission[mission.id]?.completedAt?.toISOString() ?? null,
      createdAt: mission.createdAt.toISOString(),
      updatedAt: mission.updatedAt.toISOString(),
    })),
  };
}
