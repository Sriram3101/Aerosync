// Creates the Pinecone index (if missing), embeds every MySQL log that has no
// vector yet, and writes the Pinecone record id back into Flight_Logs.vector_id.
// Run from the project root:  node --env-file=.env.local scripts/pinecone-setup.mjs
import { Pinecone } from '@pinecone-database/pinecone';
import mysql from 'mysql2/promise';

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const name = process.env.PINECONE_INDEX;

// 1. create an index that embeds text for us (integrated inference)
const existing = await pc.listIndexes();
if (!existing.indexes?.some((i) => i.name === name)) {
  console.log(`Creating index ${name} ... (takes about a minute)`);
  await pc.createIndexForModel({
    name,
    cloud: 'aws',
    region: 'us-east-1', // the free Starter plan supports this region
    embed: { model: 'llama-text-embed-v2', fieldMap: { text: 'chunk_text' } },
    waitUntilReady: true,
  });
} else {
  console.log(`Index ${name} already exists`);
}

const index = pc.index(name).namespace('flight-logs');

// 2. read logs from MySQL
const db = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const [rows] = await db.query(
  'SELECT log_id, flight_id, category, log_text FROM Flight_Logs WHERE vector_id IS NULL'
);

// 3. upsert in batches of 90 (integrated-embedding upserts allow at most 96 per call)
for (let i = 0; i < rows.length; i += 90) {
  const batch = rows.slice(i, i + 90).map((r) => ({
    id: `log-${r.log_id}`,
    chunk_text: r.log_text, // this field is turned into a 1024-d vector by Pinecone
    flight_id: r.flight_id, // metadata
    category: r.category,   // metadata (used for filtering)
  }));
  await index.upsertRecords(batch);
}

// 4. link MySQL rows to their vectors
for (const r of rows) {
  await db.execute('UPDATE Flight_Logs SET vector_id = ? WHERE log_id = ?', [`log-${r.log_id}`, r.log_id]);
}

await db.end();
console.log(`Embedded ${rows.length} logs. Wait ~10 seconds before searching (indexing delay).`);
