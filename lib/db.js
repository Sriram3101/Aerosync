import mysql from 'mysql2/promise';

// One connection pool for the whole app. Credentials come ONLY from env variables.
const g = globalThis;

export const pool =
  g._aeroPool ??
  mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true, // return DATETIME as 'YYYY-MM-DD HH:MM:SS' strings
  });

// keep a single pool across hot reloads in development
if (process.env.NODE_ENV !== 'production') g._aeroPool = pool;

// Converts database rule violations (triggers, CHECK, UNIQUE, FK) into a clean 400 response.
export function dbError(err) {
  const known = [
    'ER_SIGNAL_EXCEPTION',          // our SIGNAL SQLSTATE '45000' messages
    'ER_CHECK_CONSTRAINT_VIOLATED', // CHECK constraints
    'ER_DUP_ENTRY',                 // UNIQUE
    'ER_NO_REFERENCED_ROW_2',       // FK: parent row missing
    'ER_ROW_IS_REFERENCED_2',       // FK: row still in use
    'ER_TRUNCATED_WRONG_VALUE',
    'WARN_DATA_TRUNCATED',
    'ER_BAD_NULL_ERROR',
  ];
  if (err && (err.sqlState === '45000' || known.includes(err.code))) {
    return Response.json({ error: err.sqlMessage }, { status: 400 });
  }
  console.error(err);
  return Response.json({ error: 'Server error' }, { status: 500 });
}

// HTML <input type="datetime-local"> sends '2026-11-01T08:00'; MySQL wants '2026-11-01 08:00:00'
export function toMysqlDate(value) {
  if (typeof value !== 'string' || value.length < 16) return null;
  const s = value.replace('T', ' ');
  return s.length === 16 ? s + ':00' : s.slice(0, 19);
}
