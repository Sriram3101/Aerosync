-- =====================================================================
-- AeroSync : ddl_demo.sql
-- Shows ALTER and DROP for the demo (guideline 5). Safe to run any time
-- after schema.sql: everything it adds, it removes again.
-- =====================================================================
USE aerosync;

-- ALTER: add, modify, then drop a column
ALTER TABLE Ground_Crew ADD COLUMN phone VARCHAR(15);
DESCRIBE Ground_Crew;
ALTER TABLE Ground_Crew MODIFY COLUMN phone VARCHAR(20);
ALTER TABLE Ground_Crew DROP COLUMN phone;

-- ALTER: add and drop a CHECK constraint
ALTER TABLE Flights ADD CONSTRAINT chk_delay_cap CHECK (delay_minutes <= 1440);
ALTER TABLE Flights DROP CHECK chk_delay_cap;

-- Index: create, use, drop
CREATE INDEX idx_tmp_type ON Flights(aircraft_type);
SHOW INDEX FROM Flights;
DROP INDEX idx_tmp_type ON Flights;

-- Table: create and drop
CREATE TABLE tmp_demo (id INT PRIMARY KEY, note VARCHAR(20));
DROP TABLE tmp_demo;

-- Index proof: EXPLAIN shows MySQL using idx_flights_gate_time (key column)
EXPLAIN SELECT * FROM Flights
WHERE gate_id = 1 AND arr_time < '2026-11-01 12:00' AND dep_time > '2026-11-01 08:00';
