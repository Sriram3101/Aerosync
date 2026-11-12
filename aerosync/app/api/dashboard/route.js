import { pool } from '@/lib/db';
import { requireRole } from '@/lib/auth';

// GET /api/dashboard  -> the analytical queries (JOIN, GROUP BY, HAVING, ORDER BY,
// aggregate functions, nested subquery, correlated subquery, CTE, window functions)
// shown as panels on the dashboard.
export async function GET() {
  const { error } = await requireRole();
  if (error) return error;

  const [[totals], [gates], [airlines], [unassigned], [busyCrew], [lowBattery], [audit], [aboveAirlineAvg], [delayRank], [terminalLoad]] = await Promise.all([
    // 1. KPI cards: aggregates with conditional SUM
    pool.query(
      `SELECT COUNT(*) AS total_flights,
              SUM(status = 'Delayed') AS delayed,
              SUM(gate_id IS NULL AND status <> 'Cancelled') AS unassigned,
              ROUND(AVG(delay_minutes), 1) AS avg_delay
         FROM Flights`
    ),
    // 2. Gate utilisation from a view, ORDER BY
    pool.query('SELECT * FROM vw_gate_utilization ORDER BY busy_minutes DESC, gate_code'),
    // 3. JOIN + GROUP BY + HAVING + aggregates
    pool.query(
      `SELECT a.airline_name, COUNT(*) AS flights,
              ROUND(AVG(f.delay_minutes), 1) AS avg_delay,
              MAX(f.delay_minutes) AS worst_delay
         FROM Airlines a
         JOIN Flights f ON f.airline_id = a.airline_id
        GROUP BY a.airline_id, a.airline_name
       HAVING COUNT(*) > 1
        ORDER BY flights DESC, avg_delay DESC`
    ),
    // 4. simple filter: flights still waiting for a gate
    pool.query(
      `SELECT flight_id, flight_number, aircraft_type, aircraft_wingspan
         FROM Flights WHERE gate_id IS NULL AND status <> 'Cancelled'
        ORDER BY arr_time`
    ),
    // 5. subquery: crew busier than the average crew member
    pool.query(
      `SELECT name, tasks_assigned, task_minutes
         FROM vw_crew_workload
        WHERE tasks_assigned > (SELECT AVG(tasks_assigned) FROM vw_crew_workload)
        ORDER BY tasks_assigned DESC`
    ),
    // 6. JOIN + filter: tracking devices that need charging
    pool.query(
      `SELECT c.name, d.hardware_mac, d.battery_level
         FROM Tracking_Devices d
         JOIN Ground_Crew c ON c.crew_id = d.crew_id
        WHERE d.battery_level < 20
        ORDER BY d.battery_level`
    ),
    // 7. trigger output: latest audit rows with flight + gate names (multiple LEFT JOINs)
    pool.query(
      `SELECT fa.audit_id, f.flight_number,
              CONCAT_WS('-', g1.terminal, g1.gate_code) AS old_gate,
              CONCAT_WS('-', g2.terminal, g2.gate_code) AS new_gate,
              fa.old_dep, fa.new_dep, fa.changed_at
         FROM Flight_Audit fa
         JOIN Flights f     ON f.flight_id = fa.flight_id
         LEFT JOIN Gates g1 ON g1.gate_id = fa.old_gate
         LEFT JOIN Gates g2 ON g2.gate_id = fa.new_gate
        ORDER BY fa.audit_id DESC
        LIMIT 8`
    ),
    // 8. CORRELATED SUBQUERY: the inner query re-runs per outer row, re-evaluated
    // for each flight's own airline_id (f.airline_id), unlike the non-correlated
    // subquery in #5 above which is computed once.
    pool.query(
      `SELECT f.flight_number, a.airline_name, f.delay_minutes
         FROM Flights f
         JOIN Airlines a ON a.airline_id = f.airline_id
        WHERE f.delay_minutes > (
                SELECT AVG(f2.delay_minutes) FROM Flights f2
                 WHERE f2.airline_id = f.airline_id
              )
        ORDER BY f.delay_minutes DESC`
    ),
    // 9. WINDOW FUNCTION: RANK() each flight's delay within its own airline,
    // alongside a running SUM() of delay across the whole board ordered by arrival.
    pool.query(
      `SELECT f.flight_number, a.airline_name, f.delay_minutes,
              RANK() OVER (PARTITION BY f.airline_id ORDER BY f.delay_minutes DESC) AS delay_rank_in_airline,
              SUM(f.delay_minutes) OVER (ORDER BY f.arr_time
                                          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_delay_total
         FROM Flights f
         JOIN Airlines a ON a.airline_id = f.airline_id
        ORDER BY a.airline_name, delay_rank_in_airline`
    ),
    // 10. CTE (WITH ... AS): first summarise busy minutes per gate, then roll that
    // up by terminal. The named result gate_minutes is reused as if it were a table.
    pool.query(
      `WITH gate_minutes AS (
         SELECT g.gate_id, g.terminal,
                COALESCE(SUM(TIMESTAMPDIFF(MINUTE, f.arr_time, f.dep_time)), 0) AS busy_minutes
           FROM Gates g
           LEFT JOIN Flights f ON f.gate_id = g.gate_id
          GROUP BY g.gate_id, g.terminal
       )
       SELECT terminal, COUNT(*) AS gates, SUM(busy_minutes) AS total_busy_minutes,
              ROUND(AVG(busy_minutes), 1) AS avg_busy_minutes
         FROM gate_minutes
        GROUP BY terminal
        ORDER BY total_busy_minutes DESC`
    ),
  ]);

  return Response.json({
    totals: totals[0], gates, airlines, unassigned, busyCrew, lowBattery, audit,
    aboveAirlineAvg, delayRank, terminalLoad,
  });
}
