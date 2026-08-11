import { useState, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import CollegeHeader from '../components/CollegeHeader';
import { ChevronRight, ChevronLeft, Check, Plus, Trash2, Image, Eye } from 'lucide-react';

const STEPS = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'header', title: 'College Header' },
  { id: 'details', title: 'Details' },
  { id: 'departments', title: 'Departments' },
  { id: 'classrooms', title: 'Classrooms' },
  { id: 'preview', title: 'Preview' },
];

export default function SetupWizard() {
  const { user } = useAuth();
  const { setSettings, setDepartments, setClassroomsList, completeSetup, showToast, addAudit } = useData();
  const [step, setStep] = useState(0);
  const fileInputRef = useRef(null);

  // All institution data
  const [inst, setInst] = useState({
    institutionName: '', affiliation: '', address: '', phone: '', email: '', website: '',
    naacGrade: '', collegeLogo: '', principalName: '', establishedYear: '', aisheCode: '',
    autonomousStatus: '', collegeType: '', motto: '',
  });

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Logo must be under 2MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setInst(prev => ({ ...prev, collegeLogo: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const removeLogo = () => setInst(prev => ({ ...prev, collegeLogo: '' }));

  // Departments
  const [depts, setDepts] = useState([{ code: '', name: '', hod: '' }]);
  const addDeptRow = () => setDepts(prev => [...prev, { code: '', name: '', hod: '' }]);
  const removeDeptRow = (i) => setDepts(prev => prev.filter((_, idx) => idx !== i));
  const updateDeptRow = (i, field, val) => setDepts(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: val } : d));

  // Classrooms
  const [rooms, setRooms] = useState([{ code: '', name: '', type: 'lecture', capacity: 60, floor: 1 }]);
  const addRoomRow = () => setRooms(prev => [...prev, { code: '', name: '', type: 'lecture', capacity: 60, floor: 1 }]);
  const removeRoomRow = (i) => setRooms(prev => prev.filter((_, idx) => idx !== i));
  const updateRoomRow = (i, field, val) => setRooms(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

  const canProceed = () => {
    if (step === 1) return inst.institutionName.trim().length > 0;
    if (step === 3) return depts.some(d => d.code.trim() && d.name.trim());
    return true;
  };

  const handleFinish = () => {
    setSettings(prev => ({ ...prev, ...inst }));
    const validDepts = depts.filter(d => d.code.trim() && d.name.trim()).map((d, i) => ({
      id: `d${Date.now()}_${i}`, code: d.code.toUpperCase(), name: d.name, hod: d.hod || 'Not Assigned',
      active: true, faculty: 0, students: 0,
    }));
    setDepartments(validDepts);
    const roomTypeLabel = { lecture: 'Lecture Hall', lab: 'Computer Lab', seminar: 'Seminar Hall', exam: 'Exam Hall', drawing: 'Drawing Hall' };
    const validRooms = rooms.filter(r => r.code.trim() && r.name.trim()).map((r, i) => ({
      id: `r${Date.now()}_${i}`, code: r.code.toUpperCase(), name: r.name,
      type: roomTypeLabel[r.type] || r.type,
      capacity: Number(r.capacity), floor: Number(r.floor), dept: null,
    }));
    setClassroomsList(validRooms);
    addAudit(user?.email || 'admin', 'CREATE', 'System', 'Initial Setup Completed');
    showToast('Setup complete! Welcome to CampusFlow ERP');
    completeSetup();
  };

  return (
    <div className="setup-wizard">
      <div className="setup-container" style={{ maxWidth: step === 5 ? 900 : 820 }}>
        {/* Progress Bar */}
        <div className="setup-progress">
          {STEPS.map((s, i) => (
            <div key={s.id} className={`setup-step-dot ${i <= step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              <div className="dot">{i < step ? <Check size={14} /> : i + 1}</div>
              <span className="dot-label">{s.title}</span>
            </div>
          ))}
          <div className="progress-line">
            <div className="progress-line-fill" style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} />
          </div>
        </div>

        {/* Step Content */}
        <div className="setup-content">
          {/* STEP 0: Welcome */}
          {step === 0 && (
            <div className="setup-welcome">
              <div className="setup-logo">CF</div>
              <h1>Welcome to CampusFlow ERP</h1>
              <p>Let's set up your institution in just a few steps. You'll configure your college header, departments, and classrooms to get started.</p>
              <div className="setup-features">
                {['College Header with Logo & Branding', 'Smart Timetable Scheduling', 'Exam Seating with Anti-Cheat', 'Attendance Tracking & Document Generation'].map((f, i) => (
                  <div key={i} className="setup-feature-item">
                    <Check size={16} color="var(--success)" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 1: College Header — Logo + Name + Affiliation */}
          {step === 1 && (
            <div>
              <h2>College Header</h2>
              <p className="setup-subtitle">Upload your logo and enter the key details that appear on your institution's official header</p>

              <div className="header-setup-layout">
                <div className="header-setup-form">
                  {/* Logo Upload */}
                  <div className="form-group">
                    <label className="form-label">College Logo</label>
                    <div className="logo-upload-area" onClick={() => fileInputRef.current?.click()}>
                      {inst.collegeLogo ? (
                        <div className="logo-preview-wrap">
                          <img src={inst.collegeLogo} alt="Logo" className="logo-preview-img" />
                          <button className="logo-remove-btn" onClick={(e) => { e.stopPropagation(); removeLogo(); }} title="Remove">✕</button>
                        </div>
                      ) : (
                        <div className="logo-upload-placeholder">
                          <Image size={32} color="var(--text-muted)" />
                          <span>Click to upload logo</span>
                          <span className="logo-hint">PNG, JPG, SVG — Max 2MB</span>
                        </div>
                      )}
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Institution Name *</label>
                    <input className="form-input" placeholder="e.g., Vishwakarma Institute of Technology" value={inst.institutionName} onChange={e => setInst({ ...inst, institutionName: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">University Affiliation</label>
                    <input className="form-input" placeholder="e.g., Savitribai Phule Pune University" value={inst.affiliation} onChange={e => setInst({ ...inst, affiliation: e.target.value })} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                      <label className="form-label">Autonomous Status</label>
                      <select className="form-select" value={inst.autonomousStatus} onChange={e => setInst({ ...inst, autonomousStatus: e.target.value })}>
                        <option value="">Select...</option>
                        <option>Autonomous</option>
                        <option>Non-Autonomous</option>
                        <option>Deemed University</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">College Type</label>
                      <select className="form-select" value={inst.collegeType} onChange={e => setInst({ ...inst, collegeType: e.target.value })}>
                        <option value="">Select...</option>
                        <option>Engineering</option>
                        <option>Arts & Science</option>
                        <option>Medical</option>
                        <option>Pharmacy</option>
                        <option>Management</option>
                        <option>Polytechnic</option>
                        <option>Multi-Disciplinary</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Motto / Tagline</label>
                    <input className="form-input" placeholder="e.g., Knowledge is Supreme" value={inst.motto} onChange={e => setInst({ ...inst, motto: e.target.value })} />
                  </div>
                </div>

                {/* Live Preview */}
                <div className="header-preview-section">
                  <div className="header-preview-label"><Eye size={14} /> Live Header Preview</div>
                  <div className="header-preview-card">
                    <CollegeHeader variant="full" customSettings={inst} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Details — Address, accreditation, contact */}
          {step === 2 && (
            <div>
              <h2>Institution Details</h2>
              <p className="setup-subtitle">Contact information and accreditation details</p>
              <div className="setup-form-grid">
                <div className="form-group"><label className="form-label">Address</label>
                  <input className="form-input" placeholder="Full address with city & pincode" value={inst.address} onChange={e => setInst({ ...inst, address: e.target.value })} />
                </div>
                <div className="form-group"><label className="form-label">Phone</label>
                  <input className="form-input" placeholder="+91 20 ..." value={inst.phone} onChange={e => setInst({ ...inst, phone: e.target.value })} />
                </div>
                <div className="form-group"><label className="form-label">Email</label>
                  <input className="form-input" type="email" placeholder="admin@college.edu" value={inst.email} onChange={e => setInst({ ...inst, email: e.target.value })} />
                </div>
                <div className="form-group"><label className="form-label">Website</label>
                  <input className="form-input" placeholder="https://www.college.edu.in" value={inst.website} onChange={e => setInst({ ...inst, website: e.target.value })} />
                </div>
                <div className="form-group"><label className="form-label">NAAC Grade</label>
                  <select className="form-select" value={inst.naacGrade} onChange={e => setInst({ ...inst, naacGrade: e.target.value })}>
                    <option value="">Select...</option>
                    <option>A++</option><option>A+</option><option>A</option><option>B++</option><option>B+</option><option>B</option><option>C</option>
                  </select>
                </div>
                <div className="form-group"><label className="form-label">AISHE Code</label>
                  <input className="form-input" placeholder="e.g., C-12345" value={inst.aisheCode} onChange={e => setInst({ ...inst, aisheCode: e.target.value.toUpperCase() })} />
                </div>
                <div className="form-group"><label className="form-label">Established Year</label>
                  <input className="form-input" type="number" placeholder="e.g., 1983" value={inst.establishedYear} onChange={e => setInst({ ...inst, establishedYear: e.target.value })} />
                </div>
                <div className="form-group"><label className="form-label">Principal / Director Name</label>
                  <input className="form-input" placeholder="Dr. ..." value={inst.principalName} onChange={e => setInst({ ...inst, principalName: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Departments */}
          {step === 3 && (
            <div>
              <h2>Add Departments</h2>
              <p className="setup-subtitle">Add all your academic departments (you can add more later)</p>
              <div className="setup-table">
                <div className="setup-table-header">
                  <span style={{ width: 100 }}>Code *</span>
                  <span style={{ flex: 1 }}>Department Name *</span>
                  <span style={{ width: 200 }}>HOD Name</span>
                  <span style={{ width: 40 }}></span>
                </div>
                {depts.map((d, i) => (
                  <div key={i} className="setup-table-row">
                    <input className="form-input" style={{ width: 100 }} placeholder="CSE" value={d.code} onChange={e => updateDeptRow(i, 'code', e.target.value.toUpperCase())} />
                    <input className="form-input" style={{ flex: 1 }} placeholder="Computer Science & Engineering" value={d.name} onChange={e => updateDeptRow(i, 'name', e.target.value)} />
                    <input className="form-input" style={{ width: 200 }} placeholder="Dr. Name" value={d.hod} onChange={e => updateDeptRow(i, 'hod', e.target.value)} />
                    {depts.length > 1 && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => removeDeptRow(i)}><Trash2 size={14} /></button>}
                  </div>
                ))}
              </div>
              <button className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={addDeptRow}><Plus size={14} /> Add Another Department</button>
            </div>
          )}

          {/* STEP 4: Classrooms */}
          {step === 4 && (
            <div>
              <h2>Add Classrooms & Labs</h2>
              <p className="setup-subtitle">Add your lecture halls, labs, and exam halls (you can add more later)</p>
              <div className="setup-table">
                <div className="setup-table-header">
                  <span style={{ width: 110 }}>Code</span>
                  <span style={{ flex: 1 }}>Room Name</span>
                  <span style={{ width: 110 }}>Type</span>
                  <span style={{ width: 80 }}>Capacity</span>
                  <span style={{ width: 60 }}>Floor</span>
                  <span style={{ width: 40 }}></span>
                </div>
                {rooms.map((r, i) => (
                  <div key={i} className="setup-table-row">
                    <input className="form-input" style={{ width: 110 }} placeholder="LH-101" value={r.code} onChange={e => updateRoomRow(i, 'code', e.target.value.toUpperCase())} />
                    <input className="form-input" style={{ flex: 1 }} placeholder="Lecture Hall 101" value={r.name} onChange={e => updateRoomRow(i, 'name', e.target.value)} />
                    <select className="form-select" style={{ width: 110 }} value={r.type} onChange={e => updateRoomRow(i, 'type', e.target.value)}>
                      <option value="lecture">Lecture</option><option value="lab">Lab</option>
                      <option value="seminar">Seminar Hall</option><option value="exam">Exam Hall</option>
                      <option value="drawing">Drawing Hall</option>
                    </select>
                    <input className="form-input" style={{ width: 80 }} type="number" value={r.capacity} onChange={e => updateRoomRow(i, 'capacity', e.target.value)} />
                    <input className="form-input" style={{ width: 60 }} type="number" value={r.floor} onChange={e => updateRoomRow(i, 'floor', e.target.value)} />
                    {rooms.length > 1 && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => removeRoomRow(i)}><Trash2 size={14} /></button>}
                  </div>
                ))}
              </div>
              <button className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={addRoomRow}><Plus size={14} /> Add Another Room</button>
            </div>
          )}

          {/* STEP 5: Final Preview */}
          {step === 5 && (
            <div className="setup-welcome">
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg, var(--success), #4ade80)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <Check size={40} color="#fff" />
              </div>
              <h1>You're All Set!</h1>
              <p style={{ marginBottom: 24 }}>Here's how your official college header will look on documents:</p>

              <div className="header-preview-card" style={{ maxWidth: 700, margin: '0 auto 20px', textAlign: 'left' }}>
                <CollegeHeader variant="document" customSettings={inst} />
              </div>

              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Configured <strong>{depts.filter(d => d.code && d.name).length}</strong> departments and <strong>{rooms.filter(r => r.code && r.name).length}</strong> classrooms.
                Add faculty, students, and subjects from the management pages.
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="setup-nav">
          {step > 0 ? (
            <button className="btn btn-outline" onClick={() => setStep(s => s - 1)}><ChevronLeft size={16} /> Back</button>
          ) : <div />}
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>
              {step === 0 ? "Let's Get Started" : 'Next Step'} <ChevronRight size={16} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleFinish} style={{ background: 'linear-gradient(135deg, var(--success), #16A34A)' }}>
              <Check size={16} /> Launch CampusFlow
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
