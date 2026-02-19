import { randomUUID, randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthContext, type AuthContext } from '@/lib/auth/server';
import { dbQuery } from '@/lib/db';
import { getOnyxConfig, type OnyxConfig } from '@/lib/onyx';
import {
  addLocalMessage,
  createAuditLog,
  createRoomWithAdmin,
  getRoomMemberRole,
  getRoomRuntime,
  listActiveParticipants,
  listLocalMessages,
  listProposalsByRoom,
  setRoomMemberInactive,
  setRoomAiThinking,
  setRoomCurrentRole,
  setRoomSessionId,
  touchRoomMemberPresence,
  upsertRoomMember
} from '@/lib/repositories/persistence-repository';

const DEFAULT_WELCOME_MESSAGE = `**Welcome to the Aurindor Basin Simulation!**

Welcome to an interactive, AI-supported learning sandbox designed to help you bridge the gap between systemic theory and regional practice. You are stepping into the Aurindor Basin, a fictional but realistic region facing the complex crossroads of economic transformation and climate urgency.

**Your Quick-Start Guide**

To get the most out of this capacity-building session, use the following interaction modes:

- **The Narrator:** Type "Narrator" to receive objective context about the region's geography, history, and structural challenges. Use this mode to explore the "world" of the simulation and understand the facts on the ground.
- **The Characters:** Type the name of a "Character" or stakeholder group (e.g., Farmers' Association or Lythara University) to hear their specific perspectives. Characters may introduce conflicting goals, skepticism, or unique ideas to test your strategies.
- **Room Chat:** Use the common interface to collaborate with other participants and your facilitator. While the BOT defines the region, your specific Challenge is managed by the facilitator outside the BOT.
- **Decision Testing:** When your group makes a strategic choice, ask the BOT how the region or specific characters would react. The BOT remembers previous interactions to build a continuous narrative arch.

**Session Details**

- **Exit & Rejoin:** You can exit the simulation at any time by clicking the Exit Icon. To rejoin, simply use the original session link provided by your facilitator.
- **Availability:** Please note that the BOT is a continuous support tool available only during your active capacity-building session.

Explore the Basin, test your assumptions, and lead Aurindor toward a resilient future!

*— Carla Alvial Palavicino*`;

const OPENING_SCENE_TAG = '[SYSTEM: GENERATE_OPENING_SCENE]';
const OPENING_SCENE_PROMPT = `${OPENING_SCENE_TAG}
You are the Narrator for the Climate Sandbox Aurindor Basin simulation.
Generate the opening scene in 3 to 4 sentences.
Include setting context, the key climate tension, and what decision pressure is about to begin.
Return only plain scene text with no markdown, no bullets, and no role tags.`;

const WELCOME_MESSAGE = `[SYSTEM: WELCOME_MESSAGE]
Welcome to the Aurindor Basin Simulation!

Welcome to an interactive, AI-supported learning sandbox designed to help you bridge the gap between systemic theory and regional practice. You are stepping into the Aurindor Basin, a fictional but realistic region facing the complex crossroads of economic transformation and climate urgency.

Your Quick-Start Guide
To get the most out of this capacity-building session, use the following interaction modes:
The Narrator: Type "Narrator" to receive objective context about the region's geography, history, and structural challenges. Use this mode to explore the "world" of the simulation and understand the facts on the ground.
The Characters: Type the name of a "Character" or stakeholder group (e.g., Farmers' Association or Lythara University) to hear their specific perspectives. Characters may introduce conflicting goals, skepticism, or unique ideas to test your strategies.
Room Chat: Use the common interface to collaborate with other participants and your facilitator. While the BOT defines the region, your specific Challenge is managed by the facilitator outside the BOT.
Decision Testing: When your group makes a strategic choice, ask the BOT how the region or specific characters would react. The BOT remembers previous interactions to build a continuous narrative arch.

Session Details
Exit & Rejoin: You can exit the simulation at any time by clicking the Exit Icon. To rejoin, simply use the original session link provided by your facilitator.
Availability: Please note that the BOT is a continuous support tool available only during your active capacity-building session.

Explore the Basin, test your assumptions, and lead Aurindor toward a resilient future!`;

