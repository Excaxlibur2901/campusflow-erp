import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { getState, initDatabase, patchState, pool, resetState } from './db.js';
import { runMigrations } from './migrations.js';
import { authenticateUser, requireRole } from './middleware/auth.js';

// Route modules
import authRoutes       from './routes/auth.js';
import departmentRoutes from './routes/departments.js';
import studentRoutes    from './routes/students.js';
import facultyRoutes    from './routes/faculty.js';
import subjectRoutes    from './routes/subjects.js';
import classroomRoutes  from './routes/classrooms.js';
import timetableRoutes  from './routes/timetable.js';
import examRoutes       from './routes/exams.js';
import attendanceRoutes from './routes/attendance.js';
import marksRoutes      from './routes/marks.js';
import documentRoutes   from './routes/documents.js';
import auditRoutes      from './routes/audit.js';

const app = express();
const port = Number(process.env.API_PORT ?? 4000);
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const IS_PROD = process.env.NODE_ENV === 'production';

/* ── Security headers ───────────────────────────────────────────── */
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Allow PDF generation in browser
}));

/* ── CORS ───────────────────────────────────────────────────────── */
const allowedOrigins = IS_PROD
  ? [clientOrigin]
  : [clientOrigin, 'http://localhost:5173', 'http://localhost:4000'];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

/* ── Body parsing & cookies ─────────────────────────────────────── */
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

/* ── Rate limiting ──────────────────────────────────────────────── */
// Global limit: 500 requests per 15 minutes
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
}));

// Stricter limit for auth endpoints: 20 per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

/* ── Health check (public) ──────────────────────────────────────── */
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected', version: '2.0.0' });
  } catch {
    res.status(500).json({ ok: false, database: 'disconnected' });
  }
});

/* ── Auth routes ────────────────────────────────────────────────── */
app.use('/api/auth', authLimiter, authRoutes);

/* ── Module routes (authentication is enforced inside each router) ── */
app.use('/api/departments', departmentRoutes);
app.use('/api/students',    studentRoutes);
app.use('/api/faculty',     facultyRoutes);
app.use('/api/subjects',    subjectRoutes);
app.use('/api/classrooms',  classroomRoutes);
app.use('/api/timetable',   timetableRoutes);
app.use('/api/exams',       examRoutes);
app.use('/api/attendance',  attendanceRoutes);
app.use('/api/marks',       marksRoutes);
app.use('/api/audit',       auditRoutes);
app.use('/api/documents',   documentRoutes);

/* ── Legacy JSON-blob state API (protected) ─────────────────────── */
// Kept for frontend transition. Requires auth.
// PATCH and POST /reset require SUPER_ADMIN.

app.get('/api/state', authenticateUser, async (_req, res, next) => {
  try {
    res.json(await getState());
  } catch (error) {
    next(error);
  }
});

app.patch('/api/state', authenticateUser, async (req, res, next) => {
  try {
    if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Request body must be a JSON object.' });
    }
    res.json(await patchState(req.body));
  } catch (error) {
    next(error);
  }
});

// Reset is SUPER_ADMIN only and blocked in production
app.post('/api/reset', authenticateUser, requireRole('SUPER_ADMIN'), async (_req, res, next) => {
  if (IS_PROD) {
    return res.status(403).json({ error: 'Reset is disabled in production.' });
  }
  try {
    res.json(await resetState());
  } catch (error) {
    next(error);
  }
});

/* ── Centralised error handler ──────────────────────────────────── */
app.use((error, _req, res, _next) => {
  console.error('[server error]', error.message ?? error);

  // Map known DB constraint errors to friendly messages
  if (error.code === '23505') {
    return res.status(409).json({ error: 'A record with these details already exists.' });
  }
  if (error.code === '23503') {
    return res.status(400).json({ error: 'Referenced record does not exist.' });
  }
  if (error.name === 'ZodError') {
    return res.status(400).json({ error: 'Validation failed.', details: error.errors });
  }

  // Never expose stack traces or database internals to clients
  res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
});

/* ── Startup ────────────────────────────────────────────────────── */
runMigrations(pool)
  .then(initDatabase)
  .then(() => {
    app.listen(port, () => {
      console.log(`CampusFlow API v2.0 running on http://localhost:${port}`);
      console.log(`  Auth:    POST /api/auth/login`);
      console.log(`  Verify:  GET  /api/verify/document/:id`);
    });
  })
  .catch((error) => {
    console.error('Unable to initialize PostgreSQL database.');
    console.error(error.message);
    process.exit(1);
  });
