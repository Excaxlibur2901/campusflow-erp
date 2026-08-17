import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus, Edit, Trash2 } from 'lucide-react';

export default function SubjectsPage() {
  const { getAccessToken } = useAuth();
  const [subjectsList, setSubjectsList] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editingSub, setEditingSub] = useState(null);
  const [form, setForm] = useState({ code: '', name: '', dept: 'CSE', credits: 3, type: 'theory', weeklyHours: 3, semester: 3, facultyId: '' });
  const [errorMsg, setErrorMsg] = useState('');

  const loadData = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [subRes, deptRes, facRes] = await Promise.all([
        fetch('/api/subjects', { headers }),
        fetch('/api/departments', { headers }),
        fetch('/api/faculty?limit=200', { headers }),
      ]);

      if (deptRes.ok) {
        const dData = await deptRes.json();
        setDepartments(dData.map(d => ({ id: d.id, code: d.code, name: d.name })));
        if (dData.length > 0 && form.dept === 'CSE') {
          setForm(f => ({ ...f, dept: dData[0].code }));
        }
      }

      if (facRes.ok) {
        const fData = await facRes.json();
        const fRows = fData.data || fData;
        setFacultyList(fRows.map(f => ({
          id: f.id,
          name: f.full_name || f.name || '',
          dept: f.dept_code || f.dept || '',
        })));
      }

      if (subRes.ok) {
        const sData = await subRes.json();
        setSubjectsList(sData.map(s => ({
          id: s.id,
          code: s.code || '',
          name: s.name || '',
          dept: s.dept_code || s.dept || 'CSE',
          departmentId: s.department_id,
          facultyId: s.faculty_id || null,
          facultyName: s.faculty_name || '',
          credits: Number(s.credits || 3),
          type: s.subject_type || s.type || 'theory',
          weeklyHours: Number(s.weekly_hours || s.weeklyHours || 3),
          semester: Number(s.semester || 3),
          active: s.active !== false,
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

  const filtered = useMemo(() => subjectsList.filter(s => {
    const ms = (s.name || '').toLowerCase().includes(search.toLowerCase()) ||
               (s.code || '').toLowerCase().includes(search.toLowerCase()) ||
               (s.facultyName || '').toLowerCase().includes(search.toLowerCase());
    const md = deptFilter === 'All' || s.dept === deptFilter;
    return ms && md;
  }), [subjectsList, search, deptFilter]);

  const openAdd = () => {
    setEditingSub(null);
    setForm({
      code: '',
      name: '',
      dept: departments.length > 0 ? departments[0].code : 'CSE',
      credits: 3,
      type: 'theory',
      weeklyHours: 3,
      semester: 3,
      facultyId: '',
    });
    setErrorMsg('');
    setShowModal(true);
  };

  const openEdit = (s) => {
    setEditingSub(s);
    setForm({
      code: s.code,
      name: s.name,
      dept: s.dept,
      credits: s.credits,
      type: s.type,
      weeklyHours: s.weeklyHours,
      semester: s.semester,
      facultyId: s.facultyId || '',
    });
    setErrorMsg('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) return;
    setErrorMsg('');

    try {
      const token = await getAccessToken();
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      const matchedDept = departments.find(d => d.code === form.dept);
      const departmentId = matchedDept ? matchedDept.id : null;

      if (editingSub) {
        const res = await fetch(`/api/subjects/${editingSub.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            code: form.code,
            name: form.name,
            subjectType: form.type,
            credits: Number(form.credits),
            weeklyHours: Number(form.weeklyHours),
            semester: Number(form.semester),
            facultyId: form.facultyId || null,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          setErrorMsg(err.error || 'Failed to update subject.');
          return;
        }
      } else {
        const res = await fetch('/api/subjects', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            code: form.code,
            name: form.name,
            subjectType: form.type,
            credits: Number(form.credits),
            weeklyHours: Number(form.weeklyHours),
            semester: Number(form.semester),
            departmentId,
            facultyId: form.facultyId || null,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          setErrorMsg(err.error || 'Failed to add subject.');
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
      const res = await fetch(`/api/subjects/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await loadData();
      }
    } catch {
      // Delete error handling
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-actions">
          <div><h1>Subjects</h1><p>Manage subject catalog, credits, and assignments</p></div>
          <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus size={16} /> Add Subject</button>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header">
          <span className="table-title">{filtered.length} Subjects</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input search-input" placeholder="Search..." style={{ width: 220 }} value={search} onChange={e => setSearch(e.target.value)} />
            <select className="form-select" style={{ width: 120 }} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
              <option value="All">All Depts</option>
              {departments.map(d => <option key={d.id} value={d.code}>{d.code}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ width: 24, height: 24, margin: '0 auto 12px' }} />
            Loading subjects from database...
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Code</th><th>Subject Name</th><th>Department</th><th>Faculty</th><th>Credits</th><th>Type</th><th>Weekly Hours</th><th>Semester</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{s.code}</td>
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td><span className="badge badge-info">{s.dept}</span></td>
                  <td>{s.facultyName ? <span className="badge badge-neutral" style={{ fontWeight: 600 }}>{s.facultyName}</span> : <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Unassigned</span>}</td>
                  <td style={{ fontWeight: 600 }}>{s.credits}</td>
                  <td><span className={`badge ${s.type === 'lab' ? 'badge-warning' : 'badge-neutral'}`}>{s.type}</span></td>
                  <td>{s.weeklyHours}h</td>
                  <td>Sem {s.semester}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openEdit(s)}><Edit size={14} /></button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => handleDelete(s.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan="9" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No subjects found</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>{editingSub ? 'Edit' : 'Add'} Subject</h3><button className="btn btn-ghost" onClick={() => setShowModal(false)}>✕</button></div>
            <div className="modal-body">
              {errorMsg && (
                <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--error)', borderRadius: 6, color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>
                  {errorMsg}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label className="form-label">Subject Code *</label><input className="form-input" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
                <div className="form-group"><label className="form-label">Subject Name *</label><input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Department</label>
                  <select className="form-select" value={form.dept} onChange={e => setForm({ ...form, dept: e.target.value })}>
                    {departments.map(d => <option key={d.id} value={d.code}>{d.code}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Assign Faculty</label>
                  <select className="form-select" value={form.facultyId} onChange={e => setForm({ ...form, facultyId: e.target.value })}>
                    <option value="">-- Unassigned --</option>
                    {facultyList.map(f => (
                      <option key={f.id} value={f.id}>{f.name} {f.dept ? `(${f.dept})` : '(All branches)'}</option>
                    ))}
                  </select>
                  <small style={{ color: 'var(--text-muted)' }}>Faculty can be assigned across branches.</small>
                </div>
                <div className="form-group"><label className="form-label">Type</label><select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option value="theory">Theory</option><option value="lab">Lab</option></select></div>
                <div className="form-group"><label className="form-label">Credits</label><input className="form-input" type="number" value={form.credits} onChange={e => setForm({ ...form, credits: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Weekly Hours</label><input className="form-input" type="number" value={form.weeklyHours} onChange={e => setForm({ ...form, weeklyHours: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Semester</label><select className="form-select" value={form.semester} onChange={e => setForm({ ...form, semester: e.target.value })}>{[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>Sem {s}</option>)}</select></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.code.trim() || !form.name.trim()}>{editingSub ? 'Update' : 'Add'} Subject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
