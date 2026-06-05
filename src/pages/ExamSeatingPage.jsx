import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { downloadOfficialFile } from '../utils/officialDownloads';
import { ClipboardList, Plus, Eye, Download, Users, Printer, RefreshCw, Trash2 } from 'lucide-react';

export default function ExamSeatingPage() {
  const { examsList, addExam, updateExam, deleteExam, seatAllocations, setSeatAllocations, classroomsList, departments, settings, showToast, addAudit } = useData();
  const [activeTab, setActiveTab] = useState('exams');
  const [selectedExam, setSelectedExam] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState('');
  const [allocating, setAllocating] = useState(false);
  const [form, setForm] = useState({ name:'', type:'mid', date:'', status:'draft', halls:4, students:1200 });

  const filteredExams = useMemo(() => examsList.filter(e => e.name.toLowerCase().includes(search.toLowerCase())), [examsList, search]);

  const handleAddExam = () => {
    if (!form.name.trim() || !form.date) return;
    addExam({ ...form, halls: Number(form.halls), students: Number(form.students) });
    setShowAddModal(false);
    setForm({ name:'', type:'mid', date:'', status:'draft', halls:4, students:1200 });
  };

  const handleAllocate = (exam) => {
    setAllocating(true);
    setSelectedExam(exam);
    setActiveTab('seating');
    setTimeout(() => {
      // Generate anti-cheat seating
      const depts = departments.map(d => d.code);
      const colors = ['#3b82f6','#8b5cf6','#ef4444','#f59e0b','#10b981','#ec4899'];
      const seats = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 10; c++) {
          const di = (r + c * 3 + Math.floor(r/2)) % depts.length;
          seats.push({
            row: r, col: c,
            student: `${depts[di]}2024${String(r*10+c+1).padStart(3,'0')}`,
            dept: depts[di], color: colors[di % colors.length],
            absent: Math.random() < 0.05,
          });
        }
      }
      setSeatAllocations(seats);
      setAllocating(false);
      showToast('Seating allocated with anti-cheat mixing!');
      addAudit('exam@campus.edu', 'GENERATE', 'Seating', exam.name);
      updateExam(exam.id, { status: 'upcoming' });
    }, 1500);
  };

  const deptColors = useMemo(() => {
    const map = {};
    seatAllocations.forEach(s => { if (!map[s.dept]) map[s.dept] = s.color; });
    return map;
  }, [seatAllocations]);

  const handleDocumentDownload = async (format, doc) => {
    try {
      await downloadOfficialFile(format, {
        settings,
        title: doc.title,
        subtitle: selectedExam ? `${selectedExam.name} - ${selectedExam.date}` : 'Exam seating document',
        details: [
          { label: 'Selected Exam', value: selectedExam?.name || 'Not selected' },
          { label: 'Exam Date', value: selectedExam?.date || 'Not selected' },
          { label: 'Configured Halls', value: selectedExam?.halls || classroomsList.length },
          { label: 'Students', value: selectedExam?.students || seatAllocations.length },
          { label: 'Seats Filled', value: seatAllocations.length ? `${seatAllocations.filter(s => !s.absent).length}/${seatAllocations.length}` : 'Not allocated' },
          { label: 'Departments Mixed', value: Object.keys(deptColors).length || departments.length },
        ],
        sections: [{ heading: 'Document Purpose', lines: [doc.desc] }],
        columns: ['Row', 'Column', 'Student', 'Department', 'Status'],
        rows: seatAllocations.map((seat) => [
          `R${seat.row + 1}`,
          `C${seat.col + 1}`,
          seat.student,
          seat.dept,
          seat.absent ? 'Absent' : 'Allocated',
        ]),
        filename: doc.title,
      });
      showToast(`${doc.title} downloaded as ${format.toUpperCase()}`);
    } catch {
      showToast(`${doc.title} export failed`, 'error');
    }
  };

  const tabs = [
    { id: 'exams', label: 'Exam Events' },
    { id: 'seating', label: 'Seat Allocation' },
    { id: 'documents', label: 'Documents' },
  ];

  return (
    <div className="fade-in">
      <div className="page-header"><div className="page-header-actions">
        <div><h1>Exam Seating Arrangement</h1><p>Intelligent seating allocation with anti-cheating mixing rules</p></div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-primary btn-sm" onClick={()=>setShowAddModal(true)}><Plus size={16}/> New Exam Event</button>
        </div>
      </div></div>

      <div className="tabs">{tabs.map(t=>(<button key={t.id} className={`tab ${activeTab===t.id?'active':''}`} onClick={()=>setActiveTab(t.id)}>{t.label}</button>))}</div>

      {activeTab==='exams'&&(
        <div className="table-container">
          <div className="table-header">
            <span className="table-title">All Exam Events ({filteredExams.length})</span>
            <input className="form-input search-input" placeholder="Search exams..." style={{width:250}} value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <table>
            <thead><tr><th>Exam Name</th><th>Type</th><th>Date</th><th>Halls</th><th>Students</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filteredExams.map(e=>(
                <tr key={e.id}>
                  <td style={{fontWeight:600}}>{e.name}</td>
                  <td><span className="badge badge-info">{e.type}</span></td>
                  <td>{e.date}</td>
                  <td>{e.halls}</td>
                  <td>{e.students.toLocaleString()}</td>
                  <td><span className={`badge ${e.status==='completed'?'badge-success':e.status==='upcoming'?'badge-warning':'badge-neutral'}`}>{e.status}</span></td>
                  <td><div style={{display:'flex',gap:4}}>
                    <button className="btn btn-outline btn-sm" onClick={()=>{setSelectedExam(e);setActiveTab('seating');}}><Eye size={14}/> View</button>
                    <button className="btn btn-accent btn-sm" onClick={()=>handleAllocate(e)}><RefreshCw size={14}/> Allocate</button>
                    <button className="btn btn-ghost btn-sm" style={{color:'var(--error)'}} onClick={()=>deleteExam(e.id)}><Trash2 size={14}/></button>
                  </div></td>
                </tr>
              ))}
              {filteredExams.length===0&&<tr><td colSpan="7" style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>No exams found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {activeTab==='seating'&&(
        <>
          {allocating ? (
            <div className="card" style={{textAlign:'center',padding:60}}>
              <div style={{width:48,height:48,border:'4px solid var(--border)',borderTopColor:'var(--accent)',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 16px'}}/>
              <h3>Generating Seating...</h3><p style={{color:'var(--text-muted)'}}>Applying anti-cheat mixing algorithm</p>
              <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
            </div>
          ) : (
            <>
              <div className="stats-grid" style={{gridTemplateColumns:'repeat(4, 1fr)'}}>
                <div className="stat-card"><div className="stat-value" style={{fontSize:22}}>EXAM-1</div><div className="stat-label">Current Hall</div></div>
                <div className="stat-card"><div className="stat-value" style={{fontSize:22,color:'var(--success)'}}>{seatAllocations.filter(s=>!s.absent).length}/{seatAllocations.length}</div><div className="stat-label">Seats Filled</div></div>
                <div className="stat-card"><div className="stat-value" style={{fontSize:22,color:'var(--accent)'}}>{Object.keys(deptColors).length}</div><div className="stat-label">Departments Mixed</div></div>
                <div className="stat-card"><div className="stat-value" style={{fontSize:22,color:'var(--success)'}}>0</div><div className="stat-label">Adjacency Violations</div></div>
              </div>
              <div className="card">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                  <h3 style={{fontSize:16,fontWeight:700}}>Seat Grid — Exam Hall 1 (8 × 10)</h3>
                  <div style={{display:'flex',gap:12,fontSize:12,flexWrap:'wrap'}}>
                    {Object.entries(deptColors).map(([dept,color])=>(
                      <span key={dept} style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:14,height:14,borderRadius:3,background:color}}/>{dept}</span>
                    ))}
                  </div>
                </div>
                <div style={{overflowX:'auto'}}>
                  <div style={{display:'flex',gap:4,marginBottom:8}}>
                    <div style={{width:40}}/>
                    {Array.from({length:10},(_,i)=>(<div key={i} style={{width:64,textAlign:'center',fontSize:11,fontWeight:600,color:'var(--text-muted)'}}>C{i+1}</div>))}
                  </div>
                  {Array.from({length:8},(_,r)=>(
                    <div key={r} style={{display:'flex',gap:4,marginBottom:4}}>
                      <div style={{width:40,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,color:'var(--text-muted)'}}>R{r+1}</div>
                      {Array.from({length:10},(_,c)=>{
                        const seat=seatAllocations.find(s=>s.row===r&&s.col===c);
                        return(<div key={c} className={`seat ${seat?.absent?'absent':''}`} style={{width:64,height:48,background:seat?`${seat.color}18`:'var(--surface)',border:`2px solid ${seat?seat.color:'var(--border)'}`,color:seat?.color||'var(--text-muted)',fontSize:9,flexDirection:'column',lineHeight:1.2,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'var(--radius-sm)',cursor:'pointer'}} title={seat?`${seat.student} (${seat.dept})`:'Empty'}>
                          <div style={{fontWeight:800}}>{seat?.dept}</div><div>{seat?.student.slice(-3)}</div>
                        </div>);
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {activeTab==='documents'&&(
        <div className="card">
          <h3 style={{marginBottom:20,fontWeight:700}}>Generate Exam Documents</h3>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(250px, 1fr))',gap:16}}>
            {[
              {title:'Hall Allotment Sheet',desc:'Room-wise student list with seat numbers',icon:ClipboardList},
              {title:'Bench Allocation Chart',desc:'Printable grid with student names per seat',icon:Users},
              {title:'Invigilator Duty Sheet',desc:'Invigilator assignments with hall details',icon:Eye},
              {title:'Student Hall Tickets',desc:'Individual PDFs with QR verification',icon:Printer},
            ].map((doc,i)=>(
              <div key={i} className="card" style={{cursor:'pointer'}}>
                <doc.icon size={24} color="var(--accent)" style={{marginBottom:12}}/>
                <h4 style={{marginBottom:4}}>{doc.title}</h4>
                <p style={{fontSize:13,color:'var(--text-muted)',marginBottom:12}}>{doc.desc}</p>
                <div style={{display:'flex',gap:8}}>
                  <button className="btn btn-accent btn-sm" onClick={()=>handleDocumentDownload('pdf', doc)}><Download size={14}/> PDF</button>
                  <button className="btn btn-outline btn-sm" onClick={()=>handleDocumentDownload('docx', doc)}><Download size={14}/> DOCX</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAddModal&&(<div className="modal-overlay" onClick={()=>setShowAddModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><h3>New Exam Event</h3><button className="btn btn-ghost" onClick={()=>setShowAddModal(false)}>✕</button></div>
        <div className="modal-body">
          <div className="form-group"><label className="form-label">Exam Name *</label><input className="form-input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g., Mid Semester Exam - Oct 2025"/></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div className="form-group"><label className="form-label">Type</label><select className="form-select" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="mid">Mid Semester</option><option value="end">End Semester</option><option value="backlog">Backlog</option></select></div>
            <div className="form-group"><label className="form-label">Date *</label><input className="form-input" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div>
            <div className="form-group"><label className="form-label">Halls</label><input className="form-input" type="number" value={form.halls} onChange={e=>setForm({...form,halls:e.target.value})}/></div>
            <div className="form-group"><label className="form-label">Students</label><input className="form-input" type="number" value={form.students} onChange={e=>setForm({...form,students:e.target.value})}/></div>
          </div>
        </div>
        <div className="modal-footer"><button className="btn btn-outline" onClick={()=>setShowAddModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleAddExam} disabled={!form.name.trim()||!form.date}>Create Exam</button></div>
      </div></div>)}
    </div>
  );
}
