// OPTIONAL: fills MongoDB with simulated tracking-device pings (one every 10 minutes per device).
// Run from the project root:  node --env-file=.env.local scripts/mongo-seed.mjs
import { MongoClient } from 'mongodb';

const ZONES = ['Apron T1', 'Apron T2', 'Baggage Hall', 'Fuel Farm', 'Crew Room'];
const DEVICES = [
  { mac: 'AA:BB:CC:00:00:01', crew_id: 1, start: 100 },
  { mac: 'AA:BB:CC:00:00:02', crew_id: 2, start: 70 },
  { mac: 'AA:BB:CC:00:00:03', crew_id: 3, start: 95 },
  { mac: 'AA:BB:CC:00:00:04', crew_id: 4, start: 40 },
  { mac: 'AA:BB:CC:00:00:05', crew_id: 5, start: 85 },
];

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const col = client.db(process.env.MONGODB_DB || 'aerosync').collection('device_pings');

await col.deleteMany({});
const docs = [];
const start = new Date('2026-11-01T08:00:00+05:30');
for (const d of DEVICES) {
  for (let i = 0; i < 25; i++) {
    // documents do not need identical fields: some pings carry an extra "alert"
    const doc = {
      device_mac: d.mac,
      crew_id: d.crew_id,
      ts: new Date(start.getTime() + i * 10 * 60 * 1000),
      battery: Math.max(0, d.start - i * 1.1 - (i % 3)),
      zone: ZONES[(d.crew_id + i) % ZONES.length],
      location: { lat: 12.95 + Math.random() / 100, lng: 77.66 + Math.random() / 100 },
    };
    if (doc.battery < 20) doc.alert = 'LOW_BATTERY';
    docs.push(doc);
  }
}
await col.insertMany(docs);

// index for "latest ping per crew member" queries
await col.createIndex({ crew_id: 1, ts: -1 });
console.log(`Inserted ${docs.length} pings`);
await client.close();
