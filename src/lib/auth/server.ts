import type { NextRequest } from 'next/server';
import { hashSessionToken, SESSION_COOKIE_NAME, SESSION_TTL_MS } from '@/lib/auth/session';
import {
  getSessionByTokenHash,
  pruneExpiredSessions,
  touchSession,
  type AuthSession,
  type AuthUser
} from '@/lib/repositories/auth-repository';

export type AuthContext = {
  user: AuthUser;
  session: AuthSession;
  sessionToken: string;
};

export async function getAuthContext(request: NextRequest): Promise<AuthContext | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  await pruneExpiredSessions();
  const record = await getSessionByTokenHash(hashSessionToken(token));
  if (!record) return null;
  if (record.session.revokedAt) return null;
  if (record.session.expiresAt.getTime() <= Date.now()) return null;
  if (!record.user.isActive) return null;

  await touchSession(record.session.sessionId);
  return {
    user: record.user,
    session: record.session,
    sessionToken: token
  };
}

export async function requireAuthContext(request: NextRequest): Promise<{ ok: true; context: AuthContext } | { ok: false }> {
  const context = await getAuthContext(request);
  if (!context) return { ok: false };
  return { ok: true, context };
}

export function newSessionExpiryDate(): Date {
  return new Date(Date.now() + SESSION_TTL_MS);
}

