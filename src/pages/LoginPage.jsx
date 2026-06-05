import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { ROLES } from '../data/mockData';
import { Shield, Clock, FileCheck, Zap } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const { settings } = useData();
  const [selectedRole, setSelectedRole] = useState('Super Admin');
  const [email, setEmail] = useState(settings.email || 'admin@campusflow.edu');
  const [password, setPassword] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    login(selectedRole);
  };

  const features = [
    { icon: <Zap size={18} color="#60a5fa" />, text: 'AI-powered timetable generation in seconds' },
    { icon: <Shield size={18} color="#60a5fa" />, text: 'Intelligent exam seating with anti-cheat mixing' },
    { icon: <FileCheck size={18} color="#60a5fa" />, text: 'QR-verified official documents instantly' },
    { icon: <Clock size={18} color="#60a5fa" />, text: '80% reduction in administrative workflow time' },
  ];

  return (
    <div className="login-page">
      <div className="login-left">
        {/* College branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 40 }}>
          {settings.collegeLogo ? (
            <img src={settings.collegeLogo} alt="Logo" style={{
              width: 56, height: 56, borderRadius: 14, objectFit: 'contain',
              background: '#fff', padding: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            }} />
          ) : (
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'linear-gradient(135deg, #2E75B6, #60a5fa)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 20, color: '#fff'
            }}>{(settings.institutionName || 'CF').substring(0, 2).toUpperCase()}</div>
          )}
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
              {settings.institutionName || 'CampusFlow ERP'}
            </div>
            {settings.affiliation && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                {settings.affiliation}
              </div>
            )}
          </div>
        </div>

        <h1>Smart Campus<br />Operations, <span>Simplified.</span></h1>
        <p style={{ marginTop: 8 }}>
          The unified platform for timetable scheduling, exam seating, attendance tracking, 
          and official document generation — purpose-built for engineering colleges.
        </p>
        <div className="login-features">
          {features.map((f, i) => (
            <div className="login-feature" key={i}>
              <div className="login-feature-icon">{f.icon}</div>
              <span>{f.text}</span>
            </div>
          ))}
        </div>

        {/* Accreditation badges on login */}
        {(settings.naacGrade || settings.aisheCode || settings.autonomousStatus) && (
          <div style={{ display: 'flex', gap: 12, marginTop: 32, flexWrap: 'wrap' }}>
            {settings.naacGrade && (
              <div style={{ padding: '6px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', fontSize: 12, color: '#fff', fontWeight: 600 }}>
                NAAC: {settings.naacGrade}
              </div>
            )}
            {settings.autonomousStatus && (
              <div style={{ padding: '6px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', fontSize: 12, color: '#fff', fontWeight: 600 }}>
                {settings.autonomousStatus}
              </div>
            )}
            {settings.aisheCode && (
              <div style={{ padding: '6px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', fontSize: 12, color: '#fff', fontWeight: 600 }}>
                AISHE: {settings.aisheCode}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="login-right">
        <form className="login-card" onSubmit={handleLogin}>
          <h2>Welcome Back</h2>
          <p className="subtitle">Sign in to your institutional account</p>

          <div className="form-group">
            <label className="form-label">Select Role</label>
            <div className="role-selector">
              {ROLES.map((role) => (
                <div
                  key={role}
                  className={`role-option ${selectedRole === role ? 'selected' : ''}`}
                  onClick={() => setSelectedRole(role)}
                >
                  {role}
                </div>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email" className="form-input"
              placeholder="you@institution.edu"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password" className="form-input"
              placeholder="Enter your password"
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
              <input type="checkbox" defaultChecked /> Remember me
            </label>
            <a href="#" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>Forgot password?</a>
          </div>

          <button type="submit" className="btn btn-primary">
            Sign In as {selectedRole}
          </button>

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-muted)' }}>
            Demo mode — select any role to explore the platform
          </p>
        </form>
      </div>
    </div>
  );
}
