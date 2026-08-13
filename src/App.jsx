import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider, useData } from './context/DataContext';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import SetupWizard from './pages/SetupWizard';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import TimetablePage from './pages/TimetablePage';
import ExamSeatingPage from './pages/ExamSeatingPage';
import AttendancePage from './pages/AttendancePage';
import MarksPage from './pages/MarksPage';
import DepartmentsPage from './pages/DepartmentsPage';
import FacultyPage from './pages/FacultyPage';
import StudentsPage from './pages/StudentsPage';
import SubjectsPage from './pages/SubjectsPage';
import ClassroomsPage from './pages/ClassroomsPage';
import DocumentsPage from './pages/DocumentsPage';
import NotificationsPage from './pages/NotificationsPage';
import AuditLogsPage from './pages/AuditLogsPage';
import SettingsPage from './pages/SettingsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import VerificationPage from './pages/VerificationPage';
import { CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { useLocation } from 'react-router-dom';

function ToastContainer() {
  const { toasts } = useData();
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 400, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} className="toast" style={{
          background: t.type === 'error' ? 'var(--error)' : t.type === 'warning' ? 'var(--warning)' : t.type === 'info' ? 'var(--accent)' : 'var(--success)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {t.type === 'error' ? <AlertTriangle size={18} /> : t.type === 'info' ? <Info size={18} /> : <CheckCircle size={18} />}
          {t.message}
        </div>
      ))}
    </div>
  );
}

function AppLayout() {
  const { user } = useAuth();
  const { setupDone, dataLoading, dataError } = useData();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  // Public document verification page (accessible without login)
  if (location.pathname.startsWith('/verify')) {
    return (
      <Routes>
        <Route path="/verify/document/:documentId" element={<VerificationPage />} />
        <Route path="/verify/document" element={<VerificationPage />} />
        <Route path="/verify/:documentId" element={<VerificationPage />} />
        <Route path="*" element={<VerificationPage />} />
      </Routes>
    );
  }

  if (dataLoading) {
    return (
      <div className="page-content" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div className="card" style={{ width: 320, textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <h3>Loading CampusFlow</h3>
          <p className="text-muted">Please wait while your data loads...</p>
        </div>
      </div>
    );
  }

  // First time: show setup wizard
  if (!setupDone) return <SetupWizard />;

  // Not logged in: show login
  if (!user) return <LoginPage />;

  return (
    <div className="app-layout">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className={`main-area ${collapsed ? 'collapsed' : ''}`}>
        <Topbar onToggle={() => setCollapsed(!collapsed)} />
        <main className="page-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/timetable" element={<TimetablePage />} />
            <Route path="/exams" element={<ExamSeatingPage />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/marks" element={<MarksPage />} />
            <Route path="/departments" element={<DepartmentsPage />} />
            <Route path="/faculty" element={<FacultyPage />} />
            <Route path="/students" element={<StudentsPage />} />
            <Route path="/subjects" element={<SubjectsPage />} />
            <Route path="/classrooms" element={<ClassroomsPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/audit" element={<AuditLogsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
      {dataError && (
        <div className="toast" style={{ position: 'fixed', left: 24, bottom: 24, zIndex: 410, background: 'var(--warning)' }}>
          ⚠️ Operating in offline mode. Changes will sync when connection is restored.
        </div>
      )}
      <ToastContainer />
    </div>
  );
}

/**
 * Inner wrapper: has access to AuthContext so it can pass getAccessToken to DataProvider.
 * This avoids circular context dependencies.
 */
function AppWithAuth() {
  const { getAccessToken } = useAuth();
  return (
    <DataProvider getAccessToken={getAccessToken}>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </DataProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppWithAuth />
    </AuthProvider>
  );
}
