# CampusFlow ERP Codebase Audit

Date: 2026-08-13

## Scope

This is the Phase A audit requested before any rebuild or feature rewrite. The goal is to identify what can be preserved, what is partial, what is demo/fake, what must be rebuilt, and the safest order for productionization.

## Current Architecture

- Frontend: React + Vite single page application under `src/`.
- Backend: Express server under `server/` with only health, state fetch, state patch, and reset endpoints.
- Database: PostgreSQL is used, but only through one `app_state` table containing a single JSONB document.
- State management: `DataContext.jsx` mirrors the JSONB state into many React state slices and also writes every slice to browser `localStorage`.
- Authentication: `AuthContext.jsx` is entirely frontend-only, with hardcoded demo accounts and plaintext local user-created accounts in `localStorage`.
- Authorization: role-specific sidebar menus exist, but there is no backend authorization and no route/API enforcement.
- Documents: PDF/DOCX generation exists client-side and should be preserved where practical.
- Deployment: Docker and nginx exist, but the production compose file still uses hardcoded database credentials and wildcard CORS.

## What Is Implemented Correctly Enough To Preserve

- Existing module UI structure and visual identity can be preserved: dashboard, setup wizard, management pages, timetable, exam seating, attendance, documents, notifications, audit logs, settings.
- Basic CRUD screens for departments, faculty, students, subjects, classrooms, and exams are usable as frontend workflows.
- Client-side document generation with `jsPDF`, `jspdf-autotable`, and `docx` is a useful foundation.
- College letterhead/header configuration exists and should be improved rather than replaced.
- Build pipeline works when run outside the restricted sandbox: `npm run build` completed successfully.
- Docker/nginx scaffolding exists and can be hardened rather than recreated.

## Partially Implemented

- PostgreSQL persistence exists, but as one JSONB state blob, not normalized tables.
- Timetable generation checks some faculty/room usage while generating, but it is not a full constraint solver and has no validation report.
- Attendance persists submitted sessions inside JSON state, but has no normalized sessions/records, duplicate prevention, audit protection, or recalculated student-level percentages.
- Document generation creates files and stores document metadata, but verification is not backed by server tokens/status records.
- Audit logs are recorded by frontend helper calls, but are editable as part of public state and use hardcoded actor values in places.
- Backup is a frontend JSON download only; restore is not implemented as a controlled database restore.
- Settings has security fields such as JWT expiry and bcrypt cost, but they are display/configuration-only and do not drive backend behavior.
- Role-specific dashboard/sidebar behavior exists, but it is purely client-side.

## Fake, Demo, Or Unsafe Functionality

- Authentication uses hardcoded plaintext demo credentials in `src/context/AuthContext.jsx`.
- User registration stores plaintext passwords in browser `localStorage`.
- Any browser can call `PATCH /api/state` or `POST /api/reset` without authentication.
- Exam seating creates synthetic roll numbers and random absences in `src/pages/ExamSeatingPage.jsx`; it does not use registered exam students.
- Seating displays zero adjacency violations as a hardcoded statistic after allocation.
- QR verification is explicitly a QR-like visual pattern, not a scannable QR code, in `src/utils/qrCode.js`.
- Forgot password only tells users to contact an administrator.
- Security settings in the UI do not implement JWTs, bcrypt, HTTPS enforcement, or refresh-token behavior.
- Notifications are local/in-app only and not structured as server-generated events.
- README overstates several production/security properties compared with actual implementation.

## Major Gaps

- No normalized schema, migrations, or migration runner.
- No server-side users, roles, permissions, sessions, password hashing, failed-login controls, activation/deactivation, or password reset architecture.
- No backend validators, request schemas, centralized typed domain errors, rate limiting, Helmet headers, CSRF strategy, or file upload controls.
- No backend module APIs for students, faculty, subjects, rooms, timetable, exams, seating, attendance, marks, documents, notifications, audit logs, backup/restore, or settings.
- No marks module is present.
- No CSV/Excel import system is present.
- No exam registration data model is present.
- No real timetable validation/scoring report.
- No real seating scoring/validation report.
- No document verification endpoint/page.
- No automated tests are configured.
- No pagination at the API/database layer.

## Database Migration Requirements

Create additive migrations that preserve the existing `app_state` table until data has been migrated and verified. Required normalized tables include:

- Identity/RBAC: `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `sessions`, `password_reset_tokens`, `login_attempts`.
- Academic structure: `institutions`, `departments`, `programs`, `academic_years`, `semesters`, `sections`.
- People: `students`, `faculty`, `faculty_subjects`.
- Curriculum: `subjects`, `subject_offerings`.
- Rooms: `classrooms`, `classroom_resources`.
- Timetable: `time_slots`, `timetable_entries`, `timetable_constraints`.
- Exams/seating: `exams`, `exam_subjects`, `exam_registrations`, `exam_halls`, `hall_seats`, `seat_allocations`.
- Attendance: `attendance_sessions`, `attendance_records`.
- Marks: `mark_components`, `marks`.
- Documents: `documents`, `document_templates`, `document_verifications`.
- System: `notifications`, `audit_logs`, `settings`, `backups`.

Migration strategy:

1. Add migration runner and schema migrations without deleting `app_state`.
2. Add import/migration code that reads current JSONB arrays and writes normalized rows in transactions.
3. Keep compatibility reads from `app_state` during transition.
4. Switch one module at a time from JSON state to real APIs.
5. After all modules are migrated and verified, archive or retire `app_state`.

## Recommended Implementation Order

1. Stabilize baseline: fix lint errors, add test framework, add server structure, and document `.env.example` safe placeholders.
2. Add migration runner and normalized schema.
3. Implement auth/RBAC backend first, then protect all existing state/reset endpoints immediately.
4. Build module APIs and migrate management entities: departments, programs, sections, students, faculty, subjects, classrooms.
5. Replace frontend `DataContext` JSON patching with API clients module by module.
6. Implement audit logging server-side and make every mutation write audit records.
7. Implement attendance sessions/records and percentage calculations.
8. Implement marks/components/locking.
9. Implement exam subjects/registrations, then replace seating with real registered-student allocation and validation.
10. Implement timetable constraints, generation, validation, and reporting.
11. Implement document verification records, real QR generation, `/verify/document/:documentId`, and revocation/expiry.
12. Add CSV/Excel import with templates, preflight validation, and transactional commits.
13. Add backup/restore architecture.
14. Harden security, deployment, Docker, CORS, headers, error handling, and logging.
15. Add performance work: API pagination, indexes, payload shaping, frontend table virtualization where needed, and code splitting.

## Baseline Verification

- `npm run build`: passed outside the restricted sandbox. Vite reported a large chunk warning for `dist/assets/index-*.js`.
- `npm run lint`: failed with 12 errors and 3 warnings.

Lint failures observed:

- Unused destructured `_pw` variables in `src/context/AuthContext.jsx`.
- Unused variables/imports in `AnalyticsPage.jsx`, `Dashboard.jsx`, `DocumentsPage.jsx`, `LoginPage.jsx`, and `officialDownloads.js`.
- React hook dependency warnings in `AttendancePage.jsx`.

## Immediate Phase B Readiness Checklist

- [ ] Fix lint baseline.
- [ ] Add migration tool and `server/migrations`.
- [ ] Add safe `DATABASE_URL`, auth secret, cookie, and CORS placeholders to `.env.example`.
- [ ] Create normalized schema migrations with indexes and foreign keys.
- [ ] Add development seed strategy with hashed passwords only.
- [ ] Protect or remove public `/api/reset` before any production deployment.
- [ ] Add tests for auth, schema, and first migrated module.

