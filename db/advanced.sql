-- =====================================================================
-- AeroSync : advanced.sql
-- Stored functions, stored procedures, triggers and views.
-- Run SECOND, after schema.sql.
-- =====================================================================
USE aerosync;

DELIMITER $$

-- ---------------------------------------------------------------------
-- A. STORED FUNCTIONS: "is this gate / carousel free in this time window?"
--    Two time windows overlap when  newArr < oldDep  AND  newDep > oldArr
--    p_exclude_flight lets a flight ignore itself (0 = exclude nothing).
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_gate_is_free(p_gate INT, p_exclude_flight INT,
                                p_arr DATETIME, p_dep DATETIME)
RETURNS TINYINT(1)
READS SQL DATA
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM Flights
    WHERE gate_id = p_gate
      AND flight_id <> p_exclude_flight
      AND p_arr < dep_time AND p_dep > arr_time);
END$$

CREATE FUNCTION fn_carousel_is_free(p_car INT, p_exclude_flight INT,
                                    p_arr DATETIME, p_dep DATETIME)
RETURNS TINYINT(1)
READS SQL DATA
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM Flights
    WHERE carousel_id = p_car
      AND flight_id <> p_exclude_flight
      AND p_arr < dep_time AND p_dep > arr_time);
END$$

-- ---------------------------------------------------------------------
-- B. VALIDATION PROCEDURE used by both Flights triggers
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_validate_flight(
    IN p_id INT, IN p_gate INT, IN p_car INT,
    IN p_arr DATETIME, IN p_dep DATETIME, IN p_wing DECIMAL(5,2))
BEGIN
  DECLARE v_max      DECIMAL(5,2) DEFAULT NULL;
  DECLARE v_status   VARCHAR(20)  DEFAULT NULL;
  DECLARE v_gterm    VARCHAR(10)  DEFAULT NULL;
  DECLARE v_cterm    VARCHAR(10)  DEFAULT NULL;

  IF p_gate IS NOT NULL THEN
    SELECT max_wingspan, status, terminal INTO v_max, v_status, v_gterm
    FROM Gates WHERE gate_id = p_gate;

    IF v_status = 'Maintenance' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Gate is under maintenance';
    END IF;
    IF p_wing > v_max THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Aircraft wingspan exceeds gate limit';
    END IF;
    IF NOT fn_gate_is_free(p_gate, IFNULL(p_id, 0), p_arr, p_dep) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Gate double-booked for this time window';
    END IF;
  END IF;

  IF p_car IS NOT NULL THEN
    SET v_status = NULL;
    SELECT status, terminal INTO v_status, v_cterm
    FROM Baggage_Carousels WHERE carousel_id = p_car;

    IF v_status = 'Maintenance' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Carousel is under maintenance';
    END IF;
    IF v_gterm IS NOT NULL AND v_cterm <> v_gterm THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Carousel must be in the same terminal as the gate';
    END IF;
    IF NOT fn_carousel_is_free(p_car, IFNULL(p_id, 0), p_arr, p_dep) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Carousel double-booked for this time window';
    END IF;
  END IF;
END$$

-- ---------------------------------------------------------------------
-- C. TRIGGERS ON Flights
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_flights_bi BEFORE INSERT ON Flights
FOR EACH ROW
BEGIN
  -- a cancelled flight never holds a gate or carousel
  IF NEW.status = 'Cancelled' THEN
    SET NEW.gate_id = NULL, NEW.carousel_id = NULL;
  END IF;
  CALL sp_validate_flight(NULL, NEW.gate_id, NEW.carousel_id,
                          NEW.arr_time, NEW.dep_time, NEW.aircraft_wingspan);
END$$

CREATE TRIGGER trg_flights_bu BEFORE UPDATE ON Flights
FOR EACH ROW
BEGIN
  IF NEW.status = 'Cancelled' THEN
    SET NEW.gate_id = NULL, NEW.carousel_id = NULL;
  END IF;
  -- only re-validate when something that affects scheduling changed
  IF NOT (OLD.gate_id <=> NEW.gate_id)
     OR NOT (OLD.carousel_id <=> NEW.carousel_id)
     OR OLD.arr_time <> NEW.arr_time
     OR OLD.dep_time <> NEW.dep_time
     OR OLD.aircraft_wingspan <> NEW.aircraft_wingspan THEN
    CALL sp_validate_flight(NEW.flight_id, NEW.gate_id, NEW.carousel_id,
                            NEW.arr_time, NEW.dep_time, NEW.aircraft_wingspan);
  END IF;
END$$

CREATE TRIGGER trg_flights_au AFTER UPDATE ON Flights
FOR EACH ROW
BEGIN
  IF NOT (OLD.gate_id <=> NEW.gate_id) OR OLD.dep_time <> NEW.dep_time THEN
    INSERT INTO Flight_Audit (flight_id, old_gate, new_gate, old_dep, new_dep)
    VALUES (NEW.flight_id, OLD.gate_id, NEW.gate_id, OLD.dep_time, NEW.dep_time);
  END IF;
