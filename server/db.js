import pg from 'pg';
import { defaultState } from './defaultState.js';

const { Pool } = pg;
const localDatabaseUrl = 'postgres://campusflow:campusflow@localhost:5432/campusflow_erp';
const hasDiscretePgConfig = ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'].some(
  (key) => process.env[key],
);

const ssl =
  process.env.PGSSLMODE === 'require'
    ? { rejectUnauthorized: false }
    : undefined;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || (hasDiscretePgConfig ? undefined : localDatabaseUrl),
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl,
});

const STATE_ID = 'main';

export async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(
    `
      INSERT INTO app_state (id, data)
      VALUES ($1, $2::jsonb)
      ON CONFLICT (id) DO NOTHING
    `,
    [STATE_ID, JSON.stringify(defaultState)],
  );
}

export async function getState() {
  const result = await pool.query('SELECT data FROM app_state WHERE id = $1', [STATE_ID]);
  return { ...defaultState, ...(result.rows[0]?.data ?? {}) };
}

export async function patchState(patch) {
  const result = await pool.query(
    `
      UPDATE app_state
      SET data = data || $2::jsonb,
          updated_at = now()
      WHERE id = $1
      RETURNING data
    `,
    [STATE_ID, JSON.stringify(patch)],
  );

  return { ...defaultState, ...(result.rows[0]?.data ?? {}) };
}

export async function resetState() {
  const result = await pool.query(
    `
      UPDATE app_state
      SET data = $2::jsonb,
          updated_at = now()
      WHERE id = $1
      RETURNING data
    `,
    [STATE_ID, JSON.stringify(defaultState)],
  );

  return result.rows[0].data;
}
