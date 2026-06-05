import { useData } from '../context/DataContext';
import { downloadOfficialFile } from '../utils/officialDownloads';
import { BarChart3, TrendingUp, Download } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, RadarChart,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';

const COLORS = ['#2E75B6','#1B3A6B','#16A34A','#D97706','#DC2626','#8b5cf6'];

export default function AnalyticsPage() {
  const { departments, facultyList, studentsList, examsList, attendanceHistory, settings, showToast } = useData();

  const deptPerformance = departments.map(d => ({
    name: d.code, students: d.students, faculty: d.faculty,
    ratio: d.faculty > 0 ? Math.round(d.students / d.faculty) : 0,
  }));

  const monthlyTrend = [
    { month: 'Jul', students: studentsList.length - 300, attendance: 88 },
    { month: 'Aug', students: studentsList.length - 200, attendance: 85 },
    { month: 'Sep', students: studentsList.length - 100, attendance: 82 },
    { month: 'Oct', students: studentsList.length, attendance: 84 },
  ];

  const radarData = [
    { metric: 'Attendance', CSE: 87, ECE: 82, ME: 78 },
    { metric: 'Pass Rate', CSE: 92, ECE: 88, ME: 85 },
    { metric: 'Faculty Load', CSE: 85, ECE: 78, ME: 72 },
    { metric: 'Room Usage', CSE: 90, ECE: 80, ME: 75 },
    { metric: 'Satisfaction', CSE: 88, ECE: 84, ME: 80 },
  ];

  const regularStudents = studentsList.filter(s => s.attendance >= 75).length;
  const defaulterStudents = studentsList.filter(s => s.attendance < 75).length;
  const avgAttendance = studentsList.length > 0 ? Math.round(studentsList.reduce((a, s) => a + s.attendance, 0) / studentsList.length) : 0;

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
        columns: ['Department', 'Students', 'Faculty', 'Student-Faculty Ratio'],
        rows: deptPerformance.map((d) => [d.name, d.students, d.faculty, `${d.ratio}:1`]),
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
        <div className="stat-card"><div className="stat-value" style={{color:'var(--success)'}}>{avgAttendance}%</div><div className="stat-label">Avg Attendance</div></div>
        <div className="stat-card"><div className="stat-value" style={{color:'var(--accent)'}}>{regularStudents}</div><div className="stat-label">Regular Students</div></div>
        <div className="stat-card"><div className="stat-value" style={{color:'var(--error)'}}>{defaulterStudents}</div><div className="stat-label">Defaulters</div></div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-title"><BarChart3 size={18} color="var(--accent)"/>Student-to-Faculty Ratio by Department</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={deptPerformance}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="name" tick={{fontSize:12}}/><YAxis tick={{fontSize:12}}/><Tooltip/>
              <Bar dataKey="ratio" fill="var(--accent)" radius={[6,6,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <div className="chart-title"><TrendingUp size={18} color="var(--accent)"/>Monthly Enrollment & Attendance</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="month" tick={{fontSize:12}}/>
              <YAxis yAxisId="left" tick={{fontSize:12}}/><YAxis yAxisId="right" orientation="right" tick={{fontSize:12}} domain={[0,100]}/>
              <Tooltip/><Legend/>
              <Line yAxisId="left" type="monotone" dataKey="students" stroke="var(--accent)" strokeWidth={2}/>
              <Line yAxisId="right" type="monotone" dataKey="attendance" stroke="var(--success)" strokeWidth={2}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-title">Department Comparison Radar</div>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="var(--border)"/><PolarAngleAxis dataKey="metric" tick={{fontSize:11}}/><PolarRadiusAxis angle={30} domain={[0,100]} tick={{fontSize:10}}/>
              <Radar name="CSE" dataKey="CSE" stroke="#2E75B6" fill="#2E75B6" fillOpacity={0.2}/>
              <Radar name="ECE" dataKey="ECE" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2}/>
              <Radar name="ME" dataKey="ME" stroke="#16A34A" fill="#16A34A" fillOpacity={0.2}/>
              <Legend/>
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <div className="chart-title">Student Distribution by Department</div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={departments.map(d=>({name:d.code,value:d.students}))} cx="50%" cy="50%" outerRadius={110} dataKey="value" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}>
                {departments.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
              </Pie>
              <Tooltip/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
