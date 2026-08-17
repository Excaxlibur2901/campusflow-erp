import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { initDatabase, pool } from './db.js';
import { runMigrations } from './migrations.js';

// Route modules
import authRoutes, { validateAuthSecrets } from './routes/auth.js';
import institutionRoutes from './routes/institutions.js';
import academicRoutes    from './routes/academic.js';
import departmentRoutes  from './routes/departments.js';
import studentRoutes     from './routes/students.js';
import facultyRoutes     from './routes/faculty.js';
import subjectRoutes     from './routes/subjects.js';
import classroomRoutes   from './routes/classrooms.js';
import timetableRoutes   from './routes/timetable.js';
import examRoutes        from './routes/exams.js';
import attendanceRoutes  from './routes/attendance.js';
import marksRoutes       from './routes/marks.js';
import documentRoutes    from './routes/documents.js';
import auditRoutes       from './routes/audit.js';

const app = express();
const port = Number(process.env.PORT || process.env.API_PORT || 4000);

/* ── Trust proxy configuration ─────────────────────────────────── */
// Trust single Nginx reverse proxy hop in Docker deployment
app.set('trust proxy', 1);

/* ── Security headers ───────────────────────────────────────────── */
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Allow PDF generation in browser
}));

/* ── CORS ───────────────────────────────────────────────────────── */
// Parse CLIENT_ORIGIN (supports single string or comma-separated list)
const envOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const defaultOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4000',
];

const allowedOrigins = [...new Set([...envOrigins, ...defaultOrigins])];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, same-origin, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

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
app.use('/api/institutions', institutionRoutes);
app.use('/api/academic',     academicRoutes);
app.use('/api/departments',  departmentRoutes);
app.use('/api/students',     studentRoutes);
app.use('/api/faculty',      facultyRoutes);
app.use('/api/subjects',     subjectRoutes);
app.use('/api/classrooms',   classroomRoutes);
app.use('/api/timetable',    timetableRoutes);
app.use('/api/exams',        examRoutes);
app.use('/api/attendance',   attendanceRoutes);
app.use('/api/marks',        marksRoutes);
app.use('/api/audit',        auditRoutes);
app.use('/api/documents',    documentRoutes);
app.use('/api/verify',       documentRoutes);

/* ── Centralised error handler ──────────────────────────────────── */
app.use((error, _req, res, _next) => {
  console.error('[server error]', error.message ?? error);

  // Map CORS origin rejection to 403 Forbidden
  if (error.message?.startsWith('CORS: origin')) {
    return res.status(403).json({ error: error.message });
  }

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
validateAuthSecrets();

async function startServer() {
  try {
    await runMigrations(pool);
    await initDatabase();
    console.log('[PostgreSQL] Database connection and schema migrations verified.');
  } catch (error) {
    console.warn('[PostgreSQL] Database initialization warning:', error.message);
    console.warn('[PostgreSQL] Ensure PostgreSQL container or service is running (npm run db:up).');
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`CampusFlow API v2.0 running on http://localhost:${port}`);
    console.log(`  Health:  GET  /api/health`);
    console.log(`  Auth:    POST /api/auth/login`);
    console.log(`  Verify:  GET  /api/verify/document/:id`);
  });
}

startServer();
