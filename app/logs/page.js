'use client';
import { useEffect, useState } from 'react';
import Nav, { Notice, useMe } from '@/app/components/Nav';
import { api } from '@/lib/client';

const CATEGORIES = ['Weather', 'Maintenance', 'Delay', 'Other'];

export default function LogsPage() {
  const me = useMe();
  const [q, setQ] = useState('strong wind during touchdown');
  const [category, setCategory] = useState('');
  const [semantic, setSemantic] = useState(null);
  const [keyword, setKeyword] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flights, setFlights] = useState([]);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (me) api('/api/meta').then(({ ok, data }) => ok && setFlights(data.flights));
  }, [me]);

  // runs BOTH searches so the difference is visible side by side
  async function search(e) {
    e.preventDefault();
    setBusy(true);
    const params = (mode) => '/api/logs?' + new URLSearchParams({ q, mode, category });
    const [s, k] = await Promise.all([api(params('semantic')), api(params('keyword'))]);
    setSemantic(s.ok ? s.data : { error: s.data.error });
    setKeyword(k.ok ? k.data : { error: k.data.error });
    setBusy(false);
  }

  async function addLog(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const { ok, data } = await api('/api/logs', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
    setMsg({ ok, text: ok ? `Log saved in MySQL and embedded in Pinecone as ${data.vector_id}` : data.error });
    if (ok) form.reset();
  }

  if (!me) return <p className="p-8">Loading…</p>;

  return (
    <>
      <Nav me={me} />
      <main className="max-w-7xl mx-auto p-4 space-y-5">
        <Notice msg={msg} onClose={() => setMsg(null)} />

        <section className="card space-y-3">
          <h2 className="font-bold text-lg">Operational log search</h2>
          <form onSubmit={search} className="flex flex-wrap gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} className="input flex-1 min-w-64"
              placeholder="Describe the situation in your own words" />
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <button className="btn" disabled={busy}>{busy ? 'Searching…' : 'Search both ways'}</button>
          </form>
          <p className="text-xs text-slate-500">
            Demo queries: “strong wind during touchdown”, “plane needs repair”, “passengers waiting a long time”.
          </p>
        </section>

        <section className="grid md:grid-cols-2 gap-4">
          <Results title="Semantic (Pinecone vector similarity)" data={semantic} />
          <Results title="Keyword (MySQL FULLTEXT)" data={keyword} />
        </section>

        <section className="card">
          <h2 className="font-bold mb-3">Add an operational log</h2>
          <form onSubmit={addLog} className="grid md:grid-cols-6 gap-2">
            <select name="flight_id" className="input" required defaultValue="">
              <option value="" disabled>Flight</option>
              {flights.map((f) => (
                <option key={f.flight_id} value={f.flight_id}>{f.flight_number}</option>
              ))}
            </select>
            <select name="category" className="input" defaultValue="Other">
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input name="log_text" className="input md:col-span-3" placeholder="What happened? (min 10 characters)" required />
            <button className="btn">Save log</button>
          </form>
        </section>
      </main>
    </>
  );
}

function Results({ title, data }) {
  return (
    <div className="card">
      <h3 className="font-semibold mb-2">{title}</h3>
      {data === null && <p className="text-sm text-slate-500">Run a search.</p>}
      {data?.error && <p className="text-sm text-red-600">{data.error}</p>}
      {Array.isArray(data) && data.length === 0 && (
        <p className="text-sm text-slate-500">No matches: none of these exact words appear in the logs.</p>
      )}
      {Array.isArray(data) &&
        data.map((r) => (
          <div key={r.log_id} className="border-b border-slate-100 py-2">
            <p className="text-xs text-slate-500">
              {r.flight_number} · {r.category} · score {Number(r.score).toFixed(3)}
            </p>
            <p className="text-sm">{r.text}</p>
          </div>
        ))}
    </div>
  );
}
