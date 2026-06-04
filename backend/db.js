const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'eventflow.db');

let db;

function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH);
    db.run('PRAGMA foreign_keys = ON');
    db.run('PRAGMA journal_mode = WAL');
  }
  return db;
}

// Promisified helpers
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initSchema() {
  await run(`
    CREATE TABLE IF NOT EXISTS events (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      title                 TEXT NOT NULL,
      artist                TEXT NOT NULL,
      description           TEXT,
      city                  TEXT NOT NULL,
      artist_fee_schedule   TEXT NOT NULL,
      cost_per_show         REAL NOT NULL DEFAULT 0,
      profit_margin         REAL NOT NULL DEFAULT 0.15,
      deadline              TEXT NOT NULL,
      status                TEXT NOT NULL DEFAULT 'open',
      confirmed_shows_count INTEGER,
      creator_name          TEXT NOT NULL,
      creator_email         TEXT NOT NULL,
      created_at            TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS shows (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id              INTEGER NOT NULL REFERENCES events(id),
      date                  TEXT NOT NULL,
      venue_name            TEXT NOT NULL,
      venue_capacity        INTEGER NOT NULL,
      min_attendees         INTEGER NOT NULL,
      cancellation_buffer   REAL NOT NULL DEFAULT 0.10,
      status                TEXT NOT NULL DEFAULT 'open',
      current_clearing_price REAL,
      final_clearing_price  REAL,
      sort_order            INTEGER NOT NULL DEFAULT 0,
      created_at            TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS interests (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      show_id             INTEGER NOT NULL REFERENCES shows(id),
      event_id            INTEGER NOT NULL REFERENCES events(id),
      user_name           TEXT NOT NULL,
      user_email          TEXT NOT NULL,
      desired_price       REAL NOT NULL,
      max_price           REAL NOT NULL,
      final_price         REAL,
      payment_placeholder TEXT NOT NULL DEFAULT 'card ending in 4242',
      status              TEXT NOT NULL DEFAULT 'interested',
      confirmed_at        TEXT,
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(show_id, user_email)
    )
  `);
}

async function seedData() {
  const existing = await get('SELECT COUNT(*) as count FROM events');
  if (existing.count > 0) return;

  // Event 1: Radiohead en Buenos Aires — 2 fechas posibles, bastante interés
  const { lastID: event1 } = await run(`
    INSERT INTO events (title, artist, description, city, artist_fee_schedule, cost_per_show, profit_margin, deadline, creator_name, creator_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'Radiohead en Buenos Aires',
    'Radiohead',
    'La legendaria banda de Oxford llega a Buenos Aires. Thom Yorke, Jonny Greenwood y compañía presentan su repertorio completo en un show que promete ser histórico.',
    'Buenos Aires',
    JSON.stringify({ '1': 800000, '2': 1100000 }),
    25000,
    0.12,
    new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    'Matías Fernández',
    'matias@eventflow.com',
  ]);

  const { lastID: show1a } = await run(`
    INSERT INTO shows (event_id, date, venue_name, venue_capacity, min_attendees, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [event1, '2026-10-10', 'Estadio River Plate', 50000, 30000, 0]);

  const { lastID: show1b } = await run(`
    INSERT INTO shows (event_id, date, venue_name, venue_capacity, min_attendees, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [event1, '2026-10-11', 'Estadio River Plate', 50000, 30000, 1]);

  // Seed interests for event 1 — show 1a gets enough to confirm, show 1b almost
  const interests1a = [
    { name: 'Ana García', email: 'ana@mail.com', desired: 28, max: 35 },
    { name: 'Luis Martínez', email: 'luis@mail.com', desired: 25, max: 32 },
    { name: 'Carla Rodríguez', email: 'carla@mail.com', desired: 30, max: 40 },
    { name: 'Pablo Torres', email: 'pablo@mail.com', desired: 22, max: 30 },
    { name: 'Sofía López', email: 'sofia@mail.com', desired: 26, max: 34 },
  ];
  const interests1b = [
    { name: 'Ana García', email: 'ana@mail.com', desired: 28, max: 35 },
    { name: 'Carla Rodríguez', email: 'carla@mail.com', desired: 30, max: 40 },
    { name: 'Sofía López', email: 'sofia@mail.com', desired: 26, max: 34 },
  ];

  for (const i of interests1a) {
    await run(
      `INSERT INTO interests (show_id, event_id, user_name, user_email, desired_price, max_price) VALUES (?,?,?,?,?,?)`,
      [show1a, event1, i.name, i.email, i.desired, i.max]
    );
  }
  for (const i of interests1b) {
    await run(
      `INSERT INTO interests (show_id, event_id, user_name, user_email, desired_price, max_price) VALUES (?,?,?,?,?,?)`,
      [show1b, event1, i.name, i.email, i.desired, i.max]
    );
  }

  // Event 2: Tame Impala en Córdoba — 1 sola fecha, cerca del mínimo
  const { lastID: event2 } = await run(`
    INSERT INTO events (title, artist, description, city, artist_fee_schedule, cost_per_show, profit_margin, deadline, creator_name, creator_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'Tame Impala en Córdoba',
    'Tame Impala',
    'Kevin Parker trae el universo psicodélico de Tame Impala al Anfiteatro del Kempes. Una experiencia visual y sonora única.',
    'Córdoba',
    JSON.stringify({ '1': 300000, '2': 420000 }),
    12000,
    0.15,
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    'Valentina Cruz',
    'vale@eventflow.com',
  ]);

  const { lastID: show2 } = await run(`
    INSERT INTO shows (event_id, date, venue_name, venue_capacity, min_attendees, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [event2, '2026-09-20', 'Anfiteatro Mario Alberto Kempes', 20000, 12000, 0]);

  const interests2 = [
    { name: 'Tomás Ríos', email: 'tomas@mail.com', desired: 28, max: 36 },
    { name: 'Marina Blanco', email: 'marina@mail.com', desired: 24, max: 31 },
    { name: 'Diego Sosa', email: 'diego@mail.com', desired: 27, max: 33 },
  ];
  for (const i of interests2) {
    await run(
      `INSERT INTO interests (show_id, event_id, user_name, user_email, desired_price, max_price) VALUES (?,?,?,?,?,?)`,
      [show2, event2, i.name, i.email, i.desired, i.max]
    );
  }

  // Event 3: Sigur Rós en Rosario — recién creado, sin intereses
  const { lastID: event3 } = await run(`
    INSERT INTO events (title, artist, description, city, artist_fee_schedule, cost_per_show, profit_margin, deadline, creator_name, creator_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'Sigur Rós en Rosario',
    'Sigur Rós',
    'Los islandeses maestros del post-rock ambiental en el Teatro El Círculo. Una noche para olvidar el mundo.',
    'Rosario',
    JSON.stringify({ '1': 180000, '2': 240000, '3': 280000 }),
    8000,
    0.15,
    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    'Ignacio Peralta',
    'igna@eventflow.com',
  ]);

  await run(`
    INSERT INTO shows (event_id, date, venue_name, venue_capacity, min_attendees, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [event3, '2026-11-05', 'Teatro El Círculo', 2500, 1500, 0]);

  await run(`
    INSERT INTO shows (event_id, date, venue_name, venue_capacity, min_attendees, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [event3, '2026-11-06', 'Teatro El Círculo', 2500, 1500, 1]);

  await run(`
    INSERT INTO shows (event_id, date, venue_name, venue_capacity, min_attendees, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [event3, '2026-11-07', 'Teatro El Círculo', 2500, 1500, 2]);

  console.log('Seed data loaded.');
}

module.exports = { run, get, all, initSchema, seedData };
