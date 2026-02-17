import { NextRequest, NextResponse } from 'next/server';
import { requireAuthContext } from '@/lib/auth/server';
import { getOnyxConfig } from '@/lib/onyx';
import {
  createAuditLog,
  deleteRoomById,
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

async function fetchWithTimeout(input: RequestInfo, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

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

export async function DELETE(request: NextRequest, context: Params) {
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
    return NextResponse.json({ error: 'Only room admins can delete rooms' }, { status: 403 });
  }

  const onyx = getOnyxConfig();
  let onyxDeleteWarning: string | null = null;

  if (room.onyxSessionId && onyx.isReady && onyx.base && onyx.apiKey) {
    try {
      const deleteRes = await fetchWithTimeout(
        `${onyx.base}/chat/delete-chat-session/${room.onyxSessionId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${onyx.apiKey}` }
        },
        onyx.timeoutMs
      );

      if (!deleteRes.ok && deleteRes.status !== 404) {
        onyxDeleteWarning = `Failed to delete linked Onyx session (${deleteRes.status}).`;
      }
    } catch (error) {
      console.error('Error deleting Onyx session during room delete:', error);
      onyxDeleteWarning = 'Failed to delete linked Onyx session.';
    }
  }

  const deleted = await deleteRoomById(roomId);
  if (!deleted) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  await createAuditLog({
    actorUserId: auth.context.user.id,
    action: 'room.delete',
    entityType: 'room',
    entityId: roomId,
    metadata: {
      title: room.title,
      onyxSessionId: room.onyxSessionId,
      onyxDeleteWarning
    }
  });

  return NextResponse.json({
    success: true,
    roomId,
    onyxDeleteWarning
  });
}
