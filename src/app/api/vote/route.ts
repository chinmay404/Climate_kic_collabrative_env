import { NextRequest, NextResponse } from 'next/server';
import { getOnyxConfig } from '@/lib/onyx';
import { requireAuthContext } from '@/lib/auth/server';
import {
  addLocalMessage,
  castVoteForProposal,
  closeProposalById,
  createAuditLog,
  createProposalWithOptions,
  getRoomMemberRole,
  getRoomRuntime,
  getVoteResultsForProposal,
  listProposalsByRoom,
  setRoomAiThinking,
  setRoomSessionId,
  touchRoomMemberPresence,
  upsertRoomMember
} from '@/lib/repositories/persistence-repository';

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

async function sendOnyxVoteMessage(input: {
  onyxBase: string;
  apiKey: string;
  personaId: number;
  timeoutMs: number;
  roomSessionId: string;
  message: string;
}): Promise<{ answer: string | null; error: string | null; chatSessionId?: string }> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${input.apiKey}`
  };

  let endpoint = `${input.onyxBase}/chat/send-chat-message`;
  const payload: Record<string, unknown> = {
    message: input.message,
    chat_session_id: input.roomSessionId
  };

  try {
    let fetchResponse = await fetchWithRetry(
      endpoint,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      },
      { retries: 1, timeoutMs: input.timeoutMs, retryDelayMs: 300 }
    );

    if (fetchResponse.status === 404) {
      endpoint = `${input.onyxBase}/chat/send-message`;
      const fallbackPayload = {
        ...payload,
        persona_id: input.personaId,
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
        { retries: 0, timeoutMs: input.timeoutMs, retryDelayMs: 0 }
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
    if (data && data.answer) {
      return {
        answer: String(data.answer),
        error: null,
        chatSessionId: typeof data.chat_session_id === 'string' ? data.chat_session_id : undefined
      };
    }

    return { answer: null, error: 'No content received.' };
  } catch (error) {
    console.error('Failed to send vote message to Onyx:', error);
    return { answer: null, error: 'Network error while contacting AI service.' };
  }
}

function formatVoteResultsForAI(
  proposal: { title: string; description: string },
  results: { optionId: string; label: string; count: number; voters: string[] }[],
  totalVotes: number,
  winner: { optionId: string; label: string; count: number } | null
): string {
  let summary = `The group has voted on: "${proposal.title}"\n`;
  summary += `Description: ${proposal.description}\n\n`;
  summary += `Results (${totalVotes} total votes):\n`;

  results.forEach((r) => {
    const percentage = totalVotes > 0 ? Math.round((r.count / totalVotes) * 100) : 0;
    summary += `- "${r.label}": ${r.count} votes (${percentage}%)`;
    if (r.voters.length > 0) {
      summary += ` - voted by: ${r.voters.join(', ')}`;
    }
    summary += '\n';
  });

  if (winner && winner.count > 0) {
    summary += `\nThe winning choice is: "${winner.label}" with ${winner.count} votes.`;
  } else {
    summary += '\nNo clear winner - there may be a tie or no votes cast.';
  }

  return summary;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('roomId');
  const proposalId = searchParams.get('proposalId');
  const action = searchParams.get('action');

  if (!roomId) {
    return NextResponse.json({ error: 'Room ID required' }, { status: 400 });
  }

  const room = await getRoomRuntime(roomId);
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  await upsertRoomMember({ roomId, userId: auth.context.user.id });
  await touchRoomMemberPresence(roomId, auth.context.user.id);

  if (proposalId) {
    const results = await getVoteResultsForProposal(roomId, proposalId);
    if (!results) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }
    return NextResponse.json(results);
  }

  if (action === 'active') {
    const proposals = await listProposalsByRoom(roomId, { status: 'active' });
    return NextResponse.json({ proposals });
  }

  const proposals = await listProposalsByRoom(roomId, { status: 'all' });
  return NextResponse.json({ proposals });
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

    if (!roomId) {
      return NextResponse.json({ error: 'Room ID required' }, { status: 400 });
    }

    const room = await getRoomRuntime(roomId);
    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    await upsertRoomMember({ roomId, userId: auth.context.user.id });
    await touchRoomMemberPresence(roomId, auth.context.user.id);
    const role = await getRoomMemberRole(roomId, auth.context.user.id);

    if (action === 'create') {
      if (role !== 'admin') {
        return NextResponse.json({ error: 'Only room admins can create votes' }, { status: 403 });
      }

      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      const description = typeof body?.description === 'string' ? body.description.trim() : '';
      const optionsRaw = Array.isArray(body?.options) ? body.options : [];
      const options = optionsRaw
        .map((item: unknown) => (typeof item === 'string' ? item.trim() : typeof (item as { label?: unknown })?.label === 'string' ? String((item as { label: string }).label).trim() : ''))
        .filter(Boolean);
      const durationHours = Number(body?.durationHours);

      if (!title || options.length < 2) {
        return NextResponse.json({ error: 'Title and at least 2 options are required' }, { status: 400 });
      }

      const proposal = await createProposalWithOptions({
        roomId,
        title,
        description,
        options,
        createdByUserId: auth.context.user.id,
        durationHours: Number.isFinite(durationHours) && durationHours > 0 ? durationHours : 24
      });

      await addLocalMessage({
        roomId,
        role: 'system',
        content: `New proposal created: "${title}"`,
        senderName: 'System',
        proposalId: proposal.id,
        source: 'system'
      });

      await createAuditLog({
        roomId,
        actorUserId: auth.context.user.id,
        action: 'vote.proposal_create',
        entityType: 'proposal',
        entityId: proposal.id,
        metadata: {
          title,
          optionCount: options.length,
          durationHours: proposal.durationHours
        }
      });

      return NextResponse.json({ success: true, proposal });
    }

    if (action === 'vote') {
      const proposalId = typeof body?.proposalId === 'string' ? body.proposalId : '';
      const optionId = typeof body?.optionId === 'string' ? body.optionId : '';

      if (!proposalId || !optionId) {
        return NextResponse.json({ error: 'proposalId and optionId are required' }, { status: 400 });
      }

      const result = await castVoteForProposal({
        roomId,
        proposalId,
        userId: auth.context.user.id,
        optionId
      });

      if (!result.success) {
        return NextResponse.json({ error: result.error || 'Failed to cast vote' }, { status: 400 });
      }

      await createAuditLog({
        roomId,
        actorUserId: auth.context.user.id,
        action: 'vote.cast',
        entityType: 'proposal',
        entityId: proposalId,
        metadata: {
          optionId
        }
      });

      return NextResponse.json({ success: true });
    }

    if (action === 'close') {
      if (role !== 'admin') {
        return NextResponse.json({ error: 'Only room admins can close votes' }, { status: 403 });
      }

      const proposalId = typeof body?.proposalId === 'string' ? body.proposalId : '';
      const requestAIResponse = Boolean(body?.requestAIResponse);

      if (!proposalId) {
        return NextResponse.json({ error: 'proposalId is required' }, { status: 400 });
      }

      const voteData = await getVoteResultsForProposal(roomId, proposalId);
      if (!voteData || !voteData.proposal) {
        return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
      }

      if (voteData.proposal.status === 'closed') {
        return NextResponse.json({ error: 'Voting already closed' }, { status: 400 });
      }

      await closeProposalById({ roomId, proposalId });

      await addLocalMessage({
        roomId,
        role: 'system',
        content: `Voting closed for: "${voteData.proposal.title}". ${voteData.winner ? `Winner: "${voteData.winner.label}" with ${voteData.winner.count} votes.` : 'No clear winner.'}`,
        senderName: 'System',
        proposalId,
        source: 'system'
      });

      await createAuditLog({
        roomId,
        actorUserId: auth.context.user.id,
        action: 'vote.close',
        entityType: 'proposal',
        entityId: proposalId,
        metadata: {
          requestAIResponse,
          totalVotes: voteData.totalVotes,
          winner: voteData.winner?.label || null
        }
      });

      if (requestAIResponse && onyx.isReady && onyx.base && onyx.apiKey) {
        await setRoomAiThinking(roomId, true);
        try {
          const voteSummary = formatVoteResultsForAI(
            voteData.proposal,
            voteData.results,
            voteData.totalVotes,
            voteData.winner
          );
          const aiPrompt = `The participants have completed a vote. Here are the results:\n\n${voteSummary}\n\nPlease acknowledge the group's decision and provide guidance, analysis, or next steps based on their collective choice. Consider the implications of this decision for the group's climate transition scenario planning.`;

          const onyxResult = await sendOnyxVoteMessage({
            onyxBase: onyx.base,
            apiKey: onyx.apiKey,
            personaId: onyx.personaId,
            timeoutMs: onyx.timeoutMs,
            roomSessionId: room.onyxSessionId || roomId,
            message: aiPrompt
          });

          if (onyxResult.chatSessionId && onyxResult.chatSessionId !== room.onyxSessionId) {
            await setRoomSessionId(roomId, onyxResult.chatSessionId);
          }

          const aiMessage = await addLocalMessage({
            roomId,
            role: 'assistant',
            content: onyxResult.answer || 'The AI service could not process the voting results.',
            senderName: 'Onyx AI',
            proposalId,
            source: onyxResult.answer ? 'onyx' : 'system'
          });

          await closeProposalById({ roomId, proposalId, aiResponseMessageId: aiMessage.id });

          await createAuditLog({
            roomId,
            actorUserId: auth.context.user.id,
            action: onyxResult.answer ? 'vote.ai_response' : 'vote.ai_response_error',
            entityType: 'message',
            entityId: aiMessage.id,
            metadata: {
              onyxError: onyxResult.error
            }
          });

          return NextResponse.json({
            success: true,
            results: voteData,
            aiResponse: onyxResult.answer,
            error: onyxResult.error
          });
        } finally {
          await setRoomAiThinking(roomId, false);
        }
      }

      return NextResponse.json({ success: true, results: voteData });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error processing vote request:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
