import { NextRequest, NextResponse } from 'next/server';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import {
  clearSessionCookie,
  hashSessionToken,
  newSessionToken,
  SESSION_COOKIE_NAME,
  setSessionCookie
} from '@/lib/auth/session';
import { getAuthContext, newSessionExpiryDate } from '@/lib/auth/server';
import {
  createPasswordUser,
  createSession,
  findUserByEmail,
  markUserLogin,
  revokeSessionByTokenHash
} from '@/lib/repositories/auth-repository';

function sanitizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function sanitizePassword(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toPublicUser(user: {
  id: string;
  email: string | null;
  username: string;
  displayName: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName
  };
}

export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: toPublicUser(auth.user),
    session: {
      expiresAt: auth.session.expiresAt.toISOString()
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = typeof body?.action === 'string' ? body.action : '';

    if (action === 'logout') {
      const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
      if (token) {
        await revokeSessionByTokenHash(hashSessionToken(token));
      }
      const response = NextResponse.json({ success: true });
      clearSessionCookie(response);
      return response;
    }

    if (action !== 'login' && action !== 'register') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const email = sanitizeEmail(body?.email);
    const password = sanitizePassword(body?.password);
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
    const allowCreate = Boolean(body?.allowCreate);

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    let user = await findUserByEmail(email);

    if (action === 'register') {
      if (user) {
        return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
      }
      const passwordHash = await hashPassword(password);
      user = {
        ...(await createPasswordUser({
          email,
          passwordHash,
          username: email,
          displayName: displayName || undefined
        })),
        passwordHash
      };
    } else if (!user && allowCreate) {
      const passwordHash = await hashPassword(password);
      user = {
        ...(await createPasswordUser({
          email,
          passwordHash,
          username: email,
          displayName: displayName || undefined
        })),
        passwordHash
      };
    }

    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const matches = await verifyPassword(password, user.passwordHash);
    if (!matches) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    await markUserLogin(user.id);

    const sessionToken = newSessionToken();
    const expiresAt = newSessionExpiryDate();
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      null;
    const userAgent = request.headers.get('user-agent') || null;

    await createSession({
      userId: user.id,
      tokenHash: hashSessionToken(sessionToken),
      expiresAt,
      ipAddress,
      userAgent
    });

    const response = NextResponse.json({
      authenticated: true,
      user: toPublicUser(user),
      session: {
        expiresAt: expiresAt.toISOString()
      }
    });
    setSessionCookie(response, sessionToken);
    return response;
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
