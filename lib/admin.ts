import { AppError } from '@/lib/errors';

export function assertAdmin(request: Request) {
  const configured = process.env.ADMIN_API_TOKEN;
  if (!configured) throw new AppError('ADMIN_NOT_CONFIGURED', 'Administrative integrations are not configured.', 503);
  const supplied = request.headers.get('authorization');
  if (supplied !== `Bearer ${configured}`) throw new AppError('UNAUTHORIZED', 'A valid admin token is required.', 401);
}
