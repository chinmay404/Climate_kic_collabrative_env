import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthContext, type AuthContext } from '@/lib/auth/server';
import { getOnyxConfig, type OnyxConfig } from '@/lib/onyx';
import {
  addLocalMessage,
  createAuditLog,
  createRoomWithAdmin,
  getRoomRuntime,
  listActiveParticipants,
  listLocalMessages,
  listProposalsByRoom,
  setRoomAiThinking,
  setRoomCurrentRole,
  setRoomSessionId,
  touchRoomMemberPresence,
  upsertRoomMember
} from '@/lib/repositories/persistence-repository';

const OPENING_SCENE_TAG = '[SYSTEM: GENERATE_OPENING_SCENE]';
const OPENING_SCENE_PROMPT = `${OPENING_SCENE_TAG}
You are the Narrator for the Climate Sandbox Valle Verde simulation.
Generate the opening scene in 3 to 4 sentences.
Include setting context, the key climate tension, and what decision pressure is about to begin.
Return only plain scene text with no markdown, no bullets, and no role tags.`;

const FALLBACK_OPENING_SCENE =
  "Valle Verde gathers under a dry-season sky, with reservoir levels now thin enough to force trade-offs no one can avoid. Farmers, municipal leaders, universities, and businesses have all been called to the same table as water demand rises against shrinking supply. The first decisions made here will shape who gets protection, who absorbs risk, and how trust holds under pressure. Your simulation begins now.";

const TYPING_TTL_MS = 3000;
const PARTICIPANT_ACTIVE_MS = 45_000;

const typingState = new Map<string, Map<string, number>>();

function makeRoomId(): string {
  return `ROOM-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
}

function getUserDisplayName(context: AuthContext): string {
  return context.user.displayName || context.user.username;
}

function setTyping(roomId: string, username: string) {
  const now = Date.now();
  const roomMap = typingState.get(roomId) || new Map<string, number>();
  roomMap.set(username, now);
  typingState.set(roomId, roomMap);
}

function getActiveTyping(roomId: string, currentUsername: string): Record<string, number> {
  const roomMap = typingState.get(roomId);
  if (!roomMap) return {};

  const now = Date.now();
  const result: Record<string, number> = {};
  for (const [username, timestamp] of roomMap.entries()) {
    if (now - timestamp > TYPING_TTL_MS) {
      roomMap.delete(username);
      continue;
    }
    if (username !== currentUsername) {
      result[username] = timestamp;
    }
  }

  if (roomMap.size === 0) {
    typingState.delete(roomId);
  }

  return result;
}

async function fetchWithTimeout(input: RequestInfo, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithRetry(
  input: RequestInfo,
  init: RequestInit,
  opts: { retries: number; timeoutMs: number; retryDelayMs: number }
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt += 1) {
    try {
      return await fetchWithTimeout(input, init, opts.timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt < opts.retries) {
        await new Promise((resolve) => setTimeout(resolve, opts.retryDelayMs));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError;
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function readLegacyNdjsonAnswer(response: Response): Promise<string> {
  const text = await response.text();
  const lines = text.split('\n').filter(Boolean);
  let accumulatedAnswer = '';

  for (const line of lines) {
    try {
      const packet = JSON.parse(line);
      if (packet.obj && packet.obj.type === 'message_delta') {
        accumulatedAnswer += packet.obj.content || '';
      }
    } catch {
      // ignore malformed packets
    }
  }

  return accumulatedAnswer;
}

async function sendOnyxMessage(
  onyx: OnyxConfig,
  chatSessionId: string,
  message: string
): Promise<{ answer: string | null; error: string | null; chatSessionId?: string }> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${onyx.apiKey!}`
  };

  let endpoint = `${onyx.base!}/chat/send-chat-message`;
  const payload: Record<string, unknown> = {
    message,
    chat_session_id: chatSessionId
  };

  try {
    let fetchResponse = await fetchWithRetry(
      endpoint,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      },
      { retries: 1, timeoutMs: onyx.timeoutMs, retryDelayMs: 300 }
    );

    if (fetchResponse.status === 404) {
      endpoint = `${onyx.base!}/chat/send-message`;
      const fallbackPayload = {
        ...payload,
        persona_id: onyx.personaId,
        parent_message_id: null,
        search_doc_ids: [],
        retrieval_options: {},
        file_descriptors: []
      };
      fetchResponse = await fetchWithRetry(
        endpoint,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(fallbackPayload)
        },
        { retries: 0, timeoutMs: onyx.timeoutMs, retryDelayMs: 0 }
      );
    }

    if (!fetchResponse.ok) {
      return { answer: null, error: `Onyx error ${fetchResponse.status}.` };
    }

    if (endpoint.endsWith('/chat/send-message')) {
      const answer = await readLegacyNdjsonAnswer(fetchResponse);
      return { answer: answer || null, error: answer ? null : 'No content received.' };
    }

    const data = await safeJson(fetchResponse);
    if (data && typeof data.answer === 'string') {
      return {
        answer: data.answer,
        error: null,
        chatSessionId: typeof data.chat_session_id === 'string' ? data.chat_session_id : undefined
      };
    }

    return { answer: null, error: 'No content received.' };
  } catch {
    return { answer: null, error: 'Network error while contacting AI service.' };
  }
}

