import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { downloadOfficialFile } from '../utils/officialDownloads';
import { Plus, Download, Trash2, Edit } from 'lucide-react';

export default function StudentsPage() {
  const { studentsList, addStudent, updateStudent, deleteStudent, departments, settings, showToast } = useData();
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingStu, setEditingStu] = useState(null);
  const [form, setForm] = useState({ name:'', rollNo:'', dept:'CSE', semester:3, section:'A' });
  const perPage = 25;

  const filtered = useMemo(() => studentsList.filter(s => {
    const ms = s.name.toLowerCase().includes(search.toLowerCase()) || s.rollNo.toLowerCase().includes(search.toLowerCase());
    const mf = sectionFilter === 'All' || s.section === sectionFilter;
    return ms && mf;
  }), [studentsList, search, sectionFilter]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const openAdd = () => { setEditingStu(null); setForm({ name:'', rollNo:`CSE2024${String(studentsList.length+1).padStart(3,'0')}`, dept:'CSE', semester:3, section:'A' }); setShowModal(true); };
  const openEdit = (s) => { setEditingStu(s); setForm({ name:s.name, rollNo:s.rollNo, dept:s.dept, semester:s.semester, section:s.section }); setShowModal(true); };
  const handleSave = () => { if(!form.name.trim()||!form.rollNo.trim()) return; if(editingStu) updateStudent(editingStu.id, form); else addStudent(form); setShowModal(false); };

  const exportStudents = async (format) => {
    try {
      await downloadOfficialFile(format, {
        settings,
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
      showToast(`Student records exported as ${format.toUpperCase()}`);
    } catch {
      showToast('Student export failed', 'error');
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header"><div className="page-header-actions"><div><h1>Student Records</h1><p>Manage student enrollment, sections, and academic data</p></div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-outline btn-sm" onClick={()=>exportStudents('pdf')}><Download size={16}/> PDF</button>
          <button className="btn btn-outline btn-sm" onClick={()=>exportStudents('docx')}><Download size={16}/> DOCX</button>
          <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus size={16}/> Add Student</button>
        </div>
      </div></div>
      <div className="table-container">
        <div className="table-header">
          <span className="table-title">Showing {paginated.length} of {filtered.length} students</span>
          <div style={{display:'flex',gap:8}}>
            <input className="form-input search-input" placeholder="Search students..." style={{width:220}} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/>
            <select className="form-select" style={{width:130}} value={sectionFilter} onChange={e=>{setSectionFilter(e.target.value);setPage(1);}}><option value="All">All Sections</option><option>A</option><option>B</option></select>
          </div>
        </div>
        <table>
          <thead><tr><th>#</th><th>Roll Number</th><th>Name</th><th>Department</th><th>Semester</th><th>Section</th><th>Attendance</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {paginated.map((s,i)=>(
              <tr key={s.id}>
                <td>{(page-1)*perPage+i+1}</td>
                <td style={{fontFamily:'monospace',fontSize:13}}>{s.rollNo}</td>
                <td style={{fontWeight:500}}>{s.name}</td>
                <td><span className="badge badge-info">{s.dept}</span></td>
                <td>Sem {s.semester}</td>
                <td>{s.section}</td>
                <td><div style={{display:'flex',alignItems:'center',gap:8}}><div className="progress-bar" style={{width:60}}><div className="progress-fill" style={{width:`${s.attendance}%`,background:s.attendance>=75?'var(--success)':'var(--error)'}}/></div><span style={{fontSize:12,fontWeight:600}}>{s.attendance}%</span></div></td>
                <td><span className={`badge ${s.attendance>=75?'badge-success':'badge-error'}`}>{s.attendance>=75?'Regular':'Defaulter'}</span></td>
                <td><div style={{display:'flex',gap:4}}><button className="btn btn-ghost btn-sm" onClick={()=>openEdit(s)}><Edit size={14}/></button><button className="btn btn-ghost btn-sm" style={{color:'var(--error)'}} onClick={()=>{deleteStudent(s.id)}}><Trash2 size={14}/></button></div></td>
              </tr>
            ))}
            {paginated.length===0&&<tr><td colSpan="9" style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>No students found</td></tr>}
          </tbody>
        </table>
        <div style={{padding:16,display:'flex',justifyContent:'space-between',alignItems:'center',borderTop:'1px solid var(--border)'}}>
          <span style={{fontSize:13,color:'var(--text-muted)'}}>Page {page} of {totalPages || 1}</span>
          <div style={{display:'flex',gap:4}}>
            <button className="btn btn-sm btn-outline" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Prev</button>
            {Array.from({length:Math.min(totalPages,5)},(_,i)=>i+1).map(p=>(<button key={p} className={`btn btn-sm ${p===page?'btn-primary':'btn-outline'}`} onClick={()=>setPage(p)}>{p}</button>))}
            <button className="btn btn-sm btn-outline" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>Next</button>
          </div>
        </div>
      </div>
      {showModal&&(<div className="modal-overlay" onClick={()=>setShowModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><h3>{editingStu?'Edit':'Add'} Student</h3><button className="btn btn-ghost" onClick={()=>setShowModal(false)}>✕</button></div>
        <div className="modal-body">
          <div className="form-group"><label className="form-label">Full Name *</label><input className="form-input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div>
          <div className="form-group"><label className="form-label">Roll Number *</label><input className="form-input" value={form.rollNo} onChange={e=>setForm({...form,rollNo:e.target.value})}/></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
            <div className="form-group"><label className="form-label">Department</label><select className="form-select" value={form.dept} onChange={e=>setForm({...form,dept:e.target.value})}>{departments.map(d=><option key={d.id} value={d.code}>{d.code}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Semester</label><select className="form-select" value={form.semester} onChange={e=>setForm({...form,semester:Number(e.target.value)})}>{[1,2,3,4,5,6,7,8].map(s=><option key={s} value={s}>Sem {s}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Section</label><select className="form-select" value={form.section} onChange={e=>setForm({...form,section:e.target.value})}><option>A</option><option>B</option><option>C</option></select></div>
          </div>
        </div>
        <div className="modal-footer"><button className="btn btn-outline" onClick={()=>setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSave} disabled={!form.name.trim()||!form.rollNo.trim()}>{editingStu?'Update':'Enroll'} Student</button></div>
      </div></div>)}
    </div>
  );
}
