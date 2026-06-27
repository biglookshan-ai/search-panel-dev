// Search analytics storage (Railway Postgres).
// Self-contained + graceful: if DATABASE_URL isn't set (or pg/connection fails)
// analytics is simply disabled — the rest of the app keeps working.

let pool = null;
let ready = false;

export function analyticsEnabled() { return ready; }

export async function initDb() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.log('[analytics] DATABASE_URL not set — analytics disabled'); return; }
  try {
    const pg = (await import('pg')).default;
    const useSsl = process.env.PGSSLMODE === 'require' || /sslmode=require/i.test(url);
    pool = new pg.Pool({ connectionString: url, max: 4, ssl: useSsl ? { rejectUnauthorized: false } : false });
    await migrate();
    ready = true;
    console.log('[analytics] Postgres connected — analytics enabled');
  } catch (e) {
    console.error('[analytics] init failed (analytics disabled):', e.message);
    pool = null; ready = false;
  }
}

async function migrate() {
  // Raw events (anonymous, no PII) — pruned to 90 days.
  await pool.query(`CREATE TABLE IF NOT EXISTS search_events (
    id BIGSERIAL PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    type TEXT NOT NULL,
    query TEXT,
    result_count INT,
    target_type TEXT,
    target_id TEXT,
    session TEXT,
    source TEXT
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_se_ts ON search_events (ts)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_se_query ON search_events (query)`);
  // Daily rollups — kept long-term, tiny.
  await pool.query(`CREATE TABLE IF NOT EXISTS search_daily (
    day DATE NOT NULL,
    metric TEXT NOT NULL,
    key TEXT NOT NULL,
    count INT NOT NULL,
    PRIMARY KEY (day, metric, key)
  )`);
}

export async function insertEvent(ev) {
  if (!ready) return;
  await pool.query(
    `INSERT INTO search_events (type, query, result_count, target_type, target_id, session, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [ev.type, ev.query, ev.result_count, ev.target_type, ev.target_id, ev.session, ev.source]
  );
}

// Aggregate the last couple of days into search_daily, then prune raw > 90 days.
export async function rollupAndPrune() {
  if (!ready) return;
  await pool.query(`
    INSERT INTO search_daily (day, metric, key, count)
    SELECT date_trunc('day', ts)::date AS day,
           CASE WHEN type = 'search' AND result_count = 0 THEN 'zero_result' ELSE type END AS metric,
           COALESCE(NULLIF(query, ''), target_id, '') AS key,
           count(*)::int
    FROM search_events
    WHERE ts >= now() - interval '2 days'
      AND COALESCE(NULLIF(query, ''), target_id, '') <> ''
    GROUP BY 1, 2, 3
    ON CONFLICT (day, metric, key) DO UPDATE SET count = EXCLUDED.count
  `);
  await pool.query(`DELETE FROM search_events WHERE ts < now() - interval '90 days'`);
}

// Insights for the admin UI (Phase 2). Uses raw events for ≤90-day windows.
export async function summary({ days = 7 } = {}) {
  if (!ready) return { enabled: false };
  const d = Math.max(1, Math.min(90, Number(days) || 7));
  const since = `now() - interval '${d} days'`;
  const [top, zero, clicks, totals] = await Promise.all([
    pool.query(`SELECT query, count(*)::int n FROM search_events WHERE type='search' AND query<>'' AND ts >= ${since} GROUP BY query ORDER BY n DESC LIMIT 30`),
    pool.query(`SELECT query, count(*)::int n FROM search_events WHERE type='search' AND result_count=0 AND query<>'' AND ts >= ${since} GROUP BY query ORDER BY n DESC LIMIT 30`),
    pool.query(`SELECT target_type, target_id, count(*)::int n FROM search_events WHERE type IN ('product_click','collection_click') AND target_id<>'' AND ts >= ${since} GROUP BY 1,2 ORDER BY n DESC LIMIT 30`),
    pool.query(`SELECT
        count(*) FILTER (WHERE type='search')::int AS searches,
        count(*) FILTER (WHERE type='search' AND result_count=0)::int AS zero,
        count(*) FILTER (WHERE type IN ('product_click','collection_click'))::int AS clicks
      FROM search_events WHERE ts >= ${since}`),
  ]);
  return { enabled: true, days: d, totals: totals.rows[0], top: top.rows, zero: zero.rows, clicks: clicks.rows };
}
