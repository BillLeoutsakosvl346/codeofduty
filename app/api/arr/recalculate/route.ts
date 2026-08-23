import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertAdmin } from '@/lib/admin';
import { apiError, AppError } from '@/lib/errors';
import { recalculateAllActiveCustomers, recalculateCustomerARR } from '@/lib/arr';

const schema = z.object({ userId: z.string().min(3).max(100).optional(), all: z.boolean().optional() }).refine((value) => value.userId || value.all, 'Specify userId or all.');

export async function POST(request: Request) {
  try {
    assertAdmin(request);
    const input = schema.parse(await request.json());
    const result = input.all ? await recalculateAllActiveCustomers() : await recalculateCustomerARR(input.userId!);
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof z.ZodError) return apiError(new AppError('INVALID_RECALCULATION', 'Specify a userId or all customers.', 400));
    return apiError(error);
  }
}
