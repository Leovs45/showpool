const express = require('express');
const cors = require('cors');
const { initSchema, seedData } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/events', require('./routes/events'));
app.use('/api/shows/:showId/interest', require('./routes/interests'));

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;

async function start() {
  await initSchema();
  await seedData();
  app.listen(PORT, () => console.log(`EventFlow API running on http://localhost:${PORT}`));
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
