import { dbQuery } from '@/lib/db';
import type { UserRecord } from '@/lib/persistence/types';

type UserAuthRow = {
  id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  password_hash: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
};

type SessionJoinRow = {
  session_id: string;
  user_id: string;
  expires_at: Date;
  revoked_at: Date | null;
  email: string | null;
  username: string;
  display_name: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
};

export interface AuthUser extends UserRecord {
  email: string | null;
  isActive: boolean;
}

export interface AuthSession {
  sessionId: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

function toAuthUser(row: UserAuthRow | SessionJoinRow): AuthUser {
  const id = 'user_id' in row ? row.user_id : row.id;
  return {
    id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at
  };
}

export async function findUserByEmail(email: string): Promise<(AuthUser & { passwordHash: string | null }) | null> {
  const result = await dbQuery<UserAuthRow>(
    `
      select id, username, display_name, email, password_hash, is_active, created_at, updated_at, last_login_at
      from public.users
      where lower(email) = lower($1)
      limit 1
    `,
    [email]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    ...toAuthUser(row),
    passwordHash: row.password_hash
  };
}

export async function createPasswordUser(input: {
  email: string;
  passwordHash: string;
  username?: string;
  displayName?: string;
}): Promise<AuthUser> {
  const username = input.username?.trim() || input.email.trim().toLowerCase();
  const result = await dbQuery<UserAuthRow>(
    `
      insert into public.users (email, username, display_name, password_hash, auth_provider, is_active, last_login_at)
      values (lower($1), $2, $3, $4, 'password', true, now())
      returning id, username, display_name, email, password_hash, is_active, created_at, updated_at, last_login_at
    `,
    [input.email, username, input.displayName || null, input.passwordHash]
  );

  return toAuthUser(result.rows[0]);
}

export async function markUserLogin(userId: string): Promise<void> {
  await dbQuery(
    `
      update public.users
      set last_login_at = now(), updated_at = now()
      where id = $1
    `,
    [userId]
  );
}

export async function createSession(input: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<AuthSession> {
  const result = await dbQuery<{
    id: string;
    user_id: string;
    expires_at: Date;
    revoked_at: Date | null;
  }>(
    `
      insert into public.user_sessions (user_id, token_hash, expires_at, ip_address, user_agent)
      values ($1, $2, $3, $4, $5)
      returning id, user_id, expires_at, revoked_at
    `,
    [input.userId, input.tokenHash, input.expiresAt, input.ipAddress || null, input.userAgent || null]
  );

  const row = result.rows[0];
  return {
    sessionId: row.id,
    userId: row.user_id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at
  };
}

export async function getSessionByTokenHash(tokenHash: string): Promise<{ session: AuthSession; user: AuthUser } | null> {
  const result = await dbQuery<SessionJoinRow>(
    `
      select
        s.id as session_id,
        s.user_id,
        s.expires_at,
        s.revoked_at,
        u.id,
        u.email,
        u.username,
        u.display_name,
        u.is_active,
        u.created_at,
        u.updated_at,
        u.last_login_at
      from public.user_sessions s
      join public.users u on u.id = s.user_id
      where s.token_hash = $1
      limit 1
    `,
    [tokenHash]
  );

  const row = result.rows[0];
  if (!row) return null;

  const session: AuthSession = {
    sessionId: row.session_id,
    userId: row.user_id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at
  };

  return { session, user: toAuthUser(row) };
}

export async function touchSession(sessionId: string): Promise<void> {
  await dbQuery(
    `
      update public.user_sessions
      set last_seen_at = now()
      where id = $1
    `,
    [sessionId]
  );
}

export async function revokeSessionByTokenHash(tokenHash: string): Promise<void> {
  await dbQuery(
    `
      update public.user_sessions
      set revoked_at = now()
      where token_hash = $1 and revoked_at is null
    `,
    [tokenHash]
  );
}

export async function pruneExpiredSessions(): Promise<void> {
  await dbQuery(
    `
      delete from public.user_sessions
      where expires_at < now() or revoked_at is not null
    `
  );
}