END$$

-- ---------------------------------------------------------------------
-- D. CREW TASK VALIDATION (procedure + two triggers)
--    Rules: crew must be On_Duty, must not have overlapping tasks,
--    and Refuelling / Pushback need Advanced or Supervisor clearance.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_validate_task(
    IN p_task_id INT, IN p_crew INT, IN p_type VARCHAR(30),
    IN p_start DATETIME, IN p_end DATETIME)
BEGIN
  DECLARE v_shift     VARCHAR(20) DEFAULT NULL;
  DECLARE v_clearance VARCHAR(20) DEFAULT NULL;

  SELECT shift_status, clearance_level INTO v_shift, v_clearance
  FROM Ground_Crew WHERE crew_id = p_crew;

  IF v_shift IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Crew member does not exist';
  END IF;
  IF v_shift <> 'On_Duty' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Crew member is not on duty';
  END IF;
  IF p_type IN ('Refuelling', 'Pushback') AND v_clearance = 'Basic' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Refuelling and Pushback need Advanced or Supervisor clearance';
  END IF;
  IF EXISTS (SELECT 1 FROM Crew_Assignments
             WHERE crew_id = p_crew
               AND task_id <> IFNULL(p_task_id, 0)
               AND p_start < end_time AND p_end > start_time) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Crew member already has a task in this window';
  END IF;
END$$

CREATE TRIGGER trg_assign_bi BEFORE INSERT ON Crew_Assignments
FOR EACH ROW
BEGIN
  CALL sp_validate_task(NULL, NEW.crew_id, NEW.task_type, NEW.start_time, NEW.end_time);
END$$

CREATE TRIGGER trg_assign_bu BEFORE UPDATE ON Crew_Assignments
FOR EACH ROW
BEGIN
  CALL sp_validate_task(NEW.task_id, NEW.crew_id, NEW.task_type, NEW.start_time, NEW.end_time);
END$$

-- ---------------------------------------------------------------------
-- E. ALGORITHMIC ROUTING INSIDE A LOCKED TRANSACTION
--    Best fit = the SMALLEST free gate that fits the aircraft, then the
--    smallest free carousel in the same terminal.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_assign_resources(IN p_flight_id INT,
                                     OUT p_gate INT, OUT p_carousel INT)
BEGIN
  DECLARE v_arr    DATETIME     DEFAULT NULL;
  DECLARE v_dep    DATETIME     DEFAULT NULL;
  DECLARE v_wing   DECIMAL(5,2) DEFAULT NULL;
  DECLARE v_status VARCHAR(20)  DEFAULT NULL;
  DECLARE v_term   VARCHAR(10)  DEFAULT NULL;
  DECLARE v_lock   INT;

  -- any error: undo everything, then pass the error to the caller
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET p_gate = NULL;
  SET p_carousel = NULL;

  SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
  START TRANSACTION;

    -- pessimistic locks: a second concurrent call waits here until we COMMIT
    SELECT COUNT(*) INTO v_lock FROM Gates FOR UPDATE;
    SELECT COUNT(*) INTO v_lock FROM Baggage_Carousels FOR UPDATE;

    SELECT arr_time, dep_time, aircraft_wingspan, status
      INTO v_arr, v_dep, v_wing, v_status
    FROM Flights WHERE flight_id = p_flight_id FOR UPDATE;

    IF v_arr IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Flight not found';
    END IF;
    IF v_status = 'Cancelled' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot assign resources to a cancelled flight';
    END IF;

    SELECT g.gate_id, g.terminal INTO p_gate, v_term
    FROM Gates g
    WHERE g.status <> 'Maintenance'
      AND g.max_wingspan >= v_wing
      AND fn_gate_is_free(g.gate_id, p_flight_id, v_arr, v_dep)
    ORDER BY g.max_wingspan, g.gate_id
    LIMIT 1;

    IF p_gate IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No compatible gate available in this time window';
    END IF;

    SELECT c.carousel_id INTO p_carousel
    FROM Baggage_Carousels c
    WHERE c.terminal = v_term
      AND c.status <> 'Maintenance'
      AND fn_carousel_is_free(c.carousel_id, p_flight_id, v_arr, v_dep)
    ORDER BY c.belt_capacity, c.carousel_id
    LIMIT 1;

    UPDATE Flights
       SET gate_id = p_gate, carousel_id = p_carousel
     WHERE flight_id = p_flight_id;

  COMMIT;
END$$

-- ---------------------------------------------------------------------
-- F. DELAY HANDLING: shift times; on a clash release the resources and
--    automatically try to re-route the flight with sp_assign_resources.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_apply_delay(IN p_flight_id INT, IN p_minutes INT,
                                OUT p_message VARCHAR(255))