const FALLBACK_OPENING_SCENE =
  "Aurindor Basin gathers under a dry-season sky, with reservoir levels now thin enough to force trade-offs no one can avoid. Farmers, municipal leaders, universities, and businesses have all been called to the same table as water demand rises against shrinking supply. The first decisions made here will shape who gets protection, who absorbs risk, and how trust holds under pressure. Your simulation begins now.";

const TYPING_TTL_MS = 3000;
const PARTICIPANT_ACTIVE_MS = 45_000;
const FACTS_PROMPT_LIMIT = 20;

const typingState = new Map<string, Map<string, number>>();

type PromptFactRow = {
  id: string;
  short_id: string | null;
  fact: string;
  source: string | null;
  created_by: string | null;
  created_at: Date;
};

const ROOM_ID_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 chars, no 0/O/1/I/L
const ROOM_ID_LENGTH = 4;

async function makeRoomId(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const bytes = randomBytes(ROOM_ID_LENGTH);
    let id = '';
    for (let i = 0; i < ROOM_ID_LENGTH; i++) {
      id += ROOM_ID_CHARS[bytes[i] % ROOM_ID_CHARS.length];
    }
    const { rows } = await dbQuery(
      'SELECT EXISTS(SELECT 1 FROM public.rooms WHERE id = $1) AS exists',
      [id]
    );
    if (!rows[0]?.exists) return id;
  }
  // Fallback: use longer ID to guarantee uniqueness
  return randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
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

async function listPromptFacts(roomId: string, limit = FACTS_PROMPT_LIMIT): Promise<PromptFactRow[]> {
  try {
    try {
      const result = await dbQuery<PromptFactRow>(
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
        `,
        [roomId, limit]
      );
      return result.rows;
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === '42703') {
        const fallback = await dbQuery<PromptFactRow>(
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
          `,
          [roomId, limit]
        );
        return fallback.rows;
      }
      throw error;
    }
  } catch (error) {
    const err = error as { code?: string };
    if (err.code === '42P01') {
      return [];
    }
    throw error;
  }
}

function buildFactsContextBlock(facts: PromptFactRow[]): string {
  if (facts.length === 0) return '';

  const lines = facts.map((fact) => {
    const id = fact.short_id || fact.id;
    const by = fact.created_by ? ` | by ${fact.created_by}` : '';
    const source = fact.source ? ` | source ${fact.source}` : '';
    return `- ${id}: ${fact.fact}${by}${source}`;
  });

  return [
    '[VERIFIED_ROOM_FACTS]',
    'Use these room facts as trusted context unless the user explicitly corrects them.',
    ...lines,
    '[/VERIFIED_ROOM_FACTS]',
    ''
  ].join('\n');
}

function buildRoomContextBlock(roomId: string): string {
  return [
    '[ROOM_CONTEXT]',
    `roomId: ${roomId}`,
    'If you call tools that need roomId, you must pass this exact roomId value.',
    '[/ROOM_CONTEXT]',
    ''
  ].join('\n');
}

