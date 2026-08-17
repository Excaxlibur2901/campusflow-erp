import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus, Edit, Trash2, Link2, Save, X, BookOpen } from 'lucide-react';

export default function FacultyPage() {
  const { getAccessToken } = useAuth();
  const [facultyList, setFacultyList] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editingFac, setEditingFac] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Form state
  const [form, setForm] = useState({
    name: '',
    empCode: '',
    dept: '',
    specialization: '',
    designation: '',
    maxHours: 22,
    currentHours: 0,
  });
  const [formSubjectIds, setFormSubjectIds] = useState([]);
  const [formDeptForSubjects, setFormDeptForSubjects] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Assign Modal state
  const [assignmentFaculty, setAssignmentFaculty] = useState(null);
  const [assignmentDeptForSubjects, setAssignmentDeptForSubjects] = useState('');
  const [assignmentSubjectIds, setAssignmentSubjectIds] = useState([]);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [facRes, deptRes, subRes] = await Promise.all([
        fetch('/api/faculty?limit=200', { headers }),
        fetch('/api/departments', { headers }),
        fetch('/api/subjects', { headers }),
      ]);

      let loadedDepts = [];
      if (deptRes.ok) {
        const dData = await deptRes.json();
        loadedDepts = dData.map(d => ({ id: d.id, code: d.code, name: d.name }));
        setDepartments(loadedDepts);
        if (loadedDepts.length > 0) {
          setFormDeptForSubjects(prev => prev || loadedDepts[0].code);
          setAssignmentDeptForSubjects(prev => prev || loadedDepts[0].code);
        }
      }

      if (subRes.ok) {
        const sData = await subRes.json();
        setSubjects(sData.map(s => ({
          id: s.id,
          code: s.code,
          name: s.name,
          departmentId: s.department_id,
          departmentCode: s.dept_code || '',
          semester: Number(s.semester || s.semester_number || 1),
        })));
      }

      if (facRes.ok) {
        const fData = await facRes.json();
        const rows = fData.data || fData;
        setFacultyList(rows.map(f => ({
          id: f.id,
          empCode: f.employee_code || f.empCode || '',
          name: f.full_name || f.name || '',
          dept: f.dept_code || f.dept || '',
          departmentId: f.department_id,
          specialization: f.specialization || '',
          designation: f.designation || 'Faculty',
          maxHours: f.max_weekly_hours ?? f.maxHours ?? 22,
          currentHours: f.current_hours ?? f.currentHours ?? 0,
          email: f.email || '',
          status: f.active !== false ? 'ACTIVE' : 'INACTIVE',
          assignments: Array.isArray(f.assignments) ? f.assignments : [],
        })));
      }
    } catch {
      // Best effort load
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => facultyList.filter(f => {
    const ms = (f.name || '').toLowerCase().includes(search.toLowerCase()) ||
               (f.empCode || '').toLowerCase().includes(search.toLowerCase());
    const md = deptFilter === 'All' || f.dept === deptFilter;
    return ms && md;
  }), [facultyList, search, deptFilter]);

  // Subjects available for the selected department in the Add/Edit form
  const formSubjectsInSelectedDept = useMemo(() => {
    return subjects.filter(s => s.departmentCode === formDeptForSubjects);
  }, [subjects, formDeptForSubjects]);

  // Subjects available for the selected department in the Assign modal
  const assignSubjectsInSelectedDept = useMemo(() => {
    return subjects.filter(s => s.departmentCode === assignmentDeptForSubjects);
  }, [subjects, assignmentDeptForSubjects]);

  const openAdd = () => {
    setEditingFac(null);
    const initialDept = departments.length > 0 ? departments[0].code : 'CSE';
    setForm({
      name: '',
      empCode: `FAC${String(facultyList.length + 1).padStart(3, '0')}`,
      dept: initialDept,
      specialization: '',
      designation: 'Assistant Professor',
      maxHours: 22,
      currentHours: 0,
    });
    setFormDeptForSubjects(initialDept);
    setFormSubjectIds([]);
    setErrorMsg('');
    setShowModal(true);
  };

  const openEdit = async (f) => {
    setEditingFac(f);
    setForm({
      name: f.name,
      empCode: f.empCode,
      dept: f.dept,
      specialization: f.specialization,
      designation: f.designation || 'Faculty',
      maxHours: f.maxHours,
      currentHours: f.currentHours,
    });
    setFormDeptForSubjects(f.dept || (departments[0]?.code || 'CSE'));

    // Initialize with existing assignments from list if present
    const existingSubjectIds = f.assignments ? f.assignments.map(a => a.subject_id) : [];
    setFormSubjectIds(existingSubjectIds);
    setErrorMsg('');
    setShowModal(true);

    // Fetch authoritative assignments from server
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/faculty/${f.id}/assignments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const rows = await res.json();
        setFormSubjectIds(rows.map(row => row.subject_id));
      }
    } catch {
      // Keep existing
    }
  };

  const toggleFormSubject = (subjectId) => {
    setFormSubjectIds(prev =>
      prev.includes(subjectId) ? prev.filter(id => id !== subjectId) : [...prev, subjectId]
    );
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.empCode.trim()) return;
    setErrorMsg('');

    try {
      const token = await getAccessToken();
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      const matchedDept = departments.find(d => d.code === form.dept);
      const departmentId = matchedDept ? matchedDept.id : null;

      const payload = {
        fullName: form.name.trim(),
        departmentId,
        specialization: form.specialization.trim(),
        designation: form.designation.trim(),
        maxWeeklyHours: Number(form.maxHours),
        currentHours: Number(form.currentHours),
        subjectIds: formSubjectIds,
      };

      if (editingFac) {
        const res = await fetch(`/api/faculty/${editingFac.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          setErrorMsg(err.error || 'Failed to update faculty.');
          return;
        }
      } else {
        payload.employeeCode = form.empCode.trim();
        const res = await fetch('/api/faculty', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          setErrorMsg(err.error || 'Failed to add faculty.');
          return;
        }
      }

      setShowModal(false);
      await loadData();
    } catch {
      setErrorMsg('Network error. Please try again.');
    }
  };

  const handleDelete = async (id) => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/faculty/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setConfirmDelete(null);
        await loadData();
      }
    } catch {
      // Delete error handling
    }
  };

  const openAssignments = async (faculty) => {
    setAssignmentFaculty(faculty);
    setAssignmentDeptForSubjects(faculty.dept || departments[0]?.code || 'CSE');
    setAssignmentSubjectIds(faculty.assignments ? faculty.assignments.map(a => a.subject_id) : []);
    setAssignmentLoading(true);
    setErrorMsg('');
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/faculty/${faculty.id}/assignments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const rows = await res.json();
        setAssignmentSubjectIds(rows.map(row => row.subject_id));
      }
    } catch {
      setErrorMsg('Unable to load faculty assignments.');
    } finally {
      setAssignmentLoading(false);
    }
  };

  const toggleAssignSubject = (subjectId) => {
    setAssignmentSubjectIds(prev =>
      prev.includes(subjectId) ? prev.filter(id => id !== subjectId) : [...prev, subjectId]
    );
  };

  const saveAssignments = async () => {
    if (!assignmentFaculty) return;
    setAssignmentSaving(true);
    setErrorMsg('');
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/faculty/${assignmentFaculty.id}/assignments`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          subjectIds: assignmentSubjectIds,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setErrorMsg(err.error || 'Failed to save assignments.');
        return;
      }
      setAssignmentFaculty(null);
      await loadData();
    } catch {
      setErrorMsg('Network error saving assignments.');
    } finally {
      setAssignmentSaving(false);
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-actions">
          <div><h1>Faculty Management</h1><p>Manage faculty members, multi-branch subject assignments, and workload</p></div>
          <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus size={16} /> Add Faculty</button>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header">
          <span className="table-title">{filtered.length} Faculty Members</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input search-input" placeholder="Search faculty..." style={{ width: 220 }} value={search} onChange={e => setSearch(e.target.value)} />
            <select className="form-select" style={{ width: 120 }} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
              <option value="All">All Depts</option>
              {departments.map(d => <option key={d.id} value={d.code}>{d.code}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ width: 24, height: 24, margin: '0 auto 12px' }} />
            Loading faculty from database...
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Emp Code</th><th>Name</th><th>Primary Dept</th><th>Assigned Subjects</th><th>Workload</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(f => {
                const assignedList = f.assignments || [];
                return (
                  <tr key={f.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{f.empCode}</td>
                    <td style={{ fontWeight: 600 }}>{f.name}</td>
                    <td><span className="badge badge-info">{f.dept}</span></td>
                    <td>
                      {assignedList.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 280 }}>
                          {assignedList.map((a, i) => (
                            <span key={a.subject_id || i} className="badge badge-neutral" style={{ fontSize: 11 }}>
                              <strong>{a.department_code}:</strong> {a.subject_code} ({a.subject_name})
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>None</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="progress-bar" style={{ width: 80 }}>
                          <div className="progress-fill" style={{ width: `${Math.min(100, (f.currentHours / (f.maxHours || 1)) * 100)}%`, background: f.currentHours >= f.maxHours ? 'var(--error)' : f.currentHours >= f.maxHours - 2 ? 'var(--warning)' : 'var(--success)' }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{f.currentHours}/{f.maxHours}h</span>
                      </div>
                    </td>
                    <td><span className={`badge ${f.currentHours >= f.maxHours ? 'badge-error' : 'badge-success'}`}>{f.currentHours >= f.maxHours ? 'Full' : 'Available'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-outline btn-sm" onClick={() => openAssignments(f)} title="Assign Subjects across Branches"><Link2 size={14} /> Assign</button>
                        <button className="btn btn-outline btn-sm" onClick={() => openEdit(f)}><Edit size={14} /> Edit</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => setConfirmDelete(f.id)}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan="7" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No faculty found</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* Add / Edit Faculty Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 680 }}>
            <div className="modal-header"><h3>{editingFac ? 'Edit' : 'Add'} Faculty</h3><button className="btn btn-ghost" onClick={() => setShowModal(false)}>✕</button></div>
            <div className="modal-body">
              {errorMsg && (
                <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--error)', borderRadius: 6, color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>
                  {errorMsg}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="form-group"><label className="form-label">Full Name *</label><input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Dr. / Prof. Name" /></div>
                <div className="form-group"><label className="form-label">Emp Code *</label><input className="form-input" value={form.empCode} onChange={e => setForm({ ...form, empCode: e.target.value })} disabled={!!editingFac} /></div>
                <div className="form-group"><label className="form-label">Primary Department</label>
                  <select className="form-select" value={form.dept} onChange={e => setForm({ ...form, dept: e.target.value })}>
                    {departments.map(d => <option key={d.id} value={d.code}>{d.code} - {d.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Designation</label><input className="form-input" value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} placeholder="Professor / Assistant Prof" /></div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}><label className="form-label">Specialization</label><input className="form-input" value={form.specialization} onChange={e => setForm({ ...form, specialization: e.target.value })} placeholder="e.g. Machine Learning, Distributed Systems" /></div>

                {/* Multi-Branch Subject Assignment Section */}
                <div className="form-group" style={{ gridColumn: 'span 2', background: 'var(--bg-subtle, rgba(0,0,0,0.03))', padding: 12, borderRadius: 8, border: '1px solid var(--border-color, rgba(0,0,0,0.08))' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label className="form-label" style={{ fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <BookOpen size={16} /> Assign Subjects Across Branches
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Branch:</span>
                      <select
                        className="form-select"
                        style={{ width: 140, padding: '4px 8px', fontSize: 13 }}
                        value={formDeptForSubjects}
                        onChange={e => setFormDeptForSubjects(e.target.value)}
                      >
                        {departments.map(d => <option key={d.id} value={d.code}>{d.code}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Subjects for selected department */}
                  <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 6, padding: 8, background: 'var(--bg-surface, #fff)' }}>
                    {formSubjectsInSelectedDept.length > 0 ? (
                      formSubjectsInSelectedDept.map(s => {
                        const checked = formSubjectIds.includes(s.id);
                        return (
                          <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', cursor: 'pointer', borderRadius: 4, background: checked ? 'rgba(59, 130, 246, 0.08)' : 'transparent' }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleFormSubject(s.id)}
                            />
                            <span style={{ fontSize: 13 }}>
                              <strong style={{ fontFamily: 'monospace' }}>{s.code}</strong> — {s.name} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>(Sem {s.semester})</span>
                            </span>
                          </label>
                        );
                      })
                    ) : (
                      <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 8, textAlign: 'center' }}>No subjects found for branch {formDeptForSubjects}</div>
                    )}
                  </div>

                  {/* Summary of assigned subjects across all branches */}
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Assigned Subjects ({formSubjectIds.length}):
                    </div>
                    {formSubjectIds.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {formSubjectIds.map(id => {
                          const s = subjects.find(item => item.id === id);
                          if (!s) return null;
                          return (
                            <span key={id} className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 12 }}>
                              <strong>{s.departmentCode}:</strong> {s.code} - {s.name}
                              <button
                                type="button"
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'inherit' }}
                                onClick={() => toggleFormSubject(id)}
                                title="Remove assignment"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No subjects currently assigned.</div>
                    )}
                  </div>
                </div>

                <div className="form-group"><label className="form-label">Max Hours/Week</label><input className="form-input" type="number" value={form.maxHours} onChange={e => setForm({ ...form, maxHours: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Current Hours</label><input className="form-input" type="number" value={form.currentHours} onChange={e => setForm({ ...form, currentHours: e.target.value })} /></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.name.trim()}>{editingFac ? 'Update' : 'Add'} Faculty</button>
            </div>
          </div>
        </div>
      )}

      {/* Standalone Quick-Assign Modal */}
      {assignmentFaculty && (
        <div className="modal-overlay" onClick={() => !assignmentSaving && setAssignmentFaculty(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
            <div className="modal-header">
              <h3>Assign Subjects: {assignmentFaculty.name}</h3>
              <button className="btn btn-ghost" onClick={() => setAssignmentFaculty(null)}>✕</button>
            </div>
            <div className="modal-body">
              {errorMsg && (
                <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--error)', borderRadius: 6, color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>
                  {errorMsg}
                </div>
              )}
              {assignmentLoading ? (
                <div style={{ textAlign: 'center', padding: 24 }}>Loading assignments...</div>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>Select Branch to browse subjects:</label>
                    <select
                      className="form-select"
                      style={{ width: 160 }}
                      value={assignmentDeptForSubjects}
                      onChange={e => setAssignmentDeptForSubjects(e.target.value)}
                    >
                      {departments.map(d => <option key={d.id} value={d.code}>{d.code} - {d.name}</option>)}
                    </select>
                  </div>

                  <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 6, padding: 8, background: 'var(--bg-surface, #fff)', marginBottom: 12 }}>
                    {assignSubjectsInSelectedDept.length > 0 ? (
                      assignSubjectsInSelectedDept.map(s => {
                        const checked = assignmentSubjectIds.includes(s.id);
                        return (
                          <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', cursor: 'pointer', borderRadius: 4, background: checked ? 'rgba(59, 130, 246, 0.08)' : 'transparent' }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAssignSubject(s.id)}
                            />
                            <span style={{ fontSize: 13 }}>
                              <strong style={{ fontFamily: 'monospace' }}>{s.code}</strong> — {s.name} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>(Sem {s.semester})</span>
                            </span>
                          </label>
                        );
                      })
                    ) : (
                      <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 12, textAlign: 'center' }}>No subjects found for branch {assignmentDeptForSubjects}</div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                      Active Assignments Across All Branches ({assignmentSubjectIds.length}):
                    </div>
                    {assignmentSubjectIds.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 110, overflowY: 'auto', padding: 4 }}>
                        {assignmentSubjectIds.map(id => {
                          const s = subjects.find(item => item.id === id);
                          if (!s) return null;
                          return (
                            <span key={id} className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', fontSize: 12 }}>
                              <strong>{s.departmentCode}:</strong> {s.code} - {s.name}
                              <button
                                type="button"
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'inherit' }}
                                onClick={() => toggleAssignSubject(id)}
                                title="Remove assignment"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No subjects assigned.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setAssignmentFaculty(null)} disabled={assignmentSaving}>Cancel</button>
              <button className="btn btn-primary" onClick={saveAssignments} disabled={assignmentLoading || assignmentSaving}>
                <Save size={14} /> {assignmentSaving ? 'Saving...' : 'Save Assignments'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-body" style={{ textAlign: 'center', padding: 32 }}>
              <Trash2 size={40} color="var(--error)" style={{ marginBottom: 16 }} />
              <h3 style={{ marginBottom: 8 }}>Remove Faculty?</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>This will remove the faculty member and their assignments from the database.</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button className="btn btn-outline" onClick={() => setConfirmDelete(null)}>Cancel</button>
                <button className="btn btn-error" onClick={() => handleDelete(confirmDelete)}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
