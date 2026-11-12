import { pool } from '@/lib/db';
import { requireRole } from '@/lib/auth';

// GET /api/meta -> lists used to fill dropdowns in forms
export async function GET() {
  const { error } = await requireRole();
  if (error) return error;

  const [[airlines], [gates], [carousels], [crew], [flights]] = await Promise.all([
    pool.query('SELECT airline_id, airline_name, iata_code FROM Airlines ORDER BY airline_name'),
    pool.query('SELECT gate_id, terminal, gate_code, max_wingspan, status FROM Gates ORDER BY terminal, gate_code'),
    pool.query('SELECT carousel_id, terminal, belt_capacity, status FROM Baggage_Carousels ORDER BY terminal, carousel_id'),
    pool.query('SELECT crew_id, name, clearance_level, shift_status FROM Ground_Crew ORDER BY name'),
    pool.query("SELECT flight_id, flight_number FROM Flights WHERE status <> 'Cancelled' ORDER BY arr_time"),
  ]);
  return Response.json({ airlines, gates, carousels, crew, flights });
}
