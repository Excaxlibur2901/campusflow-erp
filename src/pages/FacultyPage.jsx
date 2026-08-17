import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus, Edit, Trash2, Link2, Save } from 'lucide-react';

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
  const [form, setForm] = useState({ name: '', empCode: '', dept: 'CSE', specialization: '', designation: '', maxHours: 22, currentHours: 0 });
  const [formSubjectIds, setFormSubjectIds] = useState([]);
  const [formAssignmentDepartmentIds, setFormAssignmentDepartmentIds] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [assignmentFaculty, setAssignmentFaculty] = useState(null);
  const [assignmentDepartments, setAssignmentDepartments] = useState([]);
  const [assignmentSubjects, setAssignmentSubjects] = useState([]);
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

      if (deptRes.ok) {
        const dData = await deptRes.json();
        setDepartments(dData.map(d => ({ id: d.id, code: d.code, name: d.name })));
        if (dData.length > 0 && form.dept === 'CSE') {
          setForm(f => ({ ...f, dept: dData[0].code }));
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
          semester: Number(s.semester || 3),
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
        })));
      }
    } catch {
      // Best effort load
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, form.dept]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => facultyList.filter(f => {
    const ms = (f.name || '').toLowerCase().includes(search.toLowerCase()) ||
               (f.empCode || '').toLowerCase().includes(search.toLowerCase());
    const md = deptFilter === 'All' || f.dept === deptFilter;
    return ms && md;
  }), [facultyList, search, deptFilter]);

  const formSubjectOptions = useMemo(() => {
    const selectedDepartments = formAssignmentDepartmentIds.length
      ? formAssignmentDepartmentIds
      : departments.filter(d => d.code === form.dept).map(d => d.id);
    return subjects.filter(subject => selectedDepartments.includes(subject.departmentId));
  }, [departments, form.dept, formAssignmentDepartmentIds, subjects]);

  const openAdd = () => {
    setEditingFac(null);
    setForm({
      name: '',
      empCode: `FAC${String(facultyList.length + 1).padStart(3, '0')}`,
      dept: departments.length > 0 ? departments[0].code : 'CSE',
      specialization: '',
      designation: 'Assistant Professor',
      maxHours: 22,
      currentHours: 0,
    });
    setFormSubjectIds([]);
    setFormAssignmentDepartmentIds([]);
    setErrorMsg('');
    setShowModal(true);
  };

  const openEdit = async (f) => {
    setEditingFac(f);
    setFormSubjectIds([]);
    setFormAssignmentDepartmentIds([]);
    setForm({
      name: f.name,
      empCode: f.empCode,
      dept: f.dept,
      specialization: f.specialization,
      designation: f.designation || 'Faculty',
      maxHours: f.maxHours,
      currentHours: f.currentHours,
    });
    setErrorMsg('');
    setShowModal(true);

    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/faculty/${f.id}/assignments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const rows = await res.json();
        setFormSubjectIds([...new Set(rows.map(row => row.subject_id))]);
        setFormAssignmentDepartmentIds([...new Set(rows.map(row => row.department_id))]);
      }
    } catch {
      setErrorMsg('Unable to load faculty subjects.');
    }
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
      const selectedSubjectDepartmentIds = subjects
        .filter(subject => formSubjectIds.includes(subject.id))
        .map(subject => subject.departmentId)
        .filter(Boolean);
      const assignmentDepartmentIds = [...new Set([
        ...formAssignmentDepartmentIds,
        ...selectedSubjectDepartmentIds,
        ...(departmentId ? [departmentId] : []),
      ])];

      if (editingFac) {
        const res = await fetch(`/api/faculty/${editingFac.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            fullName: form.name,
            departmentId,
            specialization: form.specialization,
            designation: form.designation,
            maxWeeklyHours: Number(form.maxHours),
            currentHours: Number(form.currentHours),
            departmentIds: assignmentDepartmentIds,
            subjectIds: formSubjectIds,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          setErrorMsg(err.error || 'Failed to update faculty.');
          return;
        }
      } else {
        const res = await fetch('/api/faculty', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            employeeCode: form.empCode,
            fullName: form.name,
            departmentId,
            specialization: form.specialization,
            designation: form.designation,
            maxWeeklyHours: Number(form.maxHours),
            currentHours: Number(form.currentHours),
            departmentIds: assignmentDepartmentIds,
            subjectIds: formSubjectIds,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          setErrorMsg(err.error || 'Failed to add faculty.');
          return;
        }
        await res.json();
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
    setAssignmentDepartments([]);
    setAssignmentSubjects([]);
    setAssignmentLoading(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/faculty/${faculty.id}/assignments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const rows = await res.json();
        setAssignmentDepartments([...new Set(rows.map(row => row.department_id))]);
        setAssignmentSubjects([...new Set(rows.map(row => row.subject_id))]);
      }
    } catch {
      setErrorMsg('Unable to load faculty assignments.');
    } finally {
      setAssignmentLoading(false);
    }
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
          departmentIds: assignmentDepartments,
          subjectIds: assignmentSubjects,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setErrorMsg(err.error || 'Failed to save assignments.');
        return;
      }
      setAssignmentFaculty(null);
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
          <div><h1>Faculty Management</h1><p>Manage faculty members, workload, and availability</p></div>
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
              <tr><th>Emp Code</th><th>Name</th><th>Department</th><th>Specialization</th><th>Workload</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(f => (
                <tr key={f.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{f.empCode}</td>
                  <td style={{ fontWeight: 600 }}>{f.name}</td>
                  <td><span className="badge badge-info">{f.dept}</span></td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{f.specialization}</td>
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
                      <button className="btn btn-outline btn-sm" onClick={() => openAssignments(f)}><Link2 size={14} /> Assign</button>
                      <button className="btn btn-outline btn-sm" onClick={() => openEdit(f)}><Edit size={14} /> Edit</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => setConfirmDelete(f.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan="7" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No faculty found</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>{editingFac ? 'Edit' : 'Add'} Faculty</h3><button className="btn btn-ghost" onClick={() => setShowModal(false)}>✕</button></div>
            <div className="modal-body">
              {errorMsg && (
                <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--error)', borderRadius: 6, color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>
                  {errorMsg}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group"><label className="form-label">Full Name *</label><input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Dr. / Prof. Name" /></div>
                <div className="form-group"><label className="form-label">Emp Code *</label><input className="form-input" value={form.empCode} onChange={e => setForm({ ...form, empCode: e.target.value })} disabled={!!editingFac} /></div>
                <div className="form-group"><label className="form-label">Department</label>
                  <select className="form-select" value={form.dept} onChange={e => setForm({ ...form, dept: e.target.value })}>
                    {departments.map(d => <option key={d.id} value={d.code}>{d.code}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Designation</label><input className="form-input" value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} placeholder="Professor / Assistant Prof" /></div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}><label className="form-label">Specialization</label><input className="form-input" value={form.specialization} onChange={e => setForm({ ...form, specialization: e.target.value })} placeholder="e.g. Machine Learning, Networks" /></div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Subjects</label>
                  <select
                    className="form-select"
                    multiple
                    size={Math.min(8, Math.max(4, formSubjectOptions.length))}
                    value={formSubjectIds}
                    onChange={e => setFormSubjectIds([...e.target.selectedOptions].map(option => option.value))}
                  >
                    {formSubjectOptions.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.departmentCode} · Sem {s.semester} · {s.code} - {s.name}
                      </option>
                    ))}
                  </select>
                  <small style={{ color: 'var(--text-muted)' }}>
                    Use Ctrl/Cmd-click to select multiple subjects. Existing assignments across branches are preserved.
                  </small>
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

      {assignmentFaculty && (
        <div className="modal-overlay" onClick={() => !assignmentSaving && setAssignmentFaculty(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Assign Faculty: {assignmentFaculty.name}</h3>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Branches / Departments</label>
                    <select
                      className="form-select"
                      multiple
                      size={Math.min(8, Math.max(4, departments.length))}
                      value={assignmentDepartments}
                      onChange={e => {
                        const selected = [...e.target.selectedOptions].map(option => option.value);
                        setAssignmentDepartments(selected);
                        setAssignmentSubjects(current => current.filter(subjectId => {
                          const subject = subjects.find(item => item.id === subjectId);
                          return subject && selected.includes(subject.departmentId);
                        }));
                      }}
                    >
                      {departments.map(d => <option key={d.id} value={d.id}>{d.code} - {d.name}</option>)}
                    </select>
                    <small style={{ color: 'var(--text-muted)' }}>Use Ctrl/Cmd-click to select multiple branches.</small>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Subjects</label>
                    <select
                      className="form-select"
                      multiple
                      size={Math.min(12, Math.max(4, subjects.filter(s => assignmentDepartments.includes(s.departmentId)).length))}
                      value={assignmentSubjects}
                      onChange={e => setAssignmentSubjects([...e.target.selectedOptions].map(option => option.value))}
                    >
                      {subjects
                        .filter(s => assignmentDepartments.includes(s.departmentId))
                        .map(s => <option key={s.id} value={s.id}>{s.departmentCode} · Sem {s.semester} · {s.code} - {s.name}</option>)}
                    </select>
                    <small style={{ color: 'var(--text-muted)' }}>Only subjects from selected branches are shown.</small>
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

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-body" style={{ textAlign: 'center', padding: 32 }}>
              <Trash2 size={40} color="var(--error)" style={{ marginBottom: 16 }} />
              <h3 style={{ marginBottom: 8 }}>Remove Faculty?</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>This will remove the faculty member from the database.</p>
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
