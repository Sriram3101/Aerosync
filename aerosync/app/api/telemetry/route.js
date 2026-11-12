import { pool } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { pingsCollection } from '@/lib/mongo';

// OPTIONAL: GET /api/telemetry -> MongoDB aggregation pipelines + names joined from MySQL
export async function GET() {
  const { error } = await requireRole();
  if (error) return error;

  try {
    const col = await pingsCollection();

    // latest status and averages per crew member
    const perCrew = await col
      .aggregate([
        { $sort: { ts: -1 } },
        {
          $group: {
            _id: '$crew_id',
            device_mac: { $first: '$device_mac' },
            last_seen: { $first: '$ts' },
            last_zone: { $first: '$zone' },
            last_battery: { $first: '$battery' },
            avg_battery: { $avg: '$battery' },
            pings: { $sum: 1 },
            low_battery_alerts: { $sum: { $cond: [{ $eq: ['$alert', 'LOW_BATTERY'] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    // how busy each zone is
    const perZone = await col
      .aggregate([
        { $group: { _id: '$zone', pings: { $sum: 1 }, crew: { $addToSet: '$crew_id' } } },
        { $project: { _id: 0, zone: '$_id', pings: 1, crew_count: { $size: '$crew' } } },
        { $sort: { pings: -1 } },
      ])
      .toArray();

    // cross-database join: crew names live in MySQL
    const [crew] = await pool.query('SELECT crew_id, name FROM Ground_Crew');
    const names = Object.fromEntries(crew.map((c) => [c.crew_id, c.name]));

    return Response.json({
      perCrew: perCrew.map((r) => ({ ...r, name: names[r._id] || `crew ${r._id}` })),
      perZone,
    });
  } catch (e) {
    console.error(e);
    return Response.json({ error: 'MongoDB unavailable: check MONGODB_URI' }, { status: 502 });
  }
}