BEGIN
  DECLARE v_gate     INT DEFAULT NULL;
  DECLARE v_car      INT DEFAULT NULL;
  DECLARE v_arr      DATETIME DEFAULT NULL;
  DECLARE v_dep      DATETIME DEFAULT NULL;
  DECLARE v_status   VARCHAR(20) DEFAULT NULL;
  DECLARE v_gc       INT DEFAULT 0;
  DECLARE v_cc       INT DEFAULT 0;
  DECLARE v_lock     INT;
  DECLARE v_new_gate INT DEFAULT NULL;
  DECLARE v_new_car  INT DEFAULT NULL;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET p_message = NULL;
  IF p_minutes IS NULL OR p_minutes <= 0 OR p_minutes > 1440 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Delay must be between 1 and 1440 minutes';
  END IF;

  START TRANSACTION;
    SELECT COUNT(*) INTO v_lock FROM Gates FOR UPDATE;
    SELECT COUNT(*) INTO v_lock FROM Baggage_Carousels FOR UPDATE;

    SELECT gate_id, carousel_id, status,
           DATE_ADD(arr_time, INTERVAL p_minutes MINUTE),
           DATE_ADD(dep_time, INTERVAL p_minutes MINUTE)
      INTO v_gate, v_car, v_status, v_arr, v_dep
    FROM Flights WHERE flight_id = p_flight_id FOR UPDATE;

    IF v_arr IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Flight not found';
    END IF;
    IF v_status IN ('Cancelled', 'Departed') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot delay a cancelled or departed flight';
    END IF;

    IF v_gate IS NOT NULL AND NOT fn_gate_is_free(v_gate, p_flight_id, v_arr, v_dep) THEN
      SET v_gc = 1;
    END IF;
    IF v_car IS NOT NULL AND NOT fn_carousel_is_free(v_car, p_flight_id, v_arr, v_dep) THEN
      SET v_cc = 1;
    END IF;

    UPDATE Flights
       SET arr_time      = v_arr,
           dep_time      = v_dep,
           delay_minutes = delay_minutes + p_minutes,
           status        = 'Delayed',
           gate_id       = IF(v_gc = 1, NULL, gate_id),
           carousel_id   = IF(v_gc = 1 OR v_cc = 1, NULL, carousel_id)
     WHERE flight_id = p_flight_id;
  COMMIT;

  IF v_gc = 0 AND v_cc = 0 THEN
    SET p_message = CONCAT('Delayed by ', p_minutes, ' min. No clash, resources unchanged.');
  ELSE
    BEGIN
      -- if re-routing fails, keep the delay but report the flight as unassigned
      DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
        SET p_message = CONCAT('Delayed by ', p_minutes,
                               ' min. Clash found, resources released. No compatible gate free: flight is UNASSIGNED.');
      CALL sp_assign_resources(p_flight_id, v_new_gate, v_new_car);
      IF v_new_gate IS NOT NULL THEN
        SET p_message = CONCAT('Delayed by ', p_minutes,
                               ' min. Clash found, re-routed to gate_id ', v_new_gate,
                               ', carousel_id ', IFNULL(v_new_car, 'none'), '.');
      END IF;
    END;
  END IF;
END$$

DELIMITER ;

-- ---------------------------------------------------------------------
-- G. VIEWS
-- ---------------------------------------------------------------------
CREATE VIEW vw_flight_board AS
SELECT f.flight_id, f.flight_number, a.airline_name, a.iata_code,
       f.aircraft_type, f.aircraft_wingspan,
       f.arr_time, f.dep_time, f.delay_minutes, f.status,
       f.gate_id, g.terminal AS gate_terminal, g.gate_code,
       f.carousel_id
FROM Flights f
JOIN Airlines a ON a.airline_id = f.airline_id
LEFT JOIN Gates g ON g.gate_id = f.gate_id;

CREATE VIEW vw_gate_utilization AS
SELECT g.gate_id, g.terminal, g.gate_code, g.max_wingspan, g.status,
       COUNT(f.flight_id) AS flights_count,
       COALESCE(SUM(TIMESTAMPDIFF(MINUTE, f.arr_time, f.dep_time)), 0) AS busy_minutes
FROM Gates g
LEFT JOIN Flights f ON f.gate_id = g.gate_id
GROUP BY g.gate_id, g.terminal, g.gate_code, g.max_wingspan, g.status;

CREATE VIEW vw_crew_workload AS
SELECT c.crew_id, c.name, c.clearance_level, c.shift_status,
       d.battery_level,
       COUNT(ca.task_id) AS tasks_assigned,
       COALESCE(SUM(TIMESTAMPDIFF(MINUTE, ca.start_time, ca.end_time)), 0) AS task_minutes
FROM Ground_Crew c
LEFT JOIN Tracking_Devices d  ON d.crew_id  = c.crew_id
LEFT JOIN Crew_Assignments ca ON ca.crew_id = c.crew_id
GROUP BY c.crew_id, c.name, c.clearance_level, c.shift_status, d.battery_level;
