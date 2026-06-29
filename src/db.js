// Search analytics storage (Railway Postgres).
// Anonymous, no PII. Self-contained + graceful: if DATABASE_URL isn't set (or pg
// fails) analytics is disabled and the rest of the app keeps working.

let pool = null;
let ready = false;

export function analyticsEnabled() { return ready; }

// Classify a query: structured field syntax (product_type:"…", tag:…, vendor:…)
// = category/menu navigation, NOT a typed user search. The store uses
// /search?q=product_type:"X" URLs as category pages, so those must be separated.
const CLICK = `type IN ('product_click','collection_click')`;
const STRUCT_RE = `'(product_type|tag|vendor|variants\\.|inventory_quantity|sku|barcode|handle|title)\\s*:'`;
const IS_NAV = `(query ~* ${STRUCT_RE})`;                       // category navigation
const IS_TYPED = `(query <> '' AND NOT (query ~* ${STRUCT_RE}))`; // real typed search
const IS_REC = `(query IS NULL OR query = '')`;                // recommendation (no query)
const SUBMITTED = `submitted IS TRUE`;
// One search ACTION = one row. A "results" event always implies the drawer step
// (you type in the drawer, then Enter) — so it represents the whole action. A
// "drawer" event only counts as its own action when it was NOT followed by a
// results event for the same visitor+query within 10s (i.e. they stopped at the
// drawer). This collapses the drawer+results pair of one action into one, while
// keeping separate searches (further apart) distinct.
const ACTION = `(source='results' OR NOT EXISTS (
    SELECT 1 FROM search_events r WHERE r.type='search' AND r.source='results'
      AND r.session = search_events.session AND r.query = search_events.query
      AND r.ts > search_events.ts AND r.ts <= search_events.ts + interval '10 seconds'))`;

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
  // Action-level base sets: each row = one search action (drawer+results pair
  // collapsed to the results row; standalone drawer = its own action).
  const TA = `SELECT query, session, source, result_count FROM search_events WHERE type='search' AND ${IS_TYPED} AND ts >= ${sql} AND ${ACTION}`;
  const NA = `SELECT query, session, source, result_count FROM search_events WHERE type='search' AND ${IS_NAV} AND ts >= ${sql} AND ${ACTION}`;
  const [totals, top, nav, clicks] = await Promise.all([
    pool.query(`WITH ta AS (${TA}), na AS (${NA}) SELECT
        (SELECT count(*) FROM ta)::int searches,
        (SELECT count(*) FILTER (WHERE source='results') FROM ta)::int reached,
        (SELECT count(*) FROM (SELECT query FROM ta GROUP BY query HAVING max(result_count)=0) z)::int zero_keywords,
        (SELECT count(*) FROM na)::int nav,
        (SELECT count(DISTINCT session) FROM search_events WHERE ts >= ${sql} AND session<>'')::int sessions,
        (SELECT count(*) FROM search_events WHERE ${CLICK} AND source='drawer' AND ts >= ${sql})::int drawer_clicks,
        (SELECT count(*) FROM search_events WHERE ${CLICK} AND source='results' AND ts >= ${sql})::int results_clicks,
        (SELECT count(*) FROM search_events WHERE ${CLICK} AND source='recommendation' AND ts >= ${sql})::int rec_clicks`),
    pool.query(`SELECT query,
        count(*)::int searches,
        count(*) FILTER (WHERE source='results')::int reached,
        max(result_count)::int results
      FROM (${TA}) a GROUP BY query ORDER BY searches DESC, query LIMIT 1000`),
    pool.query(`SELECT query, count(*)::int searches FROM (${NA}) a GROUP BY query ORDER BY searches DESC, query LIMIT 1000`),
    pool.query(`SELECT target_type, target_id,
        count(*) FILTER (WHERE source='drawer')::int drawer_n,
        count(*) FILTER (WHERE source='results')::int results_n,
        count(*) FILTER (WHERE source='recommendation')::int rec_n,
        count(*)::int n
      FROM search_events WHERE ${CLICK} AND target_id<>'' AND ts >= ${sql}
      GROUP BY 1,2 ORDER BY n DESC LIMIT 1000`),
  ]);
  return { enabled: true, days: d, totals: totals.rows[0], top: top.rows, nav: nav.rows, clicks: clicks.rows };
}

// Wipe all analytics (events + rollups) — for a clean start after fixes.
export async function resetEvents() {
  if (!ready) return { enabled: false };
  await pool.query('TRUNCATE search_events');
  await pool.query('TRUNCATE search_daily');
  return { ok: true };
}

// Paginated raw history (chronological, newest first). kind: searches | clicks | nav.
// Server-side: search (q matches query OR target id), separate whitelisted filters
// (source, type, result), and sort (whitelisted column + direction).
const SORT_COLS = { ts: 'ts', query: 'query', results: 'result_count', source: 'source', type: 'target_type', target: 'target_id' };
export async function events({ days = 7, kind = 'searches', page = 1, size = 50, q = '', source = '', type = '', result = '', sort = '' } = {}) {
  if (!ready) return { enabled: false };
  const { sql } = sinceSql(days);
  const sz = Math.max(1, Math.min(200, Number(size) || 50));
  const pg = Math.max(1, Number(page) || 1);
  const off = (pg - 1) * sz;
  // Search history collapses one action to a single row (hide a drawer event that
  // a results event superseded), so "结果页" rows already imply the drawer step.
  let cond = kind === 'clicks' ? CLICK
    : kind === 'nav' ? `type='search' AND ${IS_NAV} AND ${ACTION}`
    : `type='search' AND ${IS_TYPED} AND ${ACTION}`;
  const args = [];
  const term = String(q || '').trim().slice(0, 80);
  if (term) { args.push('%' + term + '%'); cond += ` AND (query ILIKE $${args.length} OR COALESCE(target_id,'') ILIKE $${args.length})`; }
  const src = String(source || '');
  if (src === 'drawer' || src === 'results' || src === 'recommendation') cond += ` AND source = '${src}'`;
  if (kind === 'clicks') {
    if (type === 'product' || type === 'collection') cond += ` AND target_type = '${type}'`;
  } else {
    if (result === 'zero') cond += ` AND result_count = 0`;
    else if (result === 'has') cond += ` AND result_count > 0`;
  }
  const sp = String(sort || '').split(':');
  const col = SORT_COLS[sp[0]] || 'ts';
  const dir = sp[1] === 'asc' ? 'ASC' : 'DESC';
  const order = col === 'ts' ? `ts ${dir}` : `${col} ${dir} NULLS LAST, ts DESC`;
  const [rows, cnt] = await Promise.all([
    pool.query(`SELECT ts, type, query, result_count, target_type, target_id, source, device, submitted
      FROM search_events WHERE ${cond} AND ts >= ${sql} ORDER BY ${order} LIMIT ${sz} OFFSET ${off}`, args),
    pool.query(`SELECT count(*)::int n FROM search_events WHERE ${cond} AND ts >= ${sql}`, args),
  ]);
  return { enabled: true, kind, page: pg, size: sz, total: cnt.rows[0].n, rows: rows.rows };
}
