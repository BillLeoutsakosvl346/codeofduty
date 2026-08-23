import { NextResponse } from 'next/server';
import { apiError } from '@/lib/errors';
import { getDashboardData } from '@/lib/data';

export async function GET() {
  try {
    return NextResponse.json(await getDashboardData(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
