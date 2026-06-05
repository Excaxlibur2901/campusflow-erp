import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { Plus, Edit, Trash2 } from 'lucide-react';

export default function SubjectsPage() {
  const { subjectsList, addSubject, updateSubject, deleteSubject, departments } = useData();
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editingSub, setEditingSub] = useState(null);
  const [form, setForm] = useState({ code:'', name:'', dept:'CSE', credits:3, type:'theory', weeklyHours:3, semester:3 });

  const filtered = useMemo(() => subjectsList.filter(s => {
    const ms = s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase());
    const md = deptFilter === 'All' || s.dept === deptFilter;
    return ms && md;
  }), [subjectsList, search, deptFilter]);

  const openAdd = () => { setEditingSub(null); setForm({ code:'', name:'', dept:'CSE', credits:3, type:'theory', weeklyHours:3, semester:3 }); setShowModal(true); };
  const openEdit = (s) => { setEditingSub(s); setForm({ code:s.code, name:s.name, dept:s.dept, credits:s.credits, type:s.type, weeklyHours:s.weeklyHours, semester:s.semester }); setShowModal(true); };
  const handleSave = () => { if(!form.code.trim()||!form.name.trim()) return; const data = {...form, credits:Number(form.credits), weeklyHours:Number(form.weeklyHours), semester:Number(form.semester)}; if(editingSub) updateSubject(editingSub.id, data); else addSubject(data); setShowModal(false); };

  return (
    <div className="fade-in">
      <div className="page-header"><div className="page-header-actions"><div><h1>Subjects</h1><p>Manage subject catalog, credits, and assignments</p></div><button className="btn btn-primary btn-sm" onClick={openAdd}><Plus size={16}/> Add Subject</button></div></div>
      <div className="table-container">
        <div className="table-header">
          <span className="table-title">{filtered.length} Subjects</span>
          <div style={{display:'flex',gap:8}}>
            <input className="form-input search-input" placeholder="Search..." style={{width:220}} value={search} onChange={e=>setSearch(e.target.value)}/>
            <select className="form-select" style={{width:120}} value={deptFilter} onChange={e=>setDeptFilter(e.target.value)}><option value="All">All Depts</option>{departments.map(d=><option key={d.id} value={d.code}>{d.code}</option>)}</select>
          </div>
        </div>
        <table>
          <thead><tr><th>Code</th><th>Subject Name</th><th>Department</th><th>Credits</th><th>Type</th><th>Weekly Hours</th><th>Semester</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map(s=>(
              <tr key={s.id}>
                <td style={{fontFamily:'monospace',fontWeight:600}}>{s.code}</td>
                <td style={{fontWeight:500}}>{s.name}</td>
                <td><span className="badge badge-info">{s.dept}</span></td>
                <td style={{fontWeight:600}}>{s.credits}</td>
                <td><span className={`badge ${s.type==='lab'?'badge-warning':'badge-neutral'}`}>{s.type}</span></td>
                <td>{s.weeklyHours}h</td>
                <td>Sem {s.semester}</td>
                <td><div style={{display:'flex',gap:4}}><button className="btn btn-outline btn-sm" onClick={()=>openEdit(s)}><Edit size={14}/></button><button className="btn btn-ghost btn-sm" style={{color:'var(--error)'}} onClick={()=>deleteSubject(s.id)}><Trash2 size={14}/></button></div></td>
              </tr>
            ))}
            {filtered.length===0&&<tr><td colSpan="8" style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>No subjects found</td></tr>}
          </tbody>
        </table>
      </div>
      {showModal&&(<div className="modal-overlay" onClick={()=>setShowModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><h3>{editingSub?'Edit':'Add'} Subject</h3><button className="btn btn-ghost" onClick={()=>setShowModal(false)}>✕</button></div>
        <div className="modal-body">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div className="form-group"><label className="form-label">Subject Code *</label><input className="form-input" value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})}/></div>
            <div className="form-group"><label className="form-label">Subject Name *</label><input className="form-input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div>
            <div className="form-group"><label className="form-label">Department</label><select className="form-select" value={form.dept} onChange={e=>setForm({...form,dept:e.target.value})}>{departments.map(d=><option key={d.id} value={d.code}>{d.code}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Type</label><select className="form-select" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="theory">Theory</option><option value="lab">Lab</option></select></div>
            <div className="form-group"><label className="form-label">Credits</label><input className="form-input" type="number" value={form.credits} onChange={e=>setForm({...form,credits:e.target.value})}/></div>
            <div className="form-group"><label className="form-label">Weekly Hours</label><input className="form-input" type="number" value={form.weeklyHours} onChange={e=>setForm({...form,weeklyHours:e.target.value})}/></div>
            <div className="form-group"><label className="form-label">Semester</label><select className="form-select" value={form.semester} onChange={e=>setForm({...form,semester:e.target.value})}>{[1,2,3,4,5,6,7,8].map(s=><option key={s} value={s}>Sem {s}</option>)}</select></div>
          </div>
        </div>
        <div className="modal-footer"><button className="btn btn-outline" onClick={()=>setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSave} disabled={!form.code.trim()||!form.name.trim()}>{editingSub?'Update':'Add'} Subject</button></div>
      </div></div>)}
    </div>
  );
}
