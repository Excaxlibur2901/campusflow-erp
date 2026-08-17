import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus, Edit, Trash2, BookOpen, Layers } from 'lucide-react';

export default function SubjectsPage() {
  const { getAccessToken } = useAuth();
  const [activeTab, setActiveTab] = useState('catalog'); // 'catalog' | 'offerings'
  const [subjectsList, setSubjectsList] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const [semestersList, setSemestersList] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [sectionsList, setSectionsList] = useState([]);
  const [offeringsList, setOfferingsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');

  // Subject Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingSub, setEditingSub] = useState(null);
  const [form, setForm] = useState({
    code: '',
    name: '',
    dept: 'CSE',
    credits: 3,
    type: 'theory',
    weeklyHours: 3,
    semesterId: '',
    semester: 1,
    facultyId: '',
  });

  // Offering Modal State
  const [showOfferingModal, setShowOfferingModal] = useState(false);
  const [offeringForm, setOfferingForm] = useState({
    deptId: '',
    semesterId: '',
    academicYearId: '',
    sectionId: '',
    subjectId: '',
    weeklyHours: 3,
  });

  const [errorMsg, setErrorMsg] = useState('');

  const loadData = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [subRes, deptRes, facRes, semRes, yearRes, secRes, offRes] = await Promise.all([
        fetch('/api/subjects', { headers }),
        fetch('/api/departments', { headers }),
        fetch('/api/faculty?limit=200', { headers }),
        fetch('/api/academic/semesters', { headers }),
        fetch('/api/academic/years', { headers }),
        fetch('/api/academic/sections', { headers }),
        fetch('/api/academic/offerings', { headers }),
      ]);

      let loadedDepts = [];
      if (deptRes.ok) {
        const dData = await deptRes.json();
        loadedDepts = dData.map(d => ({ id: d.id, code: d.code, name: d.name }));
        setDepartments(loadedDepts);
      }

      let loadedSems = [];
      if (semRes.ok) {
        const semData = await semRes.json();
        loadedSems = Array.isArray(semData) ? semData : [];
        setSemestersList(loadedSems);
      }

      let loadedYears = [];
      if (yearRes.ok) {
        const yData = await yearRes.json();
        loadedYears = Array.isArray(yData) ? yData : [];
        setAcademicYears(loadedYears);
      }

      let loadedSecs = [];
      if (secRes.ok) {
        const secData = await secRes.json();
        loadedSecs = Array.isArray(secData) ? secData : [];
        setSectionsList(loadedSecs);
      }

      if (offRes.ok) {
        const offData = await offRes.json();
        setOfferingsList(Array.isArray(offData) ? offData : []);
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
          semesterId: s.semester_id || '',
          semester: Number(s.semester || s.semester_number || 1),
          active: s.active !== false,
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

  // Semesters filtered for the currently selected department in the subject form
  const availableSemesters = useMemo(() => {
    const matchedDept = departments.find(d => d.code === form.dept);
    if (!matchedDept) return semestersList;
    const deptSems = semestersList.filter(
      s => s.department_id === matchedDept.id || s.dept_id === matchedDept.id || s.dept_code === form.dept
    );
    return deptSems.length > 0 ? deptSems : semestersList;
  }, [semestersList, departments, form.dept]);

  // Filtered lists for the Subject Offering modal
  const offeringAvailableSemesters = useMemo(() => {
    if (!offeringForm.deptId) return semestersList;
    return semestersList.filter(s => s.department_id === offeringForm.deptId || s.dept_id === offeringForm.deptId);
  }, [semestersList, offeringForm.deptId]);

  const offeringAvailableSections = useMemo(() => {
    if (!offeringForm.semesterId) return sectionsList;
    return sectionsList.filter(sec => sec.semester_id === offeringForm.semesterId);
  }, [sectionsList, offeringForm.semesterId]);

  const offeringAvailableSubjects = useMemo(() => {
    return subjectsList.filter(s => {
      const matchDept = !offeringForm.deptId || s.departmentId === offeringForm.deptId;
      const matchSem = !offeringForm.semesterId || s.semesterId === offeringForm.semesterId;
      return matchDept && matchSem;
    });
  }, [subjectsList, offeringForm.deptId, offeringForm.semesterId]);

  const filteredSubjects = useMemo(() => subjectsList.filter(s => {
    const ms = (s.name || '').toLowerCase().includes(search.toLowerCase()) ||
               (s.code || '').toLowerCase().includes(search.toLowerCase()) ||
               (s.facultyName || '').toLowerCase().includes(search.toLowerCase());
    const md = deptFilter === 'All' || s.dept === deptFilter;
    return ms && md;
  }), [subjectsList, search, deptFilter]);

  const filteredOfferings = useMemo(() => offeringsList.filter(o => {
    const ms = (o.subject_name || '').toLowerCase().includes(search.toLowerCase()) ||
               (o.subject_code || '').toLowerCase().includes(search.toLowerCase()) ||
               (o.dept_code || '').toLowerCase().includes(search.toLowerCase());
    const md = deptFilter === 'All' || o.dept_code === deptFilter;
    return ms && md;
  }), [offeringsList, search, deptFilter]);

  const openAddSubject = () => {
    setEditingSub(null);
    const initialDept = departments.length > 0 ? departments[0].code : 'CSE';
    const matchedDept = departments.find(d => d.code === initialDept);
    const deptSems = semestersList.filter(
      s => matchedDept && (s.department_id === matchedDept.id || s.dept_id === matchedDept.id || s.dept_code === initialDept)
    );
    const semsForDept = deptSems.length > 0 ? deptSems : semestersList;
    const defaultSem = semsForDept[0] || null;

    setForm({
      code: '',
      name: '',
      dept: initialDept,
      credits: 3,
      type: 'theory',
      weeklyHours: 3,
      semesterId: defaultSem?.id || '',
      semester: defaultSem?.number || 1,
      facultyId: '',
    });
    setErrorMsg('');
    setShowModal(true);
  };

  const openEditSubject = (s) => {
    setEditingSub(s);
    const matchedDept = departments.find(d => d.code === s.dept);
    const deptSems = semestersList.filter(
      sem => matchedDept && (sem.department_id === matchedDept.id || sem.dept_id === matchedDept.id || sem.dept_code === s.dept)
    );
    const semsForDept = deptSems.length > 0 ? deptSems : semestersList;
    const matchedSem = semsForDept.find(
      sem => sem.id === s.semesterId || Number(sem.number) === Number(s.semester)
    ) || semsForDept[0];

    setForm({
      code: s.code,
      name: s.name,
      dept: s.dept,
      credits: s.credits,
      type: s.type,
      weeklyHours: s.weeklyHours,
      semesterId: matchedSem?.id || s.semesterId || '',
      semester: matchedSem?.number || Number(s.semester) || 1,
      facultyId: s.facultyId || '',
    });
    setErrorMsg('');
    setShowModal(true);
  };

  const handleSaveSubject = async () => {
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

      const payload = {
        code: form.code,
        name: form.name,
        subjectType: form.type,
        credits: Number(form.credits),
        weeklyHours: Number(form.weeklyHours),
        departmentId,
        dept: form.dept,
        semesterId: form.semesterId || undefined,
        semester: form.semester !== undefined ? Number(form.semester) : undefined,
        facultyId: form.facultyId || null,
      };

      if (editingSub) {
        const res = await fetch(`/api/subjects/${editingSub.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
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
          body: JSON.stringify(payload),
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

  const handleDeleteSubject = async (id) => {
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

  // Subject Offering Handlers
  const openAddOffering = () => {
    const initialDept = departments[0]?.id || '';
    const deptSems = semestersList.filter(s => s.department_id === initialDept || s.dept_id === initialDept);
    const initialSem = deptSems[0]?.id || semestersList[0]?.id || '';
    const semSecs = sectionsList.filter(sec => sec.semester_id === initialSem);
    const initialSec = semSecs[0]?.id || sectionsList[0]?.id || '';
    const initialYear = academicYears.find(y => y.is_current)?.id || academicYears[0]?.id || '';
    const initialSub = subjectsList.find(s => s.departmentId === initialDept)?.id || subjectsList[0]?.id || '';

    setOfferingForm({
      deptId: initialDept,
      semesterId: initialSem,
      academicYearId: initialYear,
      sectionId: initialSec,
      subjectId: initialSub,
      weeklyHours: 3,
    });
    setErrorMsg('');
    setShowOfferingModal(true);
  };

  const handleSaveOffering = async () => {
    if (!offeringForm.subjectId) {
      setErrorMsg('Please select a subject.');
      return;
    }
    setErrorMsg('');

    try {
      const token = await getAccessToken();
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      const res = await fetch('/api/academic/offerings', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          departmentId: offeringForm.deptId || undefined,
          semesterId: offeringForm.semesterId || undefined,
          academicYearId: offeringForm.academicYearId || undefined,
          sectionId: offeringForm.sectionId || undefined,
          subjectId: offeringForm.subjectId,
          weeklyHours: Number(offeringForm.weeklyHours || 3),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setErrorMsg(err.error || 'Failed to create subject offering.');
        return;
      }

      setShowOfferingModal(false);
      await loadData();
    } catch {
      setErrorMsg('Network error saving subject offering.');
    }
  };

  const handleDeleteOffering = async (id) => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/academic/offerings/${id}`, {
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
          <div>
            <h1>Curriculum & Subject Offerings</h1>
            <p>Manage subjects, academic structure mappings, and schedulable offerings</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={openAddOffering}>
              <Layers size={16} /> Add Subject Offering
            </button>
            <button className="btn btn-primary btn-sm" onClick={openAddSubject}>
              <Plus size={16} /> Add Subject
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, borderBottom: '1px solid var(--border-color, #e2e8f0)', paddingBottom: 8 }}>
        <button
          className={`btn btn-sm ${activeTab === 'catalog' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('catalog')}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <BookOpen size={15} /> Subject Catalog ({subjectsList.length})
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'offerings' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('offerings')}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Layers size={15} /> Schedulable Offerings ({offeringsList.length})
        </button>
      </div>

      <div className="table-container">
        <div className="table-header">
          <span className="table-title">
            {activeTab === 'catalog' ? `${filteredSubjects.length} Subjects` : `${filteredOfferings.length} Active Offerings`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input search-input"
              placeholder={activeTab === 'catalog' ? 'Search subjects...' : 'Search offerings...'}
              style={{ width: 220 }}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select className="form-select" style={{ width: 120 }} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
              <option value="All">All Depts</option>
              {departments.map(d => <option key={d.id} value={d.code}>{d.code}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ width: 24, height: 24, margin: '0 auto 12px' }} />
            Loading curriculum data from database...
          </div>
        ) : activeTab === 'catalog' ? (
          /* Catalog View */
          <table>
            <thead>
              <tr><th>Code</th><th>Subject Name</th><th>Department</th><th>Faculty</th><th>Credits</th><th>Type</th><th>Weekly Hours</th><th>Semester</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filteredSubjects.map(s => (
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
                      <button className="btn btn-outline btn-sm" onClick={() => openEditSubject(s)}><Edit size={14} /></button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => handleDeleteSubject(s.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredSubjects.length === 0 && <tr><td colSpan="9" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No subjects found</td></tr>}
            </tbody>
          </table>
        ) : (
          /* Subject Offerings View */
          <table>
            <thead>
              <tr><th>Subject Code</th><th>Subject Name</th><th>Branch</th><th>Semester</th><th>Section</th><th>Academic Year</th><th>Weekly Hours</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filteredOfferings.map(o => (
                <tr key={o.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{o.subject_code}</td>
                  <td style={{ fontWeight: 500 }}>{o.subject_name}</td>
                  <td><span className="badge badge-info">{o.dept_code}</span></td>
                  <td><span className="badge badge-neutral">Sem {o.semester_number}</span></td>
                  <td><span className="badge badge-neutral">Sec {o.section_code || 'A'}</span></td>
                  <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{o.academic_year_label || 'Current'}</td>
                  <td style={{ fontWeight: 600 }}>{o.weekly_hours}h/wk</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => handleDeleteOffering(o.id)} title="Remove offering">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredOfferings.length === 0 && <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No subject offerings created yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* Add / Edit Subject Modal */}
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
                  <select
                    className="form-select"
                    value={form.dept}
                    onChange={e => {
                      const newDeptCode = e.target.value;
                      const matchedDept = departments.find(d => d.code === newDeptCode);
                      const deptSems = semestersList.filter(
                        s => matchedDept && (s.department_id === matchedDept.id || s.dept_id === matchedDept.id || s.dept_code === newDeptCode)
                      );
                      const semsForDept = deptSems.length > 0 ? deptSems : semestersList;
                      const firstSem = semsForDept[0];
                      setForm(prev => ({
                        ...prev,
                        dept: newDeptCode,
                        semesterId: firstSem?.id || '',
                        semester: firstSem?.number || 1,
                      }));
                    }}
                  >
                    {departments.map(d => <option key={d.id} value={d.code}>{d.code} - {d.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Assign Faculty</label>
                  <select className="form-select" value={form.facultyId} onChange={e => setForm({ ...form, facultyId: e.target.value })}>
                    <option value="">-- Unassigned --</option>
                    {facultyList.map(f => (
                      <option key={f.id} value={f.id}>{f.name} {f.dept ? `(${f.dept})` : '(All branches)'}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Type</label><select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option value="theory">Theory</option><option value="lab">Lab</option></select></div>
                <div className="form-group"><label className="form-label">Credits</label><input className="form-input" type="number" value={form.credits} onChange={e => setForm({ ...form, credits: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Weekly Hours</label><input className="form-input" type="number" value={form.weeklyHours} onChange={e => setForm({ ...form, weeklyHours: e.target.value })} /></div>
                <div className="form-group">
                  <label className="form-label">Semester *</label>
                  <select
                    className="form-select"
                    value={form.semesterId || form.semester}
                    onChange={e => {
                      const val = e.target.value;
                      const found = availableSemesters.find(s => s.id === val || String(s.number) === val);
                      setForm(prev => ({
                        ...prev,
                        semesterId: found ? found.id : val,
                        semester: found ? found.number : Number(val) || 1,
                      }));
                    }}
                  >
                    {availableSemesters.length > 0 ? (
                      availableSemesters.map(s => (
                        <option key={s.id} value={s.id}>
                          Semester {s.number} {s.program_name ? `(${s.program_name})` : ''}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>No semesters configured</option>
                    )}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveSubject} disabled={!form.code.trim() || !form.name.trim()}>{editingSub ? 'Update' : 'Add'} Subject</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Subject Offering Modal */}
      {showOfferingModal && (
        <div className="modal-overlay" onClick={() => setShowOfferingModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h3>Add Schedulable Subject Offering</h3>
              <button className="btn btn-ghost" onClick={() => setShowOfferingModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {errorMsg && (
                <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--error)', borderRadius: 6, color: 'var(--error)', fontSize: 13, marginBottom: 12 }}>
                  {errorMsg}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* 1. Department */}
                <div className="form-group">
                  <label className="form-label">Department / Branch *</label>
                  <select
                    className="form-select"
                    value={offeringForm.deptId}
                    onChange={e => {
                      const newDeptId = e.target.value;
                      const deptSems = semestersList.filter(s => s.department_id === newDeptId || s.dept_id === newDeptId);
                      const firstSem = deptSems[0]?.id || '';
                      setOfferingForm(prev => ({
                        ...prev,
                        deptId: newDeptId,
                        semesterId: firstSem,
                        subjectId: '',
                      }));
                    }}
                  >
                    {departments.map(d => <option key={d.id} value={d.id}>{d.code} - {d.name}</option>)}
                  </select>
                </div>

                {/* 2. Academic Year */}
                <div className="form-group">
                  <label className="form-label">Academic Year *</label>
                  <select
                    className="form-select"
                    value={offeringForm.academicYearId}
                    onChange={e => setOfferingForm(prev => ({ ...prev, academicYearId: e.target.value }))}
                  >
                    {academicYears.map(y => (
                      <option key={y.id} value={y.id}>
                        {y.label} {y.is_current ? '(Current)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Semester */}
                <div className="form-group">
                  <label className="form-label">Semester *</label>
                  <select
                    className="form-select"
                    value={offeringForm.semesterId}
                    onChange={e => {
                      const newSemId = e.target.value;
                      const semSecs = sectionsList.filter(sec => sec.semester_id === newSemId);
                      const firstSec = semSecs[0]?.id || '';
                      setOfferingForm(prev => ({
                        ...prev,
                        semesterId: newSemId,
                        sectionId: firstSec,
                        subjectId: '',
                      }));
                    }}
                  >
                    {offeringAvailableSemesters.map(s => (
                      <option key={s.id} value={s.id}>Semester {s.number} ({s.dept_code || 'Dept'})</option>
                    ))}
                  </select>
                </div>

                {/* 4. Section */}
                <div className="form-group">
                  <label className="form-label">Section *</label>
                  <select
                    className="form-select"
                    value={offeringForm.sectionId}
                    onChange={e => setOfferingForm(prev => ({ ...prev, sectionId: e.target.value }))}
                  >
                    {offeringAvailableSections.length > 0 ? (
                      offeringAvailableSections.map(sec => (
                        <option key={sec.id} value={sec.id}>Section {sec.code}</option>
                      ))
                    ) : (
                      <option value="">Section A (Default)</option>
                    )}
                  </select>
                </div>

                {/* 5. Subject */}
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Subject *</label>
                  <select
                    className="form-select"
                    value={offeringForm.subjectId}
                    onChange={e => {
                      const selectedSubId = e.target.value;
                      const matched = subjectsList.find(s => s.id === selectedSubId);
                      setOfferingForm(prev => ({
                        ...prev,
                        subjectId: selectedSubId,
                        weeklyHours: matched?.weeklyHours || prev.weeklyHours || 3,
                      }));
                    }}
                  >
                    <option value="" disabled>-- Select Subject --</option>
                    {offeringAvailableSubjects.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.code} - {s.name} ({s.dept} · Sem {s.semester})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 6. Weekly Hours */}
                <div className="form-group">
                  <label className="form-label">Weekly Hours *</label>
                  <input
                    className="form-input"
                    type="number"
                    value={offeringForm.weeklyHours}
                    onChange={e => setOfferingForm(prev => ({ ...prev, weeklyHours: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowOfferingModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveOffering} disabled={!offeringForm.subjectId}>
                Create Subject Offering
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
