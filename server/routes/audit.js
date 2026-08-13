/**
 * Audit Logs API — CampusFlow ERP
 *
 * GET /api/audit   – Paginated, read-only audit log (SUPER_ADMIN, PRINCIPAL only)
 *
 * Audit logs are NEVER editable by any user.
 */

import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authenticateUser);
router.use(requireRole('SUPER_ADMIN', 'PRINCIPAL'));

router.get('/', async (req, res, next) => {
  try {
    const { module, action, userId, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const conds = [];
    const params = [];
    let idx = 1;
    if (module) { conds.push(`al.module = $${idx++}`); params.push(module); }
    if (action) { conds.push(`al.action = $${idx++}`); params.push(action); }
    if (userId) { conds.push(`al.user_id = $${idx++}`); params.push(userId); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const countRes = await pool.query(
      `SELECT COUNT(*)::int FROM audit_logs al ${where}`, params,
    );
    const result = await pool.query(
      `SELECT al.*, u.email AS user_email, u.full_name AS user_name
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limitNum, offset],
    );

    return res.json({
      data: result.rows,
      total: countRes.rows[0].count,
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) { next(err); }
});

export default router;
