import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, AppError } from '@/lib/errors';
import { createCheckout } from '@/lib/integrations/stripe';

const schema = z.object({ userId: z.string().regex(/^demo_user_[a-f0-9-]{8,}$/i).max(80) });

export async function POST(request: Request) {
  try {
    const { userId } = schema.parse(await request.json());
    const session = await createCheckout(userId, new URL(request.url).origin);
    if (!session.url) throw new AppError('CHECKOUT_FAILED', 'Stripe did not return a Checkout URL.', 502);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof z.ZodError) return apiError(new AppError('INVALID_USER', 'A valid demo user ID is required.', 400));
    if (error instanceof Error && error.message.includes('already has')) return apiError(new AppError('ALREADY_SUBSCRIBED', error.message, 409));
    return apiError(error);
  }
}
