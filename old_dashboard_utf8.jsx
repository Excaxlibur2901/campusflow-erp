import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import {
  Users, GraduationCap, BookOpen, Building, Calendar, ClipboardList,
  UserCheck, Clock, TrendingUp, TrendingDown,
  FileText, BarChart3, Activity, Inbox
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

function EmptyChart({ message }) {
  return (
    <div style={{ height: 260, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: 8 }}>
      <Inbox size={36} strokeWidth={1.5} />
      <p style={{ fontSize: 13 }}>{message}</p>
    </div>
  );
}

function AdminDashboard() {
  const { departments, facultyList, studentsList, examsList, notificationsList, classroomsList, attendanceHistory } = useData();

  // Real department-wise average attendance from studentsList
  const attendanceData = useMemo(() => departments.map(d => {
    const deptStudents = studentsList.filter(s => s.dept === d.code || s.department === d.name);
    const avg = deptStudents.length > 0
      ? Math.round(deptStudents.reduce((a, s) => a + (s.attendance || 0), 0) / deptStudents.length)
      : 0;
    return { name: d.code, attendance: avg };
  }), [departments, studentsList]);

  // Real classroom utilization by type
  const classroomTypes = useMemo(() => {
    if (classroomsList.length === 0) return [];
    const counts = {};
    classroomsList.forEach(r => { counts[r.type || 'Other'] = (counts[r.type || 'Other'] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [classroomsList]);

  // Real weekly attendance trend from history (last 7 records grouped by day name)
  const weeklyTrend = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (attendanceHistory.length === 0) return [];
    return days.map(day => {
      const dayRecords = attendanceHistory.filter(h => {
        const d = new Date(h.date);
        const dayMap = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
        return dayMap[d.getDay()] === day;
      });
      const totalStudents = dayRecords.reduce((a, r) => a + (r.total || 0), 0);
      const totalPresent = dayRecords.reduce((a, r) => a + (r.present || 0), 0);
      return {
        day,
        present: totalStudents > 0 ? Math.round((totalPresent / totalStudents) * 100) : 0,
        absent: totalStudents > 0 ? Math.round(((totalStudents - totalPresent) / totalStudents) * 100) : 0,
      };
    }).filter(d => d.present > 0 || d.absent > 0);
  }, [attendanceHistory]);

  // Faculty workload grouped by department
  const workloadData = useMemo(() => departments.map(d => {
    const deptFaculty = facultyList.filter(f => f.department === d.name);
    const avgLoad = deptFaculty.length > 0
      ? Math.round(deptFaculty.reduce((a, f) => a + (f.currentHours || 0), 0) / deptFaculty.length)
      : 0;
    const avgMax = deptFaculty.length > 0
      ? Math.round(deptFaculty.reduce((a, f) => a + (f.maxHours || 0), 0) / deptFaculty.length)
      : 0;
    return { dept: d.code, currentHours: avgLoad, maxHours: avgMax };
  }), [departments, facultyList]);

  return (
    <>
      <div className="stats-grid">
        <StatCard icon={Building} iconBg="linear-gradient(135deg, #1B3A6B, #2E75B6)" value={departments.length} label="Active Departments" trend={`${departments.length} total`} trendDir="up" />
        <StatCard icon={GraduationCap} iconBg="linear-gradient(135deg, #2E75B6, #60a5fa)" value={facultyList.length} label="Total Faculty" trend={`${facultyList.filter(f => f.currentHours < f.maxHours).length} available`} trendDir="up" />
        <StatCard icon={Users} iconBg="linear-gradient(135deg, #16A34A, #4ade80)" value={studentsList.length.toLocaleString()} label="Total Students" trend={`${studentsList.filter(s => s.attendance >= 75).length} regular`} trendDir="up" />
        <StatCard icon={ClipboardList} iconBg="linear-gradient(135deg, #D97706, #fbbf24)" value={examsList.length} label="Exam Events" trend={`${examsList.filter(e => e.status === 'Upcoming' || e.status === 'upcoming').length} upcoming`} trendDir="up" />
      </div>
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-title"><BarChart3 size={18} color="var(--accent)" />Department-wise Average Attendance (%)</div>
          {attendanceData.length > 0 && attendanceData.some(d => d.attendance > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={attendanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)' }} formatter={(v) => [`${v}%`, 'Attendance']} />
                <Bar dataKey="attendance" fill="var(--accent)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="Mark attendance to see department-wise statistics" />}
        </div>
        <div className="chart-card">
          <div className="chart-title"><Activity size={18} color="var(--accent)" />Classroom Utilization by Type</div>
          {classroomTypes.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={classroomTypes} cx="50%" cy="50%" innerRadius={70} outerRadius={110} dataKey="value" paddingAngle={3} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {classroomTypes.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="Add classrooms to see utilization breakdown" />}
        </div>
      </div>
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-title"><TrendingUp size={18} color="var(--accent)" />Faculty Workload by Department (Avg Hours)</div>
          {workloadData.length > 0 && workloadData.some(d => d.currentHours > 0 || d.maxHours > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={workloadData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="dept" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="currentHours" name="Current Hours" fill="#2E75B6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="maxHours" name="Max Hours" fill="rgba(46,117,182,0.25)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="Add faculty with workload hours to see this chart" />}
        </div>
        <div className="chart-card">
          <div className="chart-title"><UserCheck size={18} color="var(--accent)" />Weekly Attendance Trend</div>
          {weeklyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={weeklyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} unit="%" />
                <Tooltip formatter={(v) => [`${v}%`]} />
                <Area type="monotone" dataKey="present" name="Present %" stackId="1" stroke="#16A34A" fill="#dcfce7" />
                <Area type="monotone" dataKey="absent" name="Absent %" stackId="1" stroke="#DC2626" fill="#fee2e2" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="Submit attendance records to see weekly trends" />}
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
            {notificationsList.length === 0 && (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No activity yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FacultyDashboard() {
  const { user } = useAuth();
  const { timetableSlots, subjectsList, attendanceHistory } = useData();

  // Get today's day name
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayDay = dayNames[new Date().getDay()];

  // Real today's schedule from timetable
  const todayLectures = useMemo(() =>
    timetableSlots.filter(slot =>
      slot.day === todayDay &&
      (slot.faculty === user?.name || slot.facultyId === user?.email)
    ),
    [timetableSlots, todayDay, user]
  );

  // Real pending attendance count
  const submittedKeys = new Set(attendanceHistory.map(h => `${h.subject}_${h.date}`));
  const pendingCount = todayLectures.filter(l => !submittedKeys.has(`${l.subject}_${new Date().toISOString().split('T')[0]}`)).length;

  return (
    <>
      <div className="stats-grid">
        <StatCard icon={Calendar} iconBg="linear-gradient(135deg, #2E75B6, #60a5fa)" value={todayLectures.length} label="Today's Lectures" />
        <StatCard icon={UserCheck} iconBg="linear-gradient(135deg, #16A34A, #4ade80)" value={pendingCount} label="Attendance Pending" />
        <StatCard icon={BookOpen} iconBg="linear-gradient(135deg, #8b5cf6, #a78bfa)" value={subjectsList.length} label="Subjects" />
        <StatCard icon={FileText} iconBg="linear-gradient(135deg, #D97706, #fbbf24)" value={attendanceHistory.length} label="Sessions Submitted" />
      </div>
      <div className="chart-card" style={{ marginBottom: 20 }}>
        <div className="chart-title"><Calendar size={18} color="var(--accent)" />Today's Schedule ΓÇö {todayDay}, {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        {todayLectures.length > 0 ? (
          <table>
            <thead><tr><th>Time</th><th>Subject</th><th>Room</th><th>Section</th><th>Type</th><th>Action</th></tr></thead>
            <tbody>
              {todayLectures.map((l, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{l.time}</td>
                  <td>{l.subject}</td>
                  <td><span className="badge badge-info">{l.room}</span></td>
                  <td>{l.section || 'ΓÇö'}</td>
                  <td><span className={`badge ${l.type === 'lab' ? 'badge-warning' : 'badge-neutral'}`}>{l.type || 'theory'}</span></td>
                  <td><a href="/attendance" className="btn btn-accent btn-sm">Mark Attendance</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state" style={{ padding: 40 }}>
            <Calendar size={36} strokeWidth={1.5} />
            <h3>No lectures scheduled today</h3>
            <p>Your timetable will appear here once configured.</p>
          </div>
        )}
      </div>
    </>
  );
}

function StudentDashboard() {
  const { user } = useAuth();
  const { studentsList, subjectsList, examsList } = useData();

  // Find logged-in student record
  const myRecord = useMemo(() =>
    studentsList.find(s => s.email === user?.email) || studentsList[0],
    [studentsList, user]
  );

  // Subjects for the student's department
  const mySubjects = useMemo(() =>
    subjectsList.filter(s => s.department === myRecord?.department || s.dept === myRecord?.dept),
    [subjectsList, myRecord]
  );

  const avgAttendance = myRecord?.attendance || 0;
  const upcomingExams = examsList.filter(e => e.status === 'Upcoming' || e.status === 'upcoming').length;

  return (
    <>
      <div className="stats-grid">
        <StatCard icon={Calendar} iconBg="linear-gradient(135deg, #2E75B6, #60a5fa)" value={mySubjects.length} label="Enrolled Subjects" />
        <StatCard icon={UserCheck} iconBg="linear-gradient(135deg, #16A34A, #4ade80)" value={`${avgAttendance}%`} label="Overall Attendance" />
        <StatCard icon={ClipboardList} iconBg="linear-gradient(135deg, #D97706, #fbbf24)" value={upcomingExams} label="Upcoming Exams" />
        <StatCard icon={FileText} iconBg="linear-gradient(135deg, #8b5cf6, #a78bfa)" value={upcomingExams > 0 ? 'Available' : 'None'} label="Hall Tickets" />
      </div>
      <div className="chart-card" style={{ marginBottom: 20 }}>
        <div className="chart-title"><UserCheck size={18} color="var(--accent)" />Subject-wise Attendance</div>
        {mySubjects.length > 0 ? (
          <table>
            <thead><tr><th>Subject</th><th>Code</th><th>Semester</th><th>Credits</th><th>Type</th></tr></thead>
            <tbody>
              {mySubjects.map((s, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{s.code}</td>
                  <td>{s.semester}</td>
                  <td>{s.credits}</td>
                  <td><span className={`badge ${s.type === 'Lab' ? 'badge-warning' : 'badge-neutral'}`}>{s.type}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state" style={{ padding: 40 }}>
            <BookOpen size={36} strokeWidth={1.5} />
            <h3>No subjects enrolled yet</h3>
            <p>Subjects assigned to your department will appear here.</p>
          </div>
        )}
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
            <span className="badge badge-neutral" style={{ padding: '8px 14px', fontSize: 13 }}>
              Academic Year {new Date().getFullYear()}-{String(new Date().getFullYear() + 1).slice(2)}
            </span>
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
            <StatCard icon={ClipboardList} iconBg="linear-gradient(135deg, #D97706, #fbbf24)" value={examsList.filter(e => e.status === 'Upcoming' || e.status === 'upcoming').length} label="Upcoming Exams" />
            <StatCard icon={Building} iconBg="linear-gradient(135deg, #2E75B6, #60a5fa)" value={classroomsList.length} label="Halls Configured" />
            <StatCard icon={Users} iconBg="linear-gradient(135deg, #16A34A, #4ade80)" value={studentsList.length.toLocaleString()} label="Students to Seat" />
            <StatCard icon={GraduationCap} iconBg="linear-gradient(135deg, #8b5cf6, #a78bfa)" value={facultyList.length} label="Invigilators Pool" />
          </div>
        </>
      )}
    </div>
  );
}
