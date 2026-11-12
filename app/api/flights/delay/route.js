import { pool, dbError } from '@/lib/db';
import { requireRole } from '@/lib/auth';

// POST /api/flights/delay  { flight_id, minutes }  (Admin)
// sp_apply_delay shifts the times, releases clashing resources and tries to re-route.
export async function POST(req) {
  const { error } = await requireRole(['Admin']);
  if (error) return error;

  const { flight_id, minutes } = await req.json().catch(() => ({}));
  const m = Number(minutes);
  if (!Number.isInteger(m) || m <= 0) {
    return Response.json({ error: 'Minutes must be a positive whole number' }, { status: 400 });
  }

  const conn = await pool.getConnection();
  try {
    await conn.query('CALL sp_apply_delay(?, ?, @msg)', [Number(flight_id), m]);
    const [[out]] = await conn.query('SELECT @msg AS message');
    return Response.json(out);
  } catch (e) {
    return dbError(e);
  } finally {
    conn.release();
  }
}
