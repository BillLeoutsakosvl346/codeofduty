import { NextResponse } from 'next/server';

export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export function apiError(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error(error instanceof Error ? error.message : 'Unknown API error');
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' } },
    { status: 500 },
  );
}
