import { NextRequest, NextResponse } from 'next/server';
import { requireAuthContext } from '@/lib/auth/server';
import {
  createAuditLog,
  getRoomMemberRole,
  getRoomRuntime,
  isUserRoomMember,
  updateRoomTitle
} from '@/lib/repositories/persistence-repository';

type Params = {
  params: Promise<{
    roomId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: Params) {
  const auth = await requireAuthContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { roomId } = await context.params;
  if (!roomId) {
    return NextResponse.json({ error: 'Room ID required' }, { status: 400 });
  }

  const room = await getRoomRuntime(roomId);
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  const isMember = await isUserRoomMember(roomId, auth.context.user.id);
  if (!isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const role = await getRoomMemberRole(roomId, auth.context.user.id);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Only room admins can rename rooms' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const nextTitle = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!nextTitle || nextTitle.length < 3 || nextTitle.length > 80) {
    return NextResponse.json({ error: 'Room name must be 3-80 characters' }, { status: 400 });
  }

  await updateRoomTitle(roomId, nextTitle);

  await createAuditLog({
    roomId,
    actorUserId: auth.context.user.id,
    action: 'room.rename',
    entityType: 'room',
    entityId: roomId,
    metadata: {
      previousTitle: room.title,
      nextTitle
    }
  });

  return NextResponse.json({
    success: true,
    roomId,
    title: nextTitle
  });
}
