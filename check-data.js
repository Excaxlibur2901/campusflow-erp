import { pool } from './server/db.js';
(async () => {
  const res = await pool.query("SELECT s.id, d.institution_id FROM subjects s JOIN departments d ON d.id = s.department_id WHERE s.name = 'Subject A'");
  console.log('Subjects:', res.rows);
  const user = await pool.query("SELECT id, institution_id FROM users WHERE email = 'admin@insta.com'");
  console.log('User:', user.rows);
  process.exit(0);
})();
