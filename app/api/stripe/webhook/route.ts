import { NextResponse } from 'next/server';
import { apiError, AppError } from '@/lib/errors';
import { constructStripeEvent, processStripeEvent } from '@/lib/integrations/stripe';

export async function POST(request: Request) {
  try {
    const signature = request.headers.get('stripe-signature');
    if (!signature) throw new AppError('MISSING_SIGNATURE', 'Stripe signature is required.', 400);
    const rawBody = await request.text();
    const event = await constructStripeEvent(rawBody, signature);
    return NextResponse.json({ received: true, ...(await processStripeEvent(event)) });
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('signature')) {
      return apiError(new AppError('INVALID_SIGNATURE', 'Stripe webhook signature verification failed.', 400));
    }
    return apiError(error);
  }
}
