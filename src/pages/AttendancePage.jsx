import { useState, useMemo, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { downloadOfficialFile } from '../utils/officialDownloads';
import { UserCheck, Download, AlertTriangle, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function AttendancePage() {
  const { studentsList, subjectsList, departments, submitAttendance, attendanceHistory, settings, showToast } = useData();
  const [activeTab, setActiveTab] = useState('mark');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedSection, setSelectedSection] = useState('A');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedSlot, setSelectedSlot] = useState('Slot 1 (9:00)');
  const [submitted, setSubmitted] = useState(false);
  const [records, setRecords] = useState([]);

  // Set defaults when departments load
  useEffect(() => {
    if (departments.length > 0 && !selectedDept) setSelectedDept(departments[0].code);
  }, [departments]);

  useEffect(() => {
    const deptSubs = subjectsList.filter(s => s.dept === selectedDept);
    if (deptSubs.length > 0 && !deptSubs.find(s => s.code === selectedSubject)) setSelectedSubject(deptSubs[0].code);
  }, [selectedDept, subjectsList]);

  const sectionStudents = useMemo(() =>
    studentsList.filter(s => s.section === selectedSection && s.dept === selectedDept),
  [studentsList, selectedSection, selectedDept]);

  // Reset records when section/dept changes
  useEffect(() => {
    setRecords(sectionStudents.map(s => ({ ...s, status: 'present' })));
    setSubmitted(false);
  }, [selectedSection, selectedDept, studentsList.length]);

  const toggleStatus = (id) => {
    if (submitted) return;
    setRecords(prev => prev.map(r => r.id === id ? { ...r, status: r.status === 'present' ? 'absent' : 'present' } : r));
  };

  const presentCount = records.filter(r => r.status === 'present').length;
  const defaulters = studentsList.filter(s => s.attendance < 75);
  const deptSubjects = subjectsList.filter(s => s.dept === selectedDept);

  const subjectAtt = useMemo(() =>
    deptSubjects.filter(s => s.type === 'theory').map(s => ({
      name: s.code, attendance: Math.floor(Math.random() * 20 + 75),
    })),
  [deptSubjects]);

  const handleSubmit = () => {
    if (records.length === 0) { showToast('No students to mark!', 'warning'); return; }
    submitAttendance({
      subject: selectedSubject, section: selectedSection, dept: selectedDept,
      date: selectedDate, slot: selectedSlot,
      total: records.length, present: presentCount,
      absent: records.length - presentCount,
      records: records.map(r => ({ id: r.id, name: r.name, rollNo: r.rollNo, status: r.status })),
    });
    setSubmitted(true);
  };

  const handleExport = async (format, title = 'Attendance Report') => {
    try {
      await downloadOfficialFile(format, {
        settings,
        title,
        subtitle: `${selectedDept} - ${selectedSubject} - Section ${selectedSection}`,
        details: [
          { label: 'Date', value: selectedDate },
          { label: 'Slot', value: selectedSlot },
          { label: 'Total Students', value: records.length },
          { label: 'Present', value: presentCount },
          { label: 'Absent', value: records.length - presentCount },
          { label: 'Attendance Rate', value: `${records.length ? Math.round((presentCount / records.length) * 100) : 0}%` },
        ],
        columns: ['Roll No', 'Name', 'Status'],
        rows: records.map((r) => [r.rollNo, r.name, r.status]),
        filename: `attendance_${selectedSubject}_${selectedDate}`,
      });
      showToast(`Attendance exported as ${format.toUpperCase()}`);
    } catch {
      showToast('Attendance export failed', 'error');
    }
  };

  const hasData = departments.length > 0 && studentsList.length > 0 && subjectsList.length > 0;

  return (
    <div className="fade-in">
      <div className="page-header"><div className="page-header-actions">
        <div><h1>Attendance Management</h1><p>Mark attendance, track defaulters, and generate reports</p></div>
        {records.length > 0 && <div style={{display:'flex',gap:8}}>
          <button className="btn btn-outline btn-sm" onClick={()=>handleExport('pdf')}><Download size={16}/> PDF</button>
          <button className="btn btn-outline btn-sm" onClick={()=>handleExport('docx')}><Download size={16}/> DOCX</button>
        </div>}
      </div></div>
      <div className="tabs">
        {['mark','reports','defaulters','history'].map(t=>(
          <button key={t} className={`tab ${activeTab===t?'active':''}`} onClick={()=>setActiveTab(t)}>
            {t==='mark'?'Mark Attendance':t==='reports'?'Reports':t==='defaulters'?'Defaulters':'History'}
          </button>
        ))}
      </div>
      {!hasData && activeTab === 'mark' && (
        <div className="empty-state"><Users size={48} /><h3>No Data Yet</h3><p>Add departments, subjects, and students first from the Management section to start marking attendance.</p></div>
      )}
      {hasData && activeTab==='mark'&&(
        <>
          <div className="card" style={{marginBottom:20,padding:16}}>
            <div style={{display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
              <select className="form-select" style={{width:180}} value={selectedDept} onChange={e=>setSelectedDept(e.target.value)}>
                {departments.map(d=><option key={d.id} value={d.code}>{d.code} - {d.name}</option>)}
              </select>
              <select className="form-select" style={{width:220}} value={selectedSubject} onChange={e=>setSelectedSubject(e.target.value)}>
                {deptSubjects.length === 0 ? <option>No subjects</option> : deptSubjects.map(s=><option key={s.id} value={s.code}>{s.code} - {s.name}</option>)}
              </select>
              <select className="form-select" style={{width:130}} value={selectedSection} onChange={e=>setSelectedSection(e.target.value)}>
                <option value="A">Section A</option><option value="B">Section B</option><option value="C">Section C</option>
              </select>
              <input type="date" className="form-input" style={{width:160}} value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}/>
              <select className="form-select" style={{width:150}} value={selectedSlot} onChange={e=>setSelectedSlot(e.target.value)}>
                <option>Slot 1 (9:00)</option><option>Slot 2 (10:00)</option><option>Slot 3 (11:00)</option><option>Slot 4 (12:00)</option>
              </select>
            </div>
          </div>
          {records.length === 0 ? (
            <div className="empty-state"><Users size={48} /><h3>No Students in {selectedDept} Section {selectedSection}</h3><p>Add students to this department and section first.</p></div>
          ) : (
            <>
              <div className="card" style={{marginBottom:16,padding:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{display:'flex',gap:20}}>
                  <span style={{fontSize:14}}>Total: <strong>{records.length}</strong></span>
                  <span style={{fontSize:14,color:'var(--success)'}}>Present: <strong>{presentCount}</strong></span>
                  <span style={{fontSize:14,color:'var(--error)'}}>Absent: <strong>{records.length-presentCount}</strong></span>
                  <span style={{fontSize:14}}>Rate: <strong>{records.length?Math.round(presentCount/records.length*100):0}%</strong></span>
                </div>
                <div style={{display:'flex',gap:8}}>
                  {!submitted&&<button className="btn btn-outline btn-sm" onClick={()=>setRecords(prev=>prev.map(r=>({...r,status:'present'})))}>Mark All Present</button>}
                  {!submitted&&<button className="btn btn-outline btn-sm" onClick={()=>setRecords(prev=>prev.map(r=>({...r,status:'absent'})))}>Mark All Absent</button>}
                  {submitted?<span className="badge badge-success" style={{padding:'8px 16px',fontSize:14}}>✓ Submitted</span>:<button className="btn btn-success btn-sm" onClick={handleSubmit}><UserCheck size={14}/> Submit Attendance</button>}
                </div>
              </div>
              <div className="table-container">
                <table>
                  <thead><tr><th style={{width:50}}>#</th><th>Roll No</th><th>Student Name</th><th>Status</th><th>Toggle</th></tr></thead>
                  <tbody>
                    {records.map((r,i)=>(
                      <tr key={r.id} style={{opacity:submitted?0.7:1}}>
                        <td>{i+1}</td>
                        <td style={{fontFamily:'monospace',fontSize:13}}>{r.rollNo}</td>
                        <td style={{fontWeight:500}}>{r.name}</td>
                        <td><span className={`badge ${r.status==='present'?'badge-success':'badge-error'}`}>{r.status==='present'?'✓ Present':'✗ Absent'}</span></td>
                        <td><button className={`btn btn-sm ${r.status==='present'?'btn-outline':'btn-success'}`} onClick={()=>toggleStatus(r.id)} disabled={submitted}>{r.status==='present'?'Mark Absent':'Mark Present'}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
      {activeTab==='reports'&&(
        <div className="charts-grid">
          <div className="chart-card">
            <div className="chart-title">Subject-wise Attendance (%)</div>
            {subjectAtt.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={subjectAtt}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/><XAxis dataKey="name" tick={{fontSize:12}}/><YAxis domain={[0,100]} tick={{fontSize:12}}/><Tooltip/><Bar dataKey="attendance" fill="var(--accent)" radius={[6,6,0,0]}/></BarChart>
              </ResponsiveContainer>
            ) : <div className="empty-state"><p>Add subjects to see reports</p></div>}
          </div>
          <div className="chart-card">
            <div className="chart-title">Generate Sheets</div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {['Monthly Attendance Sheet','Exam Attendance Sheet','Practical Attendance Sheet','Cumulative Report'].map(s=>(
                <div key={s} className="card" style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:14}}>
                  <span style={{fontWeight:500,fontSize:14}}>{s}</span>
                  <div style={{display:'flex',gap:8}}>
                    <button className="btn btn-accent btn-sm" onClick={()=>handleExport('pdf', s)}><Download size={14}/> PDF</button>
                    <button className="btn btn-outline btn-sm" onClick={()=>handleExport('docx', s)}><Download size={14}/> DOCX</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {activeTab==='defaulters'&&(
        <div className="table-container">
          <div className="table-header">
            <span className="table-title"><AlertTriangle size={16} color="var(--error)" style={{marginRight:6}}/> Defaulter List (Below 75%)</span>
            <span className="badge badge-error">{defaulters.length} students</span>
          </div>
          <table>
            <thead><tr><th>Roll No</th><th>Name</th><th>Dept</th><th>Section</th><th>Attendance %</th><th>Status</th></tr></thead>
            <tbody>
              {defaulters.map(s=>(
                <tr key={s.id}>
                  <td style={{fontFamily:'monospace'}}>{s.rollNo}</td>
                  <td style={{fontWeight:500}}>{s.name}</td>
                  <td><span className="badge badge-info">{s.dept}</span></td>
                  <td>{s.section}</td>
                  <td><div style={{display:'flex',alignItems:'center',gap:8}}><div className="progress-bar" style={{width:80}}><div className="progress-fill" style={{width:`${s.attendance}%`,background:'var(--error)'}}/></div><span style={{fontWeight:700,color:'var(--error)',fontSize:13}}>{s.attendance}%</span></div></td>
                  <td><span className="badge badge-error">Defaulter</span></td>
                </tr>
              ))}
              {defaulters.length===0&&<tr><td colSpan="6" style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>No defaulters found 🎉</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {activeTab==='history'&&(
        <div className="table-container">
          <div className="table-header"><span className="table-title">Submission History</span><span className="badge badge-info">{attendanceHistory.length} records</span></div>
          <table>
            <thead><tr><th>Date</th><th>Subject</th><th>Dept</th><th>Section</th><th>Slot</th><th>Present</th><th>Absent</th><th>Rate</th></tr></thead>
            <tbody>
              {attendanceHistory.map((h,i)=>(
                <tr key={i}>
                  <td style={{fontFamily:'monospace',fontSize:13}}>{h.date}</td>
                  <td style={{fontWeight:600}}>{h.subject}</td>
                  <td><span className="badge badge-info">{h.dept}</span></td>
                  <td>{h.section}</td>
                  <td style={{fontSize:13,color:'var(--text-muted)'}}>{h.slot}</td>
                  <td><span className="badge badge-success">{h.present}</span></td>
                  <td><span className="badge badge-error">{h.absent}</span></td>
                  <td style={{fontWeight:700}}>{Math.round(h.present/h.total*100)}%</td>
                </tr>
              ))}
              {attendanceHistory.length===0&&<tr><td colSpan="8" style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>No attendance submitted yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
