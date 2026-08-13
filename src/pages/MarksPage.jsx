import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { downloadOfficialFile } from '../utils/officialDownloads';
import {
  Award,
  BookOpen,
  Building,
  CheckCircle,
  Download,
  FileSpreadsheet,
  Lock,
  Plus,
  Save,
  Unlock,
  Upload,
  Users,
} from 'lucide-react';

export default function MarksPage() {
  const { getAccessToken, user } = useAuth();

  // Primary State
  const [activeTab, setActiveTab] = useState('entry');
  const [selectedDept, setSelectedDept] = useState('CSE');
  const [selectedSem, setSelectedSem] = useState('3');
  const [selectedSection, setSelectedSection] = useState('A');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedComponent, setSelectedComponent] = useState(null);

  // Data Arrays from PostgreSQL
  const [departments, setDepartments] = useState([]);
  const [subjectsList, setSubjectsList] = useState([]);
  const [componentsList, setComponentsList] = useState([]);
  const [studentsList, setStudentsList] = useState([]);
  const [marksMap, setMarksMap] = useState({});
  const [loading, setLoading] = useState(true);

  // UI State
  const [showAddComponentModal, setShowAddComponentModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [compForm, setCompForm] = useState({ name: '', componentType: 'internal', maxMarks: 100, weight: 20 });
  const [csvText, setCsvText] = useState('');
  const [importSummary, setImportSummary] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState(null);

  const isStaffOrAdmin = ['SUPER_ADMIN', 'PRINCIPAL', 'HOD'].includes(user?.role || '');

  const showToast = (msg, type = 'success') => {
    setToastMsg({ text: msg, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  // 1. Load Reference Data (Departments, Subjects)
  const loadReferenceData = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [dRes, sRes] = await Promise.all([
        fetch('/api/departments', { headers }),
        fetch('/api/subjects', { headers }),
      ]);

      if (dRes.ok) setDepartments(await dRes.json());
      if (sRes.ok) {
        const sData = await sRes.json();
        setSubjectsList(sData.map(s => ({ id: s.id, code: s.code, name: s.name, dept: s.dept_code || s.dept, semester: Number(s.semester || 3) })));
      }
    } catch {
      // Best effort load
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  // Filter subjects for current dept + semester
  const filteredSubjects = useMemo(() =>
    subjectsList.filter(s => s.dept === selectedDept && s.semester === Number(selectedSem)),
    [subjectsList, selectedDept, selectedSem]
  );

  // Auto-select first subject if none selected
  useEffect(() => {
    if (filteredSubjects.length > 0 && (!selectedSubject || !filteredSubjects.some(s => s.id === selectedSubject))) {
      setSelectedSubject(filteredSubjects[0].id);
    }
  }, [filteredSubjects, selectedSubject]);

  // 2. Load Assessment Components for selected Subject
  const loadComponents = useCallback(async () => {
    if (!selectedSubject) return;
    try {
      const token = await getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(`/api/marks/components?subjectId=${selectedSubject}&semester=${selectedSem}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setComponentsList(data);
        if (data.length > 0) {
          setSelectedComponent(data[0]);
        } else {
          setSelectedComponent(null);
        }
      }
    } catch {
      // Best effort load
    }
  }, [getAccessToken, selectedSubject, selectedSem]);

  useEffect(() => {
    loadComponents();
  }, [loadComponents]);

  // 3. Load Students & Marks for selected Component
  const loadStudentsAndMarks = useCallback(async () => {
    if (!selectedSubject) return;
    try {
      const token = await getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [stuRes, markRes] = await Promise.all([
        fetch(`/api/students?dept=${selectedDept}&limit=200`, { headers }),
        selectedComponent ? fetch(`/api/marks?componentId=${selectedComponent.id}`, { headers }) : Promise.resolve(null),
      ]);

      if (stuRes.ok) {
        const stuData = await stuRes.json();
        setStudentsList((stuData.data || stuData).map(s => ({
          id: s.id,
          rollNo: s.roll_number || s.rollNo || '',
          name: s.full_name || s.name || '',
          dept: s.dept_code || s.dept || 'CSE',
        })));
      }

      if (markRes && markRes.ok) {
        const mData = await markRes.json();
        const map = {};
        mData.forEach(m => {
          map[m.student_id] = {
            id: m.id,
            obtained: m.obtained_marks,
            locked: m.locked,
          };
        });
        setMarksMap(map);
      } else {
        setMarksMap({});
      }
    } catch {
      // Best effort load
    }
  }, [getAccessToken, selectedDept, selectedSubject, selectedComponent]);

  useEffect(() => {
    loadStudentsAndMarks();
  }, [loadStudentsAndMarks]);

  // Handlers
  const handleMarkChange = (studentId, val) => {
    setMarksMap(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        obtained: val,
      },
    }));
  };

  const handleSaveMarks = async (studentId) => {
    if (!selectedComponent) return;
    const entry = marksMap[studentId];
    if (!entry || entry.obtained === undefined || entry.obtained === '') return;

    const val = Number(entry.obtained);
    if (isNaN(val) || val < 0) {
      showToast('Obtained marks cannot be negative', 'error');
      return;
    }
    if (val > Number(selectedComponent.max_marks)) {
      showToast(`Marks cannot exceed maximum marks (${selectedComponent.max_marks})`, 'error');
      return;
    }

    try {
      const token = await getAccessToken();
      const res = await fetch('/api/marks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          componentId: selectedComponent.id,
          studentId,
          obtainedMarks: val,
        }),
      });

      if (res.ok) {
        showToast('Marks saved successfully!');
        await loadStudentsAndMarks();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to save marks', 'error');
      }
    } catch {
      showToast('Network error saving marks', 'error');
    }
  };

  const handleCreateComponent = async () => {
    if (!selectedSubject || !compForm.name.trim()) return;
    setErrorMsg('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/marks/components', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          subjectId: selectedSubject,
          semester: Number(selectedSem),
          name: compForm.name.trim(),
          componentType: compForm.componentType,
          maxMarks: Number(compForm.maxMarks),
          weight: Number(compForm.weight),
        }),
      });

      if (res.ok) {
        setShowAddComponentModal(false);
        setCompForm({ name: '', componentType: 'internal', maxMarks: 100, weight: 20 });
        showToast('Mark component added successfully!');
        await loadComponents();
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Failed to add component.');
      }
    } catch {
      setErrorMsg('Network error creating component.');
    }
  };

  const handleToggleLockComponent = async (compId, currentLocked) => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/marks/components/${compId}/lock`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ locked: !currentLocked }),
      });
      if (res.ok) {
        showToast(`Component ${!currentLocked ? 'locked & finalized' : 'unlocked'}`);
        await loadComponents();
        await loadStudentsAndMarks();
      } else {
        const err = await res.json();
        showToast(err.error || 'Permission denied', 'error');
      }
    } catch {
      showToast('Error locking component', 'error');
    }
  };

  const handleImportCsv = async () => {
    if (!selectedComponent || !csvText.trim()) return;
    const lines = csvText.split('\n').filter(l => l.trim());
    const parsedEntries = [];

    lines.forEach(line => {
      const [rollNo, marks] = line.split(',').map(s => s.trim());
      if (rollNo && marks && !isNaN(Number(marks))) {
        parsedEntries.push({ rollNumber: rollNo, obtainedMarks: Number(marks) });
      }
    });

    if (parsedEntries.length === 0) {
      showToast('No valid CSV rows found. Format: RollNumber,Marks', 'error');
      return;
    }

    try {
      const token = await getAccessToken();
      const res = await fetch('/api/marks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          componentId: selectedComponent.id,
          entries: parsedEntries,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        setImportSummary(result);
        setShowImportModal(false);
        setCsvText('');
        showToast(`Imported ${result.updatedCount} student marks!`);
        await loadStudentsAndMarks();
      } else {
        const err = await res.json();
        showToast(err.error || 'Import failed', 'error');
      }
    } catch {
      showToast('Network error importing marks', 'error');
    }
  };

  const handleExportMarksSheet = async (format) => {
    const currentSubjectObj = subjectsList.find(s => s.id === selectedSubject);
    try {
      await downloadOfficialFile(format, {
        settings: { institutionName: 'CampusFlow ERP' },
        title: 'Official Academic Marks Sheet',
        subtitle: `Dept of ${selectedDept} - Sem ${selectedSem} (Sec ${selectedSection})`,
        details: [
          { label: 'Subject', value: currentSubjectObj ? `${currentSubjectObj.code} - ${currentSubjectObj.name}` : 'Subject' },
          { label: 'Assessment Component', value: selectedComponent ? `${selectedComponent.name} (Max: ${selectedComponent.max_marks})` : 'All Components' },
          { label: 'Students Graded', value: Object.keys(marksMap).length },
        ],
        columns: ['Roll Number', 'Student Name', 'Department', 'Max Marks', 'Obtained Marks', 'Percentage', 'Grade', 'Status'],
        rows: studentsList.map(s => {
          const entry = marksMap[s.id];
          const obtained = entry?.obtained !== undefined ? Number(entry.obtained) : null;
          const max = selectedComponent ? Number(selectedComponent.max_marks) : 100;
          const pct = obtained !== null ? Math.round((obtained / max) * 100) : '—';
          let grade = 'F';
          if (pct >= 90) grade = 'O';
          else if (pct >= 80) grade = 'A+';
          else if (pct >= 70) grade = 'A';
          else if (pct >= 60) grade = 'B+';
          else if (pct >= 50) grade = 'B';
          else if (pct === '—') grade = '—';

          return [
            s.rollNo,
            s.name,
            s.dept,
            max,
            obtained !== null ? obtained : 'N/A',
            pct !== '—' ? `${pct}%` : '—',
            grade,
            selectedComponent?.locked ? 'FINALIZED' : 'DRAFT',
          ];
        }),
        filename: `${selectedDept}_Sem${selectedSem}_Marks_Sheet`,
      });
      showToast(`Marks sheet exported as ${format.toUpperCase()}`);
    } catch {
      showToast('Export failed', 'error');
    }
  };

  const tabsList = [
    { id: 'entry', label: 'Marks Entry & Review' },
    { id: 'components', label: 'Assessment Components' },
    { id: 'import', label: 'CSV / Excel Import' },
    { id: 'reports', label: 'Official Reports' },
  ];

  return (
    <div className="fade-in">
      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, background: toastMsg.type === 'error' ? 'var(--error)' : 'var(--success)', color: '#fff', padding: '10px 16px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontSize: 13, fontWeight: 600 }}>
          {toastMsg.text}
        </div>
      )}

      <div className="page-header">
        <div className="page-header-actions">
          <div>
            <h1>Marks Management</h1>
            <p>Grade entry, component configuration, HOD reviews, and official transcript generation</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={() => setShowImportModal(true)}>
              <Upload size={16} /> Import CSV
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => handleExportMarksSheet('pdf')}>
              <Download size={16} /> Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* FILTER CARD */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Building size={16} color="var(--text-muted)" />
            <label className="form-label" style={{ margin: 0 }}>Dept:</label>
            <select className="form-select" style={{ width: 100 }} value={selectedDept} onChange={e => setSelectedDept(e.target.value)}>
              {departments.map(d => <option key={d.id} value={d.code}>{d.code}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={16} color="var(--text-muted)" />
            <label className="form-label" style={{ margin: 0 }}>Sem:</label>
            <select className="form-select" style={{ width: 80 }} value={selectedSem} onChange={e => setSelectedSem(e.target.value)}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={String(s)}>Sem {s}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} color="var(--text-muted)" />
            <label className="form-label" style={{ margin: 0 }}>Sec:</label>
            <select className="form-select" style={{ width: 80 }} value={selectedSection} onChange={e => setSelectedSection(e.target.value)}>
              <option value="A">Sec A</option>
              <option value="B">Sec B</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Award size={16} color="var(--text-muted)" />
            <label className="form-label" style={{ margin: 0 }}>Subject:</label>
            <select className="form-select" style={{ width: 220 }} value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
              {filteredSubjects.map(s => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
              {filteredSubjects.length === 0 && <option value="">No subjects found</option>}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label className="form-label" style={{ margin: 0 }}>Component:</label>
            <select
              className="form-select"
              style={{ width: 180 }}
              value={selectedComponent ? selectedComponent.id : ''}
              onChange={e => {
                const comp = componentsList.find(c => c.id === e.target.value);
                setSelectedComponent(comp || null);
              }}
            >
              {componentsList.map(c => <option key={c.id} value={c.id}>{c.name} (Max: {c.max_marks})</option>)}
              {componentsList.length === 0 && <option value="">No components configured</option>}
            </select>
          </div>
        </div>
      </div>

      <div className="tabs">
        {tabsList.map(t => (
          <button key={t.id} className={`tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: MARKS ENTRY & REVIEW */}
      {activeTab === 'entry' && (
        <div className="table-container">
          <div className="table-header">
            <span className="table-title">
              {selectedComponent ? `${selectedComponent.name} — Max Marks: ${selectedComponent.max_marks}` : 'Select a component'}
              {selectedComponent?.locked && <span className="badge badge-error" style={{ marginLeft: 10 }}>FINALIZED & LOCKED</span>}
            </span>
            {selectedComponent && isStaffOrAdmin && (
              <button className="btn btn-outline btn-sm" onClick={() => handleToggleLockComponent(selectedComponent.id, selectedComponent.locked)}>
                {selectedComponent.locked ? <Unlock size={14} /> : <Lock size={14} />} {selectedComponent.locked ? 'Unlock Component' : 'Lock & Finalize'}
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ width: 24, height: 24, margin: '0 auto 12px' }} />
              Loading marks from database...
            </div>
          ) : !selectedComponent ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <Award size={40} color="var(--text-muted)" style={{ marginBottom: 12 }} />
              <h3>No Assessment Component Selected</h3>
              <p>Configure a component under <strong>Assessment Components</strong> to begin entering marks.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Roll Number</th>
                  <th>Student Name</th>
                  <th>Department</th>
                  <th>Max Marks</th>
                  <th>Obtained Marks</th>
                  <th>Percentage</th>
                  <th>Grade</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {studentsList.map(s => {
                  const entry = marksMap[s.id] || {};
                  const obtainedVal = entry.obtained !== undefined ? entry.obtained : '';
                  const numObtained = Number(obtainedVal);
                  const maxVal = Number(selectedComponent.max_marks);
                  const isValid = obtainedVal !== '' && !isNaN(numObtained) && numObtained >= 0 && numObtained <= maxVal;
                  const pct = isValid ? Math.round((numObtained / maxVal) * 100) : '—';
                  const isLocked = selectedComponent.locked || entry.locked;

                  return (
                    <tr key={s.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{s.rollNo}</td>
                      <td style={{ fontWeight: 500 }}>{s.name}</td>
                      <td><span className="badge badge-info">{s.dept}</span></td>
                      <td style={{ fontWeight: 600 }}>{selectedComponent.max_marks}</td>
                      <td style={{ width: 140 }}>
                        <input
                          className="form-input"
                          type="number"
                          style={{ width: 100, borderColor: !isValid && obtainedVal !== '' ? 'var(--error)' : undefined }}
                          value={obtainedVal}
                          onChange={e => handleMarkChange(s.id, e.target.value)}
                          disabled={isLocked}
                          placeholder={`0-${selectedComponent.max_marks}`}
                        />
                      </td>
                      <td style={{ fontWeight: 600 }}>{pct !== '—' ? `${pct}%` : '—'}</td>
                      <td>
                        <span className={`badge ${pct >= 75 ? 'badge-success' : pct >= 50 ? 'badge-warning' : pct === '—' ? 'badge-neutral' : 'badge-error'}`}>
                          {pct >= 90 ? 'O' : pct >= 80 ? 'A+' : pct >= 70 ? 'A' : pct >= 60 ? 'B+' : pct >= 50 ? 'B' : pct === '—' ? '—' : 'F'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${isLocked ? 'badge-error' : entry.id ? 'badge-success' : 'badge-neutral'}`}>
                          {isLocked ? 'LOCKED' : entry.id ? 'SAVED' : 'DRAFT'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleSaveMarks(s.id)}
                          disabled={isLocked || obtainedVal === ''}
                        >
                          <Save size={12} /> Save
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {studentsList.length === 0 && <tr><td colSpan="9" style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No students found in this department.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB 2: ASSESSMENT COMPONENTS SETUP */}
      {activeTab === 'components' && (
        <div className="table-container">
          <div className="table-header">
            <span className="table-title">Configured Mark Components ({componentsList.length})</span>
            <button className="btn btn-primary btn-sm" disabled={!selectedSubject} onClick={() => setShowAddComponentModal(true)}>
              <Plus size={14} /> Add Component
            </button>
          </div>

          <table>
            <thead>
              <tr><th>Component Name</th><th>Type</th><th>Max Marks</th><th>Weightage</th><th>Entries Entered</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {componentsList.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td><span className="badge badge-info">{c.component_type}</span></td>
                  <td style={{ fontWeight: 700 }}>{c.max_marks}</td>
                  <td>{c.weight ? `${c.weight}%` : 'N/A'}</td>
                  <td>{c.entries_count || 0}</td>
                  <td>
                    <span className={`badge ${c.locked ? 'badge-error' : 'badge-success'}`}>
                      {c.locked ? 'LOCKED' : 'ACTIVE'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {isStaffOrAdmin && (
                        <button className="btn btn-outline btn-sm" onClick={() => handleToggleLockComponent(c.id, c.locked)}>
                          {c.locked ? <Unlock size={14} /> : <Lock size={14} />} {c.locked ? 'Unlock' : 'Lock'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {componentsList.length === 0 && <tr><td colSpan="7" style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No components created for this subject yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: CSV / EXCEL IMPORT */}
      {activeTab === 'import' && (
        <div className="card">
          <h3 style={{ marginBottom: 12, fontWeight: 700 }}>Bulk Import Marks from CSV / Excel</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
            Upload or paste lines of <code>RollNumber,Marks</code>. The system validates roll numbers and ensures marks do not exceed the max component bounds.
          </p>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">CSV Data (Format: <code>RollNumber,Marks</code>)</label>
            <textarea
              className="form-input"
              rows={8}
              style={{ fontFamily: 'monospace', fontSize: 13 }}
              placeholder={`2024CSE001,85\n2024CSE002,92\n2024CSE003,78`}
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={handleImportCsv} disabled={!selectedComponent || !csvText.trim()}>
              <FileSpreadsheet size={16} /> Import Marks Now
            </button>
          </div>

          {importSummary && (
            <div style={{ marginTop: 20, padding: 16, background: 'var(--surface-light)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--success)', fontWeight: 700, marginBottom: 4 }}>
                <CheckCircle size={18} /> Bulk Import Completed
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Successfully updated <strong>{importSummary.updatedCount}</strong> student records ({importSummary.skippedCount} skipped due to invalid format or bounds).
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: OFFICIAL REPORTS */}
      {activeTab === 'reports' && (
        <div className="card">
          <h3 style={{ marginBottom: 20, fontWeight: 700 }}>Official College Marks Reports</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
            {[
              { title: 'Class Result Ledger', desc: 'Complete subject-wise result sheet with grades' },
              { title: 'Internal Assessment Summary', desc: 'Internal test marks breakdown per student' },
              { title: 'HOD Audit & Endorsement Sheet', desc: 'Formal marks report for HOD review and lock' },
            ].map((doc, i) => (
              <div key={i} className="card" style={{ cursor: 'pointer' }}>
                <Award size={24} color="var(--accent)" style={{ marginBottom: 12 }} />
                <h4 style={{ marginBottom: 4 }}>{doc.title}</h4>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>{doc.desc}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-accent btn-sm" onClick={() => handleExportMarksSheet('pdf')}><Download size={14} /> PDF</button>
                  <button className="btn btn-outline btn-sm" onClick={() => handleExportMarksSheet('docx')}><Download size={14} /> DOCX</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: ADD COMPONENT */}
      {showAddComponentModal && (
        <div className="modal-overlay" onClick={() => setShowAddComponentModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Add Assessment Component</h3><button className="btn btn-ghost" onClick={() => setShowAddComponentModal(false)}>✕</button></div>
            <div className="modal-body">
              {errorMsg && <div style={{ color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>{errorMsg}</div>}
              <div className="form-group"><label className="form-label">Component Name *</label><input className="form-input" value={compForm.name} onChange={e => setCompForm({ ...compForm, name: e.target.value })} placeholder="e.g., Midterm Exam / Practical Lab" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label className="form-label">Type</label>
                  <select className="form-select" value={compForm.componentType} onChange={e => setCompForm({ ...compForm, componentType: e.target.value })}>
                    <option value="internal">Internal Assessment</option>
                    <option value="practical">Practical Marks</option>
                    <option value="assignment">Assignment</option>
                    <option value="midterm">Midterm Exam</option>
                    <option value="theory">Theory Exam</option>
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Max Marks *</label><input className="form-input" type="number" value={compForm.maxMarks} onChange={e => setCompForm({ ...compForm, maxMarks: Number(e.target.value) })} /></div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}><label className="form-label">Weightage (%)</label><input className="form-input" type="number" value={compForm.weight} onChange={e => setCompForm({ ...compForm, weight: Number(e.target.value) })} /></div>
              </div>
            </div>
            <div className="modal-footer"><button className="btn btn-outline" onClick={() => setShowAddComponentModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleCreateComponent} disabled={!compForm.name.trim() || !compForm.maxMarks}>Create Component</button></div>
          </div>
        </div>
      )}

      {/* MODAL: QUICK IMPORT */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Import Student Marks</h3><button className="btn btn-ghost" onClick={() => setShowImportModal(false)}>✕</button></div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Enter lines of <code>RollNumber,ObtainedMarks</code> below:</p>
              <textarea
                className="form-input"
                rows={6}
                style={{ fontFamily: 'monospace', fontSize: 13 }}
                placeholder={`2024CSE001,85\n2024CSE002,92`}
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
              />
            </div>
            <div className="modal-footer"><button className="btn btn-outline" onClick={() => setShowImportModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleImportCsv} disabled={!csvText.trim()}>Import Marks</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
