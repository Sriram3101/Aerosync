// Creates the two demo logins with bcrypt-hashed passwords.
// Run from the project root:  node --env-file=.env.local scripts/seed-users.mjs
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const db = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// development logins only - change them for your own demo
const users = [
  ['admin', 'Admin123!', 'Admin'],
  ['staff', 'Staff123!', 'Ground_Staff'],
];

for (const [username, password, role] of users) {
  const hash = await bcrypt.hash(password, 12); // cost factor 12
  await db.execute(
    `INSERT INTO Users (username, password_hash, role) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role)`,
    [username, hash, role]
  );
  console.log(`seeded ${username} (${role})`);
}

await db.end();
console.log('Users seeded');