async function createRoomFromRequest(context: AuthContext, onyx: OnyxConfig) {
  const roomId = await makeRoomId();
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
            description: `Aurindor Basin room created at ${new Date().toISOString()}`
          })
        },
        { retries: 1, timeoutMs: onyx.timeoutMs, retryDelayMs: 300 }
      );

      if (createRes.ok) {
        const data = await safeJson(createRes);
        const sessionIdFromOnyx = typeof data?.chat_session_id === 'string' ? data.chat_session_id : null;
        if (sessionIdFromOnyx) {
          // Keep the human-friendly room ID stable; track Onyx session separately.
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

  const createdRoom = await createRoomWithAdmin({
    roomId,
    onyxSessionId,
    creatorUserId: context.user.id
  });

  // 1. Save Carla's static welcome message first
  await addLocalMessage({
    roomId,
    role: 'assistant',
    content: DEFAULT_WELCOME_MESSAGE,
    senderName: 'Narrator',
    targetRole: 'Narrator',
    source: 'local',
    metadata: {
      welcomeMessage: true
    }
  });

  // 2. Save the AI-generated opening scene with a title
  const openingSceneWithTitle = `**Opening Scene**\n\n${openingScene}`;
  const openingSceneMessage = await addLocalMessage({
    roomId,
    role: 'assistant',
    content: openingSceneWithTitle,
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
    roomTitle: createdRoom.title,
    roomRole: 'admin',
    welcomeMessage: WELCOME_MESSAGE,
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

  await upsertRoomMember({ roomId, userId: auth.context.user.id });
  await touchRoomMemberPresence(roomId, auth.context.user.id);
  const roomRole = await getRoomMemberRole(roomId, auth.context.user.id);

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

  const before = searchParams.get('before') || undefined;
  const limit = Math.min(Number(searchParams.get('limit')) || 100, 200);
  const { messages, hasMore } = await listLocalMessages(roomId, limit, before);
  const proposals = await listProposalsByRoom(roomId, { status: 'active' });
  const participants = await listActiveParticipants(roomId, PARTICIPANT_ACTIVE_MS);
  const typingUsers = getActiveTyping(roomId, getUserDisplayName(auth.context));

  return NextResponse.json({
    messages,
    hasMore,
    aiThinking: roomRuntime.aiThinking,
    typingUsers,
    proposals,
    participants,
    roomTitle: roomRuntime.title,
    roomRole
  }, {
    headers: {
      'Cache-Control': 'private, no-cache, must-revalidate',
      'X-Message-Count': messages.length.toString()
    }
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

  await upsertRoomMember({ roomId, userId: auth.context.user.id });
  await touchRoomMemberPresence(roomId, auth.context.user.id);
  const roomRole = await getRoomMemberRole(roomId, auth.context.user.id);
  if (roomRole !== 'admin') {
    return NextResponse.json({ error: 'Only room admins can delete rooms' }, { status: 403 });
  }

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

    await upsertRoomMember({ roomId, userId: auth.context.user.id });
    await touchRoomMemberPresence(roomId, auth.context.user.id);

    const senderName = getUserDisplayName(auth.context);

    if (action === 'leave') {
      await setRoomMemberInactive(roomId, auth.context.user.id);
      const roomMap = typingState.get(roomId);
      if (roomMap) {
        roomMap.delete(senderName);
        if (roomMap.size === 0) {
          typingState.delete(roomId);
        }
      }
      return NextResponse.json({ success: true });
    }

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

    if (action === 'broadcast') {
      const userMessage = await addLocalMessage({
        roomId,
        role: 'user',
        content,
        senderUserId: auth.context.user.id,
        senderName,
        targetRole: 'Everyone',
        source: 'local'
      });

      await createAuditLog({
        roomId,
        actorUserId: auth.context.user.id,
        action: 'chat.broadcast_message',
        entityType: 'message',
        entityId: userMessage.id
      });

      return NextResponse.json({
        ...userMessage,
        error: null
      });
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

    const rolePrefix = `[RESPOND AS: ${effectiveRole}]\n`;
    const userPrefix = `User question: `;
    const roomContext = buildRoomContextBlock(roomId);
    let factsContext = '';

    try {
      const facts = await listPromptFacts(roomId);
      factsContext = buildFactsContextBlock(facts);
    } catch (error) {
      console.error('Failed to load room facts for AI prompt:', error);
    }

    await setRoomAiThinking(roomId, true);
    try {
      const finalPrompt = `${rolePrefix}${roomContext}${factsContext}${userPrefix}${content}`;
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'info',
          event: 'chat.send_onyx',
          roomId,
          targetRole: effectiveRole,
          onyxSessionId: runtime.onyxSessionId,
          factsInjected: Boolean(factsContext),
          promptLength: finalPrompt.length
        })
      );

      const result = await sendOnyxMessage(
        onyx,
        runtime.onyxSessionId,
        finalPrompt
      );

      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: result.error ? 'warn' : 'info',
          event: 'chat.onyx_response',
          roomId,
          targetRole: effectiveRole,
          hasAnswer: Boolean(result.answer),
          onyxError: result.error
        })
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
