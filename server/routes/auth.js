/**
 * Authentication routes for CampusFlow ERP.
 *
 * POST /api/auth/setup          – First-run: create SUPER_ADMIN + institution (no auth required).
 * POST /api/auth/login          – Validate credentials, return access token + set refresh cookie.
 * POST /api/auth/logout         – Revoke refresh token, clear cookie.
 * POST /api/auth/refresh        – Rotate refresh token, return new access token.
 * GET  /api/auth/me             – Return current user profile (requires auth).
 * POST /api/auth/change-password – Change own password (requires auth).
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { pool } from '../db.js';
import { authenticateUser } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';

const router = Router();

export function validateAuthSecrets() {
  if (!process.env.AUTH_ACCESS_TOKEN_SECRET?.trim()) {
    console.error('FATAL: AUTH_ACCESS_TOKEN_SECRET is missing');
    throw new Error('AUTH_ACCESS_TOKEN_SECRET is missing');
  }
  if (!process.env.AUTH_REFRESH_TOKEN_SECRET?.trim()) {
    console.error('FATAL: AUTH_REFRESH_TOKEN_SECRET is missing');
    throw new Error('AUTH_REFRESH_TOKEN_SECRET is missing');
  }
}

validateAuthSecrets();

const BCRYPT_COST = Number(process.env.BCRYPT_COST ?? 12);
const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'campusflow_session';
const IS_PROD = process.env.NODE_ENV === 'production';
const ACCESS_TTL_S = 15 * 60;        // 15 minutes
const REFRESH_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days

const ROLE_MAP = {
  SUPER_ADMIN: 'Super Admin',
  PRINCIPAL: 'Principal',
  HOD: 'HOD',
  FACULTY: 'Faculty',
  EXAM_CELL: 'Exam Cell',
  STUDENT: 'Student',
};

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: IS_PROD ? 'strict' : 'lax',
  maxAge: REFRESH_TTL_MS,
  path: '/api/auth',
};

/** Generate a signed access JWT */
function signAccess(userId, roles) {
  try {
    if (!process.env.AUTH_ACCESS_TOKEN_SECRET?.trim()) {
      throw new Error('AUTH_ACCESS_TOKEN_SECRET is missing');
    }
    return jwt.sign({ sub: userId, roles }, process.env.AUTH_ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TTL_S });
  } catch (err) {
    console.error('[auth] JWT signAccess error:', err.message);
    throw err;
  }
}

/** Generate a signed refresh JWT and return its hash for DB storage */
function signRefresh(userId) {
  try {
    if (!process.env.AUTH_REFRESH_TOKEN_SECRET?.trim()) {
      throw new Error('AUTH_REFRESH_TOKEN_SECRET is missing');
    }
    const token = jwt.sign(
      { sub: userId, type: 'refresh', jti: crypto.randomUUID() },
      process.env.AUTH_REFRESH_TOKEN_SECRET,
      { expiresIn: Math.floor(REFRESH_TTL_MS / 1000) },
    );
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    return { token, hash };
  } catch (err) {
    console.error('[auth] JWT signRefresh error:', err.message);
    throw err;
  }
}

/* ── GET /api/auth/setup-status ──────────────────────────────────── */
router.get('/setup-status', async (req, res, next) => {
  try {
    const existing = await pool.query(
      `SELECT 1 FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE r.code = 'SUPER_ADMIN' LIMIT 1`,
    );
    return res.json({ setupDone: existing.rowCount > 0 });
  } catch (err) { next(err); }
});

