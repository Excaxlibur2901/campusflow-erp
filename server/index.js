import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { getState, initDatabase, patchState, pool, resetState } from './db.js';
import { runMigrations } from './migrations.js';

const app = express();
const port = Number(process.env.API_PORT ?? 4000);
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

app.use(cors({ origin: clientOrigin }));
app.use(express.json({ limit: '15mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/state', async (_req, res, next) => {
  try {
    res.json(await getState());
  } catch (error) {
    next(error);
  }
});

app.patch('/api/state', async (req, res, next) => {
  try {
    if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Request body must be a JSON object.' });
    }

    res.json(await patchState(req.body));
  } catch (error) {
    next(error);
  }
});

app.post('/api/reset', async (_req, res, next) => {
  try {
    res.json(await resetState());
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Database request failed.' });
});

runMigrations(pool)
  .then(initDatabase)
  .then(() => {
    app.listen(port, () => {
      console.log(`CampusFlow API running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Unable to initialize PostgreSQL database.');
    console.error(error);
    process.exit(1);
  });
