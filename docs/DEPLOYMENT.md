# CampusFlow ERP - Deployment & Operations Guide

This guide covers deployment, environment configuration, database migrations, and operational maintenance for CampusFlow ERP.

---

## 1. Prerequisites & Architecture

*   **Operating System**: Linux (Ubuntu 22.04 LTS recommended) / macOS / Windows Server
*   **Database**: PostgreSQL 16
*   **Runtime**: Node.js 20 LTS + npm
*   **Containerization**: Docker & Docker Compose (v2.20+)

---

## 2. Environment Configuration

1. Clone the repository and copy `.env.example`:
   ```bash
   cp .env.example .env
   ```

2. Configure environment variables in `.env`:
   - `API_PORT`: Express backend port (e.g. `4000`)
   - `CLIENT_ORIGIN`: Approved CORS origin for frontend (e.g. `https://erp.yourdomain.com`)
   - `DATABASE_URL`: PostgreSQL connection string (`postgres://campusflow:<password>@postgres:5432/campusflow_erp`)
   - `POSTGRES_PASSWORD`: Secure password for PostgreSQL container
   - `AUTH_ACCESS_TOKEN_SECRET`: 256-bit random hex secret key for JWT access tokens
   - `AUTH_REFRESH_TOKEN_SECRET`: 256-bit random hex secret key for JWT refresh tokens
   - `SESSION_COOKIE_NAME`: Session cookie name (default: `campusflow_session`)
   - `BCRYPT_COST`: Salt rounds for bcrypt password hashing (default: `12`)

3. **Generate Production JWT Secrets**:
   Run the following command to generate 256-bit random secret keys:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

---

## 3. Database Migrations

CampusFlow ERP automatically executes database migrations on server startup via `server/migrate.js`. 

To manually execute or verify migrations:
```bash
npm run db:migrate
```

SQL migration files are located in `server/migrations/`:
- `001_initial_normalized_schema.sql`: 20+ normalized PostgreSQL tables, foreign keys, and indexes.
- `002_seed_initial_data.sql`: System roles and permission lookup entries.

---

## 4. Docker Deployment

### Single-Command Production Start
```bash
docker compose up -d --build
```

This provisions two services:
1. `campusflow-postgres`: Managed PostgreSQL 16 Alpine database container with healthcheck.
2. `campusflow-app`: Production container running Nginx and Express backend.

### Verify Deployment Health
```bash
# Check container status
docker compose ps

# Check API health endpoint
curl http://localhost:4000/api/health

# View application logs
docker compose logs -f app
```

---

## 5. Manual / Bare-Metal Deployment

1. **Install Dependencies**:
   ```bash
   npm install --production=false
   ```

2. **Build Frontend Bundle**:
   ```bash
   npm run build
   ```

3. **Start Production Backend API**:
   ```bash
   NODE_ENV=production npm run server
   ```

4. **Serve Static Assets & Reverse Proxy via Nginx**:
   Configure Nginx reverse proxy to route `/api/*` to `http://127.0.0.1:4000/api/` and serve `dist/` for static assets.
