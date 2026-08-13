/**
 * Server-side audit logging utility.
 * All mutations call this to write permanent, tamper-resistant audit records.
 */

import { pool } from '../db.js';

/**
 * Write an audit log entry.
 *
 * @param {object} opts
 * @param {string} opts.userId        – UUID of the acting user (null for system actions)
 * @param {string} opts.action        – CREATE | UPDATE | DELETE | GENERATE | EXPORT | LOGIN | LOGOUT | APPROVE | REJECT | LOCK | UNLOCK
 * @param {string} opts.module        – Module name (e.g. 'Auth', 'Students', 'Timetable')
 * @param {string} opts.entity        – Human-readable entity name or identifier
 * @param {string} [opts.entityId]    – UUID of the affected record
 * @param {object} [opts.before]      – Previous values (for updates/deletes)
 * @param {object} [opts.after]       – New values (for creates/updates)
 * @param {string} [opts.ip]          – Client IP address
 * @param {string} [opts.ua]          – User agent string
 * @param {string} [opts.institutionId] – Institution UUID (optional)
 */
export async function auditLog({
  userId = null,
  action,
  module,
  entity,
  entityId = null,
  before = null,
  after = null,
  ip = null,
  ua = null,
  institutionId = null,
}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs
         (institution_id, user_id, action, module, entity, entity_id,
          before_values, after_values, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::inet, $10)`,
      [
        institutionId,
        userId,
        action,
        module,
        entity,
        entityId,
        before ? JSON.stringify(before) : null,
        after  ? JSON.stringify(after)  : null,
        ip,
        ua,
      ],
    );
  } catch (err) {
    // Audit failures should not block the main operation but must be visible.
    console.error('[audit] Failed to write audit log:', err.message);
  }
}
