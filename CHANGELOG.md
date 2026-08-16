# Changelog

## Bug Fixes

### 1. Timetable Generation
- Refactored `POST /api/timetable/generate` in `server/routes/timetable.js` to filter subjects and sections by semester.
- Ensured `faculty_id` is correctly mapped to subjects before passing data to the scheduling engine.

### 2. Semester Persistence
- Added `semester` column to `subjects` and `students` tables via database migration (`005_add_subject_faculty_and_semester.sql`).
- Updated `server/routes/subjects.js` and `server/routes/students.js` to handle `semester` fields in CRUD operations.
- Updated `src/pages/SubjectsPage.jsx`, `src/pages/StudentsPage.jsx`, and `src/pages/MarksPage.jsx` to fetch and filter data based on the selected semester.

### 3. Faculty Assignment to Subjects
- Added `faculty_id` (foreign key to `faculty` table) column to the `subjects` table via migration.
- Updated `server/routes/subjects.js` to support assigning a faculty member to a subject.
- Updated `src/pages/SubjectsPage.jsx` UI to include a dropdown for faculty selection.

### 4. Setup Wizard on Login Page
- Added a `setupDone` check in `src/pages/LoginPage.jsx`.
- If the system is not initialized (no college registered), a "Register College" button is now displayed, redirecting to the `/setup` wizard.
