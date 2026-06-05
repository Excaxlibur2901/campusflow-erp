import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { Building, Plus, Edit, Trash2, Users, GraduationCap, X } from 'lucide-react';

export default function DepartmentsPage() {
  const { departments, addDepartment, updateDepartment, deleteDepartment, facultyList } = useData();
  const [showModal, setShowModal] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [form, setForm] = useState({ code: '', name: '', hod: '' });

  const filtered = useMemo(() =>
    departments.filter(d =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.code.toLowerCase().includes(search.toLowerCase()) ||
      d.hod.toLowerCase().includes(search.toLowerCase())
    ), [departments, search]
  );

  const openAdd = () => {
    setEditingDept(null);
    setForm({ code: '', name: '', hod: '' });
    setShowModal(true);
  };

  const openEdit = (d) => {
    setEditingDept(d);
    setForm({ code: d.code, name: d.name, hod: d.hod });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.code.trim() || !form.name.trim()) return;
    if (editingDept) {
      updateDepartment(editingDept.id, form);
    } else {
      addDepartment(form);
    }
    setShowModal(false);
  };

  const handleDelete = (id) => {
    deleteDepartment(id);
    setConfirmDelete(null);
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
      {filtered.length === 0 ? (
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