async function createRoomFromRequest(context: AuthContext, onyx: OnyxConfig) {
  let roomId = makeRoomId();
  let onyxSessionId: string | null = null;
  let openingScene = FALLBACK_OPENING_SCENE;
  let onyxError: string | null = null;

  if (onyx.isReady && onyx.base && onyx.apiKey) {
    try {
      const createRes = await fetchWithRetry(
        `${onyx.base}/chat/create-chat-session`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${onyx.apiKey}`
          },
          body: JSON.stringify({
            persona_id: onyx.personaId,
            description: `Valle Verde room created at ${new Date().toISOString()}`
          })
        },
        { retries: 1, timeoutMs: onyx.timeoutMs, retryDelayMs: 300 }
      );

      if (createRes.ok) {
        const data = await safeJson(createRes);
        const sessionIdFromOnyx = typeof data?.chat_session_id === 'string' ? data.chat_session_id : null;
        if (sessionIdFromOnyx) {
          roomId = sessionIdFromOnyx;
          onyxSessionId = sessionIdFromOnyx;

          const sceneResult = await sendOnyxMessage(onyx, sessionIdFromOnyx, OPENING_SCENE_PROMPT);
          if (sceneResult.answer) {
            openingScene = sceneResult.answer.trim();
          } else if (sceneResult.error) {
            onyxError = sceneResult.error;
          }
        }
      } else {
        onyxError = 'The AI service could not start a session. A local room was created instead.';
      }
    } catch (error) {
      console.error('Error creating Onyx room session:', error);
      onyxError = 'The AI service is temporarily unreachable. A local room was created instead.';
    }
  } else {
    onyxError = `Onyx is not configured (${onyx.errors.join(' ')})`;
  }

  await createRoomWithAdmin({
    roomId,
    onyxSessionId,
    creatorUserId: context.user.id
  });

  const openingSceneMessage = await addLocalMessage({
    roomId,
    role: 'assistant',
    content: openingScene,
    senderName: 'Narrator',
    targetRole: 'Narrator',
    source: onyxSessionId ? 'onyx' : 'local',
    metadata: {
      openingScene: true,
      generatedBy: onyxSessionId ? 'onyx' : 'fallback'
    }
  });

  await createAuditLog({
    roomId,
    actorUserId: context.user.id,
    action: 'room.opening_scene',
    entityType: 'message',
    entityId: openingSceneMessage.id,
    metadata: {
      source: onyxSessionId ? 'onyx' : 'fallback'
    }
  });

  return NextResponse.json({
    roomId,
    sessionId: onyxSessionId || roomId,
    openingScene,
    onyxError
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const onyx = getOnyxConfig();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'create') {
    return createRoomFromRequest(auth.context, onyx);
  }

  const roomId = searchParams.get('roomId');
  if (!roomId) {
    return NextResponse.json({ error: 'Room ID required' }, { status: 400 });
  }

  const roomRuntime = await getRoomRuntime(roomId);
  if (!roomRuntime) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  await upsertRoomMember({ roomId, userId: auth.context.user.id, role: 'member' });
  await touchRoomMemberPresence(roomId, auth.context.user.id);

  if (action === 'sync') {
    if (!roomRuntime.onyxSessionId) {
      return NextResponse.json({ onyxData: null, warning: 'No Onyx session linked to this room.' });
    }

    if (!onyx.isReady || !onyx.base || !onyx.apiKey) {
      return NextResponse.json({ error: 'Onyx configuration error.', details: onyx.errors }, { status: 503 });
    }

    try {
      const onyxRes = await fetchWithTimeout(
        `${onyx.base}/chat/get-chat-session/${roomRuntime.onyxSessionId}`,
        { headers: { Authorization: `Bearer ${onyx.apiKey}` } },
        onyx.timeoutMs
      );
      if (onyxRes.ok) {
        const onyxData = await safeJson(onyxRes);
        return NextResponse.json({ onyxData });
      }

      return NextResponse.json({ error: 'Onyx session not found' }, { status: 404 });
    } catch (error) {
      console.error('Failed to sync with Onyx:', error);
      return NextResponse.json({ error: 'Failed to sync with Onyx' }, { status: 502 });
    }
  }

  const messages = await listLocalMessages(roomId);
  const proposals = await listProposalsByRoom(roomId, { status: 'active' });
  const participants = await listActiveParticipants(roomId, PARTICIPANT_ACTIVE_MS);
  const typingUsers = getActiveTyping(roomId, getUserDisplayName(auth.context));

  return NextResponse.json({
    messages,
    aiThinking: roomRuntime.aiThinking,
    typingUsers,
    proposals,
    participants
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const onyx = getOnyxConfig();
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('roomId');

  if (!roomId) {
    return NextResponse.json({ error: 'Room ID required' }, { status: 400 });
  }

  const roomRuntime = await getRoomRuntime(roomId);
  if (!roomRuntime) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  await upsertRoomMember({ roomId, userId: auth.context.user.id, role: 'member' });
  await touchRoomMemberPresence(roomId, auth.context.user.id);

  if (roomRuntime.onyxSessionId && onyx.isReady && onyx.base && onyx.apiKey) {
    try {
      await fetchWithTimeout(
        `${onyx.base}/chat/delete-chat-session/${roomRuntime.onyxSessionId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${onyx.apiKey}` }
        },
        onyx.timeoutMs
      );
    } catch (error) {
      console.error('Error deleting Onyx session:', error);
      return NextResponse.json({ error: 'Failed to delete session' }, { status: 502 });
    }
  }

  await createAuditLog({
    roomId,
    actorUserId: auth.context.user.id,
    action: 'room.session_delete_remote',
    entityType: 'room',
    entityId: roomId,
    metadata: {
      onyxSessionId: roomRuntime.onyxSessionId
    }
  });

  return NextResponse.json({ success: true });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const onyx = getOnyxConfig();

  try {
    const body = await request.json();
    const roomId = typeof body?.roomId === 'string' ? body.roomId : '';
    const action = typeof body?.action === 'string' ? body.action : '';
    const targetRole =
      typeof body?.targetRole === 'string' && body.targetRole.trim() ? body.targetRole.trim() : undefined;

    if (!roomId) {
      return NextResponse.json({ error: 'Room ID required' }, { status: 400 });
    }

    const runtime = await getRoomRuntime(roomId);
    if (!runtime) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    await upsertRoomMember({ roomId, userId: auth.context.user.id, role: 'member' });
    await touchRoomMemberPresence(roomId, auth.context.user.id);

    const senderName = getUserDisplayName(auth.context);

    if (action === 'typing') {
      setTyping(roomId, senderName);
      return NextResponse.json({ success: true });
    }

    if (action === 'presence') {
      return NextResponse.json({ success: true });
    }

    const content = typeof body?.content === 'string' ? body.content.trim() : '';
    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const effectiveRole = targetRole || runtime.currentRole || 'Narrator';
    if (targetRole && targetRole !== runtime.currentRole) {
      await setRoomCurrentRole(roomId, targetRole);
    }

    await addLocalMessage({
      roomId,
      role: 'user',
      content,
      senderUserId: auth.context.user.id,
      senderName,
      targetRole: effectiveRole,
      source: 'local'
    });

    await createAuditLog({
      roomId,
      actorUserId: auth.context.user.id,
      action: 'chat.user_message',
      entityType: 'room',
      entityId: roomId,
      metadata: {
        targetRole: effectiveRole
      }
    });

    if (!onyx.isReady || !onyx.base || !onyx.apiKey || !runtime.onyxSessionId) {
      const assistantMessage = await addLocalMessage({
        roomId,
        role: 'assistant',
        content: 'AI is unavailable for this room right now. Your message was saved.',
        senderName: 'Onyx AI',
        targetRole: effectiveRole,
        source: 'system',
        metadata: {
          reason: !runtime.onyxSessionId ? 'missing_onyx_session' : 'onyx_not_configured'
        }
      });

      return NextResponse.json({
        ...assistantMessage,
        error: !runtime.onyxSessionId
          ? 'This room has no linked AI session.'
          : `Onyx configuration error: ${onyx.errors.join(' ')}`
      });
    }

    const rolePrefix = `You are acting as ${effectiveRole}. Respond in that voice.\n\n`;
    const userPrefix = `[User: ${senderName}] `;

    await setRoomAiThinking(roomId, true);
    try {
      const result = await sendOnyxMessage(
        onyx,
        runtime.onyxSessionId,
        `${rolePrefix}${userPrefix}${content}`
      );

      if (result.chatSessionId && result.chatSessionId !== runtime.onyxSessionId) {
        await setRoomSessionId(roomId, result.chatSessionId);
      }

      const assistantMessage = await addLocalMessage({
        roomId,
        role: 'assistant',
        content: result.answer || 'The AI service failed to respond. Please try again in a moment.',
        senderName: 'Onyx AI',
        targetRole: effectiveRole,
        source: result.answer ? 'onyx' : 'system',
        metadata: {
          onyxError: result.error
        }
      });

      await createAuditLog({
        roomId,
        actorUserId: auth.context.user.id,
        action: result.answer ? 'chat.assistant_message' : 'chat.assistant_error',
        entityType: 'message',
        entityId: assistantMessage.id,
        metadata: {
          onyxError: result.error
        }
      });

      return NextResponse.json({
        ...assistantMessage,
        error: result.error
      });
    } finally {
      await setRoomAiThinking(roomId, false);
    }
  } catch (error) {
    console.error('Error processing chat:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
