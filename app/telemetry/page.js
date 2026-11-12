'use client';
import { useEffect, useState } from 'react';
import Nav, { useMe } from '@/app/components/Nav';
import { api } from '@/lib/client';

// OPTIONAL page: shows the MongoDB aggregation results
export default function TelemetryPage() {
  const me = useMe();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (me) api('/api/telemetry').then(({ data }) => setData(data));
  }, [me]);

  if (!me) return <p className="p-8">Loading…</p>;

  return (
    <>
      <Nav me={me} />
      <main className="max-w-7xl mx-auto p-4 space-y-5">
        {data?.error && <p className="card text-red-600">{data.error}</p>}
        {data?.perCrew && (
          <section className="card overflow-x-auto">
            <h2 className="font-bold text-lg mb-3">Device telemetry per crew member (MongoDB $group)</h2>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">Crew</th>
                  <th className="th">Device</th>
                  <th className="th">Last zone</th>
                  <th className="th">Last battery</th>
                  <th className="th">Avg battery</th>
                  <th className="th">Pings</th>
                  <th className="th">Low-battery alerts</th>
                </tr>
              </thead>
              <tbody>
                {data.perCrew.map((r) => (
                  <tr key={r._id}>
                    <td className="td font-medium">{r.name}</td>
                    <td className="td font-mono text-xs">{r.device_mac}</td>
                    <td className="td">{r.last_zone}</td>
                    <td className="td">{Number(r.last_battery).toFixed(0)}%</td>
                    <td className="td">{Number(r.avg_battery).toFixed(1)}%</td>
                    <td className="td">{r.pings}</td>
                    <td className="td">{r.low_battery_alerts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {data?.perZone && (
          <section className="card">
            <h2 className="font-bold text-lg mb-3">Zone activity ($group + $project + $size)</h2>
            {data.perZone.map((z) => (
              <div key={z.zone} className="flex justify-between text-sm border-b border-slate-100 py-1">
                <span>{z.zone}</span>
                <span>{z.pings} pings · {z.crew_count} crew</span>
              </div>
            ))}
          </section>
        )}
      </main>
    </>
  );
}
