import pg from 'pg';

const { Pool } = pg;
const localDatabaseUrl = 'postgres://campusflow:campusflow@localhost:5432/campusflow_erp';
const hasDiscretePgConfig = ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'].some(
  (key) => process.env[key],
);

const ssl =
  process.env.PGSSLMODE === 'require' ||
  process.env.DATABASE_SSL === 'true' ||
  (process.env.NODE_ENV === 'production' &&
    process.env.DATABASE_URL &&
    !process.env.DATABASE_URL.includes('localhost') &&
    !process.env.DATABASE_URL.includes('127.0.0.1') &&
    !process.env.DATABASE_URL.includes('postgres:5432'))
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

export async function initDatabase() {
  await pool.query('SELECT 1');
}
