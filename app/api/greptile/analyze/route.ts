import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertAdmin } from '@/lib/admin';
import { apiError, AppError } from '@/lib/errors';
import { analyzePullRequests } from '@/lib/integrations/greptile';

const schema = z.object({ prNumbers: z.array(z.number().int().positive()).max(5).optional(), force: z.boolean().optional() });

export async function POST(request: Request) {
  try {
    assertAdmin(request);
    const body = await request.text();
    const options = body ? schema.parse(JSON.parse(body)) : {};
    return NextResponse.json(await analyzePullRequests(options));
  } catch (error) {
    if (error instanceof z.ZodError) return apiError(new AppError('INVALID_ANALYSIS_REQUEST', 'Invalid PR analysis request.', 400));
    return apiError(error);
  }
}
