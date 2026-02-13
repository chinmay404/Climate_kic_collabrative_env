import { NextRequest, NextResponse } from 'next/server';
import { requireAuthContext } from '@/lib/auth/server';
import { listRoomsForUser } from '@/lib/repositories/persistence-repository';

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get('limit'));
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;

  const rooms = await listRoomsForUser(auth.context.user.id, limit);
  return NextResponse.json({ rooms });
}
