import { pool, dbError, toMysqlDate } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { logsIndex } from '@/lib/pinecone';

const STATUSES = ['Scheduled', 'Delayed', 'Arrived', 'Departed', 'Cancelled'];

// GET /api/flights?q=AI&status=Delayed   (any logged-in user)  -> SELECT through a view, search + filter
export async function GET(req) {
  const { error } = await requireRole();
  if (error) return error;

  const sp = new URL(req.url).searchParams;
  const q = `%${(sp.get('q') || '').trim()}%`;
  const status = sp.get('status') || '';

  const [rows] = await pool.execute(
    `SELECT * FROM vw_flight_board
      WHERE (flight_number LIKE ? OR airline_name LIKE ? OR aircraft_type LIKE ?)
        AND (? = '' OR status = ?)
      ORDER BY arr_time, flight_number`,
    [q, q, q, status, status]
  );
  return Response.json(rows);
}

// POST /api/flights   (Admin)  -> INSERT; the BEFORE INSERT trigger validates gate/wingspan/overlap
export async function POST(req) {
  const { error } = await requireRole(['Admin']);
  if (error) return error;

  const b = await req.json().catch(() => ({}));
  const arr = toMysqlDate(b.arr_time);
  const dep = toMysqlDate(b.dep_time);
  if (!b.flight_number || !b.aircraft_type || !arr || !dep || !b.airline_id) {
    return Response.json({ error: 'Flight number, aircraft, airline, arrival and departure are required' }, { status: 400 });
  }

  try {
    const [r] = await pool.execute(
      `INSERT INTO Flights (flight_number, aircraft_type, aircraft_wingspan, arr_time, dep_time,
                            airline_id, gate_id, carousel_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(b.flight_number).trim().toUpperCase(),
        String(b.aircraft_type).trim(),
        Number(b.aircraft_wingspan),
        arr,
        dep,
        Number(b.airline_id),
        b.gate_id ? Number(b.gate_id) : null,
        b.carousel_id ? Number(b.carousel_id) : null,
      ]
    );
    return Response.json({ flight_id: r.insertId }, { status: 201 });
  } catch (e) {
    return dbError(e);
  }
}

// PATCH /api/flights  { flight_id, status }  -> UPDATE
// Ground_Staff may mark Arrived / Departed; only Admin may set any status (e.g. Cancelled).
export async function PATCH(req) {
  const { error, session } = await requireRole(['Admin', 'Ground_Staff']);
  if (error) return error;

  const { flight_id, status } = await req.json().catch(() => ({}));
  if (!STATUSES.includes(status)) return Response.json({ error: 'Invalid status' }, { status: 400 });
  if (session.role !== 'Admin' && !['Arrived', 'Departed'].includes(status)) {
    return Response.json({ error: 'Forbidden: Ground_Staff can only mark Arrived or Departed' }, { status: 403 });
  }

  try {
    const [r] = await pool.execute('UPDATE Flights SET status = ? WHERE flight_id = ?', [status, Number(flight_id)]);
    if (r.affectedRows === 0) return Response.json({ error: 'Flight not found' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    return dbError(e);
  }
}

// DELETE /api/flights  { flight_id }  (Admin) -> DELETE; logs and tasks go via ON DELETE CASCADE
export async function DELETE(req) {
  const { error } = await requireRole(['Admin']);
  if (error) return error;

  const { flight_id } = await req.json().catch(() => ({}));
  try {
    // remember the vector ids first, because CASCADE will remove the log rows
    const [logs] = await pool.execute(
      'SELECT vector_id FROM Flight_Logs WHERE flight_id = ? AND vector_id IS NOT NULL',
      [Number(flight_id)]
    );
    const [r] = await pool.execute('DELETE FROM Flights WHERE flight_id = ?', [Number(flight_id)]);
    if (r.affectedRows === 0) return Response.json({ error: 'Flight not found' }, { status: 404 });

    // keep Pinecone in sync with MySQL (best effort)
    if (logs.length) {
      try {
        await logsIndex().deleteMany(logs.map((l) => l.vector_id));
      } catch (pe) {
        console.error('Pinecone cleanup failed', pe);
      }
    }
    return Response.json({ ok: true });
  } catch (e) {
    return dbError(e);
  }
}
