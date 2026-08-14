import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import CollegeHeader from './CollegeHeader';
import {
  LayoutDashboard, Calendar, ClipboardList, Users, FileText, Bell,
  Settings, Shield, GraduationCap, BookOpen, Building,
  LogOut, BarChart3, UserCheck, Printer, Award
} from 'lucide-react';

const menuByRole = {
  'Super Admin': [
    { group: 'Overview', items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/analytics', icon: BarChart3, label: 'Analytics' },
    ]},
    { group: 'Academics', items: [
      { to: '/timetable', icon: Calendar, label: 'Timetable' },
      { to: '/exams', icon: ClipboardList, label: 'Exam Seating' },
      { to: '/attendance', icon: UserCheck, label: 'Attendance' },
      { to: '/marks', icon: Award, label: 'Marks Management' },
    ]},
    { group: 'Management', items: [
      { to: '/departments', icon: Building, label: 'Departments' },
      { to: '/faculty', icon: GraduationCap, label: 'Faculty' },
      { to: '/students', icon: Users, label: 'Students' },
      { to: '/subjects', icon: BookOpen, label: 'Subjects' },
      { to: '/classrooms', icon: Building, label: 'Classrooms' },
    ]},
    { group: 'System', items: [
      { to: '/documents', icon: FileText, label: 'Documents' },
      { to: '/notifications', icon: Bell, label: 'Notifications' },
      { to: '/audit', icon: Shield, label: 'Audit Logs' },
      { to: '/settings', icon: Settings, label: 'Settings' },
    ]},
  ],
  'Principal': [
    { group: 'Overview', items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/analytics', icon: BarChart3, label: 'Analytics' },
    ]},
    { group: 'Academics', items: [
      { to: '/timetable', icon: Calendar, label: 'Timetables' },
      { to: '/exams', icon: ClipboardList, label: 'Examinations' },
      { to: '/attendance', icon: UserCheck, label: 'Attendance' },
    ]},
    { group: 'Reports', items: [
      { to: '/departments', icon: Building, label: 'Departments' },
      { to: '/documents', icon: FileText, label: 'Documents' },
      { to: '/notifications', icon: Bell, label: 'Notifications' },
    ]},
  ],
  'HOD': [
    { group: 'Overview', items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    ]},
    { group: 'Department', items: [
      { to: '/timetable', icon: Calendar, label: 'Timetable' },
      { to: '/faculty', icon: GraduationCap, label: 'Faculty' },
      { to: '/students', icon: Users, label: 'Students' },
      { to: '/attendance', icon: UserCheck, label: 'Attendance' },
      { to: '/subjects', icon: BookOpen, label: 'Subjects' },
    ]},
    { group: 'Other', items: [
      { to: '/documents', icon: FileText, label: 'Documents' },
      { to: '/notifications', icon: Bell, label: 'Notifications' },
    ]},
  ],
  'Faculty': [
    { group: 'Overview', items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    ]},
    { group: 'Teaching', items: [
      { to: '/timetable', icon: Calendar, label: 'My Timetable' },
      { to: '/attendance', icon: UserCheck, label: 'Mark Attendance' },
    ]},
    { group: 'Other', items: [
      { to: '/documents', icon: FileText, label: 'Documents' },
      { to: '/notifications', icon: Bell, label: 'Notifications' },
    ]},
  ],
  'Exam Cell': [
    { group: 'Overview', items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    ]},
    { group: 'Examinations', items: [
      { to: '/exams', icon: ClipboardList, label: 'Exam Seating' },
      { to: '/classrooms', icon: Building, label: 'Exam Halls' },
      { to: '/documents', icon: Printer, label: 'Print Documents' },
    ]},
    { group: 'Other', items: [
      { to: '/notifications', icon: Bell, label: 'Notifications' },
    ]},
  ],
  'Student': [
    { group: 'Overview', items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    ]},
    { group: 'Academics', items: [
      { to: '/timetable', icon: Calendar, label: 'My Timetable' },
      { to: '/attendance', icon: UserCheck, label: 'Attendance' },
      { to: '/exams', icon: ClipboardList, label: 'Exams' },
    ]},
    { group: 'Other', items: [
      { to: '/documents', icon: FileText, label: 'Hall Tickets' },
      { to: '/notifications', icon: Bell, label: 'Notices' },
    ]},
  ],
};

export default function Sidebar({ collapsed }) {
  const { user, logout } = useAuth();
  const { settings = {} } = useData() || {};
  const location = useLocation();

  const roleCode = Array.isArray(user?.roles) && user.roles[0] ? user.roles[0] : (user?.role || '');
  const roleNameMap = {
    SUPER_ADMIN: 'Super Admin',
    'Super Admin': 'Super Admin',
    PRINCIPAL: 'Principal',
    Principal: 'Principal',
    HOD: 'HOD',
    FACULTY: 'Faculty',
    Faculty: 'Faculty',
    EXAM_CELL: 'Exam Cell',
    'Exam Cell': 'Exam Cell',
    STUDENT: 'Student',
    Student: 'Student',
  };
  const resolvedRole = roleNameMap[roleCode] || 'Super Admin';
  const menu = menuByRole[resolvedRole] || menuByRole['Super Admin'] || menuByRole['Student'];

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-brand">
        {collapsed ? (
          settings.collegeLogo ?
            <img src={settings.collegeLogo} alt="Logo" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'contain' }} /> :
            <div className="logo">{(settings.institutionName || 'CF').substring(0, 2).toUpperCase()}</div>
        ) : (
          <CollegeHeader variant="compact" />
        )}
      </div>

      <nav className="sidebar-nav">
        {menu.map((group) => (
          <div key={group.group}>
            <div className="nav-group-title">{group.group}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `nav-item ${isActive && (item.to === '/' ? location.pathname === '/' : true) ? 'active' : ''}`
                }
                end={item.to === '/'}
                title={collapsed ? item.label : ''}
              >
                <item.icon size={20} />
                <span className="nav-label">{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="avatar">{user?.initials}</div>
        <div style={{ overflow: 'hidden', flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{user?.name}</div>
          <div className="role-name">{user?.role}</div>
        </div>
        <button className="toggle-btn" onClick={logout} title="Logout" style={{ color: 'rgba(255,255,255,0.5)' }}>
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
