import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { apiError, AppError } from '@/lib/errors';
import { recordUsage, usageSchema } from '@/lib/usage';

export async function POST(request: Request) {
  try {
    const input = usageSchema.parse(await request.json());
    return NextResponse.json(await recordUsage(input));
  } catch (error) {
    if (error instanceof ZodError) return apiError(new AppError('INVALID_USAGE', error.issues[0]?.message ?? 'Invalid usage event.', 400));
    return apiError(error);
  }
}
