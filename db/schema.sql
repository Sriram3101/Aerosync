-- =====================================================================
-- AeroSync : schema.sql
-- Creates the database, all 10 tables, constraints and indexes.
-- Run this FIRST (MySQL 8.0.16 or newer).
-- =====================================================================
DROP DATABASE IF EXISTS aerosync;
CREATE DATABASE aerosync CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE aerosync;

-- 1. Login accounts for the web app (passwords are bcrypt hashes, never plain text)
CREATE TABLE Users (
  user_id       INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('Admin','Ground_Staff') NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_username CHECK (CHAR_LENGTH(username) >= 3)
);

-- 2. Airlines
CREATE TABLE Airlines (
  airline_id   INT AUTO_INCREMENT PRIMARY KEY,
  airline_name VARCHAR(100) NOT NULL,
  iata_code    VARCHAR(3)   NOT NULL UNIQUE,
  -- 'c' = case-sensitive, so 'ai' is rejected but 'AI' and '6E' are accepted
  CONSTRAINT chk_iata CHECK (REGEXP_LIKE(iata_code, '^[A-Z0-9]{2,3}$', 'c'))
);

-- 3. Gates (max_wingspan is in metres)
CREATE TABLE Gates (
  gate_id      INT AUTO_INCREMENT PRIMARY KEY,
  terminal     VARCHAR(10)  NOT NULL,
  gate_code    VARCHAR(10)  NOT NULL,
  max_wingspan DECIMAL(5,2) NOT NULL,
  status       ENUM('Available','Occupied','Maintenance') NOT NULL DEFAULT 'Available',
  UNIQUE (terminal, gate_code),
  CONSTRAINT chk_gate_span CHECK (max_wingspan > 0 AND max_wingspan <= 90)
);

-- 4. Baggage carousels
CREATE TABLE Baggage_Carousels (
  carousel_id   INT AUTO_INCREMENT PRIMARY KEY,
  terminal      VARCHAR(10) NOT NULL,
  belt_capacity INT NOT NULL,
  status        ENUM('Available','Occupied','Maintenance') NOT NULL DEFAULT 'Available',
  CONSTRAINT chk_belt CHECK (belt_capacity > 0)
);

-- 5. Ground crew
CREATE TABLE Ground_Crew (
  crew_id         INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  clearance_level ENUM('Basic','Advanced','Supervisor') NOT NULL,
  shift_status    ENUM('On_Duty','Off_Duty','On_Break') NOT NULL DEFAULT 'Off_Duty'
);

-- 6. Tracking devices (1 : 1 with Ground_Crew because crew_id is UNIQUE)
CREATE TABLE Tracking_Devices (
  device_id     INT AUTO_INCREMENT PRIMARY KEY,
  hardware_mac  VARCHAR(17) NOT NULL UNIQUE,
  battery_level INT NOT NULL DEFAULT 100,
  crew_id       INT UNIQUE,
  FOREIGN KEY (crew_id) REFERENCES Ground_Crew(crew_id) ON DELETE SET NULL,
  CONSTRAINT chk_battery CHECK (battery_level BETWEEN 0 AND 100),
  CONSTRAINT chk_mac     CHECK (REGEXP_LIKE(hardware_mac, '^([0-9A-F]{2}:){5}[0-9A-F]{2}$', 'c'))
);

-- 7. Flights (aircraft_wingspan + delay columns added to the original draft)
CREATE TABLE Flights (
  flight_id         INT AUTO_INCREMENT PRIMARY KEY,
  flight_number     VARCHAR(10)  NOT NULL,
  aircraft_type     VARCHAR(30)  NOT NULL,
  aircraft_wingspan DECIMAL(5,2) NOT NULL,
  arr_time          DATETIME     NOT NULL,
  dep_time          DATETIME     NOT NULL,
  delay_minutes     INT          NOT NULL DEFAULT 0,
  status            ENUM('Scheduled','Delayed','Arrived','Departed','Cancelled') NOT NULL DEFAULT 'Scheduled',
  airline_id        INT NOT NULL,
  gate_id           INT NULL,
  carousel_id       INT NULL,
  FOREIGN KEY (airline_id)  REFERENCES Airlines(airline_id)           ON DELETE RESTRICT,
  FOREIGN KEY (gate_id)     REFERENCES Gates(gate_id)                 ON DELETE SET NULL,
  FOREIGN KEY (carousel_id) REFERENCES Baggage_Carousels(carousel_id) ON DELETE SET NULL,
  UNIQUE (flight_number, arr_time),
  CONSTRAINT chk_times CHECK (dep_time > arr_time),
  CONSTRAINT chk_delay CHECK (delay_minutes >= 0),
  CONSTRAINT chk_wing  CHECK (aircraft_wingspan > 0 AND aircraft_wingspan <= 90)
);

-- 8. Crew assignments (M : N between Ground_Crew and Flights, with task details)
CREATE TABLE Crew_Assignments (
  task_id    INT AUTO_INCREMENT PRIMARY KEY,
  task_type  ENUM('Refuelling','Baggage_Unloading','Catering','Cleaning','Pushback','Inspection') NOT NULL,
  start_time DATETIME NOT NULL,
  end_time   DATETIME NOT NULL,
  crew_id    INT NOT NULL,
  flight_id  INT NOT NULL,
  FOREIGN KEY (crew_id)   REFERENCES Ground_Crew(crew_id) ON DELETE RESTRICT,
  FOREIGN KEY (flight_id) REFERENCES Flights(flight_id)   ON DELETE CASCADE,
  CONSTRAINT chk_task_time CHECK (end_time > start_time)
);

-- 9. Operational logs (text also lives in Pinecone as a vector; vector_id links them)
CREATE TABLE Flight_Logs (
  log_id    INT AUTO_INCREMENT PRIMARY KEY,
  flight_id INT NOT NULL,
  category  ENUM('Weather','Maintenance','Delay','Other') NOT NULL DEFAULT 'Other',
  log_text  TEXT NOT NULL,
  vector_id VARCHAR(100) NULL,
  log_date  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (flight_id) REFERENCES Flights(flight_id) ON DELETE CASCADE,
  CONSTRAINT chk_log_len CHECK (CHAR_LENGTH(log_text) >= 10)
);

-- 10. Audit trail, filled automatically by a trigger
CREATE TABLE Flight_Audit (
  audit_id   INT AUTO_INCREMENT PRIMARY KEY,
  flight_id  INT NOT NULL,
  old_gate   INT,
  new_gate   INT,
  old_dep    DATETIME,
  new_dep    DATETIME,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes (speed up the overlap checks used by triggers and procedures)
CREATE INDEX idx_flights_gate_time  ON Flights(gate_id, arr_time, dep_time);
CREATE INDEX idx_flights_car_time   ON Flights(carousel_id, arr_time, dep_time);
CREATE INDEX idx_flights_status     ON Flights(status);
CREATE INDEX idx_assign_crew_time   ON Crew_Assignments(crew_id, start_time, end_time);
CREATE FULLTEXT INDEX ft_logs_text  ON Flight_Logs(log_text);
