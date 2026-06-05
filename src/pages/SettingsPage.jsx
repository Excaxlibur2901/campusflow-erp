import { useState, useRef } from 'react';
import { useData } from '../context/DataContext';
import CollegeHeader from '../components/CollegeHeader';
import { Save, Upload, Database, AlertTriangle, Image } from 'lucide-react';

export default function SettingsPage() {
  const { settings, setSettings, showToast, addAudit, resetAll } = useData();
  const [activeTab, setActiveTab] = useState('institution');
  const [form, setForm] = useState({ ...settings });
  const [backups, setBackups] = useState([]);
  const [confirmReset, setConfirmReset] = useState(false);
  const logoInputRef = useRef(null);

  const handleSave = () => {
    setSettings(form);
    showToast('Settings saved successfully!');
    addAudit('admin@campus.edu', 'UPDATE', 'Settings', activeTab);
  };

  const handleBackup = () => {
    const name = `backup_${new Date().toISOString().split('T')[0]}.json`;
    setBackups(prev => [{ name, size: '~1 KB', date: new Date().toLocaleDateString(), status: 'Completed' }, ...prev]);
    showToast('Backup created!');
    addAudit('admin@campus.edu', 'BACKUP', 'System', name);
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Logo must be under 2MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setForm(prev => ({ ...prev, collegeLogo: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const u = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div className="fade-in">
      <div className="page-header"><div className="page-header-actions">
        <div><h1>Settings</h1><p>Configure institution settings and system preferences</p></div>
        <button className="btn btn-primary btn-sm" onClick={handleSave}><Save size={16}/> Save Changes</button>
      </div></div>
      <div className="tabs">
        {['institution','header','documents','security','backup','danger'].map(t=>(
          <button key={t} className={`tab ${activeTab===t?'active':''}`} onClick={()=>setActiveTab(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>
        ))}
      </div>
      {activeTab==='institution'&&(
        <div className="card">
          <h3 style={{marginBottom:20,fontWeight:700}}>Institution Profile</h3>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
            <div className="form-group"><label className="form-label">Institution Name</label><input className="form-input" value={form.institutionName} onChange={u('institutionName')}/></div>
            <div className="form-group"><label className="form-label">Affiliation</label><input className="form-input" value={form.affiliation} onChange={u('affiliation')}/></div>
            <div className="form-group"><label className="form-label">Address</label><input className="form-input" value={form.address} onChange={u('address')}/></div>
            <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={form.phone} onChange={u('phone')}/></div>
            <div className="form-group"><label className="form-label">Email</label><input className="form-input" value={form.email} onChange={u('email')}/></div>
            <div className="form-group"><label className="form-label">Website</label><input className="form-input" value={form.website} onChange={u('website')}/></div>
            <div className="form-group"><label className="form-label">Principal / Director</label><input className="form-input" value={form.principalName||''} onChange={u('principalName')}/></div>
            <div className="form-group"><label className="form-label">Established Year</label><input className="form-input" type="number" value={form.establishedYear||''} onChange={u('establishedYear')}/></div>
            <div className="form-group"><label className="form-label">NAAC Grade</label>
              <select className="form-select" value={form.naacGrade} onChange={u('naacGrade')}>
                <option value="">Select...</option><option>A++</option><option>A+</option><option>A</option><option>B++</option><option>B+</option><option>B</option><option>C</option>
              </select>
            </div>
            <div className="form-group"><label className="form-label">AISHE Code</label><input className="form-input" value={form.aisheCode||''} onChange={u('aisheCode')}/></div>
            <div className="form-group"><label className="form-label">Autonomous Status</label>
              <select className="form-select" value={form.autonomousStatus||''} onChange={u('autonomousStatus')}>
                <option value="">Select...</option><option>Autonomous</option><option>Non-Autonomous</option><option>Deemed University</option>
              </select>
            </div>
            <div className="form-group"><label className="form-label">Motto / Tagline</label><input className="form-input" value={form.motto||''} onChange={u('motto')}/></div>
          </div>
        </div>
      )}
      {activeTab==='header'&&(
        <div className="card">
          <h3 style={{marginBottom:20,fontWeight:700}}>College Header & Logo</h3>
          <div className="header-setup-layout">
            <div className="header-setup-form">
              <div className="form-group">
                <label className="form-label">College Logo</label>
                <div className="logo-upload-area" onClick={() => logoInputRef.current?.click()}>
                  {form.collegeLogo ? (
                    <div className="logo-preview-wrap">
                      <img src={form.collegeLogo} alt="Logo" className="logo-preview-img" />
                      <button className="logo-remove-btn" onClick={(e) => { e.stopPropagation(); setForm(prev => ({...prev, collegeLogo: ''})); }} title="Remove">✕</button>
                    </div>
                  ) : (
                    <div className="logo-upload-placeholder">
                      <Image size={32} color="var(--text-muted)" />
                      <span>Click to upload logo</span>
                      <span className="logo-hint">PNG, JPG, SVG — Max 2MB</span>
                    </div>
                  )}
                  <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                </div>
              </div>
              <div className="form-group"><label className="form-label">College Type</label>
                <select className="form-select" value={form.collegeType||''} onChange={u('collegeType')}>
                  <option value="">Select...</option><option>Engineering</option><option>Arts & Science</option><option>Medical</option><option>Pharmacy</option><option>Management</option><option>Polytechnic</option><option>Multi-Disciplinary</option>
                </select>
              </div>
              <p style={{fontSize:12,color:'var(--text-muted)',marginTop:8}}>
                This header appears on all generated documents, hall tickets, and printable reports. Click "Save Changes" to apply.
              </p>
            </div>
            <div className="header-preview-section">
              <div className="header-preview-label">📄 Document Header Preview</div>
              <div className="header-preview-card">
                <CollegeHeader variant="document" customSettings={form} />
              </div>
              <div style={{marginTop:16}}>
                <div className="header-preview-label">📱 Sidebar Preview</div>
                <div style={{background:'var(--primary)',borderRadius:12,padding:12}}>
                  <CollegeHeader variant="compact" customSettings={form} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {activeTab==='documents'&&(
        <div className="card">
          <h3 style={{marginBottom:20,fontWeight:700}}>Document Templates</h3>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
            <div className="form-group"><label className="form-label">Header Font</label><select className="form-select" value={form.headerFont} onChange={u('headerFont')}><option>Arial</option><option>Times New Roman</option><option>Calibri</option><option>Georgia</option></select></div>
            <div className="form-group"><label className="form-label">Body Font Size</label><select className="form-select" value={form.bodyFontSize} onChange={u('bodyFontSize')}><option>10pt</option><option>11pt</option><option>12pt</option><option>14pt</option></select></div>
            <div className="form-group"><label className="form-label">Page Margins</label><select className="form-select" value={form.pageMargins} onChange={u('pageMargins')}><option>10mm</option><option>15mm</option><option>20mm</option><option>25mm</option></select></div>
            <div className="form-group"><label className="form-label">QR Verification</label><select className="form-select" value={form.qrVerification} onChange={u('qrVerification')}><option>Enabled</option><option>Disabled</option></select></div>
          </div>
        </div>
      )}
      {activeTab==='security'&&(
        <div className="card">
          <h3 style={{marginBottom:20,fontWeight:700}}>Security Settings</h3>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
            <div className="form-group"><label className="form-label">JWT Expiry</label><select className="form-select" value={form.jwtExpiry} onChange={u('jwtExpiry')}><option>5 minutes</option><option>15 minutes</option><option>30 minutes</option><option>1 hour</option></select></div>
            <div className="form-group"><label className="form-label">Refresh Token Expiry</label><select className="form-select" value={form.refreshExpiry} onChange={u('refreshExpiry')}><option>1 day</option><option>7 days</option><option>30 days</option></select></div>
            <div className="form-group"><label className="form-label">Bcrypt Cost Factor</label><select className="form-select" value={form.bcryptCost} onChange={u('bcryptCost')}><option>10</option><option>12</option><option>14</option></select></div>
            <div className="form-group"><label className="form-label">HTTPS Enforcement</label><select className="form-select" value={form.httpsEnforcement} onChange={u('httpsEnforcement')}><option>Enabled</option><option>Disabled</option></select></div>
          </div>
        </div>
      )}
      {activeTab==='backup'&&(
        <div className="card">
          <h3 style={{marginBottom:20,fontWeight:700}}>Backup & Restore</h3>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:24}}>
            <div className="form-group"><label className="form-label">Auto Backup</label><select className="form-select" value={form.autoBackup} onChange={u('autoBackup')}><option>Daily at 2:00 AM</option><option>Weekly</option><option>Disabled</option></select></div>
            <div className="form-group"><label className="form-label">Retention Period</label><select className="form-select" value={form.retentionPeriod} onChange={u('retentionPeriod')}><option>30 days</option><option>60 days</option><option>90 days</option></select></div>
          </div>
          <div style={{display:'flex',gap:12,marginBottom:20}}>
            <button className="btn btn-accent" onClick={handleBackup}><Database size={16}/> Create Backup Now</button>
            <button className="btn btn-outline" onClick={()=>showToast('Restore dialog opened','info')}><Upload size={16}/> Restore from Backup</button>
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>Backup</th><th>Size</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {backups.map((b,i)=>(
                  <tr key={i}><td>{b.name}</td><td>{b.size}</td><td>{b.date}</td><td><span className="badge badge-success">{b.status}</span></td></tr>
                ))}
                {backups.length===0&&<tr><td colSpan="4" style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>No backups yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {activeTab==='danger'&&(
        <div className="card" style={{borderLeft:'4px solid var(--error)'}}>
          <h3 style={{marginBottom:8,fontWeight:700,color:'var(--error)'}}><AlertTriangle size={20} style={{verticalAlign:'middle',marginRight:8}}/>Danger Zone</h3>
          <p style={{color:'var(--text-muted)',marginBottom:20}}>These actions are destructive and cannot be undone.</p>
          <div className="card" style={{background:'rgba(220,38,38,0.04)',border:'1px solid rgba(220,38,38,0.15)',padding:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div><strong>Reset All Data</strong><p style={{fontSize:13,color:'var(--text-muted)',marginTop:4}}>Erases all institution data, departments, faculty, students, and returns to setup wizard.</p></div>
              {!confirmReset?(<button className="btn btn-error" onClick={()=>setConfirmReset(true)}>Reset Everything</button>):(
                <div style={{display:'flex',gap:8}}><button className="btn btn-outline" onClick={()=>setConfirmReset(false)}>Cancel</button><button className="btn btn-error" onClick={resetAll}>Yes, Delete All Data</button></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
