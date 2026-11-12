import { Pinecone } from '@pinecone-database/pinecone';

// Lazily create the client so a missing key only breaks log search, not the whole app.
let client;
export function logsIndex() {
  if (!client) client = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  return client.index(process.env.PINECONE_INDEX).namespace('flight-logs');
}