/* ─────────────────────────────────────────────────────────────────
   POST /api/auth/setup
   First-run only. Creates institution + SUPER_ADMIN account.
   Returns 409 if a SUPER_ADMIN already exists.
───────────────────────────────────────────────────────────────── */
router.post('/setup', async (req, res, next) => {
  try {
    const {
      institutionName,
      adminName,
      adminEmail,
      adminPassword,
      instDetails,
      departments,
      classrooms,
    } = req.body;

    if (!institutionName?.trim()) return res.status(400).json({ error: 'Institution name is required.' });
    if (!adminName?.trim())       return res.status(400).json({ error: 'Admin full name is required.' });
    if (!adminEmail?.trim())      return res.status(400).json({ error: 'Admin email is required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim())) {
      return res.status(400).json({ error: 'Please enter a valid admin email address.' });
    }
    if (!adminPassword || adminPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Guard: if any SUPER_ADMIN user already exists, deny setup.
      const existing = await client.query(
        `SELECT 1 FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
         WHERE r.code = 'SUPER_ADMIN' LIMIT 1`,
      );
      if (existing.rowCount > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'System is already set up. Use /login.' });
      }

      // Check if admin email already belongs to an existing user
      const existingUser = await client.query(
        `SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [adminEmail.trim()],
      );
      if (existingUser.rowCount > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Administrator email already exists.' });
      }

      // 1. Create institution
      const instData = instDetails || {};
      const instResult = await client.query(
        `INSERT INTO institutions (
          name, affiliation, address, phone, email, website,
          naac_grade, aishe_code, principal_name, established_year,
          autonomous_status, college_type, motto, logo_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id`,
        [
          institutionName.trim(),
          instData.affiliation?.trim() || null,
          instData.address?.trim() || null,
          instData.phone?.trim() || null,
          instData.email?.trim() || null,
          instData.website?.trim() || null,
          instData.naacGrade?.trim() || null,
          instData.aisheCode?.trim() || null,
          instData.principalName?.trim() || adminName.trim(),
          instData.establishedYear ? Number(instData.establishedYear) || null : null,
          instData.autonomousStatus?.trim() || null,
          instData.collegeType?.trim() || null,
          instData.motto?.trim() || null,
          instData.collegeLogo || null,
        ],
      );
      const institutionId = instResult.rows[0].id;

      // 2. Insert initial configuration / settings
      await client.query(
        `INSERT INTO settings (institution_id, key, value)
         VALUES ($1, 'institution_profile', $2::jsonb)
         ON CONFLICT (institution_id, key) DO UPDATE SET value = EXCLUDED.value`,
        [
          institutionId,
          JSON.stringify({
            institutionName: institutionName.trim(),
            ...instData,
            principalName: instData.principalName?.trim() || adminName.trim(),
          }),
        ],
      );

      // 3. Insert Departments if provided
      if (Array.isArray(departments)) {
        for (const dept of departments) {
          if (dept.code?.trim() && dept.name?.trim()) {
            await client.query(
              `INSERT INTO departments (institution_id, code, name)
               VALUES ($1, $2, $3)
               ON CONFLICT (institution_id, code) DO NOTHING`,
              [institutionId, dept.code.trim().toUpperCase(), dept.name.trim()],
            );
          }
        }
      }

      // 4. Insert Classrooms if provided
      if (Array.isArray(classrooms)) {
        for (const room of classrooms) {
          if (room.code?.trim() && room.name?.trim()) {
            const cap = Number(room.capacity) > 0 ? Number(room.capacity) : 60;
            const validTypes = ['lecture', 'lab', 'seminar', 'exam_hall', 'other'];
            const rType = validTypes.includes(room.type) ? room.type : (room.type === 'exam' ? 'exam_hall' : 'lecture');
            await client.query(
              `INSERT INTO classrooms (institution_id, code, name, room_type, capacity)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (institution_id, code) DO NOTHING`,
              [institutionId, room.code.trim().toUpperCase(), room.name.trim(), rType, cap],
            );
          }
        }
      }

      // 5. Hash password with bcrypt
      const hash = await bcrypt.hash(adminPassword, BCRYPT_COST);

      // 6. Create SUPER_ADMIN user
      const nameParts = adminName.trim().split(/\s+/);
      const initials = nameParts.length >= 2
        ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
        : adminName.slice(0, 2).toUpperCase();

      const userResult = await client.query(
        `INSERT INTO users (institution_id, email, password_hash, full_name, initials, status)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
         RETURNING id`,
        [institutionId, adminEmail.trim().toLowerCase(), hash, adminName.trim(), initials],
      );
      const userId = userResult.rows[0].id;

      // 7. Assign SUPER_ADMIN role
      await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE code = 'SUPER_ADMIN'`,
        [userId],
      );

      // Issue access token and set refresh cookie for immediate login
      const roles = ['SUPER_ADMIN'];
      const accessToken = signAccess(userId, roles);
      const { token: refreshToken, hash: refreshHash } = signRefresh(userId);
      const rawIp = req.ip || req.socket?.remoteAddress || null;
      const cleanIp = (typeof rawIp === 'string' && rawIp.replace(/^::ffff:/, '').trim()) || null;
      const validIp = (cleanIp === '::1' || /^[0-9.:a-fA-F]+$/.test(cleanIp)) ? cleanIp : null;
      const ua = req.headers['user-agent'] ?? null;

      await client.query(
        `INSERT INTO user_sessions (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
         VALUES ($1, $2, $3, $4::inet, $5)`,
        [userId, refreshHash, ua, validIp, new Date(Date.now() + REFRESH_TTL_MS)],
      );

      await client.query('COMMIT');

      await auditLog({ userId, action: 'CREATE', module: 'Auth', entity: adminEmail.trim().toLowerCase(), ip: validIp, ua });

      res.cookie(COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);

      const roleCode = roles[0] || 'SUPER_ADMIN';
      const role = ROLE_MAP[roleCode] || roleCode;

      return res.status(201).json({
        ok: true,
        accessToken,
        expiresIn: ACCESS_TTL_S,
        user: {
          id: userId,
          email: adminEmail.trim().toLowerCase(),
          fullName: adminName.trim(),
          name: adminName.trim(),
          initials,
          roles,
          role,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────────────────
   POST /api/auth/login
───────────────────────────────────────────────────────────────── */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email?.trim())      return res.status(400).json({ error: 'Email is required.' });
    if (!password?.length)   return res.status(400).json({ error: 'Password is required.' });

    const rawIp = req.ip || req.socket?.remoteAddress || null;
    const cleanIp = (typeof rawIp === 'string' && rawIp.replace(/^::ffff:/, '').trim()) || null;
    const validIp = (cleanIp === '::1' || /^[0-9.:a-fA-F]+$/.test(cleanIp)) ? cleanIp : null;
    const ua = req.headers['user-agent'] ?? null;

    // Fetch user
    const result = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.initials, u.password_hash,
              u.status, u.failed_login_count, u.locked_until,
              array_agg(r.code) FILTER (WHERE r.code IS NOT NULL) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.email = $1
       GROUP BY u.id`,
      [email.trim().toLowerCase()],
    );

    const user = result.rows[0];

    const recordAttempt = async (success) => {
      try {
        await pool.query(
          `INSERT INTO login_attempts (email, success, ip_address, user_agent)
           VALUES ($1, $2, $3::inet, $4)`,
          [email.trim().toLowerCase(), success, validIp, ua],
        );
      } catch (attErr) {
        console.warn('[auth] login_attempt insert warning:', attErr.message);
      }
    };

    // Account not found — still hash to prevent timing attacks
    if (!user) {
      await bcrypt.compare(password, '$2b$12$invalidhashfortimingatk');
      await recordAttempt(false);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Account locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await recordAttempt(false);
      return res.status(429).json({ error: 'Account temporarily locked. Please try again later.' });
    }

    // Account inactive
    if (user.status !== 'ACTIVE') {
      await recordAttempt(false);
      return res.status(401).json({ error: 'Account is not active. Contact your administrator.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      const failCount = user.failed_login_count + 1;
      const lockUntil = failCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await pool.query(
        `UPDATE users SET failed_login_count = $1, locked_until = $2 WHERE id = $3`,
        [failCount, lockUntil, user.id],
      );
      await recordAttempt(false);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Reset failure count on success
    await pool.query(
      `UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`,
      [user.id],
    );
    await recordAttempt(true);

    const roles = user.roles ?? [];
    const accessToken = signAccess(user.id, roles);
    const { token: refreshToken, hash: refreshHash } = signRefresh(user.id);

    // Store refresh token hash in DB
    await pool.query(
      `INSERT INTO user_sessions (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
       VALUES ($1, $2, $3, $4::inet, $5)`,
      [user.id, refreshHash, ua, validIp, new Date(Date.now() + REFRESH_TTL_MS)],
    );

    await auditLog({ userId: user.id, action: 'LOGIN', module: 'Auth', entity: user.email, ip: validIp, ua });

    res.cookie(COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);

    const roleCode = roles[0] || 'SUPER_ADMIN';
    const role = ROLE_MAP[roleCode] || roleCode;

    return res.json({
      accessToken,
      expiresIn: ACCESS_TTL_S,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        name: user.full_name,
        initials: user.initials,
        roles,
        role,
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────────────────
   POST /api/auth/logout
───────────────────────────────────────────────────────────────── */
router.post('/logout', async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.[COOKIE_NAME];
    if (refreshToken) {
      const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await pool.query(
        `UPDATE user_sessions SET revoked_at = now() WHERE refresh_token_hash = $1`,
        [hash],
      );
    }
    res.clearCookie(COOKIE_NAME, { path: '/api/auth' });
    if (req.user) {
      await auditLog({ userId: req.user.id, action: 'LOGOUT', module: 'Auth', entity: req.user.email });
    }
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────────────────
   POST /api/auth/refresh
───────────────────────────────────────────────────────────────── */
router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.[COOKIE_NAME];
    if (!refreshToken) return res.status(401).json({ error: 'No refresh token.' });

    let payload;
    try {
      payload = jwt.verify(refreshToken, process.env.AUTH_REFRESH_TOKEN_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }

    if (payload.type !== 'refresh') return res.status(401).json({ error: 'Invalid token type.' });

    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const sessionResult = await pool.query(
      `SELECT id FROM user_sessions
       WHERE refresh_token_hash = $1
         AND revoked_at IS NULL
         AND expires_at > now()
       LIMIT 1`,
      [hash],
    );
    if (sessionResult.rowCount === 0) return res.status(401).json({ error: 'Session revoked or expired.' });

    // Rotate refresh token
    const sessionId = sessionResult.rows[0].id;
    await pool.query(`UPDATE user_sessions SET revoked_at = now() WHERE id = $1`, [sessionId]);

    // Fetch current user roles
    const userResult = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.initials, u.status,
              array_agg(r.code) FILTER (WHERE r.code IS NOT NULL) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1
       GROUP BY u.id`,
      [payload.sub],
    );
    if (userResult.rowCount === 0 || userResult.rows[0].status !== 'ACTIVE') {
      return res.status(401).json({ error: 'Account inactive.' });
    }
    const user = userResult.rows[0];
    const roles = user.roles ?? [];

    const { token: newRefresh, hash: newHash } = signRefresh(user.id);
    const newAccess = signAccess(user.id, roles);
    const ip = req.ip ?? null;
    const ua = req.headers['user-agent'] ?? null;

    await pool.query(
      `INSERT INTO user_sessions (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
       VALUES ($1, $2, $3, $4::inet, $5)`,
      [user.id, newHash, ua, ip, new Date(Date.now() + REFRESH_TTL_MS)],
    );

    res.cookie(COOKIE_NAME, newRefresh, REFRESH_COOKIE_OPTIONS);

    const refRoleCode = roles[0] || 'SUPER_ADMIN';
    const refRole = ROLE_MAP[refRoleCode] || refRoleCode;

    return res.json({
      accessToken: newAccess,
      expiresIn: ACCESS_TTL_S,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        name: user.full_name,
        initials: user.initials,
        roles,
        role: refRole,
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────────────────
   GET /api/auth/me
───────────────────────────────────────────────────────────────── */
router.get('/me', authenticateUser, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.initials, u.last_login_at,
              array_agg(r.code) FILTER (WHERE r.code IS NOT NULL) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1
       GROUP BY u.id`,
      [req.user.id],
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found.' });
    const u = result.rows[0];
    return res.json({
      id: u.id, email: u.email, fullName: u.full_name,
      initials: u.initials, roles: u.roles ?? [], lastLoginAt: u.last_login_at,
    });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────────────────
   POST /api/auth/change-password
───────────────────────────────────────────────────────────────── */
router.post('/change-password', authenticateUser, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword) return res.status(400).json({ error: 'Current password is required.' });
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    const result = await pool.query(
      `SELECT password_hash FROM users WHERE id = $1`, [req.user.id],
    );
    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect.' });

    const newHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, req.user.id]);

    // Revoke all existing sessions
    await pool.query(
      `UPDATE user_sessions SET revoked_at = now()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [req.user.id],
    );
    res.clearCookie(COOKIE_NAME, { path: '/api/auth' });

    await auditLog({ userId: req.user.id, action: 'UPDATE', module: 'Auth', entity: 'password' });
    return res.json({ ok: true, message: 'Password changed. Please log in again.' });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────────────────
   GET /api/auth/institutions (PUBLIC)
───────────────────────────────────────────────────────────────── */
router.get('/institutions', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, affiliation, logo_url FROM institutions ORDER BY name`,
    );
    return res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────────────────────────
   POST /api/auth/register (PUBLIC)
   Supports registering user accounts or onboard new institutions.
───────────────────────────────────────────────────────────────── */
router.post('/register', async (req, res, next) => {
  try {
    const {
      accountType = 'user', // 'user' | 'institution'
      fullName,
      email,
      password,
      department = 'CSE',
      institutionId,
      institutionName,
    } = req.body;

    if (!email?.trim()) return res.status(400).json({ error: 'Email address is required.' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (!fullName?.trim()) return res.status(400).json({ error: 'Full name is required.' });

    const cleanEmail = email.trim().toLowerCase();

    // Check if email already exists
    const existing = await pool.query(`SELECT 1 FROM users WHERE email = $1`, [cleanEmail]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }

    let targetInstitutionId = (accountType === 'user' && institutionId && typeof institutionId === 'string' && institutionId.trim() && institutionId !== 'undefined')
      ? institutionId.trim()
      : null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (accountType === 'institution') {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Public institution registration is disabled. Please contact the administrator.' });
      }

      // Hash password
      const hash = await bcrypt.hash(password, BCRYPT_COST);

      const nameParts = fullName.trim().split(/\s+/);
      const initials = nameParts.length >= 2
        ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
        : fullName.trim().slice(0, 2).toUpperCase();

      // Insert user
      const userResult = await client.query(
        `INSERT INTO users (institution_id, email, password_hash, full_name, initials, status)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
         RETURNING id`,
        [targetInstitutionId, cleanEmail, hash, fullName.trim(), initials],
      );
      const userId = userResult.rows[0].id;

      // Security rule: Public user registration creates STUDENT accounts ONLY.
      // Staff/Admin accounts (SUPER_ADMIN, PRINCIPAL, HOD, EXAM_CELL, FACULTY) must be created by an authorized admin.
      const finalRoleCode = 'STUDENT';

      // Ensure role exists in roles table
      await client.query(
        `INSERT INTO roles (code, name, description)
         VALUES ($1, $1, 'System Role')
         ON CONFLICT (code) DO NOTHING`,
        [finalRoleCode],
      );

      let deptId = null;
      if (targetInstitutionId && department) {
        const deptRes = await client.query(
          `SELECT id FROM departments WHERE institution_id = $1 AND code = $2 LIMIT 1`,
          [targetInstitutionId, department.toUpperCase()],
        );
        if (deptRes.rowCount > 0) deptId = deptRes.rows[0].id;
      }

      await client.query(
        `INSERT INTO user_roles (user_id, role_id, department_id)
         SELECT $1, id, $3 FROM roles WHERE code = $2`,
        [userId, finalRoleCode, deptId],
      );

      // Issue access token and set refresh token cookie
      const roles = [finalRoleCode];
      const accessToken = signAccess(userId, roles);
      const { token: refreshToken, hash: refreshHash } = signRefresh(userId);

      const rawIp = req.ip || req.socket?.remoteAddress || null;
      const cleanIp = (typeof rawIp === 'string' && rawIp.replace(/^::ffff:/, '').trim()) || null;
      const validIp = (cleanIp === '::1' || /^[0-9.:a-fA-F]+$/.test(cleanIp)) ? cleanIp : null;
      const ua = req.headers['user-agent'] ?? null;

      await client.query(
        `INSERT INTO user_sessions (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
         VALUES ($1, $2, $3, $4::inet, $5)`,
        [userId, refreshHash, ua, validIp, new Date(Date.now() + REFRESH_TTL_MS)],
      );

      await client.query('COMMIT');

      await auditLog({ userId, action: 'CREATE', module: 'Auth', entity: cleanEmail, ip: validIp, ua });

      res.cookie(COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);

      return res.status(201).json({
        accessToken,
        expiresIn: ACCESS_TTL_S,
        user: {
          id: userId,
          email: cleanEmail,
          fullName: fullName.trim(),
          initials,
          roles,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
