import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { withTransaction } from '@/db';
import { activityEvents, engineers, missionClaims, missions } from '@/db/schema';
import { AppError } from '@/lib/errors';

export const missionActorSchema = z.object({ engineerId: z.string().min(2).max(100) });

export async function claimMission(missionId: string, engineerId: string) {
  return withTransaction(async (tx) => {
    const [engineer] = await tx.select().from(engineers).where(eq(engineers.id, engineerId)).limit(1);
    if (!engineer) throw new AppError('ENGINEER_NOT_FOUND', 'The selected engineer does not exist.', 404);
    const [mission] = await tx.update(missions).set({ status: 'claimed', claimedBy: engineerId, updatedAt: new Date() })
      .where(and(eq(missions.id, missionId), eq(missions.status, 'open'))).returning();
    if (!mission) throw new AppError('MISSION_UNAVAILABLE', 'This mission has already been claimed.', 409);
    await tx.insert(missionClaims).values({ id: `claim_${missionId}`, missionId, engineerId, status: 'claimed' });
    await tx.insert(activityEvents).values({
      id: `act_${randomUUID()}`,
      type: 'mission_claimed',
      headline: 'MISSION CLAIMED',
      detail: `${engineer.name} claimed ${mission.title}`,
      source: mission.source,
      engineerId,
      featureId: mission.linkedFeatureId,
      dedupeKey: `mission:${missionId}:claimed`,
      payload: { missionId, xpReward: mission.xpReward },
    });
    return mission;
  });
}

export async function completeMission(missionId: string, engineerId: string) {
  return withTransaction(async (tx) => {
    const [engineer] = await tx.select().from(engineers).where(eq(engineers.id, engineerId)).limit(1);
    if (!engineer) throw new AppError('ENGINEER_NOT_FOUND', 'The selected engineer does not exist.', 404);
    const [mission] = await tx.update(missions).set({ status: 'completed', updatedAt: new Date() })
      .where(and(eq(missions.id, missionId), eq(missions.status, 'claimed'), eq(missions.claimedBy, engineerId))).returning();
    if (!mission) throw new AppError('MISSION_NOT_CLAIMED', 'Only the assigned engineer can complete this mission.', 409);
    await tx.update(missionClaims).set({ status: 'completed', completedAt: new Date() }).where(eq(missionClaims.missionId, missionId));
    await tx.insert(activityEvents).values({
      id: `act_${randomUUID()}`,
      type: 'mission_completed',
      headline: 'MISSION COMPLETE',
      detail: `${engineer.name} completed ${mission.title}`,
      source: mission.source,
      engineerId,
      featureId: mission.linkedFeatureId,
      dedupeKey: `mission:${missionId}:completed`,
      payload: { missionId, xpReward: mission.xpReward },
    });
    return mission;
  });
}
