/**
 * Authentication & authorization middleware for CampusFlow ERP.
 *
 * authenticateUser   – verifies JWT access token from Authorization header or cookie.
 * requireRole        – ensures the authenticated user has one of the required roles.
 * requirePermission  – ensures the authenticated user has a specific permission code.
 */

import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const ACCESS_SECRET = process.env.AUTH_ACCESS_TOKEN_SECRET;
const TOKEN_COOKIE = process.env.SESSION_COOKIE_NAME || 'campusflow_session';

if (!ACCESS_SECRET) {
  console.warn('[auth] WARNING: AUTH_ACCESS_TOKEN_SECRET is not set. Auth will fail at runtime.');
}

/**
 * Extract the raw token string from the request.
 * Prefers the Authorization header, falls back to the access_token cookie.
 */
function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies?.[TOKEN_COOKIE]) return req.cookies[TOKEN_COOKIE];
  return null;
}

/**
 * Middleware: verify access token and attach user info to req.user.
 * Returns 401 if the token is missing, invalid, or expired.
 */
export async function authenticateUser(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(token, ACCESS_SECRET);

    // Lightweight liveness check — confirm the user is still ACTIVE in the DB.
    const result = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.status,
              array_agg(r.code) FILTER (WHERE r.code IS NOT NULL) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1
       GROUP BY u.id`,
      [payload.sub],
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'User not found.' });
    }

    const user = result.rows[0];
    if (user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'Account is not active.' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      roles: user.roles ?? [],
    };

    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
}

/**
 * Middleware factory: ensures at least one of the specified role codes is present.
 * Must be used AFTER authenticateUser.
 *
 * @param {...string} roles  – e.g. requireRole('SUPER_ADMIN', 'PRINCIPAL')
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const hasRole = roles.some((role) => req.user.roles.includes(role));
    if (!hasRole) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(' or ')}.`,
      });
    }
    return next();
  };
}

/**
 * Middleware factory: ensures the user holds a specific permission code.
 * Looks up role_permissions from the database.
 *
 * @param {string} permissionCode  – e.g. 'students:write'
 */
export function requirePermission(permissionCode) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    try {
      const result = await pool.query(
        `SELECT 1
         FROM user_roles ur
         JOIN role_permissions rp ON rp.role_id = ur.role_id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE ur.user_id = $1 AND p.code = $2
         LIMIT 1`,
        [req.user.id, permissionCode],
      );
      if (result.rowCount === 0) {
        return res.status(403).json({ error: `Permission '${permissionCode}' required.` });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Optionally authenticate. Attaches req.user if a valid token is present,
 * but does not reject the request if no token is found. Used for public endpoints
 * that display more info when authenticated.
 */
export async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const payload = jwt.verify(token, ACCESS_SECRET);
    const result = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.status,
              array_agg(r.code) FILTER (WHERE r.code IS NOT NULL) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1
       GROUP BY u.id`,
      [payload.sub],
    );
    if (result.rowCount > 0 && result.rows[0].status === 'ACTIVE') {
      req.user = {
        id: result.rows[0].id,
        email: result.rows[0].email,
        fullName: result.rows[0].full_name,
        roles: result.rows[0].roles ?? [],
      };
    }
  } catch {
    // Token invalid/expired — proceed as unauthenticated
  }
  return next();
}
