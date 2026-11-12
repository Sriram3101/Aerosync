'use client';
import { useCallback, useEffect, useState } from 'react';
import Nav, { Notice, useMe } from '@/app/components/Nav';
import { api } from '@/lib/client';

const STATUSES = ['Scheduled', 'Delayed', 'Arrived', 'Departed', 'Cancelled'];
const STATUS_COLOR = {
  Scheduled: 'bg-slate-100 text-slate-700',
  Delayed: 'bg-amber-100 text-amber-800',
  Arrived: 'bg-sky-100 text-sky-800',
  Departed: 'bg-emerald-100 text-emerald-800',
  Cancelled: 'bg-red-100 text-red-700',
};

export default function Dashboard() {
  const me = useMe();
  const [flights, setFlights] = useState([]);
  const [stats, setStats] = useState(null);
  const [meta, setMeta] = useState(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const [f, s] = await Promise.all([
      api('/api/flights?' + new URLSearchParams({ q, status })),
      api('/api/dashboard'),
    ]);
    if (f.ok) setFlights(f.data);
    if (s.ok) setStats(s.data);
  }, [q, status]);

  useEffect(() => {
    if (me) load();
  }, [me, load]);

  useEffect(() => {
    if (me) api('/api/meta').then(({ ok, data }) => ok && setMeta(data));
  }, [me]);

  // runs any write call, shows the DB message (success or trigger error), reloads data
  async function act(url, method, body, successText) {
    const { ok, data } = await api(url, { method, body });
    setMsg({ ok, text: ok ? data.message || successText : data.error });
    load();
    return ok;
  }

  async function addFlight(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    if (await act('/api/flights', 'POST', body, `Flight ${body.flight_number} added`)) form.reset();
  }

  function delay(f) {
    const m = prompt(`Delay ${f.flight_number} by how many minutes?`, '30');
    if (m) act('/api/flights/delay', 'POST', { flight_id: f.flight_id, minutes: Number(m) });
  }

  function remove(f) {
    if (confirm(`Delete flight ${f.flight_number}? Its tasks and logs are deleted too (CASCADE).`)) {
      act('/api/flights', 'DELETE', { flight_id: f.flight_id }, `Flight ${f.flight_number} deleted`);
    }
  }

  if (!me) return <p className="p-8">Loading…</p>;
  const isAdmin = me.role === 'Admin';
  const t = stats?.totals;

  return (
    <>
      <Nav me={me} />
      <main className="max-w-7xl mx-auto p-4 space-y-5">
        <Notice msg={msg} onClose={() => setMsg(null)} />

        {/* KPI cards */}
        {t && (
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Total flights" value={t.total_flights} />
            <Kpi label="Delayed" value={t.delayed ?? 0} tone="text-amber-600" />
            <Kpi label="Waiting for a gate" value={t.unassigned ?? 0} tone="text-red-600" />
            <Kpi label="Average delay (min)" value={t.avg_delay ?? 0} />
          </section>
        )}

        {/* search + filter */}
        <section className="card space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <h2 className="font-bold text-lg mr-auto">Flight board</h2>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search flight, airline or aircraft"
              className="input w-64"
            />
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">Flight</th>
                  <th className="th">Airline</th>
                  <th className="th">Aircraft</th>
                  <th className="th">Arrives</th>
                  <th className="th">Departs</th>
                  <th className="th">Delay</th>
                  <th className="th">Gate</th>
                  <th className="th">Carousel</th>
                  <th className="th">Status</th>
                  <th className="th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {flights.map((f) => (
                  <tr key={f.flight_id} className="hover:bg-slate-50">
                    <td className="td font-semibold">{f.flight_number}</td>
                    <td className="td">{f.airline_name}</td>
                    <td className="td">
                      {f.aircraft_type} <span className="text-slate-500">({f.aircraft_wingspan} m)</span>
                    </td>
                    <td className="td whitespace-nowrap">{f.arr_time.slice(5, 16)}</td>
                    <td className="td whitespace-nowrap">{f.dep_time.slice(5, 16)}</td>
                    <td className="td">{f.delay_minutes} m</td>
                    <td className="td">
                      {f.gate_code ? (
                        `${f.gate_terminal}-${f.gate_code}`
                      ) : (
                        <span className="text-red-600 font-semibold">UNASSIGNED</span>
                      )}
                    </td>
                    <td className="td">{f.carousel_id ?? '—'}</td>
                    <td className="td">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[f.status]}`}>
                        {f.status}
                      </span>
                    </td>
                    <td className="td whitespace-nowrap space-x-2">
                      {isAdmin ? (
                        <>
                          <button
                            onClick={() => act('/api/flights/assign', 'POST', { flight_id: f.flight_id })}
                            className="text-sky-700 hover:underline"
                          >
                            Auto-assign
                          </button>
                          <button onClick={() => delay(f)} className="text-amber-700 hover:underline">
                            Delay
                          </button>
                          <select
                            value={f.status}
                            onChange={(e) =>
                              act('/api/flights', 'PATCH', { flight_id: f.flight_id, status: e.target.value }, 'Status updated')
                            }
                            className="input py-0.5"
                          >
                            {STATUSES.map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                          <button onClick={() => remove(f)} className="text-red-700 hover:underline">
                            Delete
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() =>
                              act('/api/flights', 'PATCH', { flight_id: f.flight_id, status: 'Arrived' }, 'Marked Arrived')
                            }
                            className="text-sky-700 hover:underline"
                          >
                            Mark arrived
                          </button>
                          <button
                            onClick={() =>
                              act('/api/flights', 'PATCH', { flight_id: f.flight_id, status: 'Departed' }, 'Marked Departed')
                            }
                            className="text-emerald-700 hover:underline"
                          >
                            Mark departed
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {flights.length === 0 && (
                  <tr>
                    <td className="td text-slate-500" colSpan={10}>
                      No flights match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* add flight (Admin only) */}
        {isAdmin && meta && (
          <section className="card">
            <h2 className="font-bold mb-3">Add flight</h2>
            <form onSubmit={addFlight} className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <input name="flight_number" placeholder="Flight no (e.g. AI909)" className="input" required />
              <input name="aircraft_type" placeholder="Aircraft (e.g. A320)" className="input" required />
              <input name="aircraft_wingspan" type="number" step="0.01" placeholder="Wingspan (m)" className="input" required />
              <select name="airline_id" className="input" required defaultValue="">
                <option value="" disabled>
                  Airline
                </option>
                {meta.airlines.map((a) => (
                  <option key={a.airline_id} value={a.airline_id}>
                    {a.airline_name} ({a.iata_code})
                  </option>
                ))}
              </select>
              <label className="text-xs text-slate-500">
                Arrival
                <input name="arr_time" type="datetime-local" className="input w-full" required />
              </label>
              <label className="text-xs text-slate-500">
                Departure
                <input name="dep_time" type="datetime-local" className="input w-full" required />
              </label>
              <select name="gate_id" className="input self-end" defaultValue="">
                <option value="">Gate: none (auto-assign later)</option>
                {meta.gates.map((g) => (
                  <option key={g.gate_id} value={g.gate_id}>
                    {g.terminal}-{g.gate_code} (max {g.max_wingspan} m{g.status === 'Maintenance' ? ', maintenance' : ''})
                  </option>
                ))}
              </select>
              <button className="btn self-end">Add flight</button>
            </form>
            <p className="text-xs text-slate-500 mt-2">
              Try picking a gate that is too small or already busy: the MySQL trigger rejects it and its message appears above.
            </p>
          </section>
        )}

        {/* analytics panels */}
        {stats && (
          <section className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Panel title="Gate utilisation (view + ORDER BY)">
              {stats.gates.map((g) => (
                <Row key={g.gate_id} left={`${g.terminal}-${g.gate_code} (${g.max_wingspan} m)`}
                  right={g.status === 'Maintenance' ? 'maintenance' : `${g.flights_count} flights · ${g.busy_minutes} min`} />
              ))}
            </Panel>
            <Panel title="Airlines with 2+ flights (GROUP BY + HAVING)">
              {stats.airlines.map((a) => (
                <Row key={a.airline_name} left={a.airline_name} right={`${a.flights} flights · avg delay ${a.avg_delay} m`} />
              ))}
            </Panel>
            <Panel title="Waiting for a gate">
              {stats.unassigned.length === 0 && <p className="text-sm text-slate-500">All flights have gates.</p>}
              {stats.unassigned.map((f) => (
                <Row key={f.flight_id} left={f.flight_number} right={`${f.aircraft_type} · ${f.aircraft_wingspan} m`} />
              ))}
            </Panel>
            <Panel title="Crew busier than average (subquery)">
              {stats.busyCrew.map((c) => (
                <Row key={c.name} left={c.name} right={`${c.tasks_assigned} tasks · ${c.task_minutes} min`} />
              ))}
            </Panel>
            <Panel title="Tracking devices below 20% battery">
              {stats.lowBattery.length === 0 && <p className="text-sm text-slate-500">All devices charged.</p>}
              {stats.lowBattery.map((c) => (
                <Row key={c.hardware_mac} left={c.name} right={<span className="text-red-600">{c.battery_level}%</span>} />
              ))}
            </Panel>
            <Panel title="Audit trail (written by a trigger)">
              {stats.audit.length === 0 && <p className="text-sm text-slate-500">No gate or time changes yet.</p>}
              {stats.audit.map((a) => (
                <Row key={a.audit_id} left={a.flight_number}
                  right={`gate ${a.old_gate || '—'} → ${a.new_gate || '—'} · dep ${String(a.new_dep).slice(11, 16)}`} />
              ))}
            </Panel>
            <Panel title="Delayed above their own airline's average (correlated subquery)">
              {stats.aboveAirlineAvg.length === 0 && <p className="text-sm text-slate-500">No flight beats its airline's average delay.</p>}
              {stats.aboveAirlineAvg.map((f) => (
                <Row key={f.flight_number} left={`${f.flight_number} (${f.airline_name})`} right={`${f.delay_minutes} min`} />
              ))}
            </Panel>
            <Panel title="Delay rank per airline (window function RANK + running SUM)">
              {stats.delayRank.map((f) => (
                <Row key={f.flight_number} left={`${f.flight_number} (${f.airline_name})`}
                  right={`rank ${f.delay_rank_in_airline} in airline · running total ${f.running_delay_total} min`} />
              ))}
            </Panel>
            <Panel title="Gate load by terminal (CTE)">
              {stats.terminalLoad.map((t) => (
                <Row key={t.terminal} left={t.terminal} right={`${t.gates} gates · ${t.total_busy_minutes} min total · avg ${t.avg_busy_minutes} min`} />
              ))}
            </Panel>
          </section>
        )}
      </main>
    </>
  );
}

function Kpi({ label, value, tone = 'text-slate-900' }) {
  return (
    <div className="card">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="card">
      <h3 className="font-semibold mb-2 text-sm">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ left, right }) {
  return (
    <div className="flex justify-between gap-2 text-sm border-b border-slate-100 py-1">
      <span>{left}</span>
      <span className="text-slate-600 text-right">{right}</span>
    </div>
  );
}
