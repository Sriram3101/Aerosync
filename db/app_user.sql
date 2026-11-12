-- =====================================================================
-- AeroSync : app_user.sql   (run as root, ONCE)
-- A least-privilege MySQL account for the web app: it can read/write
-- data and run procedures, but it can NOT drop, alter or grant.
-- Replace CHANGE_ME_Strong#2026 with your own password BEFORE running,
-- then put the same password in .env.local.  Commit this file only with
-- the placeholder, never with your real password.
-- =====================================================================
DROP USER IF EXISTS 'aerosync_app'@'localhost';
DROP USER IF EXISTS 'aerosync_app'@'127.0.0.1';

CREATE USER 'aerosync_app'@'localhost' IDENTIFIED BY 'CHANGE_ME_Strong#2026';
CREATE USER 'aerosync_app'@'127.0.0.1' IDENTIFIED BY 'CHANGE_ME_Strong#2026';

GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON aerosync.* TO 'aerosync_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON aerosync.* TO 'aerosync_app'@'127.0.0.1';
FLUSH PRIVILEGES;

SHOW GRANTS FOR 'aerosync_app'@'127.0.0.1';
