import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Building, Plus, Edit, Trash2, Users, GraduationCap, X } from 'lucide-react';

export default function DepartmentsPage() {
  const { getAccessToken } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [form, setForm] = useState({ code: '', name: '', hod: '' });
  const [errorMsg, setErrorMsg] = useState('');

  const loadData = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [deptRes, facRes] = await Promise.all([
        fetch('/api/departments', { headers }),
        fetch('/api/faculty?limit=200', { headers }),
      ]);

      if (deptRes.ok) {
        const data = await deptRes.json();
        setDepartments(data.map(d => ({
          id: d.id,
          code: d.code,
          name: d.name,
          hod: d.hod_name || 'Not Assigned',
          faculty: d.faculty_count || 0,
          students: d.student_count || 0,
          active: d.active !== false,
        })));
      }

      if (facRes.ok) {
        const facData = await facRes.json();
        setFacultyList((facData.data || facData).map(f => ({
          id: f.id,
          name: f.full_name || f.name,
          dept: f.dept_code || '',
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

  const filtered = useMemo(() =>
    departments.filter(d =>
      (d.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.code || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.hod || '').toLowerCase().includes(search.toLowerCase())
    ), [departments, search]
  );

  const openAdd = () => {
    setEditingDept(null);
    setForm({ code: '', name: '', hod: '' });
    setErrorMsg('');
    setShowModal(true);
  };

  const openEdit = (d) => {
    setEditingDept(d);
    setForm({ code: d.code, name: d.name, hod: d.hod || '' });
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

      if (editingDept) {
        const res = await fetch(`/api/departments/${editingDept.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ code: form.code, name: form.name }),
        });
        if (!res.ok) {
          const err = await res.json();
          setErrorMsg(err.error || 'Failed to update department.');
          return;
        }
      } else {
        const res = await fetch('/api/departments', {
          method: 'POST',
          headers,
          body: JSON.stringify({ code: form.code, name: form.name }),
        });
        if (!res.ok) {
          const err = await res.json();
          setErrorMsg(err.error || 'Failed to create department.');
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
      const res = await fetch(`/api/departments/${id}`, {
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

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-actions">
          <div><h1>Departments</h1><p>Manage academic departments and their configurations</p></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <input className="form-input search-input" placeholder="Search departments..." style={{ width: 240 }} value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setSearch('')}><X size={14} /></button>}
            </div>
            <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus size={16} /> Add Department</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 16px' }} />
          <p>Loading departments from database...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><Building size={48} /><h3>No departments found</h3><p>Try adjusting your search or add a new department.</p></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
          {filtered.map(d => (
            <div key={d.id} className="card" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ background: 'linear-gradient(135deg, var(--primary), var(--accent))', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 13, fontWeight: 700 }}>{d.code}</span>
                    {d.active && <span className="badge badge-success">Active</span>}
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>{d.name}</h3>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(d)}><Edit size={14} /></button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => setConfirmDelete(d.id)}><Trash2 size={14} /></button>
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>HOD: <strong style={{ color: 'var(--text-primary)' }}>{d.hod}</strong></div>
              <div style={{ display: 'flex', gap: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><GraduationCap size={14} color="var(--accent)" /> <strong>{d.faculty}</strong> Faculty</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><Users size={14} color="var(--accent)" /> <strong>{d.students}</strong> Students</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>{editingDept ? 'Edit' : 'Add'} Department</h3><button className="btn btn-ghost" onClick={() => setShowModal(false)}>✕</button></div>
            <div className="modal-body">
              {errorMsg && (
                <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--error)', borderRadius: 6, color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>
                  {errorMsg}
                </div>
              )}
              <div className="form-group"><label className="form-label">Department Code *</label><input className="form-input" placeholder="e.g., CSE" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
              <div className="form-group"><label className="form-label">Department Name *</label><input className="form-input" placeholder="e.g., Computer Science & Engineering" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Head of Department</label>
                <select className="form-select" value={form.hod} onChange={e => setForm({ ...form, hod: e.target.value })}>
                  <option value="">Select HOD...</option>
                  {facultyList.map(f => <option key={f.id} value={f.name}>{f.name} ({f.dept})</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.code.trim() || !form.name.trim()}>{editingDept ? 'Update' : 'Save'} Department</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-body" style={{ textAlign: 'center', padding: 32 }}>
              <Trash2 size={40} color="var(--error)" style={{ marginBottom: 16 }} />
              <h3 style={{ marginBottom: 8 }}>Delete Department?</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>This action cannot be undone. All associated data will be removed.</p>
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
