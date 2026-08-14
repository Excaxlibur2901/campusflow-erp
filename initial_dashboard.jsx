import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import {
  Users, GraduationCap, BookOpen, Building, Calendar, ClipboardList,
  UserCheck, Clock, TrendingUp, TrendingDown,
  FileText, BarChart3, Activity
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area
} from 'recharts';

const COLORS = ['#2E75B6', '#1B3A6B', '#16A34A', '#D97706', '#DC2626', '#8b5cf6'];

function StatCard({ icon: Icon, iconBg, value, label, trend, trendDir }) {
  return (
    <div className="stat-card slide-up">
      <div className="stat-icon" style={{ background: iconBg }}>
        <Icon size={24} color="#fff" />
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {trend && (
        <div className={`stat-trend ${trendDir === 'up' ? 'trend-up' : 'trend-down'}`}>
          {trendDir === 'up' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {trend}
        </div>
      )}
    </div>
  );
}

function AdminDashboard() {
  const { departments, facultyList, studentsList, examsList, notificationsList, classroomsList } = useData();

  const attendanceData = departments.map(d => ({
    name: d.code,
    attendance: Math.floor(Math.random() * 15 + 75),
  }));

  const workloadData = [
    { week: 'W1', CSE: 18, ECE: 16, ME: 15 }, { week: 'W2', CSE: 20, ECE: 17, ME: 16 },
    { week: 'W3', CSE: 19, ECE: 18, ME: 17 }, { week: 'W4', CSE: 21, ECE: 16, ME: 18 },
  ];

  const occupied = classroomsList.filter(r => r.type === 'lab').length;
  const free = classroomsList.filter(r => r.type === 'lecture').length;
  const roomUtil = [
    { name: 'Occupied', value: Math.round((occupied / classroomsList.length) * 100) || 68 },
    { name: 'Free', value: Math.round((free / classroomsList.length) * 100) || 24 },
    { name: 'Maintenance', value: 8 },
  ];

  const weeklyTrend = [
    { day: 'Mon', present: 92, absent: 8 }, { day: 'Tue', present: 88, absent: 12 },
    { day: 'Wed', present: 90, absent: 10 }, { day: 'Thu', present: 85, absent: 15 },
    { day: 'Fri', present: 82, absent: 18 }, { day: 'Sat', present: 75, absent: 25 },
  ];

  return (
    <>
      <div className="stats-grid">
        <StatCard icon={Building} iconBg="linear-gradient(135deg, #1B3A6B, #2E75B6)" value={departments.length} label="Active Departments" trend={`${departments.length} total`} trendDir="up" />
        <StatCard icon={GraduationCap} iconBg="linear-gradient(135deg, #2E75B6, #60a5fa)" value={facultyList.length} label="Total Faculty" trend={`${facultyList.filter(f => f.currentHours < f.maxHours).length} available`} trendDir="up" />
        <StatCard icon={Users} iconBg="linear-gradient(135deg, #16A34A, #4ade80)" value={studentsList.length.toLocaleString()} label="Total Students" trend={`${studentsList.filter(s => s.attendance >= 75).length} regular`} trendDir="up" />
        <StatCard icon={ClipboardList} iconBg="linear-gradient(135deg, #D97706, #fbbf24)" value={examsList.length} label="Exam Events" trend={`${examsList.filter(e => e.status === 'upcoming').length} upcoming`} trendDir="up" />
      </div>
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-title"><BarChart3 size={18} color="var(--accent)" />Department-wise Attendance (%)</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={attendanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)' }} />
              <Bar dataKey="attendance" fill="var(--accent)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <div className="chart-title"><Activity size={18} color="var(--accent)" />Classroom Utilization</div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={roomUtil} cx="50%" cy="50%" innerRadius={70} outerRadius={110} dataKey="value" paddingAngle={3}>
                {roomUtil.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-title"><TrendingUp size={18} color="var(--accent)" />Faculty Workload Trend (hours/week)</div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={workloadData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="CSE" stroke="#2E75B6" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="ECE" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="ME" stroke="#16A34A" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <div className="chart-title"><UserCheck size={18} color="var(--accent)" />Weekly Attendance Trend</div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={weeklyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Area type="monotone" dataKey="present" stackId="1" stroke="#16A34A" fill="#dcfce7" />
              <Area type="monotone" dataKey="absent" stackId="1" stroke="#DC2626" fill="#fee2e2" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="table-container">
        <div className="table-header">
          <span className="table-title">Recent Activity</span>
          <span className="badge badge-info">{notificationsList.length} items</span>
        </div>
        <table>
          <thead><tr><th>Type</th><th>Description</th><th>Time</th><th>Status</th></tr></thead>
          <tbody>
            {notificationsList.slice(0, 5).map(n => (
              <tr key={n.id}>
                <td><span className={`badge ${n.type === 'exam' ? 'badge-warning' : n.type === 'attendance' ? 'badge-error' : 'badge-info'}`}>{n.type}</span></td>
                <td style={{ fontWeight: 500 }}>{n.title}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{n.time}</td>
                <td>{n.read ? <span className="badge badge-neutral">Read</span> : <span className="badge badge-success">New</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FacultyDashboard() {
  const todayLectures = [
    { time: '9:00 - 9:50', subject: 'Data Structures', room: 'LH-101', section: 'A', type: 'theory' },
    { time: '11:00 - 11:50', subject: 'DSA Lab', room: 'LAB-CSE-1', section: 'A', type: 'lab' },
    { time: '2:30 - 3:20', subject: 'Data Structures', room: 'LH-201', section: 'B', type: 'theory' },
  ];
  return (
    <>
      <div className="stats-grid">
        <StatCard icon={Calendar} iconBg="linear-gradient(135deg, #2E75B6, #60a5fa)" value={todayLectures.length} label="Today's Lectures" />
        <StatCard icon={Clock} iconBg="linear-gradient(135deg, #D97706, #fbbf24)" value="18/22" label="Weekly Hours Used" />
        <StatCard icon={UserCheck} iconBg="linear-gradient(135deg, #16A34A, #4ade80)" value="2" label="Attendance Pending" />
        <StatCard icon={FileText} iconBg="linear-gradient(135deg, #8b5cf6, #a78bfa)" value="1" label="Marks Entry Pending" />
      </div>
      <div className="chart-card" style={{ marginBottom: 20 }}>
        <div className="chart-title"><Calendar size={18} color="var(--accent)" />Today's Schedule</div>
        <table>
          <thead><tr><th>Time</th><th>Subject</th><th>Room</th><th>Section</th><th>Type</th><th>Action</th></tr></thead>
          <tbody>
            {todayLectures.map((l, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{l.time}</td>
                <td>{l.subject}</td>
                <td><span className="badge badge-info">{l.room}</span></td>
                <td>{l.section}</td>
                <td><span className={`badge ${l.type === 'lab' ? 'badge-warning' : 'badge-neutral'}`}>{l.type}</span></td>
                <td><button className="btn btn-accent btn-sm">Mark Attendance</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StudentDashboard() {
  const mySubjects = [
    { name: 'Data Structures', code: 'CS301', attendance: 88, status: 'safe' },
    { name: 'DBMS', code: 'CS302', attendance: 92, status: 'safe' },
    { name: 'OS', code: 'CS303', attendance: 74, status: 'danger' },
    { name: 'Networks', code: 'CS304', attendance: 80, status: 'safe' },
    { name: 'DSA Lab', code: 'CS305', attendance: 95, status: 'safe' },
  ];
  const avgAttendance = (mySubjects.reduce((a, s) => a + s.attendance, 0) / mySubjects.length).toFixed(1);
  return (
    <>
      <div className="stats-grid">
        <StatCard icon={Calendar} iconBg="linear-gradient(135deg, #2E75B6, #60a5fa)" value="4" label="Today's Lectures" />
        <StatCard icon={UserCheck} iconBg="linear-gradient(135deg, #16A34A, #4ade80)" value={`${avgAttendance}%`} label="Overall Attendance" />
        <StatCard icon={ClipboardList} iconBg="linear-gradient(135deg, #D97706, #fbbf24)" value="1" label="Upcoming Exams" />
        <StatCard icon={FileText} iconBg="linear-gradient(135deg, #8b5cf6, #a78bfa)" value="Yes" label="Hall Ticket Ready" />
      </div>
      <div className="chart-card" style={{ marginBottom: 20 }}>
        <div className="chart-title"><UserCheck size={18} color="var(--accent)" />Subject-wise Attendance</div>
        <table>
          <thead><tr><th>Subject</th><th>Code</th><th>Attendance</th><th>Status</th></tr></thead>
          <tbody>
            {mySubjects.map((s, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500 }}>{s.name}</td>
                <td style={{ color: 'var(--text-muted)' }}>{s.code}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="progress-bar" style={{ width: 120 }}>
                      <div className="progress-fill" style={{ width: `${s.attendance}%`, background: s.attendance >= 75 ? 'var(--success)' : 'var(--error)' }} />
                    </div>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{s.attendance}%</span>
                  </div>
                </td>
                <td>
                  <span className={`badge ${s.status === 'safe' ? 'badge-success' : 'badge-error'}`}>
                    {s.status === 'safe' ? 'Γ£ô Safe' : 'ΓÜá At Risk'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { examsList, classroomsList, studentsList, facultyList, departments, settings } = useData();
  const role = user?.role;
  const greeting = new Date().getHours() < 12 ? 'Good Morning' : new Date().getHours() < 17 ? 'Good Afternoon' : 'Good Evening';
  const isEmpty = departments.length === 0 && facultyList.length === 0 && studentsList.length === 0;

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-actions">
          <div>
            <h1>{greeting}, {user?.name?.split(' ')[0]} ≡ƒæï</h1>
            <p>{settings.institutionName ? `${settings.institutionName} ΓÇö ` : ''}Here's what's happening today.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm"><FileText size={16} /> Export Report</button>
            <button className="btn btn-primary btn-sm"><Calendar size={16} /> Academic Year 2025-26</button>
          </div>
        </div>
      </div>
      {isEmpty && (role === 'Super Admin' || role === 'Principal' || role === 'HOD') && (
        <div className="card" style={{ textAlign: 'center', padding: 40, marginBottom: 24 }}>
          <h2 style={{ marginBottom: 12 }}>≡ƒÜÇ Getting Started</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24, maxWidth: 500, margin: '0 auto 24px' }}>
            Your institution is set up! Now add your data step by step:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, maxWidth: 700, margin: '0 auto' }}>
            {[
              { label: '1. Add Faculty', href: '/faculty', icon: GraduationCap, count: facultyList.length },
              { label: '2. Add Subjects', href: '/subjects', icon: BookOpen, count: 0 },
              { label: '3. Add Students', href: '/students', icon: Users, count: studentsList.length },
            ].map((item, i) => (
              <a key={i} href={item.href} className="card" style={{ textDecoration: 'none', textAlign: 'center', cursor: 'pointer', border: item.count > 0 ? '2px solid var(--success)' : '2px dashed var(--border)' }}>
                <item.icon size={28} color={item.count > 0 ? 'var(--success)' : 'var(--accent)'} style={{ marginBottom: 8 }} />
                <div style={{ fontWeight: 700, fontSize: 14 }}>{item.label}</div>
                {item.count > 0 && <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 4 }}>Γ£ô {item.count} added</div>}
              </a>
            ))}
          </div>
        </div>
      )}
      {(role === 'Super Admin' || role === 'Principal' || role === 'HOD') && <AdminDashboard />}
      {role === 'Faculty' && <FacultyDashboard />}
      {role === 'Student' && <StudentDashboard />}
      {role === 'Exam Cell' && (
        <>
          <div className="stats-grid">
            <StatCard icon={ClipboardList} iconBg="linear-gradient(135deg, #D97706, #fbbf24)" value={examsList.filter(e => e.status === 'upcoming').length} label="Upcoming Exams" />
            <StatCard icon={Building} iconBg="linear-gradient(135deg, #2E75B6, #60a5fa)" value={classroomsList.length} label="Halls Configured" />
            <StatCard icon={Users} iconBg="linear-gradient(135deg, #16A34A, #4ade80)" value={studentsList.length.toLocaleString()} label="Students to Seat" />
            <StatCard icon={GraduationCap} iconBg="linear-gradient(135deg, #8b5cf6, #a78bfa)" value={facultyList.length} label="Invigilators Pool" />
          </div>
        </>
      )}
    </div>
  );
}
