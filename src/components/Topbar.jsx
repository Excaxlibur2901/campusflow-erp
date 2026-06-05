import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Menu, ChevronRight } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

const routeNames = {
  '/': 'Dashboard',
  '/timetable': 'Timetable Scheduler',
  '/exams': 'Exam Seating',
  '/attendance': 'Attendance',
  '/departments': 'Departments',
  '/faculty': 'Faculty Management',
  '/students': 'Student Records',
  '/subjects': 'Subjects',
  '/classrooms': 'Classrooms',
  '/documents': 'Documents',
  '/notifications': 'Notifications',
  '/audit': 'Audit Logs',
  '/settings': 'Settings',
  '/analytics': 'Analytics',
};

const searchableRoutes = Object.entries(routeNames).map(([path, name]) => ({ path, name }));

export default function Topbar({ onToggle }) {
  const { user } = useAuth();
  const { notificationsList } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  const pageName = routeNames[location.pathname] || 'Page';
  const unread = notificationsList.filter(n => !n.read).length;
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef(null);

  const filteredRoutes = searchQuery.trim()
    ? searchableRoutes.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSearch(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="toggle-btn" onClick={onToggle}>
          <Menu size={20} />
        </button>
        <div className="breadcrumb">
          <span>CampusFlow</span>
          <ChevronRight size={14} className="breadcrumb-sep" />
          <span className="current">{pageName}</span>
        </div>
      </div>
      <div className="topbar-right">
        <div style={{ position: 'relative' }} ref={searchRef}>
          <input
            type="text"
            className="form-input search-input"
            placeholder="Search pages..."
            style={{ width: 220, padding: '8px 14px 8px 36px', fontSize: 13 }}
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setShowSearch(true); }}
            onFocus={() => setShowSearch(true)}
          />
          {showSearch && filteredRoutes.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0,
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)',
              zIndex: 100, marginTop: 4, overflow: 'hidden',
            }}>
              {filteredRoutes.map(r => (
                <div
                  key={r.path}
                  style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                  className="search-result-item"
                  onClick={() => { navigate(r.path); setSearchQuery(''); setShowSearch(false); }}
                  onMouseEnter={e => e.target.style.background = 'var(--surface)'}
                  onMouseLeave={e => e.target.style.background = 'transparent'}
                >
                  {r.name}
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="topbar-btn" title="Notifications" onClick={() => navigate('/notifications')}>
          <Bell size={20} />
          {unread > 0 && <span className="notif-badge">{unread}</span>}
        </button>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--primary), var(--accent))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer'
        }}>
          {user?.initials}
        </div>
      </div>
    </header>
  );
}
