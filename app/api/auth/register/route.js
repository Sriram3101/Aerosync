import bcrypt from 'bcryptjs';
import { pool, dbError } from '@/lib/db';
import { createSession } from '@/lib/auth';

// POST /api/auth/register { username, password }
// Public sign-up. The role is ALWAYS Ground_Staff: nobody can make themselves Admin from the browser.
export async function POST(req) {
  const { username, password } = await req.json().catch(() => ({}));

  if (typeof username !== 'string' || typeof password !== 'string') {
    return Response.json({ error: 'Username and password are required' }, { status: 400 });
  }
  const name = username.trim();
  if (!/^[A-Za-z0-9_.@+-]{3,50}$/.test(name)) {
    return Response.json({ error: 'Username must be 3-50 characters: letters, numbers or _ . @ + -' }, { status: 400 });
  }
  if (password.length < 8 || password.length > 72) {
    return Response.json({ error: 'Password must be 8-72 characters' }, { status: 400 });
  }

  const hash = await bcrypt.hash(password, 12);
  try {
    // parameterised query (the ?) -> safe from SQL injection
    const [r] = await pool.execute(
      "INSERT INTO Users (username, password_hash, role) VALUES (?, ?, 'Ground_Staff')",
      [name, hash]
    );
    await createSession({ user_id: r.insertId, username: name, role: 'Ground_Staff' });
    return Response.json({ username: name, role: 'Ground_Staff' }, { status: 201 });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return Response.json({ error: 'Username already taken' }, { status: 409 });
    }
    return dbError(e);
  }
}