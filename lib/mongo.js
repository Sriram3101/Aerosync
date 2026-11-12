import { MongoClient } from 'mongodb';

// OPTIONAL module: MongoDB stores high-volume tracking-device pings (documents).
const g = globalThis;
let client = g._mongoClient;

export async function pingsCollection() {
  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI);
    if (process.env.NODE_ENV !== 'production') g._mongoClient = client;
  }
  await client.connect(); // safe to call repeatedly
  return client.db(process.env.MONGODB_DB || 'aerosync').collection('device_pings');
}
