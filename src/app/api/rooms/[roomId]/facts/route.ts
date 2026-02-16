import { NextRequest, NextResponse } from 'next/server';
import { dbQuery } from '@/lib/db';
import { requireAuthContext } from '@/lib/auth/server';
import {
  getRoomMemberRole,
  isUserRoomMember
} from '@/lib/repositories/persistence-repository';

type Params = {
  params: Promise<{
    roomId: string;
  }>;
};

type RoomFactRow = {
  id: string;
  short_id: string | null;
  fact: string;
  source: string | null;
  created_by: string | null;
  created_at: Date;
};

async function queryFactsWithShortId(roomId: string, limit: number, offset: number) {
  return dbQuery<RoomFactRow>(
    `
      select
        id::text as id,
        short_id,
        fact,
        source,
        created_by,
        created_at
      from public.room_facts
      where room_id = $1
      order by created_at desc
      limit $2
      offset $3
    `,
    [roomId, limit, offset]
  );
}

async function queryFactsWithoutShortId(roomId: string, limit: number, offset: number) {
  return dbQuery<RoomFactRow>(
    `
      select
        id::text as id,
        null::text as short_id,
        fact,
        source,
        created_by,
        created_at
      from public.room_facts
      where room_id = $1
      order by created_at desc
      limit $2
      offset $3
    `,
    [roomId, limit, offset]
  );
}

export async function GET(request: NextRequest, context: Params) {
  const auth = await requireAuthContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { roomId } = await context.params;
  if (!roomId) {
    return NextResponse.json({ error: 'Room ID required' }, { status: 400 });
  }

  const isMember = await isUserRoomMember(roomId, auth.context.user.id);
  if (!isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const role = await getRoomMemberRole(roomId, auth.context.user.id);
  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get('limit'));
  const offsetRaw = Number(searchParams.get('offset'));
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

  try {
    let result;
    try {
      result = await queryFactsWithShortId(roomId, limit, offset);
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === '42703') {
        result = await queryFactsWithoutShortId(roomId, limit, offset);
      } else {
        throw error;
      }
    }

    const facts = result.rows.map((row) => ({
      id: row.id,
      shortId: row.short_id,
      fact: row.fact,
      source: row.source,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString()
    }));

    return NextResponse.json({
      roomId,
      role,
      facts
    });
  } catch (error) {
    const err = error as { code?: string };
    if (err.code === '42P01') {
      return NextResponse.json({
        roomId,
        role,
        facts: []
      });
    }

    console.error('Failed to load room facts', error);
    return NextResponse.json({ error: 'Failed to load facts' }, { status: 500 });
  }
}
