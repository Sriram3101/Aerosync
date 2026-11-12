import bcrypt from 'bcryptjs';
import { pool } from '@/lib/db';
import { createSession } from '@/lib/auth';

export async function POST(req) {
  const { username, password } = await req.json().catch(() => ({}));

  // basic input validation
  if (typeof username !== 'string' || typeof password !== 'string' || !username || password.length < 6) {
    return Response.json({ error: 'Invalid credentials' }, { status: 400 });
  }

  // parameterised query (the ?) -> safe from SQL injection
  const [rows] = await pool.execute(
    'SELECT user_id, username, password_hash, role FROM Users WHERE username = ?',
    [username]
  );
  const user = rows[0];

  // same generic message for "no such user" and "wrong password" (no information leak)
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return Response.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  await createSession(user);
  return Response.json({ username: user.username, role: user.role });
}
