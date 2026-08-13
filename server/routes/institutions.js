/**
 * Institutions API — CampusFlow ERP
 *
 * GET    /api/institutions        – List institutions
 * GET    /api/institutions/:id    – Get institution by ID
 * POST   /api/institutions        – Create institution (SUPER_ADMIN)
 * PUT    /api/institutions/:id    – Update institution (SUPER_ADMIN, PRINCIPAL)
 * DELETE /api/institutions/:id    – Delete institution (SUPER_ADMIN)
 */

import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';

const router = Router();
router.use(authenticateUser);

router.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM institutions ORDER BY name`,
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM institutions WHERE id = $1`,
      [req.params.id],
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Institution not found.' });
    return res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.post('/', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const {
      name, affiliation, address, phone, email, website,
      naacGrade, aisheCode, principalName, establishedYear,
      autonomousStatus, collegeType, motto, logoUrl
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: 'Institution name is required.' });

    const result = await pool.query(
      `INSERT INTO institutions (
        name, affiliation, address, phone, email, website,
        naac_grade, aishe_code, principal_name, established_year,
        autonomous_status, college_type, motto, logo_url
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        name.trim(), affiliation?.trim() ?? null, address?.trim() ?? null,
        phone?.trim() ?? null, email?.trim() ?? null, website?.trim() ?? null,
        naacGrade?.trim() ?? null, aisheCode?.trim() ?? null,
        principalName?.trim() ?? null, establishedYear ? Number(establishedYear) : null,
        autonomousStatus?.trim() ?? null, collegeType?.trim() ?? null,
        motto?.trim() ?? null, logoUrl?.trim() ?? null,
      ],
    );

    await auditLog({ userId: req.user.id, action: 'CREATE', module: 'Institutions', entity: name.trim(), entityId: result.rows[0].id });
    return res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req, res, next) => {
  try {
    const before = await pool.query('SELECT * FROM institutions WHERE id = $1', [req.params.id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Institution not found.' });

    const {
      name, affiliation, address, phone, email, website,
      naacGrade, aisheCode, principalName, establishedYear,
      autonomousStatus, collegeType, motto, logoUrl
    } = req.body;

    const result = await pool.query(
      `UPDATE institutions SET
         name = COALESCE($1, name), affiliation = COALESCE($2, affiliation),
         address = COALESCE($3, address), phone = COALESCE($4, phone),
         email = COALESCE($5, email), website = COALESCE($6, website),
         naac_grade = COALESCE($7, naac_grade), aishe_code = COALESCE($8, aishe_code),
         principal_name = COALESCE($9, principal_name),
         established_year = COALESCE($10, established_year),
         autonomous_status = COALESCE($11, autonomous_status),
         college_type = COALESCE($12, college_type),
         motto = COALESCE($13, motto), logo_url = COALESCE($14, logo_url)
       WHERE id = $15 RETURNING *`,
      [
        name?.trim() ?? null, affiliation?.trim() ?? null, address?.trim() ?? null,
        phone?.trim() ?? null, email?.trim() ?? null, website?.trim() ?? null,
        naacGrade?.trim() ?? null, aisheCode?.trim() ?? null,
        principalName?.trim() ?? null, establishedYear ? Number(establishedYear) : null,
        autonomousStatus?.trim() ?? null, collegeType?.trim() ?? null,
        motto?.trim() ?? null, logoUrl?.trim() ?? null,
        req.params.id,
      ],
    );

    await auditLog({ userId: req.user.id, action: 'UPDATE', module: 'Institutions', entity: result.rows[0].name, entityId: req.params.id, before: before.rows[0], after: result.rows[0] });
    return res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const before = await pool.query('SELECT * FROM institutions WHERE id = $1', [req.params.id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Institution not found.' });

    await pool.query('DELETE FROM institutions WHERE id = $1', [req.params.id]);
    await auditLog({ userId: req.user.id, action: 'DELETE', module: 'Institutions', entity: before.rows[0].name, entityId: req.params.id, before: before.rows[0] });
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
