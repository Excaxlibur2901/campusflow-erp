import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { downloadOfficialFile } from '../utils/officialDownloads';
import { ClipboardList, Plus, Eye, Download, Users, Printer, RefreshCw, Lock, AlertTriangle, UserX } from 'lucide-react';

export default function ExamSeatingPage() {
  const { getAccessToken } = useAuth();

  // Primary state
  const [examsList, setExamsList] = useState([]);
  const [selectedExam, setSelectedExam] = useState(null);
  const [activeTab, setActiveTab] = useState('exams');
  const [loading, setLoading] = useState(true);

  // Sub-data for selected exam
  const [examSubjects, setExamSubjects] = useState([]);
  const [examHalls, setExamHalls] = useState([]);
  const [examRegistrations, setExamRegistrations] = useState([]);
  const [seatAllocations, setSeatAllocations] = useState([]);
  const [allClassrooms, setAllClassrooms] = useState([]);
  const [allDepartments, setAllDepartments] = useState([]);
  const [allSubjects, setAllSubjects] = useState([]);

  // UI Modals & State
  const [search, setSearch] = useState('');
  const [allocating, setAllocating] = useState(false);
  const [showAddExamModal, setShowAddExamModal] = useState(false);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [showAddHallModal, setShowAddHallModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [report, setReport] = useState(null);

  // Forms
  const [examForm, setExamForm] = useState({ name: '', examType: 'Mid Semester', startsOn: '', endsOn: '' });
  const [subjForm, setSubjForm] = useState({ subjectId: '', examDate: '', session: 'Morning' });
  const [hallForm, setHallForm] = useState({ classroomId: '', rowsCount: 8, columnsCount: 10, seatsPerBench: 2 });
  const [regForm, setRegForm] = useState({ examSubjectId: '', departmentId: '' });

  // 1. Load initial exams & dropdown reference data
  const loadExams = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [eRes, cRes, dRes, sRes] = await Promise.all([
        fetch('/api/exams', { headers }),
        fetch('/api/classrooms', { headers }),
        fetch('/api/departments', { headers }),
        fetch('/api/subjects', { headers }),
      ]);

      if (eRes.ok) {
        const data = await eRes.json();
        setExamsList(data.map(e => ({
          id: e.id,
          name: e.name,
          type: e.exam_type || 'Mid Semester',
          date: e.starts_on || 'TBD',
          halls: e.hall_count || 0,
          students: e.registration_count || 0,
          status: e.status || 'draft',
        })));
      }

      if (cRes.ok) setAllClassrooms(await cRes.json());
      if (dRes.ok) setAllDepartments(await dRes.json());
      if (sRes.ok) setAllSubjects(await sRes.json());
    } catch {
      // Best effort load
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  // 2. Load details for selected exam
  const loadExamDetails = useCallback(async (examId) => {
    if (!examId) return;
    try {
      const token = await getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [subjRes, hallRes, regRes, seatRes] = await Promise.all([
        fetch(`/api/exams/${examId}/subjects`, { headers }),
        fetch(`/api/exams/${examId}/halls`, { headers }),
        fetch(`/api/exams/${examId}/registrations`, { headers }),
        fetch(`/api/exams/${examId}/seating`, { headers }),
      ]);

      if (subjRes.ok) setExamSubjects(await subjRes.json());
      if (hallRes.ok) setExamHalls(await hallRes.json());
      if (regRes.ok) setExamRegistrations(await regRes.json());
      if (seatRes.ok) {
        const seats = await seatRes.json();
        setSeatAllocations(seats.map(s => ({
          id: s.id,
          hallSeatId: s.hall_seat_id,
          row: s.row_number - 1,
          col: s.column_number - 1,
          seatNumber: s.seat_number,
          student: s.student_name,
          rollNo: s.roll_number,
          dept: s.dept_code || 'GEN',
          subject: s.subject_code || 'SUBJ',
          absent: s.allocation_status === 'absent',
          conflictFlags: s.conflict_flags || [],
          locked: s.locked,
        })));
      }
    } catch {
      // Best effort load
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (selectedExam) {
      loadExamDetails(selectedExam.id);
    }
  }, [selectedExam, loadExamDetails]);

  const filteredExams = useMemo(() =>
    examsList.filter(e => e.name.toLowerCase().includes(search.toLowerCase())),
    [examsList, search]
  );

  const deptColors = useMemo(() => {
    const palette = ['#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b', '#10b981', '#ec4899', '#06b6d4'];
    const map = {};
    seatAllocations.forEach(s => {
      if (s.dept && !map[s.dept]) {
        map[s.dept] = palette[Object.keys(map).length % palette.length];
      }
    });
    return map;
  }, [seatAllocations]);

  // Actions
  const handleCreateExam = async () => {
    if (!examForm.name.trim() || !examForm.startsOn) return;
    setErrorMsg('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(examForm),
      });
      if (res.ok) {
        setShowAddExamModal(false);
        setExamForm({ name: '', examType: 'Mid Semester', startsOn: '', endsOn: '' });
        await loadExams();
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Failed to create exam.');
      }
    } catch {
      setErrorMsg('Network error creating exam.');
    }
  };

  const handleAddSubjectSchedule = async () => {
    if (!selectedExam || !subjForm.subjectId || !subjForm.examDate) return;
    setErrorMsg('');
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/exams/${selectedExam.id}/subjects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(subjForm),
      });
      if (res.ok) {
        setShowAddSubjectModal(false);
        await loadExamDetails(selectedExam.id);
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Failed to add subject schedule.');
      }
    } catch {
      setErrorMsg('Network error adding subject.');
    }
  };

  const handleAddHall = async () => {
    if (!selectedExam || !hallForm.classroomId) return;
    setErrorMsg('');
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/exams/${selectedExam.id}/halls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(hallForm),
      });
      if (res.ok) {
        setShowAddHallModal(false);
        await loadExamDetails(selectedExam.id);
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Failed to configure exam hall.');
      }
    } catch {
      setErrorMsg('Network error configuring hall.');
    }
  };

  const handleRegisterStudents = async () => {
    if (!selectedExam || !regForm.examSubjectId) return;
    setErrorMsg('');
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/exams/${selectedExam.id}/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          examSubjectId: regForm.examSubjectId,
          departmentId: regForm.departmentId || undefined,
        }),
      });
      if (res.ok) {
        setShowRegisterModal(false);
        await loadExamDetails(selectedExam.id);
        await loadExams();
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Failed to register students.');
      }
    } catch {
      setErrorMsg('Network error registering students.');
    }
  };

  const handleGenerateSeating = async () => {
    if (!selectedExam) return;
    setAllocating(true);
    setErrorMsg('');
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/exams/${selectedExam.id}/seating/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setReport(data.report);
        await loadExamDetails(selectedExam.id);
        await loadExams();
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Seating generation failed.');
      }
    } catch {
      setErrorMsg('Network error generating seating.');
    } finally {
      setAllocating(false);
    }
  };

  const handleToggleAbsent = async (regId, currentAbsent) => {
    if (!selectedExam) return;
    try {
      const token = await getAccessToken();
      await fetch(`/api/exams/${selectedExam.id}/registrations/${regId}/absent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ absent: !currentAbsent }),
      });
      await loadExamDetails(selectedExam.id);
    } catch {
      // Best effort
    }
  };

  const handleLockSeating = async () => {
    if (!selectedExam) return;
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/exams/${selectedExam.id}/seating/lock`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await loadExamDetails(selectedExam.id);
        await loadExams();
      }
    } catch {
      // Lock error
    }
  };

  const handleDocumentDownload = async (format, doc) => {
    try {
      await downloadOfficialFile(format, {
        settings: { institutionName: 'CampusFlow ERP' },
        title: doc.title,
        subtitle: selectedExam ? `${selectedExam.name} - ${selectedExam.date}` : 'Exam Seating Official Document',
        details: [
          { label: 'Exam Name', value: selectedExam?.name || 'Not selected' },
          { label: 'Exam Date', value: selectedExam?.date || 'Not selected' },
          { label: 'Registered Students', value: examRegistrations.length },
          { label: 'Seats Allocated', value: seatAllocations.length },
          { label: 'Departments Mixed', value: Object.keys(deptColors).length },
        ],
        sections: [{ heading: 'Document Purpose', lines: [doc.desc] }],
        columns: ['Seat No', 'Roll Number', 'Student Name', 'Department', 'Subject', 'Status'],
        rows: seatAllocations.map(s => [
          s.seatNumber,
          s.rollNo,
          s.student,
          s.dept,
          s.subject,
          s.absent ? 'ABSENT' : 'ALLOCATED',
        ]),
        filename: doc.title,
      });
    } catch {
      // Export handling
    }
  };

  const tabs = [
    { id: 'exams', label: 'Exam Events' },
    { id: 'subjects', label: 'Subject Schedules' },
    { id: 'halls', label: 'Exam Halls' },
    { id: 'registrations', label: 'Student Registrations' },
    { id: 'seating', label: 'Seat Allocation & Grid' },
    { id: 'documents', label: 'Official Documents' },
  ];

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-actions">
          <div><h1>Exam Seating Arrangement</h1><p>Intelligent seating allocation with PostgreSQL student data</p></div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddExamModal(true)}><Plus size={16} /> New Exam Event</button>
        </div>
      </div>

      {selectedExam && (
        <div style={{ padding: '8px 16px', background: 'var(--surface-light)', borderRadius: 8, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ fontSize: 15 }}>Active Exam: {selectedExam.name}</strong>
            <span style={{ marginLeft: 12, color: 'var(--text-muted)', fontSize: 13 }}>Date: {selectedExam.date} | Status: <span className="badge badge-info">{selectedExam.status}</span></span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelectedExam(null)}>Change Exam</button>
        </div>
      )}

      <div className="tabs">
        {tabs.map(t => (
          <button key={t.id} className={`tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: EXAM EVENTS */}
      {activeTab === 'exams' && (
        <div className="table-container">
          <div className="table-header">
            <span className="table-title">All Exam Events ({filteredExams.length})</span>
            <input className="form-input search-input" placeholder="Search exams..." style={{ width: 250 }} value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ width: 24, height: 24, margin: '0 auto 12px' }} />
              Loading exam events...
            </div>
          ) : (
            <table>
              <thead><tr><th>Exam Name</th><th>Type</th><th>Date</th><th>Halls</th><th>Students</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredExams.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 600 }}>{e.name}</td>
                    <td><span className="badge badge-info">{e.type}</span></td>
                    <td>{e.date}</td>
                    <td>{e.halls}</td>
                    <td>{e.students.toLocaleString()}</td>
                    <td><span className={`badge ${e.status === 'locked' ? 'badge-error' : e.status === 'completed' ? 'badge-success' : 'badge-neutral'}`}>{e.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-outline btn-sm" onClick={() => { setSelectedExam(e); setActiveTab('seating'); }}><Eye size={14} /> View</button>
                        <button className="btn btn-accent btn-sm" onClick={() => { setSelectedExam(e); setActiveTab('seating'); }}><RefreshCw size={14} /> Manage</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredExams.length === 0 && <tr><td colSpan="7" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No exams found</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB 2: SUBJECT SCHEDULES */}
      {activeTab === 'subjects' && (
        <div className="table-container">
          <div className="table-header">
            <span className="table-title">Scheduled Exam Subjects ({examSubjects.length})</span>
            <button className="btn btn-primary btn-sm" disabled={!selectedExam} onClick={() => setShowAddSubjectModal(true)}><Plus size={14} /> Add Subject</button>
          </div>
          {!selectedExam ? (
            <div className="empty-state"><p>Please select an exam event first.</p></div>
          ) : (
            <table>
              <thead><tr><th>Subject Code</th><th>Subject Name</th><th>Exam Date</th><th>Session</th></tr></thead>
              <tbody>
                {examSubjects.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{s.subject_code}</td>
                    <td>{s.subject_name}</td>
                    <td>{s.exam_date}</td>
                    <td><span className="badge badge-info">{s.session}</span></td>
                  </tr>
                ))}
                {examSubjects.length === 0 && <tr><td colSpan="4" style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No subjects scheduled for this exam yet.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB 3: EXAM HALLS */}
      {activeTab === 'halls' && (
        <div className="table-container">
          <div className="table-header">
            <span className="table-title">Configured Exam Halls ({examHalls.length})</span>
            <button className="btn btn-primary btn-sm" disabled={!selectedExam} onClick={() => setShowAddHallModal(true)}><Plus size={14} /> Add Hall</button>
          </div>
          {!selectedExam ? (
            <div className="empty-state"><p>Please select an exam event first.</p></div>
          ) : (
            <table>
              <thead><tr><th>Room Code</th><th>Classroom Name</th><th>Rows × Cols</th><th>Total Capacity</th><th>Available Seats</th></tr></thead>
              <tbody>
                {examHalls.map(h => (
                  <tr key={h.id}>
                    <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{h.classroom_code}</td>
                    <td>{h.classroom_name}</td>
                    <td>{h.rows_count} × {h.columns_count}</td>
                    <td style={{ fontWeight: 600 }}>{h.capacity}</td>
                    <td><span className="badge badge-success">{h.available_seats || h.capacity}</span></td>
                  </tr>
                ))}
                {examHalls.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No exam halls configured yet.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB 4: STUDENT REGISTRATIONS */}
      {activeTab === 'registrations' && (
        <div className="table-container">
          <div className="table-header">
            <span className="table-title">Registered Students ({examRegistrations.length})</span>
            <button className="btn btn-primary btn-sm" disabled={!selectedExam || examSubjects.length === 0} onClick={() => setShowRegisterModal(true)}><Plus size={14} /> Register Students</button>
          </div>
          {!selectedExam ? (
            <div className="empty-state"><p>Please select an exam event first.</p></div>
          ) : (
            <table>
              <thead><tr><th>Roll Number</th><th>Student Name</th><th>Dept</th><th>Semester</th><th>Subject</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {examRegistrations.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{r.roll_number}</td>
                    <td style={{ fontWeight: 500 }}>{r.student_name}</td>
                    <td><span className="badge badge-info">{r.dept_code}</span></td>
                    <td>Sem {r.year ? r.year * 2 : 1}</td>
                    <td>{r.subject_code}</td>
                    <td><span className={`badge ${r.status === 'absent' ? 'badge-error' : 'badge-success'}`}>{r.status}</span></td>
                    <td>
                      <button className={`btn btn-sm ${r.status === 'absent' ? 'btn-outline' : 'btn-ghost'}`} onClick={() => handleToggleAbsent(r.id, r.status === 'absent')}>
                        <UserX size={14} /> {r.status === 'absent' ? 'Mark Present' : 'Mark Absent'}
                      </button>
                    </td>
                  </tr>
                ))}
                {examRegistrations.length === 0 && <tr><td colSpan="7" style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No real students registered for this exam yet.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB 5: SEAT ALLOCATION & GRID */}
      {activeTab === 'seating' && (
        <>
          {!selectedExam ? (
            <div className="empty-state"><p>Please select an exam event first.</p></div>
          ) : allocating ? (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ width: 48, height: 48, border: '4px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
              <h3>Generating Anti-Cheat Seating...</h3>
              <p style={{ color: 'var(--text-muted)' }}>Executing 7-step anti-cheat allocation & swap optimizer across PostgreSQL student records</p>
              <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
            </div>
          ) : (
            <>
              {errorMsg && (
                <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--error)', borderRadius: 6, color: 'var(--error)', fontSize: 13, marginBottom: 16 }}>
                  {errorMsg}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', flex: 1, marginRight: 16 }}>
                  <div className="stat-card"><div className="stat-value" style={{ fontSize: 20 }}>{examHalls.length} Halls</div><div className="stat-label">Allocated Rooms</div></div>
                  <div className="stat-card"><div className="stat-value" style={{ fontSize: 20, color: 'var(--success)' }}>{seatAllocations.filter(s => !s.absent).length}/{examRegistrations.length}</div><div className="stat-label">Seats Filled</div></div>
                  <div className="stat-card"><div className="stat-value" style={{ fontSize: 20, color: 'var(--accent)' }}>{Object.keys(deptColors).length}</div><div className="stat-label">Departments Mixed</div></div>
                  <div className="stat-card">
                    <div className="stat-value" style={{ fontSize: 20, color: report?.conflicts?.length ? 'var(--error)' : 'var(--success)' }}>
                      {report?.conflicts?.length || 0}
                    </div>
                    <div className="stat-label">Adjacency Conflicts</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-accent" onClick={handleGenerateSeating} disabled={selectedExam.status === 'locked'}>
                    <RefreshCw size={16} /> Generate Anti-Cheat Seating
                  </button>
                  <button className="btn btn-outline" onClick={handleLockSeating} disabled={selectedExam.status === 'locked'}>
                    <Lock size={16} /> Lock Seating
                  </button>
                </div>
              </div>

              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700 }}>Seat Grid View — {selectedExam.name}</h3>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, flexWrap: 'wrap' }}>
                    {Object.entries(deptColors).map(([dept, color]) => (
                      <span key={dept} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 14, height: 14, borderRadius: 3, background: color }} />
                        {dept}
                      </span>
                    ))}
                  </div>
                </div>

                {seatAllocations.length === 0 ? (
                  <div className="empty-state" style={{ padding: 40 }}>
                    <p>No seating generated yet. Click <strong>Generate Anti-Cheat Seating</strong> above.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <div style={{ width: 40 }} />
                      {Array.from({ length: 10 }, (_, i) => (
                        <div key={i} style={{ width: 80, textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>C{i + 1}</div>
                      ))}
                    </div>

                    {Array.from({ length: 8 }, (_, r) => (
                      <div key={r} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                        <div style={{ width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>R{r + 1}</div>
                        {Array.from({ length: 10 }, (_, c) => {
                          const seat = seatAllocations.find(s => s.row === r && s.col === c);
                          const hasConflict = seat && seat.conflictFlags && seat.conflictFlags.length > 0;
                          const color = seat ? (deptColors[seat.dept] || 'var(--primary)') : 'var(--border)';

                          return (
                            <div
                              key={c}
                              style={{
                                width: 80,
                                height: 56,
                                background: seat ? `${color}15` : 'var(--surface)',
                                border: `2px solid ${hasConflict ? 'var(--error)' : seat ? color : 'var(--border)'}`,
                                color: seat ? color : 'var(--text-muted)',
                                fontSize: 10,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 6,
                                position: 'relative',
                                opacity: seat?.absent ? 0.4 : 1,
                              }}
                              title={seat ? `${seat.student} (${seat.rollNo}) - ${seat.subject}` : 'Empty'}
                            >
                              {hasConflict && (
                                <AlertTriangle size={12} color="var(--error)" style={{ position: 'absolute', top: 2, right: 2 }} />
                              )}
                              <div style={{ fontWeight: 800 }}>{seat ? seat.dept : ''}</div>
                              <div style={{ fontWeight: 600, fontSize: 9 }}>{seat ? seat.rollNo : 'Empty'}</div>
                              <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>{seat ? seat.subject : ''}</div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* TAB 6: OFFICIAL DOCUMENTS */}
      {activeTab === 'documents' && (
        <div className="card">
          <h3 style={{ marginBottom: 20, fontWeight: 700 }}>Generate Exam Documents</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
            {[
              { title: 'Hall Allotment Sheet', desc: 'Room-wise student list with seat numbers', icon: ClipboardList },
              { title: 'Bench Allocation Chart', desc: 'Printable grid with student names per seat', icon: Users },
              { title: 'Invigilator Duty Sheet', desc: 'Invigilator assignments with hall details', icon: Eye },
              { title: 'Student Hall Tickets', desc: 'Individual tickets with seating instructions', icon: Printer },
            ].map((doc, i) => (
              <div key={i} className="card" style={{ cursor: 'pointer' }}>
                <doc.icon size={24} color="var(--accent)" style={{ marginBottom: 12 }} />
                <h4 style={{ marginBottom: 4 }}>{doc.title}</h4>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>{doc.desc}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-accent btn-sm" onClick={() => handleDocumentDownload('pdf', doc)}><Download size={14} /> PDF</button>
                  <button className="btn btn-outline btn-sm" onClick={() => handleDocumentDownload('docx', doc)}><Download size={14} /> DOCX</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL 1: ADD EXAM */}
      {showAddExamModal && (
        <div className="modal-overlay" onClick={() => setShowAddExamModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>New Exam Event</h3><button className="btn btn-ghost" onClick={() => setShowAddExamModal(false)}>✕</button></div>
            <div className="modal-body">
              {errorMsg && <div style={{ color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>{errorMsg}</div>}
              <div className="form-group"><label className="form-label">Exam Name *</label><input className="form-input" value={examForm.name} onChange={e => setExamForm({ ...examForm, name: e.target.value })} placeholder="e.g. Mid Semester Exam - Nov 2025" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label className="form-label">Type</label><select className="form-select" value={examForm.examType} onChange={e => setExamForm({ ...examForm, examType: e.target.value })}><option value="Mid Semester">Mid Semester</option><option value="End Semester">End Semester</option></select></div>
                <div className="form-group"><label className="form-label">Start Date *</label><input className="form-input" type="date" value={examForm.startsOn} onChange={e => setExamForm({ ...examForm, startsOn: e.target.value })} /></div>
              </div>
            </div>
            <div className="modal-footer"><button className="btn btn-outline" onClick={() => setShowAddExamModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleCreateExam} disabled={!examForm.name.trim() || !examForm.startsOn}>Create Exam</button></div>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD SUBJECT SCHEDULE */}
      {showAddSubjectModal && (
        <div className="modal-overlay" onClick={() => setShowAddSubjectModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Schedule Exam Subject</h3><button className="btn btn-ghost" onClick={() => setShowAddSubjectModal(false)}>✕</button></div>
            <div className="modal-body">
              {errorMsg && <div style={{ color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>{errorMsg}</div>}
              <div className="form-group"><label className="form-label">Select Subject *</label>
                <select className="form-select" value={subjForm.subjectId} onChange={e => setSubjForm({ ...subjForm, subjectId: e.target.value })}>
                  <option value="">Select Subject...</option>
                  {allSubjects.map(s => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label className="form-label">Date *</label><input className="form-input" type="date" value={subjForm.examDate} onChange={e => setSubjForm({ ...subjForm, examDate: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Session</label><select className="form-select" value={subjForm.session} onChange={e => setSubjForm({ ...subjForm, session: e.target.value })}><option value="Morning">Morning (9:30 AM)</option><option value="Afternoon">Afternoon (2:00 PM)</option></select></div>
              </div>
            </div>
            <div className="modal-footer"><button className="btn btn-outline" onClick={() => setShowAddSubjectModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleAddSubjectSchedule} disabled={!subjForm.subjectId || !subjForm.examDate}>Add Subject</button></div>
          </div>
        </div>
      )}

      {/* MODAL 3: ADD EXAM HALL */}
      {showAddHallModal && (
        <div className="modal-overlay" onClick={() => setShowAddHallModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Configure Exam Hall</h3><button className="btn btn-ghost" onClick={() => setShowAddHallModal(false)}>✕</button></div>
            <div className="modal-body">
              {errorMsg && <div style={{ color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>{errorMsg}</div>}
              <div className="form-group"><label className="form-label">Select Classroom *</label>
                <select className="form-select" value={hallForm.classroomId} onChange={e => setHallForm({ ...hallForm, classroomId: e.target.value })}>
                  <option value="">Select Room...</option>
                  {allClassrooms.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name} (Cap: {c.capacity})</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label className="form-label">Rows</label><input className="form-input" type="number" value={hallForm.rowsCount} onChange={e => setHallForm({ ...hallForm, rowsCount: Number(e.target.value) })} /></div>
                <div className="form-group"><label className="form-label">Columns</label><input className="form-input" type="number" value={hallForm.columnsCount} onChange={e => setHallForm({ ...hallForm, columnsCount: Number(e.target.value) })} /></div>
              </div>
            </div>
            <div className="modal-footer"><button className="btn btn-outline" onClick={() => setShowAddHallModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleAddHall} disabled={!hallForm.classroomId}>Add Exam Hall</button></div>
          </div>
        </div>
      )}

      {/* MODAL 4: REGISTER STUDENTS */}
      {showRegisterModal && (
        <div className="modal-overlay" onClick={() => setShowRegisterModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Register Students for Exam</h3><button className="btn btn-ghost" onClick={() => setShowRegisterModal(false)}>✕</button></div>
            <div className="modal-body">
              {errorMsg && <div style={{ color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>{errorMsg}</div>}
              <div className="form-group"><label className="form-label">Select Scheduled Subject *</label>
                <select className="form-select" value={regForm.examSubjectId} onChange={e => setRegForm({ ...regForm, examSubjectId: e.target.value })}>
                  <option value="">Select Scheduled Subject...</option>
                  {examSubjects.map(s => <option key={s.id} value={s.id}>{s.subject_code} - {s.subject_name}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Department (All Students)</label>
                <select className="form-select" value={regForm.departmentId} onChange={e => setRegForm({ ...regForm, departmentId: e.target.value })}>
                  <option value="">All Departments</option>
                  {allDepartments.map(d => <option key={d.id} value={d.id}>{d.code} - {d.name}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer"><button className="btn btn-outline" onClick={() => setShowRegisterModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleRegisterStudents} disabled={!regForm.examSubjectId}>Register Students</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
