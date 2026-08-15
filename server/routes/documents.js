/**
 * Documents & Verification API — CampusFlow ERP
 *
 * POST /api/documents               – Register a generated document + create verification token
 * GET  /api/documents               – List documents (paginated)
 * GET  /api/documents/:id           – Get single document
 * POST /api/documents/:id/revoke    – Revoke a document (SUPER_ADMIN, PRINCIPAL)
 *
 * Public (no auth required):
 * GET  /api/verify/document/:documentId  – Verify a document by ID (returns status only)
 */

import crypto from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateUser, requireRole, optionalAuth } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';

const router = Router();

/* ── POST /api/documents (authenticated) ─────────────────────────── */
router.post('/', authenticateUser, async (req, res, next) => {
  try {
    const { documentType, title, payload = {}, expiresAt } = req.body;
    const institutionId = req.user.institution_id;
    if (!documentType?.trim()) return res.status(400).json({ error: 'documentType is required.' });
    if (!title?.trim())        return res.status(400).json({ error: 'title is required.' });

    // Generate a sequential document number
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM documents WHERE institution_id = $1`,
      [institutionId ?? null],
    );
    const docNumber = `CF-${new Date().getFullYear()}-${String(countResult.rows[0].cnt + 1).padStart(6, '0')}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const docResult = await client.query(
        `INSERT INTO documents (institution_id, document_number, document_type, title, payload, status, generated_by, expires_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, 'valid', $6, $7)
         RETURNING *`,
        [institutionId ?? null, docNumber, documentType.trim(), title.trim(),
         JSON.stringify(payload), req.user.id, expiresAt ?? null],
      );
      const docId = docResult.rows[0].id;

      // Generate verification token
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const baseUrl = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
      const verificationUrl = `${baseUrl}/verify/document/${docId}`;

      await client.query(
        `INSERT INTO document_verifications (document_id, verification_token_hash, verification_url, status, expires_at)
         VALUES ($1, $2, $3, 'VALID', $4)`,
        [docId, tokenHash, verificationUrl, expiresAt ?? null],
      );

      await client.query('COMMIT');

      await auditLog({ userId: req.user.id, action: 'GENERATE', module: 'Documents', entity: title.trim(), entityId: docId });

      return res.status(201).json({
        ...docResult.rows[0],
        verificationToken: rawToken,  // returned once to embed in the document QR
        verificationUrl,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

/* ── GET /api/documents (authenticated) ──────────────────────────── */
router.get('/', authenticateUser, async (req, res, next) => {
  try {
    const { type, status, search, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;
    const conds = ['d.institution_id = $1'];
    const params = [req.user.institution_id];
    let idx = 2;
    if (type)   { conds.push(`d.document_type = $${idx++}`); params.push(type); }
    if (status) { conds.push(`d.status = $${idx++}`); params.push(status); }
    if (search) { conds.push(`(d.title ILIKE $${idx} OR d.document_number ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT d.*, dv.verification_url, dv.status AS verification_status
       FROM documents d
       LEFT JOIN document_verifications dv ON dv.document_id = d.id
       ${where}
       ORDER BY d.generated_at DESC
       LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, limitNum, offset],
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

/* ── POST /api/documents/:id/revoke (authenticated) ─────────────── */
router.post('/:id/revoke', authenticateUser, requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req, res, next) => {
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE documents SET status = 'revoked', revoked_at = now(), updated_at = now()
         WHERE id = $1 AND institution_id = $2 RETURNING *`,
        [req.params.id, req.user.institution_id],
      );
      if (result.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Document not found.' }); }
      await client.query(
        `UPDATE document_verifications SET status = 'REVOKED' WHERE document_id = $1`,
        [req.params.id],
      );
      await client.query('COMMIT');
      await auditLog({ userId: req.user.id, action: 'DELETE', module: 'Documents', entity: result.rows[0].title, entityId: req.params.id });
      return res.json(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

/* ── GET /api/documents/verify/:documentId or /api/verify/document/:documentId (PUBLIC) ───────────────── */
router.get(['/verify/:documentId', '/verify/document/:documentId', '/document/:documentId'], optionalAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT d.id, d.document_number, d.document_type, d.title, d.status,
              d.generated_at, d.revoked_at, d.expires_at,
              dv.verification_url, dv.status AS verification_status, dv.last_verified_at,
              u.full_name AS generated_by_name,
              i.name AS institution_name
       FROM documents d
       LEFT JOIN document_verifications dv ON dv.document_id = d.id
       LEFT JOIN users u ON u.id = d.generated_by
       LEFT JOIN institutions i ON i.id = d.institution_id
       WHERE d.id = $1`,
      [req.params.documentId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        verified: false,
        status: 'NOT_FOUND',
        message: 'No document found with this ID.',
      });
    }

    const doc = result.rows[0];

    // Update last verified timestamp
    await pool.query(
      `UPDATE document_verifications SET last_verified_at = now() WHERE document_id = $1`,
      [doc.id],
    );

    // Determine effective status
    let status = doc.verification_status ?? 'VALID';
    if (doc.status === 'revoked') status = 'REVOKED';
    if (doc.expires_at && new Date(doc.expires_at) < new Date()) status = 'EXPIRED';

    return res.json({
      verified: status === 'VALID',
      status,
      documentId: doc.id,
      documentNumber: doc.document_number,
      documentType: doc.document_type,
      title: doc.title,
      institution: doc.institution_name,
      generatedAt: doc.generated_at,
      generatedBy: doc.generated_by_name,
      revokedAt: doc.revoked_at,
      expiresAt: doc.expires_at,
      // Note: sensitive student data is NOT returned here
    });
  } catch (err) { next(err); }
});

export default router;
