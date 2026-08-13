import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { downloadOfficialFile } from '../utils/officialDownloads';
import { Plus, Download, Trash2, Edit } from 'lucide-react';

export default function StudentsPage() {
  const { getAccessToken } = useAuth();
  const [studentsList, setStudentsList] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingStu, setEditingStu] = useState(null);
  const [form, setForm] = useState({ name: '', rollNo: '', enrollmentNo: '', email: '', phone: '', dept: 'CSE', year: 2, semester: 3, section: 'A' });
  const [errorMsg, setErrorMsg] = useState('');
  const perPage = 25;

  const loadData = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [stuRes, deptRes] = await Promise.all([
        fetch('/api/students?limit=500', { headers }),
        fetch('/api/departments', { headers }),
      ]);

      if (deptRes.ok) {
        const dData = await deptRes.json();
        setDepartments(dData.map(d => ({ id: d.id, code: d.code, name: d.name })));
        if (dData.length > 0 && form.dept === 'CSE') {
          setForm(f => ({ ...f, dept: dData[0].code }));
        }
      }

      if (stuRes.ok) {
        const sData = await stuRes.json();
        const rows = sData.data || sData;
        setStudentsList(rows.map(s => ({
          id: s.id,
          rollNo: s.roll_number || s.rollNo || '',
          enrollmentNo: s.enrollment_number || s.enrollmentNo || '',
          name: s.full_name || s.name || '',
          email: s.email || '',
          phone: s.phone || '',
          dept: s.dept_code || s.dept || 'CSE',
          departmentId: s.department_id,
          year: s.year || 2,
          semester: s.semester || 3,
          section: s.section || 'A',
          status: s.status || 'ACTIVE',
          attendance: s.attendance_pct ?? s.attendance ?? 85,
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

  const filtered = useMemo(() => studentsList.filter(s => {
    const ms = (s.name || '').toLowerCase().includes(search.toLowerCase()) ||
               (s.rollNo || '').toLowerCase().includes(search.toLowerCase());
    const mf = sectionFilter === 'All' || s.section === sectionFilter;
    return ms && mf;
  }), [studentsList, search, sectionFilter]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const openAdd = () => {
    setEditingStu(null);
    setForm({
      name: '',
      rollNo: `CSE2024${String(studentsList.length + 1).padStart(3, '0')}`,
      enrollmentNo: '',
      email: '',
      phone: '',
      dept: departments.length > 0 ? departments[0].code : 'CSE',
      year: 2,
      semester: 3,
      section: 'A',
    });
    setErrorMsg('');
    setShowModal(true);
  };

  const openEdit = (s) => {
    setEditingStu(s);
    setForm({
      name: s.name,
      rollNo: s.rollNo,
      enrollmentNo: s.enrollmentNo || '',
      email: s.email || '',
      phone: s.phone || '',
      dept: s.dept,
      year: s.year || 2,
      semester: s.semester || 3,
      section: s.section || 'A',
    });
    setErrorMsg('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.rollNo.trim()) return;
    setErrorMsg('');

    try {
      const token = await getAccessToken();
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      const matchedDept = departments.find(d => d.code === form.dept);
      const departmentId = matchedDept ? matchedDept.id : null;

      if (editingStu) {
        const res = await fetch(`/api/students/${editingStu.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            fullName: form.name,
            enrollmentNumber: form.enrollmentNo,
            email: form.email,
            phone: form.phone,
            departmentId,
            year: Number(form.year),
            division: form.section,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          setErrorMsg(err.error || 'Failed to update student record.');
          return;
        }
      } else {
        const res = await fetch('/api/students', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            rollNumber: form.rollNo,
            enrollmentNumber: form.enrollmentNo,
            fullName: form.name,
            email: form.email,
            phone: form.phone,
            departmentId,
            year: Number(form.year),
            division: form.section,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          setErrorMsg(err.error || 'Failed to add student record.');
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
      const res = await fetch(`/api/students/${id}`, {
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

  const exportStudents = async (format) => {
    try {
      await downloadOfficialFile(format, {
        settings: { institutionName: 'CampusFlow ERP' },
        title: 'Student Records',
        subtitle: 'Student enrollment, sections, and academic data',
        details: [
          { label: 'Students Included', value: filtered.length },
          { label: 'Section Filter', value: sectionFilter },
          { label: 'Search', value: search || 'All' },
        ],
        columns: ['Roll No', 'Name', 'Department', 'Semester', 'Section', 'Attendance', 'Status'],
        rows: filtered.map((s) => [
          s.rollNo,
          s.name,
          s.dept,
          `Sem ${s.semester}`,
          s.section,
          `${s.attendance}%`,
          s.attendance >= 75 ? 'Regular' : 'Defaulter',
        ]),
        filename: 'students',
      });
    } catch {
      // Export handling
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-actions">
          <div><h1>Student Records</h1><p>Manage student enrollment, sections, and academic data</p></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={() => exportStudents('pdf')}><Download size={16} /> PDF</button>
            <button className="btn btn-outline btn-sm" onClick={() => exportStudents('docx')}><Download size={16} /> DOCX</button>
            <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus size={16} /> Add Student</button>
          </div>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header">
          <span className="table-title">Showing {paginated.length} of {filtered.length} students</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input search-input" placeholder="Search students..." style={{ width: 220 }} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
            <select className="form-select" style={{ width: 130 }} value={sectionFilter} onChange={e => { setSectionFilter(e.target.value); setPage(1); }}>
              <option value="All">All Sections</option>
              <option value="A">Section A</option>
              <option value="B">Section B</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ width: 24, height: 24, margin: '0 auto 12px' }} />
            Loading students from database...
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>#</th><th>Roll Number</th><th>Name</th><th>Department</th><th>Semester</th><th>Section</th><th>Attendance</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {paginated.map((s, i) => (
                <tr key={s.id}>
                  <td>{(page - 1) * perPage + i + 1}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{s.rollNo}</td>
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td><span className="badge badge-info">{s.dept}</span></td>
                  <td>Sem {s.semester}</td>
                  <td>{s.section}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="progress-bar" style={{ width: 60 }}>
                        <div className="progress-fill" style={{ width: `${s.attendance}%`, background: s.attendance >= 75 ? 'var(--success)' : 'var(--error)' }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{s.attendance}%</span>
                    </div>
                  </td>
                  <td><span className={`badge ${s.attendance >= 75 ? 'badge-success' : 'badge-error'}`}>{s.attendance >= 75 ? 'Regular' : 'Defaulter'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}><Edit size={14} /></button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => handleDelete(s.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {paginated.length === 0 && <tr><td colSpan="9" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No students found</td></tr>}
            </tbody>
          </table>
        )}

        <div style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Page {page} of {totalPages || 1}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
              <button key={p} className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPage(p)}>{p}</button>
            ))}
            <button className="btn btn-sm btn-outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>{editingStu ? 'Edit' : 'Add'} Student</h3><button className="btn btn-ghost" onClick={() => setShowModal(false)}>✕</button></div>
            <div className="modal-body">
              {errorMsg && (
                <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--error)', borderRadius: 6, color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>
                  {errorMsg}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group"><label className="form-label">Full Name *</label><input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Student Name" /></div>
                <div className="form-group"><label className="form-label">Roll Number *</label><input className="form-input" value={form.rollNo} onChange={e => setForm({ ...form, rollNo: e.target.value })} disabled={!!editingStu} /></div>
                <div className="form-group"><label className="form-label">Enrollment Number</label><input className="form-input" value={form.enrollmentNo} onChange={e => setForm({ ...form, enrollmentNo: e.target.value })} placeholder="ENR-2024-..." /></div>
                <div className="form-group"><label className="form-label">Department</label>
                  <select className="form-select" value={form.dept} onChange={e => setForm({ ...form, dept: e.target.value })}>
                    {departments.map(d => <option key={d.id} value={d.code}>{d.code}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="student@college.edu" /></div>
                <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+91 ..." /></div>
                <div className="form-group"><label className="form-label">Semester</label><input className="form-input" type="number" value={form.semester} onChange={e => setForm({ ...form, semester: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Section / Division</label><select className="form-select" value={form.section} onChange={e => setForm({ ...form, section: e.target.value })}><option value="A">Section A</option><option value="B">Section B</option></select></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.name.trim() || !form.rollNo.trim()}>{editingStu ? 'Update' : 'Add'} Student</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
