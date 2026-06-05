const { Pool, types } = require('pg');

// pg returns BIGINT (COUNT results) as strings by default — parse as integers
types.setTypeParser(20, (val) => parseInt(val, 10));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Convert SQLite-style ? placeholders to PostgreSQL $1, $2, ...
function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// run: for INSERT/UPDATE/DELETE. Auto-appends RETURNING id to INSERTs.
async function run(sql, params = []) {
  const converted = convertPlaceholders(sql);
  const isInsert = /^\s*INSERT/i.test(converted.trim());
  const query =
    isInsert && !/RETURNING/i.test(converted)
      ? converted + ' RETURNING id'
      : converted;
  const result = await pool.query(query, params);
  return {
    lastID: result.rows[0]?.id ?? null,
    changes: result.rowCount,
  };
}

// get: returns a single row or null
async function get(sql, params = []) {
  const result = await pool.query(convertPlaceholders(sql), params);
  return result.rows[0] ?? null;
}

// all: returns all matching rows
async function all(sql, params = []) {
  const result = await pool.query(convertPlaceholders(sql), params);
  return result.rows;
}

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id                    SERIAL PRIMARY KEY,
      title                 TEXT NOT NULL,
      artist                TEXT NOT NULL,
      description           TEXT,
      city                  TEXT NOT NULL,
      artist_fee_schedule   TEXT NOT NULL,
      cost_per_show         DOUBLE PRECISION NOT NULL DEFAULT 0,
      profit_margin         DOUBLE PRECISION NOT NULL DEFAULT 0.15,
      deadline              TEXT NOT NULL,
      status                TEXT NOT NULL DEFAULT 'open',
      confirmed_shows_count INTEGER,
      creator_name          TEXT NOT NULL,
      creator_email         TEXT NOT NULL,
      created_at            TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shows (
      id                     SERIAL PRIMARY KEY,
      event_id               INTEGER NOT NULL REFERENCES events(id),
      date                   TEXT NOT NULL,
      venue_name             TEXT NOT NULL,
      venue_capacity         INTEGER NOT NULL,
      min_attendees          INTEGER NOT NULL,
      cancellation_buffer    DOUBLE PRECISION NOT NULL DEFAULT 0.10,
      status                 TEXT NOT NULL DEFAULT 'open',
      current_clearing_price DOUBLE PRECISION,
      final_clearing_price   DOUBLE PRECISION,
      sort_order             INTEGER NOT NULL DEFAULT 0,
      created_at             TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS interests (
      id                  SERIAL PRIMARY KEY,
      show_id             INTEGER NOT NULL REFERENCES shows(id),
      event_id            INTEGER NOT NULL REFERENCES events(id),
      user_name           TEXT NOT NULL,
      user_email          TEXT NOT NULL,
      desired_price       DOUBLE PRECISION NOT NULL,
      max_price           DOUBLE PRECISION NOT NULL,
      final_price         DOUBLE PRECISION,
      payment_placeholder TEXT NOT NULL DEFAULT 'card ending in 4242',
      status              TEXT NOT NULL DEFAULT 'interested',
      confirmed_at        TEXT,
      created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(show_id, user_email)
    )
  `);
}

async function insertInterestsBatch(rows) {
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const placeholders = batch.map(() => '(?,?,?,?,?,?)').join(',');
    await run(
      `INSERT INTO interests (show_id, event_id, user_name, user_email, desired_price, max_price) VALUES ${placeholders}`,
      batch.flat()
    );
  }
}

async function seedData() {
  const existing = await get('SELECT COUNT(*) as count FROM events');
  if (Number(existing.count) > 0) return;

  const { runClearing } = require('./clearing');

  // ── Event 1: Radiohead en Montevideo ──────────────────────────────────────
  // 2 fechas potenciales, min 3000 c/u. Fee schedule makes clearing price ~$185.
  // Seed 3020 interests per show at max $220 → event already confirmed.
  const { lastID: event1 } = await run(`
    INSERT INTO events (title, artist, description, city, artist_fee_schedule, cost_per_show, profit_margin, deadline, creator_name, creator_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'Radiohead en Montevideo',
    'Radiohead',
    'La legendaria banda de Oxford llega al Antel Arena. Thom Yorke, Jonny Greenwood y compañía presentan su repertorio completo en un show que promete ser histórico para Uruguay.',
    'Montevideo',
    JSON.stringify({ '1': 700000, '2': 950000 }),
    20000,
    0.12,
    new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    'Matías Fernández',
    'matias@showpool.com',
  ]);

  const { lastID: show1a } = await run(`
    INSERT INTO shows (event_id, date, venue_name, venue_capacity, min_attendees, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [event1, '2026-10-10', 'Antel Arena', 18000, 3000, 0]);

  const { lastID: show1b } = await run(`
    INSERT INTO shows (event_id, date, venue_name, venue_capacity, min_attendees, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [event1, '2026-10-11', 'Antel Arena', 18000, 3000, 1]);

  const rh1Rows = Array.from({ length: 3020 }, (_, i) => [show1a, event1, `Fan ${i + 1}`, `fan${i + 1}@rh1.demo`, 180, 220]);
  const rh2Rows = Array.from({ length: 3020 }, (_, i) => [show1b, event1, `Fan ${i + 1}`, `fan${i + 1}@rh2.demo`, 180, 220]);
  await insertInterestsBatch(rh1Rows);
  await insertInterestsBatch(rh2Rows);

  // Run clearing so Event 1 shows as confirmed with current prices
  const rh1Interests = await all(`SELECT * FROM interests WHERE show_id = ?`, [show1a]);
  const rh2Interests = await all(`SELECT * FROM interests WHERE show_id = ?`, [show1b]);
  const rh1Event = { artist_fee_schedule: { '1': 700000, '2': 950000 }, cost_per_show: 20000, profit_margin: 0.12 };
  const rh1Shows = [
    { id: show1a, venue_capacity: 18000, min_attendees: 3000, cancellation_buffer: 0.1 },
    { id: show1b, venue_capacity: 18000, min_attendees: 3000, cancellation_buffer: 0.1 },
  ];
  const rh1Result = runClearing(rh1Event, rh1Shows, [...rh1Interests, ...rh2Interests]);
  if (rh1Result.event_viable) {
    for (const [showId, sr] of rh1Result.show_results) {
      await run(`UPDATE shows SET current_clearing_price = ?, status = 'confirmed' WHERE id = ?`, [sr.clearing_price, showId]);
    }
    await run(`UPDATE events SET status = 'confirmed', confirmed_shows_count = ? WHERE id = ?`, [rh1Result.confirmed_shows_count, event1]);
  }

  // ── Event 2: Tame Impala en Montevideo ────────────────────────────────────
  // 1 fecha, min 1500. Fee makes clearing price ≈ $222.
  // Seed 1498 interests → faltan exactamente 2 personas para confirmar.
  const { lastID: event2 } = await run(`
    INSERT INTO events (title, artist, description, city, artist_fee_schedule, cost_per_show, profit_margin, deadline, creator_name, creator_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'Tame Impala en Montevideo',
    'Tame Impala',
    'Kevin Parker trae el universo psicodélico de Tame Impala al Teatro de Verano. Una experiencia visual y sonora única bajo las estrellas montevideanas.',
    'Montevideo',
    JSON.stringify({ '1': 280000, '2': 380000 }),
    10000,
    0.15,
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    'Valentina Cruz',
    'vale@showpool.com',
  ]);

  const { lastID: show2 } = await run(`
    INSERT INTO shows (event_id, date, venue_name, venue_capacity, min_attendees, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [event2, '2026-09-20', 'Teatro de Verano Ramón Collazo', 15000, 1500, 0]);

  const ti2Rows = Array.from({ length: 1498 }, (_, i) => [show2, event2, `Fan ${i + 1}`, `fan${i + 1}@ti.demo`, 200, 250]);
  await insertInterestsBatch(ti2Rows);

  // ── Event 3: Sigur Rós en Montevideo ──────────────────────────────────────
  // 3 fechas potenciales, recién creado, sin intereses.
  const { lastID: event3 } = await run(`
    INSERT INTO events (title, artist, description, city, artist_fee_schedule, cost_per_show, profit_margin, deadline, creator_name, creator_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'Sigur Rós en Montevideo',
    'Sigur Rós',
    'Los islandeses maestros del post-rock ambiental en el Auditorio Nacional del SODRE. Una noche para olvidar el mundo.',
    'Montevideo',
    JSON.stringify({ '1': 180000, '2': 240000, '3': 280000 }),
    8000,
    0.15,
    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    'Ignacio Peralta',
    'igna@showpool.com',
  ]);

  await run(`INSERT INTO shows (event_id, date, venue_name, venue_capacity, min_attendees, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
    [event3, '2026-11-05', 'Auditorio Nacional del SODRE', 2000, 600, 0]);
  await run(`INSERT INTO shows (event_id, date, venue_name, venue_capacity, min_attendees, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
    [event3, '2026-11-06', 'Auditorio Nacional del SODRE', 2000, 600, 1]);
  await run(`INSERT INTO shows (event_id, date, venue_name, venue_capacity, min_attendees, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
    [event3, '2026-11-07', 'Auditorio Nacional del SODRE', 2000, 600, 2]);

  console.log('Seed data loaded.');
}

module.exports = { run, get, all, initSchema, seedData };
