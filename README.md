# CampusFlow ERP

CampusFlow ERP is an Enterprise Resource Planning (ERP) platform for academic institutions. Built using a **React + Vite** SPA frontend, a **Node.js + Express** REST API, and a normalized **PostgreSQL** database, it provides multi-tenant institutional management, automated timetable scheduling, anti-cheat exam seating allocation, attendance tracking, marks management, and official document generation.

---

## 🌟 Architecture & Features Summary

*   **Multi-Tenant Data Isolation**: Every resource (departments, faculty, students, subjects, exams, attendance, marks, documents) is isolated by `institution_id`. Cross-tenant access is strictly blocked at the API layer.
*   **Normalized PostgreSQL Database**: 20+ normalized database tables managed via additive migrations (`server/migrate.js`).
*   **Secure Authentication & Session Management**: JWT access tokens coupled with HTTP-only refresh cookies (`campusflow_session`), atomic session creation in `user_sessions`, and password hashing via `bcryptjs` (cost 12).
*   **Role-Based Access Control (RBAC)**: Backend role enforcement (`SUPER_ADMIN`, `PRINCIPAL`, `HOD`, `FACULTY`, `EXAM_CELL`, `STUDENT`) on every API endpoint.
*   **First-Time Setup Wizard**: Guided institutional onboarding for setup of first institution and initial `SUPER_ADMIN` account. Public registration is restricted to `STUDENT` accounts only.
*   **Constraint-Based Timetable Engine**: Deterministic timetable generator evaluating faculty clashes, room clashes, section clashes, room capacity, lab requirements (lab room + 2 consecutive slots), unavailable slots, and lunch breaks. Conflicts prevent DB write and return clear HTTP 409 conflict reports.
*   **Anti-Cheat Exam Seating Planner**: Seat allocation using real registered students. Explicit bench-level mixing rules (`canShareBench`) enforce different subject, different year, and different section constraints per bench.
*   **Attendance & Defaulter System**: Session-wise attendance recording with attendance percentage tracking and automated defaulter filtering (< 75%).
*   **Marks & Assessment Module**: Multi-component grading (internal, midterm, final) with component locking, single/bulk entry, and score validation.
*   **Document Generation & Verification**: Client-side document generation (PDF/DOCX) for Fee Receipts, Hall Tickets, Attendance Summaries, and Official Letters. Backend verification endpoint (`/api/verify/document/:id`).

---

## 🛠️ Technology Stack

```mermaid
graph TD
    Client[React 19 Frontend - Vite] <-->|HTTP REST & JWT Bearer / Cookies| ExpressApp[Express 5 API Server]
    ExpressApp <-->|pg Client Pool| Postgres[(PostgreSQL 16 Database)]
```

### 1. Frontend
*   **Framework**: React 19, React Router DOM (v7).
*   **State Management**: `AuthContext.jsx` for authentication state & JWT lifecycle; `DataContext.jsx` for API data fetching.
*   **Styling**: Vanilla CSS with custom HSL theme variables.
*   **Charts & Icons**: Recharts & Lucide React.

### 2. Backend
*   **Framework**: Node.js 20+, Express 5.
*   **Database Client**: `pg` pool connecting to PostgreSQL 16.
*   **Security**: Helmet headers, CORS policies, Express rate limiting, bcryptjs password hashing.

### 3. Database
*   **Engine**: PostgreSQL 16 Alpine.
*   **Migrations**: Automated migration runner (`node server/migrate.js`) executing SQL scripts in `server/migrations/`.

---

## 🔑 Authentication & Setup Workflow

1.  **Initial Setup Wizard**: On a fresh database, accessing the web app opens the Setup Wizard (`POST /api/auth/setup`). This creates the initial `Institution` and primary `SUPER_ADMIN` account.
2.  **Public Registration**: Public user signup (`POST /api/auth/register`) is strictly limited to creating `STUDENT` accounts. Unrestricted public institution/admin creation is disabled.
3.  **Session Security**: Successful logins generate an access token and record a secure HTTP-only refresh session token in the database (`user_sessions`).

---

## 📡 API Reference

All protected endpoints require a `Bearer <token>` Authorization header or valid session cookie.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **GET** | `/api/health` | Backend status & PostgreSQL database health check |
| **GET** | `/api/auth/setup-status` | Check if initial institution setup is completed |
| **POST** | `/api/auth/setup` | Create first institution and SUPER_ADMIN account |
| **POST** | `/api/auth/login` | Authenticate user & issue access token + refresh cookie |
| **POST** | `/api/auth/register` | Student account registration |
| **POST** | `/api/auth/refresh` | Rotate refresh token and issue new access token |
| **POST** | `/api/auth/logout` | Revoke session and clear refresh cookie |
| **GET** | `/api/auth/me` | Fetch active authenticated profile & roles |
| **GET/POST/PUT/DELETE** | `/api/departments` | Department management (tenant isolated) |
| **GET/POST/PUT/DELETE** | `/api/academic/*` | Programs, semesters, and sections management |
| **GET/POST/PUT/DELETE** | `/api/faculty` | Faculty members management |
| **GET/POST/PUT/DELETE** | `/api/students` | Student records management |
| **GET/POST/PUT/DELETE** | `/api/subjects` | Course subjects management |
| **GET/POST** | `/api/attendance/*` | Attendance sessions, records, percentage, & defaulters |
| **GET/POST/PUT** | `/api/marks/*` | Mark components, lock, single, & bulk mark entry |
| **GET/POST/PUT/DELETE** | `/api/exams/*` | Exam setup, subjects, halls, registrations, seating |
| **GET/POST/PUT/DELETE** | `/api/timetable/*` | Timetable grid, generation engine, move validation |
| **GET/POST** | `/api/documents` | Document metadata & verification (`/api/verify/document/:id`) |
| **GET** | `/api/audit` | System audit logs (tenant isolated) |

---

## 📦 Environment Variables & Security

Copy `.env.example` to `.env` before starting the application:

```bash
cp .env.example .env
```

Key environment variables:
*   `API_PORT`: Express server port (default: `4000`)
*   `CLIENT_ORIGIN`: Allowed CORS origin (default: `http://localhost:5173`)
*   `DATABASE_URL`: PostgreSQL connection string (`postgres://user:password@host:5432/dbname`)
*   `POSTGRES_PASSWORD`: Database password for Docker Compose
*   `AUTH_ACCESS_TOKEN_SECRET`: Secret key for JWT access tokens
*   `AUTH_REFRESH_TOKEN_SECRET`: Secret key for JWT refresh tokens
*   `SESSION_COOKIE_NAME`: Cookie name for session tokens (default: `campusflow_session`)
*   `BCRYPT_COST`: Password hash salt rounds (default: `12`)

*Note: `.env` is listed in `.gitignore` and must never be committed to source control.*

---

## 🚀 Development Commands

```bash
# Spin up local PostgreSQL container via Docker
npm run db:up

# Run database schema migrations
npm run db:migrate

# Launch concurrent Express backend and Vite frontend dev servers
npm run dev

# Run Express backend server only (Port 4000)
npm run server

# Run Vite frontend dev server only (Port 5173)
npm run client

# Stop local PostgreSQL container
npm run db:down
```

---

## 🐳 Docker Deployment

To run CampusFlow ERP using Docker Compose:

```bash
docker compose up -d --build
```

This starts:
1. `campusflow-postgres`: PostgreSQL 16 container.
2. `campusflow-app`: Production container running Nginx & Express backend.
