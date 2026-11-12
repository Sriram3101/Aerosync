'use client';
import { useCallback, useEffect, useState } from 'react';
import Nav, { Notice, useMe } from '@/app/components/Nav';
import { api } from '@/lib/client';

const TASKS = ['Refuelling', 'Baggage_Unloading', 'Catering', 'Cleaning', 'Pushback', 'Inspection'];
const SHIFTS = ['On_Duty', 'Off_Duty', 'On_Break'];

export default function CrewPage() {
  const me = useMe();
  const [data, setData] = useState({ crew: [], tasks: [] });
  const [meta, setMeta] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const { ok, data } = await api('/api/crew');
    if (ok) setData(data);
  }, []);

  useEffect(() => {
    if (!me) return;
    load();
    api('/api/meta').then(({ ok, data }) => ok && setMeta(data));
  }, [me, load]);

  async function act(method, body, successText) {
    const res = await api('/api/crew', { method, body });
    setMsg({ ok: res.ok, text: res.ok ? successText : res.data.error });
    load();
    return res.ok;
  }

  async function addTask(e) {
    e.preventDefault();
    const form = e.currentTarget;
    if (await act('POST', Object.fromEntries(new FormData(form)), 'Task assigned')) form.reset();
  }

  if (!me) return <p className="p-8">Loading…</p>;
  const isAdmin = me.role === 'Admin';

  return (
    <>
      <Nav me={me} />
      <main className="max-w-7xl mx-auto p-4 space-y-5">
        <Notice msg={msg} onClose={() => setMsg(null)} />

        <section className="card overflow-x-auto">
          <h2 className="font-bold text-lg mb-3">Crew workload (view)</h2>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">Name</th>
                <th className="th">Clearance</th>
                <th className="th">Device battery</th>
                <th className="th">Tasks</th>
                <th className="th">Task minutes</th>
                <th className="th">Shift</th>
              </tr>
            </thead>
            <tbody>
              {data.crew.map((c) => (
                <tr key={c.crew_id}>
                  <td className="td font-medium">{c.name}</td>
                  <td className="td">{c.clearance_level}</td>
                  <td className={`td ${c.battery_level !== null && c.battery_level < 20 ? 'text-red-600 font-semibold' : ''}`}>
                    {c.battery_level === null ? 'no device' : `${c.battery_level}%`}
                  </td>
                  <td className="td">{c.tasks_assigned}</td>
                  <td className="td">{c.task_minutes}</td>
                  <td className="td">
                    <select
                      value={c.shift_status}
                      onChange={(e) => act('PATCH', { crew_id: c.crew_id, shift_status: e.target.value }, 'Shift updated')}
                      className="input py-0.5"
                    >
                      {SHIFTS.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card overflow-x-auto">
          <h2 className="font-bold text-lg mb-3">Task schedule (3-table JOIN)</h2>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">Task</th>
                <th className="th">Flight</th>
                <th className="th">Crew</th>
                <th className="th">Start</th>
                <th className="th">End</th>
                {isAdmin && <th className="th"></th>}
              </tr>
            </thead>
            <tbody>
              {data.tasks.map((t) => (
                <tr key={t.task_id}>
                  <td className="td">{t.task_type.replace('_', ' ')}</td>
                  <td className="td">{t.flight_number}</td>
                  <td className="td">
                    {t.name} <span className="text-slate-500">({t.clearance_level})</span>
                  </td>
                  <td className="td">{t.start_time.slice(5, 16)}</td>
                  <td className="td">{t.end_time.slice(5, 16)}</td>
                  {isAdmin && (
                    <td className="td">
                      <button onClick={() => act('DELETE', { task_id: t.task_id }, 'Task removed')} className="text-red-700 hover:underline">
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {isAdmin && meta && (
          <section className="card">
            <h2 className="font-bold mb-3">Assign a task</h2>
            <form onSubmit={addTask} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
              <select name="task_type" className="input" required defaultValue="">
                <option value="" disabled>Task type</option>
                {TASKS.map((t) => (
                  <option key={t} value={t}>{t.replace('_', ' ')}</option>
                ))}
              </select>
              <select name="flight_id" className="input" required defaultValue="">
                <option value="" disabled>Flight</option>
                {meta.flights.map((f) => (
                  <option key={f.flight_id} value={f.flight_id}>{f.flight_number}</option>
                ))}
              </select>
              <select name="crew_id" className="input" required defaultValue="">
                <option value="" disabled>Crew member</option>
                {meta.crew.map((c) => (
                  <option key={c.crew_id} value={c.crew_id}>
                    {c.name} ({c.clearance_level}, {c.shift_status})
                  </option>
                ))}
              </select>
              <label className="text-xs text-slate-500">
                Start
                <input name="start_time" type="datetime-local" className="input w-full" required />
              </label>
              <label className="text-xs text-slate-500">
                End
                <input name="end_time" type="datetime-local" className="input w-full" required />
              </label>
              <button className="btn">Assign</button>
            </form>
            <p className="text-xs text-slate-500 mt-2">
              The database refuses off-duty crew, overlapping tasks, and Refuelling/Pushback by Basic clearance.
            </p>
          </section>
        )}
      </main>
    </>
  );
}
