import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { Plus, Edit, Trash2 } from 'lucide-react';

export default function FacultyPage() {
  const { facultyList, addFaculty, updateFaculty, deleteFaculty, departments } = useData();
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editingFac, setEditingFac] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [form, setForm] = useState({ name:'', empCode:'', dept:'CSE', specialization:'', maxHours:22, currentHours:0 });

  const filtered = useMemo(() => facultyList.filter(f => {
    const ms = f.name.toLowerCase().includes(search.toLowerCase()) || f.empCode.toLowerCase().includes(search.toLowerCase());
    const md = deptFilter === 'All' || f.dept === deptFilter;
    return ms && md;
  }), [facultyList, search, deptFilter]);

  const openAdd = () => { setEditingFac(null); setForm({ name:'', empCode:`FAC${String(facultyList.length+1).padStart(3,'0')}`, dept:'CSE', specialization:'', maxHours:22, currentHours:0 }); setShowModal(true); };
  const openEdit = (f) => { setEditingFac(f); setForm({ name:f.name, empCode:f.empCode, dept:f.dept, specialization:f.specialization, maxHours:f.maxHours, currentHours:f.currentHours }); setShowModal(true); };
  const handleSave = () => { if(!form.name.trim()) return; if(editingFac) updateFaculty(editingFac.id, {...form, maxHours:Number(form.maxHours), currentHours:Number(form.currentHours)}); else addFaculty({...form, maxHours:Number(form.maxHours), currentHours:Number(form.currentHours)}); setShowModal(false); };

  return (
    <div className="fade-in">
      <div className="page-header"><div className="page-header-actions"><div><h1>Faculty Management</h1><p>Manage faculty members, workload, and availability</p></div><button className="btn btn-primary btn-sm" onClick={openAdd}><Plus size={16}/> Add Faculty</button></div></div>
      <div className="table-container">
        <div className="table-header">
          <span className="table-title">{filtered.length} Faculty Members</span>
          <div style={{display:'flex',gap:8}}>
            <input className="form-input search-input" placeholder="Search faculty..." style={{width:220}} value={search} onChange={e=>setSearch(e.target.value)}/>
            <select className="form-select" style={{width:120}} value={deptFilter} onChange={e=>setDeptFilter(e.target.value)}><option value="All">All Depts</option>{departments.map(d=><option key={d.id} value={d.code}>{d.code}</option>)}</select>
          </div>
        </div>
        <table>
          <thead><tr><th>Emp Code</th><th>Name</th><th>Department</th><th>Specialization</th><th>Workload</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map(f=>(
              <tr key={f.id}>
                <td style={{fontFamily:'monospace',fontSize:13}}>{f.empCode}</td>
                <td style={{fontWeight:600}}>{f.name}</td>
                <td><span className="badge badge-info">{f.dept}</span></td>
                <td style={{color:'var(--text-muted)',fontSize:13}}>{f.specialization}</td>
                <td><div style={{display:'flex',alignItems:'center',gap:8}}><div className="progress-bar" style={{width:80}}><div className="progress-fill" style={{width:`${(f.currentHours/f.maxHours)*100}%`,background:f.currentHours>=f.maxHours?'var(--error)':f.currentHours>=f.maxHours-2?'var(--warning)':'var(--success)'}}/></div><span style={{fontSize:12,fontWeight:600}}>{f.currentHours}/{f.maxHours}h</span></div></td>
                <td><span className={`badge ${f.currentHours>=f.maxHours?'badge-error':'badge-success'}`}>{f.currentHours>=f.maxHours?'Full':'Available'}</span></td>
                <td><div style={{display:'flex',gap:4}}><button className="btn btn-outline btn-sm" onClick={()=>openEdit(f)}><Edit size={14}/> Edit</button><button className="btn btn-ghost btn-sm" style={{color:'var(--error)'}} onClick={()=>setConfirmDelete(f.id)}><Trash2 size={14}/></button></div></td>
              </tr>
            ))}
            {filtered.length===0&&<tr><td colSpan="7" style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>No faculty found</td></tr>}
          </tbody>
        </table>
      </div>
      {showModal&&(<div className="modal-overlay" onClick={()=>setShowModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><h3>{editingFac?'Edit':'Add'} Faculty</h3><button className="btn btn-ghost" onClick={()=>setShowModal(false)}>✕</button></div>
        <div className="modal-body">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <div className="form-group"><label className="form-label">Full Name *</label><input className="form-input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Dr. / Prof. Name"/></div>
            <div className="form-group"><label className="form-label">Emp Code *</label><input className="form-input" value={form.empCode} onChange={e=>setForm({...form,empCode:e.target.value})}/></div>
            <div className="form-group"><label className="form-label">Department</label><select className="form-select" value={form.dept} onChange={e=>setForm({...form,dept:e.target.value})}>{departments.map(d=><option key={d.id} value={d.code}>{d.code}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Specialization</label><input className="form-input" value={form.specialization} onChange={e=>setForm({...form,specialization:e.target.value})}/></div>
            <div className="form-group"><label className="form-label">Max Hours/Week</label><input className="form-input" type="number" value={form.maxHours} onChange={e=>setForm({...form,maxHours:e.target.value})}/></div>
            <div className="form-group"><label className="form-label">Current Hours</label><input className="form-input" type="number" value={form.currentHours} onChange={e=>setForm({...form,currentHours:e.target.value})}/></div>
          </div>
        </div>
        <div className="modal-footer"><button className="btn btn-outline" onClick={()=>setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSave} disabled={!form.name.trim()}>{editingFac?'Update':'Add'} Faculty</button></div>
      </div></div>)}
      {confirmDelete&&(<div className="modal-overlay" onClick={()=>setConfirmDelete(null)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:400}}>
        <div className="modal-body" style={{textAlign:'center',padding:32}}>
          <Trash2 size={40} color="var(--error)" style={{marginBottom:16}}/>
          <h3 style={{marginBottom:8}}>Remove Faculty?</h3>
          <p style={{color:'var(--text-muted)',marginBottom:24}}>This will remove the faculty member.</p>
          <div style={{display:'flex',gap:10,justifyContent:'center'}}><button className="btn btn-outline" onClick={()=>setConfirmDelete(null)}>Cancel</button><button className="btn btn-error" onClick={()=>{deleteFaculty(confirmDelete);setConfirmDelete(null);}}>Delete</button></div>
        </div>
      </div></div>)}
    </div>
  );
}
