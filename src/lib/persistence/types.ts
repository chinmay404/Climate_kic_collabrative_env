export type RoomMemberRole = 'admin' | 'member';
export type RoomStatus = 'active' | 'archived' | 'deleted';
export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageSource = 'local' | 'onyx' | 'system';
export type ProposalStatus = 'active' | 'closed' | 'cancelled';

export interface UserRecord {
  id: string;
  username: string;
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface RoomRecord {
  id: string;
  onyxSessionId: string | null;
  title: string;
  createdByUserId: string;
  status: RoomStatus;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface RoomSummary {
  roomId: string;
  title: string;
  role: RoomMemberRole;
  roomStatus: RoomStatus;
  joinedAt: Date;
  lastSeenAt: Date;
  lastMessageAt: Date | null;
}

export interface AuditLogRecord {
  id: number;
  roomId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

