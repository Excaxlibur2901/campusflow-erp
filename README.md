# CampusFlow ERP

CampusFlow ERP is a Vite + React application with a small Node API and PostgreSQL persistence.

## Requirements

- Node.js 20+
- Docker Desktop, or a local PostgreSQL server

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template:

   ```bash
   copy .env.example .env
   ```

3. Start PostgreSQL with Docker:

   ```bash
   npm run db:up
   ```

4. Start the API and React app together:

   ```bash
   npm run dev
   ```

The React app runs at `http://localhost:5173`. The API runs at `http://localhost:4000` and creates the `app_state` PostgreSQL table automatically on startup.

## Database

The app stores ERP data in PostgreSQL as a JSONB document in `app_state`. The browser no longer depends on `localStorage` as the source of truth; it only keeps a local cache so the UI can still render if the API is temporarily unavailable.

Useful API checks:

```bash
curl http://localhost:4000/api/health
curl http://localhost:4000/api/state
```
