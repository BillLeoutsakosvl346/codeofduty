import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, AppError } from '@/lib/errors';
import { completeMission, missionActorSchema } from '@/lib/missions';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { engineerId } = missionActorSchema.parse(await request.json());
    return NextResponse.json({ mission: await completeMission(id, engineerId) });
  } catch (error) {
    if (error instanceof z.ZodError) return apiError(new AppError('INVALID_ENGINEER', 'Select a valid engineer.', 400));
    return apiError(error);
  }
}
