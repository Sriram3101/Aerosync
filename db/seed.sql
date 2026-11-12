-- =====================================================================
-- AeroSync : seed.sql
-- Mock data. Run THIRD, after schema.sql and advanced.sql.
-- (Login users are NOT here: they are created by scripts/seed-users.mjs
--  because passwords must be bcrypt-hashed.)
-- Tip: change names / flight numbers to your own values (originality).
-- =====================================================================
USE aerosync;

INSERT INTO Airlines (airline_name, iata_code) VALUES
 ('Air India', 'AI'), ('IndiGo', '6E'), ('Emirates', 'EK'), ('Lufthansa', 'LH');

-- gate_id:   1=A1  2=A2  3=A3  4=B1  5=B2  6=B3  7=A4
INSERT INTO Gates (terminal, gate_code, max_wingspan, status) VALUES
 ('T1', 'A1', 36.00, 'Available'),
 ('T1', 'A2', 36.00, 'Available'),
 ('T1', 'A3', 52.00, 'Available'),
 ('T2', 'B1', 65.00, 'Available'),
 ('T2', 'B2', 65.00, 'Available'),
 ('T2', 'B3', 65.00, 'Maintenance'),
 ('T1', 'A4', 36.00, 'Available');

-- carousel_id: 1,2 = T1 (300) | 3,4 = T2 (450) | 5 = T1 (250)
INSERT INTO Baggage_Carousels (terminal, belt_capacity, status) VALUES
 ('T1', 300, 'Available'), ('T1', 300, 'Available'),
 ('T2', 450, 'Available'), ('T2', 450, 'Available'),
 ('T1', 250, 'Available');

INSERT INTO Ground_Crew (name, clearance_level, shift_status) VALUES
 ('Ravi Kumar',  'Advanced',   'On_Duty'),
 ('Anita Rao',   'Basic',      'On_Duty'),
 ('Suresh Nair', 'Supervisor', 'On_Duty'),
 ('Meera Iyer',  'Basic',      'On_Duty'),
 ('Imran Khan',  'Advanced',   'On_Duty'),
 ('Priya Das',   'Basic',      'Off_Duty');

INSERT INTO Tracking_Devices (hardware_mac, battery_level, crew_id) VALUES
 ('AA:BB:CC:00:00:01', 92, 1), ('AA:BB:CC:00:00:02', 45, 2),
 ('AA:BB:CC:00:00:03', 78, 3), ('AA:BB:CC:00:00:04', 15, 4),
 ('AA:BB:CC:00:00:05', 60, 5);

-- flight_id: 1=AI101 2=6E202 3=EK503 4=LH754 5=AI305 6=6E411 7=AI777
INSERT INTO Flights (flight_number, aircraft_type, aircraft_wingspan,
                     arr_time, dep_time, airline_id, gate_id, carousel_id) VALUES
 ('AI101', 'A320',       35.80, '2026-11-01 08:00', '2026-11-01 09:30', 1, 1,    1),
 ('6E202', 'A320',       35.80, '2026-11-01 08:30', '2026-11-01 10:00', 2, 2,    2),
 ('EK503', 'B777-300ER', 64.80, '2026-11-01 09:00', '2026-11-01 11:30', 3, 4,    3),
 ('LH754', 'A350',       64.75, '2026-11-01 09:15', '2026-11-01 12:00', 4, NULL, NULL),
 ('AI305', 'B787',       60.12, '2026-11-01 10:00', '2026-11-01 12:30', 1, NULL, NULL),
 ('6E411', 'A321',       35.80, '2026-11-01 10:00', '2026-11-01 11:15', 2, 1,    1),
 ('AI777', 'A320',       35.80, '2026-11-01 09:00', '2026-11-01 10:30', 1, NULL, NULL);

INSERT INTO Crew_Assignments (task_type, start_time, end_time, crew_id, flight_id) VALUES
 ('Refuelling',        '2026-11-01 08:10', '2026-11-01 08:40', 1, 1),
 ('Baggage_Unloading', '2026-11-01 08:00', '2026-11-01 08:45', 2, 1),
 ('Catering',          '2026-11-01 08:40', '2026-11-01 09:10', 3, 2),
 ('Pushback',          '2026-11-01 09:35', '2026-11-01 09:50', 1, 1),
 ('Inspection',        '2026-11-01 09:05', '2026-11-01 09:45', 5, 3),
 ('Cleaning',          '2026-11-01 08:35', '2026-11-01 09:00', 4, 2);

INSERT INTO Flight_Logs (flight_id, category, log_text) VALUES
 (1, 'Delay',       'Late ground crew availability caused a 10 minute turnaround delay'),
 (1, 'Weather',     'Heavy crosswind on approach, pilot reported turbulence below 3000 ft, landing delayed 12 minutes'),
 (2, 'Maintenance', 'Hydraulic pressure warning on landing gear, maintenance inspection required before departure'),
 (3, 'Weather',     'Thunderstorm over runway 27 caused a holding pattern for 25 minutes'),
 (3, 'Maintenance', 'Cargo door sensor fault, technician replaced sensor, departure delayed'),
 (4, 'Weather',     'Fog reduced visibility, diversion considered, arrival 40 minutes late'),
 (5, 'Maintenance', 'Bird strike reported on approach, engine borescope inspection needed'),
 (6, 'Weather',     'Heavy rain and slippery apron slowed baggage unloading'),
 (7, 'Delay',       'Passenger boarding took longer because of a missing wheelchair assistance request'),
 (2, 'Other',       'Catering truck arrived late at the stand, meals loaded after scheduled time'),
 (4, 'Maintenance', 'Cabin pressurisation fault logged by first officer, engineers fixed the outflow valve'),
 (6, 'Weather',     'Gusty conditions at the threshold forced a go-around on the first attempt');

-- quick check
SELECT 'Airlines' t, COUNT(*) n FROM Airlines UNION ALL
SELECT 'Gates', COUNT(*) FROM Gates UNION ALL
SELECT 'Flights', COUNT(*) FROM Flights UNION ALL
SELECT 'Crew_Assignments', COUNT(*) FROM Crew_Assignments UNION ALL
SELECT 'Flight_Logs', COUNT(*) FROM Flight_Logs;
