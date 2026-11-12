import { pool, dbError, toMysqlDate } from '@/lib/db';
import { requireRole } from '@/lib/auth';

const SHIFTS = ['On_Duty', 'Off_Duty', 'On_Break'];

// GET /api/crew -> workload view + task list (3-table JOIN)
export async function GET() {
  const { error } = await requireRole();
  if (error) return error;

  const [crew] = await pool.query('SELECT * FROM vw_crew_workload ORDER BY tasks_assigned DESC, name');
  const [tasks] = await pool.query(
    `SELECT ca.task_id, ca.task_type, ca.start_time, ca.end_time,
            c.name, c.clearance_level, f.flight_number
       FROM Crew_Assignments ca
       JOIN Ground_Crew c ON c.crew_id = ca.crew_id
       JOIN Flights f     ON f.flight_id = ca.flight_id
      ORDER BY ca.start_time`
  );
  return Response.json({ crew, tasks });
}

// POST /api/crew -> create a task (Admin). Trigger trg_assign_bi enforces duty, clearance and overlap rules.
export async function POST(req) {
  const { error } = await requireRole(['Admin']);
  if (error) return error;

  const b = await req.json().catch(() => ({}));
  const start = toMysqlDate(b.start_time);
  const end = toMysqlDate(b.end_time);
  if (!b.task_type || !b.crew_id || !b.flight_id || !start || !end) {
    return Response.json({ error: 'All task fields are required' }, { status: 400 });
  }
  try {
    await pool.execute(
      'INSERT INTO Crew_Assignments (task_type, start_time, end_time, crew_id, flight_id) VALUES (?, ?, ?, ?, ?)',
      [b.task_type, start, end, Number(b.crew_id), Number(b.flight_id)]
    );
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return dbError(e);
  }
}

// PATCH /api/crew { crew_id, shift_status } -> both roles can change a shift status
export async function PATCH(req) {
  const { error } = await requireRole(['Admin', 'Ground_Staff']);
  if (error) return error;

  const { crew_id, shift_status } = await req.json().catch(() => ({}));
  if (!SHIFTS.includes(shift_status)) return Response.json({ error: 'Invalid shift status' }, { status: 400 });
  try {
    await pool.execute('UPDATE Ground_Crew SET shift_status = ? WHERE crew_id = ?', [shift_status, Number(crew_id)]);
    return Response.json({ ok: true });
  } catch (e) {
    return dbError(e);
  }
}

// DELETE /api/crew { task_id } -> remove a task (Admin)
export async function DELETE(req) {
  const { error } = await requireRole(['Admin']);
  if (error) return error;

  const { task_id } = await req.json().catch(() => ({}));
  try {
    await pool.execute('DELETE FROM Crew_Assignments WHERE task_id = ?', [Number(task_id)]);
    return Response.json({ ok: true });
  } catch (e) {
    return dbError(e);
  }
}
