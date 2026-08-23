import { NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/admin';
import { apiError } from '@/lib/errors';
import { syncMergedPullRequests } from '@/lib/integrations/github';

export async function POST(request: Request) {
  try {
    assertAdmin(request);
    return NextResponse.json(await syncMergedPullRequests());
  } catch (error) {
    return apiError(error);
  }
}
