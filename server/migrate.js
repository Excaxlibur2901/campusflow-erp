import 'dotenv/config';
import { pool } from './db.js';
import { runMigrations } from './migrations.js';

try {
  await runMigrations(pool);
  console.log('Database migrations complete.');
} finally {
  await pool.end();
}