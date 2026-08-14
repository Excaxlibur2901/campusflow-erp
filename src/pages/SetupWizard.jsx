import { useState, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import CollegeHeader from '../components/CollegeHeader';
import { ChevronRight, ChevronLeft, Check, Plus, Trash2, Image, Eye, ShieldCheck } from 'lucide-react';

const STEPS = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'header', title: 'College Header' },
  { id: 'details', title: 'Details' },
  { id: 'departments', title: 'Departments' },
  { id: 'classrooms', title: 'Classrooms' },
  { id: 'preview', title: 'Preview & Admin' },
];

export default function SetupWizard() {
  const { runSetup } = useAuth();
  const { setSettings, showToast } = useData();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  // Super Admin Account Data
  const [adminName, setAdminName] = useState('System Administrator');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

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
    if (step === 1) {
      return inst.institutionName.trim().length > 0;
    }
    if (step === 3) return depts.some(d => d.code.trim() && d.name.trim());
    return true;
  };

  const handleFinish = async () => {
    const errors = {};
    if (!inst.institutionName.trim()) {
      showToast('Institution name is required.', 'error');
      setStep(1);
      return;
    }
    if (!adminName.trim()) {
      errors.name = 'Full name is required.';
    }
    if (!adminEmail.trim()) {
      errors.email = 'Institutional email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim())) {
      errors.email = 'Please enter a valid email address.';
    }
    if (!adminPassword) {
      errors.password = 'Password is required.';
    } else if (adminPassword.length < 8) {
      errors.password = 'Password must be at least 8 characters long.';
    }
    if (adminConfirmPassword !== adminPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      showToast('Please fix the validation errors before launching.', 'error');
      return;
    }

    setFieldErrors({});
    setLoading(true);

    try {
      const result = await runSetup({
        institutionName: inst.institutionName.trim(),
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim(),
        adminPassword,
        instDetails: { ...inst, phone: inst.phone || adminPhone },
        departments: depts.filter(d => d.code.trim() && d.name.trim()),
        classrooms: rooms.filter(r => r.code.trim() && r.name.trim()),
      });

      if (!result.success) {
        showToast(result.error || 'Setup failed.', 'error');
        setLoading(false);
        return;
      }

      setSettings(prev => ({ ...prev, ...inst, principalName: inst.principalName || adminName }));
      showToast('Setup complete! Welcome to CampusFlow ERP.');
    } catch {
      showToast('Network error completing setup.', 'error');
    } finally {
      setLoading(false);
    }
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
              <p>Let's set up your institution in just a few steps. You'll configure your college header, departments, classrooms, and first administrator account to get started.</p>
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

          {/* STEP 5: Final Preview & First Admin Account */}
          {step === 5 && (
            <div>
              <h2>Preview & Create Administrator</h2>
              <p className="setup-subtitle">Review your college header and create your first Super Admin account</p>

              {/* College Header Preview */}
              <div className="header-preview-card" style={{ maxWidth: 780, margin: '0 auto 24px', textAlign: 'left' }}>
                <CollegeHeader variant="document" customSettings={inst} />
              </div>

              {/* First Super Admin Account Credentials Form */}
              <div style={{ padding: 20, borderRadius: 10, background: 'var(--bg-main)', border: '1px solid var(--border)', maxWidth: 780, margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, marginBottom: 4, color: 'var(--primary)' }}>
                  <ShieldCheck size={18} />
                  <span>First Administrator Account (SUPER_ADMIN)</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                  Create the primary administrator account for {inst.institutionName || 'your institution'}. This account will have full access.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Admin Full Name *</label>
                    <input
                      className="form-input"
                      placeholder="e.g. Dr. System Administrator"
                      value={adminName}
                      onChange={e => { setAdminName(e.target.value); if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: null })); }}
                    />
                    {fieldErrors.name && <span style={{ color: 'var(--error, #ef4444)', fontSize: 12, marginTop: 4, display: 'block' }}>{fieldErrors.name}</span>}
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Institutional Email *</label>
                    <input
                      className="form-input"
                      type="email"
                      placeholder="admin@college.edu"
                      value={adminEmail}
                      onChange={e => { setAdminEmail(e.target.value); if (fieldErrors.email) setFieldErrors(prev => ({ ...prev, email: null })); }}
                    />
                    {fieldErrors.email && <span style={{ color: 'var(--error, #ef4444)', fontSize: 12, marginTop: 4, display: 'block' }}>{fieldErrors.email}</span>}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Phone Number (Optional)</label>
                    <input
                      className="form-input"
                      placeholder="+91 9876543210"
                      value={adminPhone}
                      onChange={e => setAdminPhone(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Password (min 8 chars) *</label>
                    <input
                      className="form-input"
                      type="password"
                      placeholder="Enter secure password"
                      value={adminPassword}
                      onChange={e => { setAdminPassword(e.target.value); if (fieldErrors.password) setFieldErrors(prev => ({ ...prev, password: null })); }}
                    />
                    {fieldErrors.password && <span style={{ color: 'var(--error, #ef4444)', fontSize: 12, marginTop: 4, display: 'block' }}>{fieldErrors.password}</span>}
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Confirm Password *</label>
                    <input
                      className="form-input"
                      type="password"
                      placeholder="Re-enter password"
                      value={adminConfirmPassword}
                      onChange={e => { setAdminConfirmPassword(e.target.value); if (fieldErrors.confirmPassword) setFieldErrors(prev => ({ ...prev, confirmPassword: null })); }}
                    />
                    {fieldErrors.confirmPassword && <span style={{ color: 'var(--error, #ef4444)', fontSize: 12, marginTop: 4, display: 'block' }}>{fieldErrors.confirmPassword}</span>}
                  </div>
                </div>
              </div>

              <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', marginTop: 16 }}>
                Configured <strong>{depts.filter(d => d.code && d.name).length}</strong> departments and <strong>{rooms.filter(r => r.code && r.name).length}</strong> classrooms.
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="setup-nav">
          {step > 0 ? (
            <button className="btn btn-outline" onClick={() => setStep(s => s - 1)} disabled={loading}><ChevronLeft size={16} /> Back</button>
          ) : <div />}
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>
              {step === 0 ? "Let's Get Started" : 'Next Step'} <ChevronRight size={16} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleFinish} disabled={loading} style={{ background: 'linear-gradient(135deg, var(--success), #16A34A)' }}>
              {loading ? (
                <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Creating Institution...</>
              ) : (
                <><Check size={16} /> Launch CampusFlow</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
