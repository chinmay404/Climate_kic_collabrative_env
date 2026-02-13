import { dbQuery, withDbClient } from '@/lib/db';
import type {
  AuditLogRecord,
  MessageRole,
  MessageSource,
  ProposalStatus,
  RoomStatus,
  RoomMemberRole,
  RoomRecord,
  RoomSummary,
  UserRecord
} from '@/lib/persistence/types';

type UserRow = {
  id: string;
  username: string;
  display_name: string | null;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
};

type RoomRow = {
  id: string;
  onyx_session_id: string | null;
  title: string;
  created_by_user_id: string;
  status: RoomRecord['status'];
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
};

type RoomSummaryRow = {
  room_id: string;
  title: string;
  role: RoomMemberRole;
  room_status: RoomRecord['status'];
  joined_at: Date;
  last_seen_at: Date;
  last_message_at: Date | null;
};

type AuditLogRow = {
  id: number;
  room_id: string | null;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
};

type RoomRuntimeRow = {
  id: string;
  onyx_session_id: string | null;
  title: string;
  status: RoomStatus;
  created_by_user_id: string;
  ai_thinking: boolean;
  current_persona: string;
};

type ParticipantRow = {
  username: string;
};

type LocalMessageRow = {
  id: string;
  message_role: MessageRole;
  content: string;
  created_at: Date;
  sender_name_snapshot: string | null;
  target_role: string | null;
  proposal_id: string | null;
};

type ProposalBaseRow = {
  id: string;
  title: string;
  description: string;
  created_at: Date;
  duration_hours: number;
  ends_at: Date;
  status: ProposalStatus;
  closed_at: Date | null;
  ai_response_message_id: string | null;
  created_by_username: string | null;
};

type ProposalOptionRow = {
  id: string;
  proposal_id: string;
  label: string;
  sort_order: number;
};

type ProposalVoteRow = {
  proposal_id: string;
  username: string;
  option_id: string;
};

type VoteResultRow = {
  option_id: string;
  label: string;
  sort_order: number;
  count: number;
  voters: string[] | null;
};

export type LocalChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  sender?: string;
  targetRole?: string;
  proposalId?: string;
};

export type ProposalOptionView = {
  id: string;
  label: string;
};

export type ProposalView = {
  id: string;
  title: string;
  description: string;
  options: ProposalOptionView[];
  votes: Record<string, string>;
  createdBy: string;
  createdAt: number;
  durationHours: number;
  endsAt: number;
  status: 'active' | 'closed';
  closedAt?: number;
  aiResponseMessageId?: string;
};

export type VoteResultsView = {
  proposal: ProposalView | null;
  results: { optionId: string; label: string; count: number; voters: string[] }[];
  totalVotes: number;
  winner: { optionId: string; label: string; count: number } | null;
};

function toUserRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at
  };
}

function toRoomRecord(row: RoomRow): RoomRecord {
  return {
    id: row.id,
    onyxSessionId: row.onyx_session_id,
    title: row.title,
    createdByUserId: row.created_by_user_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at
  };
}

function toRoomSummary(row: RoomSummaryRow): RoomSummary {
  return {
    roomId: row.room_id,
    title: row.title,
    role: row.role,
    roomStatus: row.room_status,
    joinedAt: row.joined_at,
    lastSeenAt: row.last_seen_at,
    lastMessageAt: row.last_message_at
  };
}

function toMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toAuditLogRecord(row: AuditLogRow): AuditLogRecord {
  return {
    id: row.id,
    roomId: row.room_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: toMetadata(row.metadata),
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at
  };
}

export async function getOrCreateUserByUsername(
  username: string,
  displayName?: string
): Promise<UserRecord> {
  const normalized = username.trim();
  if (!normalized) {
    throw new Error('Username is required.');
  }

  const existing = await dbQuery<UserRow>(
    `
      select id, username, display_name, created_at, updated_at, last_login_at
      from public.users
      where lower(username) = lower($1)
      limit 1
    `,
    [normalized]
  );
  if (existing.rowCount && existing.rows[0]) {
    return toUserRecord(existing.rows[0]);
  }

  try {
    const inserted = await dbQuery<UserRow>(
      `
        insert into public.users (username, display_name, last_login_at)
        values ($1, $2, now())
        returning id, username, display_name, created_at, updated_at, last_login_at
      `,
      [normalized, displayName || null]
    );
    return toUserRecord(inserted.rows[0]);
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === '23505') {
      const conflictRead = await dbQuery<UserRow>(
        `
          select id, username, display_name, created_at, updated_at, last_login_at
          from public.users
          where lower(username) = lower($1)
          limit 1
        `,
        [normalized]
      );
      if (conflictRead.rowCount && conflictRead.rows[0]) {
        return toUserRecord(conflictRead.rows[0]);
      }
    }
    throw error;
  }
}

