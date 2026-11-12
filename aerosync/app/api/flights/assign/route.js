import { pool, dbError } from '@/lib/db';
import { requireRole } from '@/lib/auth';

// POST /api/flights/assign  { flight_id }  (Admin)
// Calls the transactional best-fit routing procedure. OUT parameters (@g, @c) are
// session variables, so the CALL and the SELECT must use the SAME connection.
export async function POST(req) {
  const { error } = await requireRole(['Admin']);
  if (error) return error;

  const { flight_id } = await req.json().catch(() => ({}));
  const conn = await pool.getConnection();
  try {
    await conn.query('CALL sp_assign_resources(?, @g, @c)', [Number(flight_id)]);
    const [[out]] = await conn.query(
      `SELECT @g AS gate_id, @c AS carousel_id,
              (SELECT CONCAT(terminal, '-', gate_code) FROM Gates WHERE gate_id = @g) AS gate`
    );
    return Response.json({
      ...out,
      message: `Assigned gate ${out.gate}` + (out.carousel_id ? `, carousel ${out.carousel_id}` : ', no carousel free'),
    });
  } catch (e) {
    return dbError(e);
  } finally {
    conn.release();
  }
}
