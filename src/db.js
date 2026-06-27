// Search analytics storage (Railway Postgres).
// Anonymous, no PII. Self-contained + graceful: if DATABASE_URL isn't set (or pg
// fails) analytics is disabled and the rest of the app keeps working.

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
  await pool.query(`CREATE TABLE IF NOT EXISTS search_events (
    id BIGSERIAL PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    type TEXT NOT NULL,            -- search | product_click | collection_click
    query TEXT,                    -- search term; on a click = the query that led to it ('' = none)
    result_count INT,              -- for search events
    target_type TEXT,              -- product | collection (clicks)
    target_id TEXT,
    session TEXT,                  -- anonymous random id
    source TEXT,                   -- drawer | results | recommendation
    device TEXT,                   -- mobile | tablet | desktop
    submitted BOOLEAN              -- search reached the results page (Enter) vs drawer-only
  )`);
  // Columns for DBs created before these existed.
  await pool.query(`ALTER TABLE search_events ADD COLUMN IF NOT EXISTS device TEXT`);
  await pool.query(`ALTER TABLE search_events ADD COLUMN IF NOT EXISTS submitted BOOLEAN`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_se_ts ON search_events (ts)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_se_type_ts ON search_events (type, ts)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_se_query ON search_events (query)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS search_daily (
    day DATE NOT NULL, metric TEXT NOT NULL, key TEXT NOT NULL, count INT NOT NULL,
    PRIMARY KEY (day, metric, key)
  )`);
}

export async function insertEvent(ev) {
  if (!ready) return;
  await pool.query(
    `INSERT INTO search_events (type, query, result_count, target_type, target_id, session, source, device, submitted)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [ev.type, ev.query, ev.result_count, ev.target_type, ev.target_id, ev.session, ev.source, ev.device, ev.submitted]
  );
}

// Roll the last couple of days into search_daily, then prune raw events > 90 days.
export async function rollupAndPrune() {
  if (!ready) return;
  await pool.query(`
    INSERT INTO search_daily (day, metric, key, count)
    SELECT date_trunc('day', ts)::date,
           CASE WHEN type='search' AND result_count=0 THEN 'zero_result' ELSE type END,
           COALESCE(NULLIF(query,''), target_id, ''),
           count(*)::int
    FROM search_events
    WHERE ts >= now() - interval '2 days' AND COALESCE(NULLIF(query,''), target_id, '') <> ''
    GROUP BY 1,2,3
    ON CONFLICT (day, metric, key) DO UPDATE SET count = EXCLUDED.count
  `);
  await pool.query(`DELETE FROM search_events WHERE ts < now() - interval '90 days'`);
}

// days is clamped to the 90-day raw-retention window.
function sinceSql(days) { const d = Math.max(1, Math.min(90, Number(days) || 7)); return { d, sql: `now() - interval '${d} days'` }; }

// Overview + aggregated rankings (popular searches / most clicked).
export async function summary({ days = 7 } = {}) {
  if (!ready) return { enabled: false };
  const { d, sql } = sinceSql(days);
  const [totals, top, clicks] = await Promise.all([
    pool.query(`SELECT
        count(*) FILTER (WHERE type='search')::int searches,
        count(*) FILTER (WHERE type='search' AND result_count=0)::int zero,
        count(*) FILTER (WHERE type IN ('product_click','collection_click'))::int clicks,
        count(*) FILTER (WHERE type IN ('product_click','collection_click') AND (query IS NULL OR query=''))::int rec_clicks,
        count(*) FILTER (WHERE device='mobile')::int mobile,
        count(*) FILTER (WHERE device='tablet')::int tablet,
        count(*) FILTER (WHERE device='desktop')::int desktop
      FROM search_events WHERE ts >= ${sql}`),
    pool.query(`SELECT query, count(*)::int n, count(*) FILTER (WHERE result_count=0)::int zero
      FROM search_events WHERE type='search' AND query<>'' AND ts >= ${sql}
      GROUP BY query ORDER BY n DESC, query LIMIT 50`),
    pool.query(`SELECT target_type, target_id, count(*)::int n
      FROM search_events WHERE type IN ('product_click','collection_click') AND target_id<>'' AND ts >= ${sql}
      GROUP BY 1,2 ORDER BY n DESC LIMIT 50`),
  ]);
  return { enabled: true, days: d, totals: totals.rows[0], top: top.rows, clicks: clicks.rows };
}

// Paginated raw history (chronological, newest first). kind: searches | clicks.
export async function events({ days = 7, kind = 'searches', page = 1, size = 50 } = {}) {
  if (!ready) return { enabled: false };
  const { sql } = sinceSql(days);
  const sz = Math.max(1, Math.min(200, Number(size) || 50));
  const pg = Math.max(1, Number(page) || 1);
  const off = (pg - 1) * sz;
  const cond = kind === 'clicks' ? `type IN ('product_click','collection_click')` : `type='search'`;
  const [rows, cnt] = await Promise.all([
    pool.query(`SELECT ts, type, query, result_count, target_type, target_id, source, device, submitted
      FROM search_events WHERE ${cond} AND ts >= ${sql} ORDER BY ts DESC LIMIT ${sz} OFFSET ${off}`),
    pool.query(`SELECT count(*)::int n FROM search_events WHERE ${cond} AND ts >= ${sql}`),
  ]);
  return { enabled: true, kind, page: pg, size: sz, total: cnt.rows[0].n, rows: rows.rows };
}
