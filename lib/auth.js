import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET);

// Creates a signed JWT and stores it in an httpOnly cookie (JavaScript in the browser cannot read it).
export async function createSession(user) {
  const token = await new SignJWT({ uid: user.user_id, username: user.username, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret());

  const store = await cookies();
  store.set('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 8,
  });
}

export async function getSession() {
  const store = await cookies();
  const token = store.get('session')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload;
  } catch {
    return null;
  }
}

// Usage in a route:  const { error, session } = await requireRole(['Admin']); if (error) return error;
// requireRole() with no argument = any logged-in user.
export async function requireRole(roles) {
  const s = await getSession();
  if (!s) return { error: Response.json({ error: 'Not logged in' }, { status: 401 }) };
  if (roles && !roles.includes(s.role)) {
    return { error: Response.json({ error: 'Forbidden: your role cannot do this' }, { status: 403 }) };
  }
  return { session: s };
}
