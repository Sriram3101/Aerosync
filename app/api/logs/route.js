import { pool, dbError } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { logsIndex } from '@/lib/pinecone';

const CATEGORIES = ['Weather', 'Maintenance', 'Delay', 'Other'];

// GET /api/logs?q=...&category=Weather  -> semantic (Pinecone vector) search over the logs
export async function GET(req) {
  const { error } = await requireRole();
  if (error) return error;

  const sp = new URL(req.url).searchParams;
  const q = (sp.get('q') || '').trim();
  const category = CATEGORIES.includes(sp.get('category')) ? sp.get('category') : '';
  if (q.length < 3) return Response.json({ error: 'Query must be at least 3 characters' }, { status: 400 });

  try {
    // Pinecone embeds the query text and returns the 5 nearest logs
    const query = { topK: 5, inputs: { text: q } };
    if (category) query.filter = { category: { $eq: category } };
    const res = await logsIndex().searchRecords({ query, fields: ['chunk_text', 'flight_id', 'category'] });
    const hits = res.result.hits;

    // join back to MySQL to attach the flight number
    const ids = [...new Set(hits.map((h) => Number(h.fields.flight_id)))];
    let names = {};
    if (ids.length) {
      const [fl] = await pool.query('SELECT flight_id, flight_number FROM Flights WHERE flight_id IN (?)', [ids]);
      names = Object.fromEntries(fl.map((f) => [f.flight_id, f.flight_number]));
    }
    return Response.json(
      hits.map((h) => ({
        log_id: h._id,
        text: h.fields.chunk_text,
        category: h.fields.category,
        flight_number: names[Number(h.fields.flight_id)] || '(deleted flight)',
        score: h._score,
      }))
    );
  } catch (e) {
    if (!e.sqlState) {
      console.error(e);
      return Response.json({ error: 'Search failed: check PINECONE_API_KEY / PINECONE_INDEX' }, { status: 502 });
    }
    return dbError(e);
  }
}

// POST /api/logs { flight_id, category, log_text } -> saved in MySQL AND embedded in Pinecone
export async function POST(req) {
  const { error } = await requireRole(); // both roles may write operational logs
  if (error) return error;

  const { flight_id, category, log_text } = await req.json().catch(() => ({}));
  const cat = CATEGORIES.includes(category) ? category : 'Other';
  if (typeof log_text !== 'string' || log_text.trim().length < 10) {
    return Response.json({ error: 'Log text must be at least 10 characters' }, { status: 400 });
  }

  try {
    const [r] = await pool.execute(
      'INSERT INTO Flight_Logs (flight_id, category, log_text) VALUES (?, ?, ?)',
      [Number(flight_id), cat, log_text.trim()]
    );
    const vid = `log-${r.insertId}`;
    await logsIndex().upsertRecords([
      { id: vid, chunk_text: log_text.trim(), flight_id: Number(flight_id), category: cat },
    ]);
    await pool.execute('UPDATE Flight_Logs SET vector_id = ? WHERE log_id = ?', [vid, r.insertId]);
    return Response.json({ log_id: r.insertId, vector_id: vid }, { status: 201 });
  } catch (e) {
    return dbError(e);
  }
}