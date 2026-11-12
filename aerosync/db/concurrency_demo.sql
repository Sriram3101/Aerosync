-- =====================================================================
-- AeroSync : concurrency_demo.sql  (transaction locking demo)
-- You need TWO query tabs in Workbench (File > New Query Tab).
-- Run the lines in the order of the numbers.
-- =====================================================================

-- ---------- TAB 1 ----------
-- (1)
USE aerosync;
-- (2) start a transaction and lock every gate row; DO NOT commit yet
START TRANSACTION;
SELECT * FROM Gates FOR UPDATE;

-- ---------- TAB 2 ----------
-- (3)
USE aerosync;
-- (4) this call now HANGS (spinner) because it needs the same locks
CALL sp_assign_resources(7, @g, @c);

-- ---------- TAB 1 ----------
-- (5) release the locks: Tab 2 continues immediately
COMMIT;

-- ---------- TAB 2 ----------
-- (6) see what AI777 received: gate_id 1 (A1) after the full tests.sql
--     (T13 cancelled 6E411 and freed A1), or gate_id 3 (A3) if T13 was not run
SELECT @g AS gate_id, @c AS carousel_id;

-- Note: if Tab 2 waits more than 50 s it fails with "Lock wait timeout
-- exceeded" (innodb_lock_wait_timeout). That error is also proof the lock
-- works. Just run step (4) again after the COMMIT.
