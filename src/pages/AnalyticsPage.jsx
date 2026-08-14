import { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { downloadOfficialFile } from '../utils/officialDownloads';
import { BarChart3, TrendingUp, Download, Inbox } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts';

function EmptyChart({ message }) {
  return (
    <div style={{ height: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: 8 }}>
      <Inbox size={36} strokeWidth={1.5} />
      <p style={{ fontSize: 13 }}>{message}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const {
    departments = [],
    facultyList = [],
    studentsList = [],
    examsList = [],
    attendanceHistory = [],
    settings = {},
    showToast,
  } = useData() || {};

  // Real department performance from actual data
  const deptPerformance = useMemo(() => (departments ?? []).map(d => {
    const deptStudents = (studentsList ?? []).filter(s => s?.dept === d?.code || s?.department === d?.name);
    const deptFaculty = (facultyList ?? []).filter(f => f?.department === d?.name || f?.dept === d?.code);
    return {
      name: d?.code || 'N/A',
      fullName: d?.name || 'Department',
      students: deptStudents.length,
      faculty: deptFaculty.length,
      ratio: deptFaculty.length > 0 ? Math.round(deptStudents.length / deptFaculty.length) : 0,
      avgAttendance: deptStudents.length > 0
        ? Math.round(deptStudents.reduce((a, s) => a + (s?.attendance || 0), 0) / deptStudents.length)
        : 0,
    };
  }), [departments, studentsList, facultyList]);

  // Attendance trend from real history — group by month
  const monthlyTrend = useMemo(() => {
    if (attendanceHistory.length === 0) return [];
    const byMonth = {};
    attendanceHistory.forEach(h => {
      if (!h.date) return;
      const month = h.date.substring(0, 7); // YYYY-MM
      if (!byMonth[month]) byMonth[month] = { totalStudents: 0, totalPresent: 0 };
      byMonth[month].totalStudents += h.total || 0;
      byMonth[month].totalPresent += h.present || 0;
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, data]) => ({
        month: new Date(month + '-01').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        sessions: attendanceHistory.filter(h => h.date?.startsWith(month)).length,
        attendance: data.totalStudents > 0 ? Math.round((data.totalPresent / data.totalStudents) * 100) : 0,
      }));
  }, [attendanceHistory]);

  // Student attendance distribution
  const regularStudents = studentsList.filter(s => s.attendance >= 75).length;
  const defaulterStudents = studentsList.filter(s => s.attendance < 75).length;
  const avgAttendance = studentsList.length > 0 ? Math.round(studentsList.reduce((a, s) => a + (s.attendance || 0), 0) / studentsList.length) : 0;

  // Attendance status pie chart
  const attendancePie = studentsList.length > 0 ? [
    { name: 'Regular (≥75%)', value: regularStudents },
    { name: 'Defaulter (<75%)', value: defaulterStudents },
  ].filter(d => d.value > 0) : [];

  const handleExport = async (format) => {
    try {
      await downloadOfficialFile(format, {
        settings,
        title: 'Analytics & Reports',
        subtitle: 'Comprehensive institutional performance analytics',
        details: [
          { label: 'Total Departments', value: departments.length },
          { label: 'Total Faculty', value: facultyList.length },
          { label: 'Total Students', value: studentsList.length },
          { label: 'Average Attendance', value: `${avgAttendance}%` },
          { label: 'Regular Students', value: regularStudents },
          { label: 'Defaulter Students', value: defaulterStudents },
          { label: 'Attendance Submissions', value: attendanceHistory.length },
          { label: 'Total Exams', value: examsList.length },
        ],
        columns: ['Department', 'Students', 'Faculty', 'Student-Faculty Ratio', 'Avg Attendance'],
        rows: deptPerformance.map((d) => [d.name, d.students, d.faculty, `${d.ratio}:1`, `${d.avgAttendance}%`]),
        filename: 'analytics_report',
      });
      showToast(`Analytics report exported as ${format.toUpperCase()}`);
    } catch {
      showToast('Analytics report export failed', 'error');
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header"><div className="page-header-actions">
        <div><h1>Analytics & Reports</h1><p>Comprehensive institutional performance analytics</p></div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-outline btn-sm" onClick={()=>handleExport('pdf')}><Download size={16}/> PDF</button>
          <button className="btn btn-outline btn-sm" onClick={()=>handleExport('docx')}><Download size={16}/> DOCX</button>
        </div>
      </div></div>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card"><div className="stat-value">{studentsList.length}</div><div className="stat-label">Total Students</div></div>
        <div className="stat-card"><div className="stat-value" style={{color:'var(--success)'}}>{avgAttendance > 0 ? `${avgAttendance}%` : '—'}</div><div className="stat-label">Avg Attendance</div></div>
        <div className="stat-card"><div className="stat-value" style={{color:'var(--accent)'}}>{regularStudents}</div><div className="stat-label">Regular Students</div></div>
        <div className="stat-card"><div className="stat-value" style={{color:'var(--error)'}}>{defaulterStudents}</div><div className="stat-label">Defaulters</div></div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-title"><BarChart3 size={18} color="var(--accent)"/>Student-to-Faculty Ratio by Department</div>
          {deptPerformance.length > 0 && deptPerformance.some(d => d.students > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={deptPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis dataKey="name" tick={{fontSize:12}}/>
                <YAxis tick={{fontSize:12}}/>
                <Tooltip formatter={(v, name) => [name === 'ratio' ? `${v}:1` : v, name === 'ratio' ? 'S:F Ratio' : 'Students']}/>
                <Legend />
                <Bar dataKey="students" name="Students" fill="var(--accent)" radius={[4,4,0,0]}/>
                <Bar dataKey="ratio" name="S:F Ratio" fill="#8b5cf6" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="Add departments, faculty, and students to see this chart" />}
        </div>
        <div className="chart-card">
          <div className="chart-title"><TrendingUp size={18} color="var(--accent)"/>Monthly Attendance Trend</div>
          {monthlyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis dataKey="month" tick={{fontSize:12}}/>
                <YAxis yAxisId="left" tick={{fontSize:12}}/>
                <YAxis yAxisId="right" orientation="right" tick={{fontSize:12}} domain={[0,100]} unit="%"/>
                <Tooltip/>
                <Legend/>
                <Line yAxisId="left" type="monotone" dataKey="sessions" name="Sessions" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4 }}/>
                <Line yAxisId="right" type="monotone" dataKey="attendance" name="Attendance %" stroke="var(--success)" strokeWidth={2} dot={{ r: 4 }}/>
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="Submit attendance records to see monthly trends" />}
        </div>
      </div>
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-title">Department Average Attendance (%)</div>
          {deptPerformance.length > 0 && deptPerformance.some(d => d.avgAttendance > 0) ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={deptPerformance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis type="number" domain={[0, 100]} tick={{fontSize:12}} unit="%"/>
                <YAxis dataKey="name" type="category" tick={{fontSize:12}} width={50}/>
                <Tooltip formatter={(v) => [`${v}%`, 'Avg Attendance']}/>
                <Bar dataKey="avgAttendance" name="Avg Attendance" fill="#16A34A" radius={[0,4,4,0]}/>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="Mark attendance to see department comparison" />}
        </div>
        <div className="chart-card">
          <div className="chart-title">Student Attendance Status</div>
          {attendancePie.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={attendancePie} cx="50%" cy="50%" outerRadius={110} dataKey="value" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}>
                  {attendancePie.map((_,i)=><Cell key={i} fill={i === 0 ? '#16A34A' : '#DC2626'}/>)}
                </Pie>
                <Tooltip/>
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="Add students to see attendance status breakdown" />}
        </div>
      </div>
    </div>
  );
}
