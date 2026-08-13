import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus, Edit, Trash2, Building } from 'lucide-react';

export default function ClassroomsPage() {
  const { getAccessToken } = useAuth();
  const [classroomsList, setClassroomsList] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [form, setForm] = useState({ code: '', name: '', type: 'lecture', capacity: 60, floor: 1, dept: '' });
  const [errorMsg, setErrorMsg] = useState('');

  const loadData = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [cRes, dRes] = await Promise.all([
        fetch('/api/classrooms', { headers }),
        fetch('/api/departments', { headers }),
      ]);

      if (dRes.ok) {
        const dData = await dRes.json();
        setDepartments(dData.map(d => ({ id: d.id, code: d.code, name: d.name })));
      }

      if (cRes.ok) {
        const cData = await cRes.json();
        setClassroomsList(cData.map(c => ({
          id: c.id,
          code: c.code || '',
          name: c.name || c.code || '',
          type: c.room_type || c.type || 'lecture',
          capacity: Number(c.capacity || 60),
          floor: Number(c.floor || 1),
          dept: c.dept_code || c.dept || '',
          departmentId: c.department_id,
          active: c.active !== false,
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

  const filtered = useMemo(() => classroomsList.filter(r => {
    const ms = (r.name || '').toLowerCase().includes(search.toLowerCase()) ||
               (r.code || '').toLowerCase().includes(search.toLowerCase());
    const mt = typeFilter === 'All' || r.type === typeFilter;
    return ms && mt;
  }), [classroomsList, search, typeFilter]);

  const openAdd = () => {
    setEditingRoom(null);
    setForm({ code: '', name: '', type: 'lecture', capacity: 60, floor: 1, dept: '' });
    setErrorMsg('');
    setShowModal(true);
  };

  const openEdit = (r) => {
    setEditingRoom(r);
    setForm({
      code: r.code,
      name: r.name,
      type: r.type,
      capacity: r.capacity,
      floor: r.floor,
      dept: r.dept || '',
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

      if (editingRoom) {
        const res = await fetch(`/api/classrooms/${editingRoom.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            code: form.code,
            name: form.name,
            roomType: form.type,
            capacity: Number(form.capacity),
            departmentId,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          setErrorMsg(err.error || 'Failed to update classroom.');
          return;
        }
      } else {
        const res = await fetch('/api/classrooms', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            code: form.code,
            name: form.name,
            roomType: form.type,
            capacity: Number(form.capacity),
            departmentId,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          setErrorMsg(err.error || 'Failed to add classroom.');
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
      const res = await fetch(`/api/classrooms/${id}`, {
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
          <div><h1>Classrooms & Labs</h1><p>Manage room inventory, types, and capacity</p></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input search-input" placeholder="Search rooms..." style={{ width: 200 }} value={search} onChange={e => setSearch(e.target.value)} />
            <select className="form-select" style={{ width: 120 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="All">All Types</option>
              <option value="lecture">Lecture</option>
              <option value="lab">Lab</option>
            </select>
            <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus size={16} /> Add Room</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ width: 24, height: 24, margin: '0 auto 12px' }} />
          Loading rooms from database...
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><Building size={48} /><h3>No rooms found</h3><p>Try adjusting your search or add a new room.</p></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filtered.map(r => (
            <div key={r.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>{r.code}</span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span className={`badge ${r.type === 'lab' ? 'badge-warning' : 'badge-info'}`}>{r.type}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}><Edit size={14} /></button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => handleDelete(r.id)}><Trash2 size={14} /></button>
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>{r.name}</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-muted)' }}>
                <span>Capacity: <strong style={{ color: 'var(--text-primary)' }}>{r.capacity}</strong></span>
                <span>Floor: <strong style={{ color: 'var(--text-primary)' }}>{r.floor}</strong></span>
              </div>
              {r.dept && <div style={{ marginTop: 8 }}><span className="badge badge-neutral">{r.dept} Dept</span></div>}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>{editingRoom ? 'Edit' : 'Add'} Room</h3><button className="btn btn-ghost" onClick={() => setShowModal(false)}>✕</button></div>
            <div className="modal-body">
              {errorMsg && (
                <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--error)', borderRadius: 6, color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>
                  {errorMsg}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label className="form-label">Room Code *</label><input className="form-input" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
                <div className="form-group"><label className="form-label">Room Name *</label><input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Type</label><select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option value="lecture">Lecture</option><option value="lab">Lab</option></select></div>
                <div className="form-group"><label className="form-label">Capacity</label><input className="form-input" type="number" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Floor</label><input className="form-input" type="number" value={form.floor} onChange={e => setForm({ ...form, floor: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Assigned Dept</label>
                  <select className="form-select" value={form.dept} onChange={e => setForm({ ...form, dept: e.target.value })}>
                    <option value="">None (Shared)</option>
                    {departments.map(d => <option key={d.id} value={d.code}>{d.code}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.code.trim() || !form.name.trim()}>{editingRoom ? 'Update' : 'Add'} Room</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
