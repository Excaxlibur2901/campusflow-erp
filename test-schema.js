import { pool } from './server/db.js';

async function check() {
  const res = await pool.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('faculty', 'students', 'sections', 'subject_offerings', 'subjects', 'departments', 'programs', 'semesters')`);
  console.table(res.rows);
  process.exit(0);
}
check();