export async function touchUserLogin(userId: string): Promise<void> {
  await dbQuery('update public.users set last_login_at = now() where id = $1', [userId]);
}

export async function createRoomWithAdmin(input: {
  roomId: string;
  onyxSessionId?: string | null;
  title?: string;
  creatorUserId: string;
}): Promise<RoomRecord> {
  return withDbClient(async (client) => {
    await client.query('begin');
    try {
      const roomResult = await client.query<RoomRow>(
        `
          insert into public.rooms (id, onyx_session_id, title, created_by_user_id)
          values ($1, $2, $3, $4)
          returning id, onyx_session_id, title, created_by_user_id, status, created_at, updated_at, archived_at
        `,
        [
          input.roomId,
          input.onyxSessionId || null,
          input.title || 'Valle Verde Simulation',
          input.creatorUserId
        ]
      );

      await client.query(
        `
          insert into public.room_members (room_id, user_id, role, is_active)
          values ($1, $2, 'admin', true)
          on conflict (room_id, user_id)
          do update set role = excluded.role, is_active = true, last_seen_at = now()
        `,
        [input.roomId, input.creatorUserId]
      );

      await client.query(
        `
          insert into public.audit_logs (room_id, actor_user_id, action, entity_type, entity_id, metadata)
          values ($1, $2, 'room.create', 'room', $1, $3::jsonb)
        `,
        [input.roomId, input.creatorUserId, JSON.stringify({ source: 'app' })]
      );

      await client.query('commit');
      return toRoomRecord(roomResult.rows[0]);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

export async function upsertRoomMember(input: {
  roomId: string;
  userId: string;
  role?: RoomMemberRole;
}): Promise<void> {
  await dbQuery(
    `
      insert into public.room_members (room_id, user_id, role, is_active, last_seen_at)
      values ($1, $2, $3, true, now())
      on conflict (room_id, user_id)
      do update set
        role = excluded.role,
        is_active = true,
        last_seen_at = now()
    `,
    [input.roomId, input.userId, input.role || 'member']
  );
}

export async function touchRoomMemberPresence(roomId: string, userId: string): Promise<void> {
  await dbQuery(
    `
      update public.room_members
      set last_seen_at = now(), is_active = true
      where room_id = $1 and user_id = $2
    `,
    [roomId, userId]
  );
}

export async function listRoomsForUser(userId: string, limit = 20): Promise<RoomSummary[]> {
  const result = await dbQuery<RoomSummaryRow>(
    `
      select
        rm.room_id,
        r.title,
        rm.role::text as role,
        r.status::text as room_status,
        rm.joined_at,
        rm.last_seen_at,
        max(m.created_at) as last_message_at
      from public.room_members rm
      join public.rooms r on r.id = rm.room_id
      left join public.messages m on m.room_id = rm.room_id
      where rm.user_id = $1 and rm.is_active = true
      group by rm.room_id, r.title, rm.role, r.status, rm.joined_at, rm.last_seen_at, r.updated_at
      order by coalesce(max(m.created_at), r.updated_at) desc
      limit $2
    `,
    [userId, limit]
  );

  return result.rows.map(toRoomSummary);
}

export async function createAuditLog(input: {
  roomId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await dbQuery(
    `
      insert into public.audit_logs (
        room_id,
        actor_user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        ip_address,
        user_agent
      )
      values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
    `,
    [
      input.roomId || null,
      input.actorUserId || null,
      input.action,
      input.entityType,
      input.entityId || null,
      JSON.stringify(input.metadata || {}),
      input.ipAddress || null,
      input.userAgent || null
    ]
  );
}

export async function listRoomAuditLogs(
  roomId: string,
  opts?: { limit?: number; offset?: number }
): Promise<AuditLogRecord[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  const offset = Math.max(opts?.offset ?? 0, 0);

  const result = await dbQuery<AuditLogRow>(
    `
      select
        id,
        room_id,
        actor_user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        host(ip_address) as ip_address,
        user_agent,
        created_at
      from public.audit_logs
      where room_id = $1
      order by created_at desc
      limit $2
      offset $3
    `,
    [roomId, limit, offset]
  );

  return result.rows.map(toAuditLogRecord);
}

function mapLocalMessage(row: LocalMessageRow): LocalChatMessage {
  return {
    id: row.id,
    role: row.message_role,
    content: row.content,
    timestamp: row.created_at.getTime(),
    sender: row.sender_name_snapshot || undefined,
    targetRole: row.target_role || undefined,
    proposalId: row.proposal_id || undefined
  };
}

function mapProposalStatus(status: ProposalStatus): 'active' | 'closed' {
  return status === 'active' ? 'active' : 'closed';
}

function mapProposals(
  proposalRows: ProposalBaseRow[],
  optionRows: ProposalOptionRow[],
  voteRows: ProposalVoteRow[]
): ProposalView[] {
  const optionsByProposal = new Map<string, ProposalOptionRow[]>();
  optionRows.forEach((row) => {
    const bucket = optionsByProposal.get(row.proposal_id) || [];
    bucket.push(row);
    optionsByProposal.set(row.proposal_id, bucket);
  });

  const votesByProposal = new Map<string, ProposalVoteRow[]>();
  voteRows.forEach((row) => {
    const bucket = votesByProposal.get(row.proposal_id) || [];
    bucket.push(row);
    votesByProposal.set(row.proposal_id, bucket);
  });

  return proposalRows.map((row) => {
    const options = (optionsByProposal.get(row.id) || [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => ({ id: o.id, label: o.label }));
    const votes: Record<string, string> = {};
    (votesByProposal.get(row.id) || []).forEach((vote) => {
      votes[vote.username] = vote.option_id;
    });
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      options,
      votes,
      createdBy: row.created_by_username || 'Unknown',
      createdAt: row.created_at.getTime(),
      durationHours: row.duration_hours,
      endsAt: row.ends_at.getTime(),
      status: mapProposalStatus(row.status),
      closedAt: row.closed_at ? row.closed_at.getTime() : undefined,
      aiResponseMessageId: row.ai_response_message_id || undefined
    };
  });
}

export async function getRoomRuntime(roomId: string): Promise<{
  id: string;
  onyxSessionId: string | null;
  title: string;
  status: RoomStatus;
  createdByUserId: string;
  aiThinking: boolean;
  currentRole: string;
} | null> {
  const result = await dbQuery<RoomRuntimeRow>(
    `
      select id, onyx_session_id, title, status::text as status, created_by_user_id, ai_thinking, current_persona
      from public.rooms
      where id = $1
      limit 1
    `,
    [roomId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    onyxSessionId: row.onyx_session_id,
    title: row.title,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    aiThinking: row.ai_thinking,
    currentRole: row.current_persona
  };
}

export async function setRoomSessionId(roomId: string, onyxSessionId: string): Promise<void> {
  await dbQuery(
    `
      update public.rooms
      set onyx_session_id = $2, updated_at = now()
      where id = $1
    `,
    [roomId, onyxSessionId]
  );
}

export async function setRoomAiThinking(roomId: string, isThinking: boolean): Promise<void> {
  await dbQuery(
    `
      update public.rooms
      set ai_thinking = $2, updated_at = now()
      where id = $1
    `,
    [roomId, isThinking]
  );
}

export async function setRoomCurrentRole(roomId: string, currentRole: string): Promise<void> {
  await dbQuery(
    `
      update public.rooms
      set current_persona = $2, updated_at = now()
      where id = $1
    `,
    [roomId, currentRole]
  );
}

export async function isUserRoomMember(roomId: string, userId: string): Promise<boolean> {
  const result = await dbQuery<{ exists: boolean }>(
    `
      select exists (
        select 1
        from public.room_members
        where room_id = $1 and user_id = $2 and is_active = true
      ) as exists
    `,
    [roomId, userId]
  );
  return Boolean(result.rows[0]?.exists);
}

export async function getRoomMemberRole(roomId: string, userId: string): Promise<RoomMemberRole | null> {
  const result = await dbQuery<{ role: RoomMemberRole }>(
    `
      select role::text as role
      from public.room_members
      where room_id = $1 and user_id = $2 and is_active = true
      limit 1
    `,
    [roomId, userId]
  );
  return result.rows[0]?.role || null;
}

export async function listActiveParticipants(roomId: string, activeWithinMs = 45_000): Promise<string[]> {
  const seconds = Math.max(1, Math.floor(activeWithinMs / 1000));
  const result = await dbQuery<ParticipantRow>(
    `
      select u.username
      from public.room_members rm
      join public.users u on u.id = rm.user_id
      where rm.room_id = $1
        and rm.is_active = true
        and rm.last_seen_at >= now() - ($2::text || ' seconds')::interval
      order by rm.last_seen_at desc
    `,
    [roomId, seconds]
  );

  return result.rows.map((row) => row.username);
}

export async function addLocalMessage(input: {
  roomId: string;
  role: MessageRole;
  content: string;
  senderUserId?: string | null;
  senderName?: string | null;
  targetRole?: string | null;
  proposalId?: string | null;
  source?: MessageSource;
  metadata?: Record<string, unknown>;
}): Promise<LocalChatMessage> {
  const result = await dbQuery<LocalMessageRow>(
    `
      insert into public.messages (
        room_id,
        sender_user_id,
        sender_name_snapshot,
        message_role,
        target_role,
        content,
        source,
        proposal_id,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      returning id, message_role, content, created_at, sender_name_snapshot, target_role, proposal_id
    `,
    [
      input.roomId,
      input.senderUserId || null,
      input.senderName || null,
      input.role,
      input.targetRole || null,
      input.content,
      input.source || 'local',
      input.proposalId || null,
      JSON.stringify(input.metadata || {})
    ]
  );

  return mapLocalMessage(result.rows[0]);
}

export async function listLocalMessages(roomId: string): Promise<LocalChatMessage[]> {
  const result = await dbQuery<LocalMessageRow>(
    `
      select id, message_role, content, created_at, sender_name_snapshot, target_role, proposal_id
      from public.messages
      where room_id = $1
      order by created_at asc
    `,
    [roomId]
  );
  return result.rows.map(mapLocalMessage);
}

export async function closeExpiredProposals(roomId: string): Promise<void> {
  await dbQuery(
    `
      update public.proposals
      set status = 'closed', closed_at = now(), updated_at = now()
      where room_id = $1 and status = 'active' and ends_at <= now()
    `,
    [roomId]
  );
}

export async function createProposalWithOptions(input: {
  roomId: string;
  title: string;
  description: string;
  options: string[];
  createdByUserId: string;
  durationHours: number;
}): Promise<ProposalView> {
  const safeDuration = Math.max(1, Math.min(input.durationHours, 168));
  let createdProposalId: string | null = null;
  await withDbClient(async (client) => {
    await client.query('begin');
    try {
      const proposalInsert = await client.query<ProposalBaseRow>(
        `
          insert into public.proposals (
            room_id,
            title,
            description,
            created_by_user_id,
            duration_hours,
            ends_at
          )
          values ($1, $2, $3, $4, $5, now() + ($5::text || ' hours')::interval)
          returning
            id,
            title,
            description,
            created_at,
            duration_hours,
            ends_at,
            status::text as status,
            closed_at,
            ai_response_message_id,
            null::text as created_by_username
        `,
        [input.roomId, input.title, input.description, input.createdByUserId, safeDuration]
      );

      const proposal = proposalInsert.rows[0];
      createdProposalId = proposal.id;

      for (let i = 0; i < input.options.length; i += 1) {
        await client.query(
          `
            insert into public.proposal_options (proposal_id, label, sort_order)
            values ($1, $2, $3)
          `,
          [proposal.id, input.options[i], i]
        );
      }

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
  if (!createdProposalId) {
    throw new Error('Failed to load created proposal');
  }
  const proposals = await listProposalsByRoom(input.roomId, { status: 'all', proposalId: createdProposalId });
  if (!proposals[0]) {
    throw new Error('Failed to load created proposal');
  }
  return proposals[0];
}

export async function listProposalsByRoom(
  roomId: string,
  opts?: { status?: 'active' | 'all'; proposalId?: string }
): Promise<ProposalView[]> {
  await closeExpiredProposals(roomId);
  const onlyActive = (opts?.status || 'all') === 'active';

  const proposalResult = await dbQuery<ProposalBaseRow>(
    `
      select
        p.id,
        p.title,
        p.description,
        p.created_at,
        p.duration_hours,
        p.ends_at,
        p.status::text as status,
        p.closed_at,
        p.ai_response_message_id,
        u.username as created_by_username
      from public.proposals p
      left join public.users u on u.id = p.created_by_user_id
      where p.room_id = $1
        and ($2::boolean = false or p.status = 'active')
        and ($3::uuid is null or p.id = $3)
      order by p.created_at desc
    `,
    [roomId, onlyActive, opts?.proposalId || null]
  );

  if (proposalResult.rowCount === 0) return [];
  const proposalIds = proposalResult.rows.map((row) => row.id);

  const optionsResult = await dbQuery<ProposalOptionRow>(
    `
      select id, proposal_id, label, sort_order
      from public.proposal_options
      where proposal_id = any($1::uuid[])
      order by proposal_id, sort_order
    `,
    [proposalIds]
  );

  const votesResult = await dbQuery<ProposalVoteRow>(
    `
      select
        v.proposal_id,
        u.username,
        v.option_id
      from public.votes v
      join public.users u on u.id = v.user_id
      where v.proposal_id = any($1::uuid[])
    `,
    [proposalIds]
  );

  return mapProposals(proposalResult.rows, optionsResult.rows, votesResult.rows);
}

export async function castVoteForProposal(input: {
  roomId: string;
  proposalId: string;
  userId: string;
  optionId: string;
}): Promise<{ success: boolean; error?: string }> {
  return withDbClient(async (client) => {
    await client.query('begin');
    try {
      const proposalRes = await client.query<{
        id: string;
        status: ProposalStatus;
        ends_at: Date;
      }>(
        `
          select id, status::text as status, ends_at
          from public.proposals
          where id = $1 and room_id = $2
          for update
        `,
        [input.proposalId, input.roomId]
      );
      const proposal = proposalRes.rows[0];
      if (!proposal) {
        await client.query('rollback');
        return { success: false, error: 'Proposal not found' };
      }

      if (proposal.status !== 'active' || proposal.ends_at.getTime() <= Date.now()) {
        if (proposal.status === 'active') {
          await client.query(
            `
              update public.proposals
              set status = 'closed', closed_at = now(), updated_at = now()
              where id = $1
            `,
            [input.proposalId]
          );
        }
        await client.query('commit');
        return { success: false, error: 'Voting is closed' };
      }

      const optionRes = await client.query<{ id: string }>(
        `
          select id
          from public.proposal_options
          where id = $1 and proposal_id = $2
          limit 1
        `,
        [input.optionId, input.proposalId]
      );
      if (!optionRes.rows[0]) {
        await client.query('rollback');
        return { success: false, error: 'Invalid option' };
      }

      await client.query(
        `
          insert into public.votes (proposal_id, option_id, user_id)
          values ($1, $2, $3)
          on conflict (proposal_id, user_id)
          do update set option_id = excluded.option_id, updated_at = now()
        `,
        [input.proposalId, input.optionId, input.userId]
      );

      await client.query('commit');
      return { success: true };
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

export async function closeProposalById(input: {
  roomId: string;
  proposalId: string;
  aiResponseMessageId?: string;
}): Promise<{ success: boolean; error?: string }> {
  const result = await dbQuery<{ id: string }>(
    `
      update public.proposals
      set
        status = 'closed',
        closed_at = now(),
        updated_at = now(),
        ai_response_message_id = coalesce($3::uuid, ai_response_message_id)
      where id = $1 and room_id = $2
      returning id
    `,
    [input.proposalId, input.roomId, input.aiResponseMessageId || null]
  );

  if (!result.rows[0]) {
    return { success: false, error: 'Proposal not found' };
  }
  return { success: true };
}

export async function getVoteResultsForProposal(
  roomId: string,
  proposalId: string
): Promise<VoteResultsView | null> {
  const proposals = await listProposalsByRoom(roomId, { status: 'all', proposalId });
  const proposal = proposals[0] || null;
  if (!proposal) return null;

  const resultRows = await dbQuery<VoteResultRow>(
    `
      select
        po.id as option_id,
        po.label,
        po.sort_order,
        count(v.user_id)::int as count,
        array_remove(array_agg(u.username), null) as voters
      from public.proposal_options po
      left join public.votes v on v.option_id = po.id
      left join public.users u on u.id = v.user_id
      where po.proposal_id = $1
      group by po.id, po.label, po.sort_order
      order by po.sort_order asc
    `,
    [proposalId]
  );

  const results = resultRows.rows.map((row) => ({
    optionId: row.option_id,
    label: row.label,
    count: Number(row.count) || 0,
    voters: row.voters || []
  }));

  const totalVotes = results.reduce((sum, item) => sum + item.count, 0);
  let winner: { optionId: string; label: string; count: number } | null = null;
  for (const result of results) {
    if (!winner || result.count > winner.count) {
      winner = { optionId: result.optionId, label: result.label, count: result.count };
    }
  }
  if (winner && winner.count === 0) winner = null;

  return {
    proposal,
    results,
    totalVotes,
    winner
  };
}
