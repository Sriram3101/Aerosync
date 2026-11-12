-- =====================================================================
-- AeroSync : tests.sql
-- Run ONE statement at a time (put the cursor on it, press Ctrl+Enter)
-- on a FRESHLY seeded database, IN THIS ORDER. Screenshot every result.
-- Lines marked FAIL are supposed to show a red error: that IS the pass.
-- =====================================================================
USE aerosync;

-- T1 (FAIL expected) wingspan 64.80 m does not fit gate A1 (36 m)
INSERT INTO Flights (flight_number, aircraft_type, aircraft_wingspan, arr_time, dep_time, airline_id, gate_id)
VALUES ('TEST1', 'B777', 64.80, '2026-11-01 20:00', '2026-11-01 21:00', 3, 1);
-- expected: Error 1644 'Aircraft wingspan exceeds gate limit'

-- T2 (FAIL expected) gate A1 is busy 08:00-09:30 with AI101
INSERT INTO Flights (flight_number, aircraft_type, aircraft_wingspan, arr_time, dep_time, airline_id, gate_id)
VALUES ('TEST2', 'A320', 35.80, '2026-11-01 08:45', '2026-11-01 09:00', 1, 1);
-- expected: 'Gate double-booked for this time window'

-- T3 (SUCCESS) best-fit routing: LH754 (A350, 64.75 m) -> gate B2 (id 5), carousel 4
CALL sp_assign_resources(4, @g, @c);
SELECT @g AS gate_id, @c AS carousel_id;

-- T4 (FAIL expected) AI305 (B787, 60.12 m) only fits B1/B2 and both are busy now
CALL sp_assign_resources(5, @g, @c);
-- expected: 'No compatible gate available in this time window'

-- T5 (SUCCESS) delay AI101 by 60 min -> clashes with 6E411 at A1 -> auto re-routed
CALL sp_apply_delay(1, 60, @msg);
SELECT @msg AS result;
SELECT * FROM vw_flight_board WHERE flight_id IN (1, 6);
SELECT * FROM Flight_Audit;
-- expected: AI101 now 09:00-10:30, status Delayed, gate A4 (id 7), carousel 5,
--           and an audit row old_gate 1 -> NULL, then NULL -> 7

-- T6 (FAIL expected) Priya Das is Off_Duty
INSERT INTO Crew_Assignments (task_type, start_time, end_time, crew_id, flight_id)
VALUES ('Cleaning', '2026-11-01 09:00', '2026-11-01 09:30', 6, 2);

-- T7 (FAIL expected) Anita Rao has Basic clearance, Refuelling needs Advanced
INSERT INTO Crew_Assignments (task_type, start_time, end_time, crew_id, flight_id)
VALUES ('Refuelling', '2026-11-01 10:00', '2026-11-01 10:30', 2, 2);

-- T8 (FAIL expected) Ravi already has Refuelling 08:10-08:40
INSERT INTO Crew_Assignments (task_type, start_time, end_time, crew_id, flight_id)
VALUES ('Inspection', '2026-11-01 08:20', '2026-11-01 08:50', 1, 2);

-- T9 (FAIL expected) CHECK constraint: battery must be 0..100
INSERT INTO Tracking_Devices (hardware_mac, battery_level, crew_id)
VALUES ('AA:BB:CC:00:00:09', 150, 6);
-- expected: Error 3819 Check constraint 'chk_battery' is violated

-- T10 (FAIL expected) CHECK constraint: IATA code must be uppercase
INSERT INTO Airlines (airline_name, iata_code) VALUES ('Test Air', 'ab');

-- T11 (FAIL expected) CHECK constraint: departure must be after arrival
INSERT INTO Flights (flight_number, aircraft_type, aircraft_wingspan, arr_time, dep_time, airline_id)
VALUES ('TEST3', 'A320', 35.80, '2026-11-01 12:00', '2026-11-01 11:00', 1);

-- T12 (FAIL expected) foreign key: cannot delete an airline that still has flights
DELETE FROM Airlines WHERE airline_id = 1;

-- T13 (SUCCESS) cancelling a flight frees its gate automatically (trigger) + audit row
UPDATE Flights SET status = 'Cancelled' WHERE flight_id = 6;
SELECT flight_id, flight_number, status, gate_id, carousel_id FROM Flights WHERE flight_id = 6;

-- T14 (SUCCESS) gate maintenance is respected: B3 is never chosen
SELECT gate_code, status FROM Gates WHERE gate_code = 'B3';

-- T15 (SUCCESS) keyword full-text search
SELECT log_id, log_text, MATCH(log_text) AGAINST ('maintenance inspection') AS score
FROM Flight_Logs
WHERE MATCH(log_text) AGAINST ('maintenance inspection')
ORDER BY score DESC;

-- T16 (ZERO ROWS expected) keyword search cannot match different words
SELECT log_id, log_text FROM Flight_Logs
WHERE MATCH(log_text) AGAINST ('strong wind during touchdown');
-- (the semantic search in the web app DOES find the crosswind/gusty logs)

-- T17 (SUCCESS) correlated subquery: inner query re-evaluates per outer row (f.airline_id)
SELECT f.flight_number, a.airline_name, f.delay_minutes
FROM Flights f JOIN Airlines a ON a.airline_id = f.airline_id
WHERE f.delay_minutes > (SELECT AVG(f2.delay_minutes) FROM Flights f2 WHERE f2.airline_id = f.airline_id)
ORDER BY f.delay_minutes DESC;

-- T18 (SUCCESS) window functions: RANK() per airline + a running total ordered by arrival
SELECT f.flight_number, a.airline_name, f.delay_minutes,
       RANK() OVER (PARTITION BY f.airline_id ORDER BY f.delay_minutes DESC) AS delay_rank_in_airline,
       SUM(f.delay_minutes) OVER (ORDER BY f.arr_time ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_delay_total
FROM Flights f JOIN Airlines a ON a.airline_id = f.airline_id
ORDER BY a.airline_name, delay_rank_in_airline;

-- T19 (SUCCESS) CTE (WITH ... AS): named result reused like a temporary table
WITH gate_minutes AS (
  SELECT g.gate_id, g.terminal,
         COALESCE(SUM(TIMESTAMPDIFF(MINUTE, f.arr_time, f.dep_time)), 0) AS busy_minutes
    FROM Gates g LEFT JOIN Flights f ON f.gate_id = g.gate_id
   GROUP BY g.gate_id, g.terminal
)
SELECT terminal, COUNT(*) AS gates, SUM(busy_minutes) AS total_busy_minutes, ROUND(AVG(busy_minutes), 1) AS avg_busy_minutes
FROM gate_minutes GROUP BY terminal ORDER BY total_busy_minutes DESC;

-- To reset everything after testing: re-run schema.sql, advanced.sql, seed.sql,
-- then  node --env-file=.env.local scripts/seed-users.mjs
--       node --env-file=.env.local scripts/pinecone-setup.mjs
