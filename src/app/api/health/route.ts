import { NextResponse } from 'next/server';
import { getOnyxConfig } from '@/lib/onyx';

export async function GET() {
  const onyx = getOnyxConfig();
  const status = onyx.isReady ? 'ok' : 'degraded';

  return NextResponse.json({
    status,
    time: new Date().toISOString(),
    onyx: {
      ready: onyx.isReady,
      errors: onyx.errors,
    },
  });
}
