/**
 * SAFE Development Reset Script — CampusFlow ERP
 *
 * Resets the first-run setup state in PostgreSQL without wiping the database volume or schema.
 * Preserves static roles, schema, triggers, and indices.
 *
 * Removes:
 *   - users
 *   - user_roles
 *   - user_sessions
 *   - login_attempts
 *   - institutions (and cascading dependent entities)
 */

import 'dotenv/config';
import { pool } from './db.js';

async function resetSetupState() {
  console.log('─── CampusFlow ERP: Safe First-Run Setup Reset ───\n');

  try {
    // 1. Audit records to be removed
    const usersCount = await pool.query('SELECT count(*)::int FROM users');
    const instCount = await pool.query('SELECT count(*)::int FROM institutions');
    const sessCount = await pool.query('SELECT count(*)::int FROM user_sessions');

    console.log('Current database state to be cleared:');
    console.log(`  - Institutions: ${instCount.rows[0].count}`);
    console.log(`  - Users:        ${usersCount.rows[0].count}`);
    console.log(`  - Sessions:     ${sessCount.rows[0].count}`);

    // 2. Perform cascade truncation of user & institution state
    await pool.query('TRUNCATE users, user_sessions, login_attempts, institutions CASCADE;');

    // 3. Verify setup status
    const statusRes = await pool.query(
      `SELECT 1 FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE r.code = 'SUPER_ADMIN' LIMIT 1`,
    );

    const setupDone = statusRes.rowCount > 0;
    console.log(`\n✓ Reset completed successfully.`);
    console.log(`✓ GET /api/auth/setup-status will now return: { "setupDone": ${setupDone} }`);
    console.log('✓ Next browser visit will present the SetupWizard UI.\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Reset failed:', err.message);
    process.exit(1);
  }
}

resetSetupState();
