import { NextResponse } from 'next/server';
import { apiError, AppError } from '@/lib/errors';
import { getPlayerData } from '@/lib/data';

export async function GET(_request: Request, context: { params: Promise<{ engineerId: string }> }) {
  try {
    const { engineerId } = await context.params;
    const player = await getPlayerData(engineerId);
    if (!player) throw new AppError('PLAYER_NOT_FOUND', 'Player not found.', 404);
    return NextResponse.json(player, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
