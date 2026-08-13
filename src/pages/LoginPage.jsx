import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import CollegeHeader from '../components/CollegeHeader';
import {
  Shield, Clock, FileCheck, Zap, Eye, EyeOff, LogIn,
  Home, CheckCircle2, Search, Building2, UserPlus,
} from 'lucide-react';

export default function LoginPage() {
  const { login, registerAccount, fetchInstitutions } = useAuth();

  // Mode: 'login' | 'register' | 'home'
  const [mode, setMode] = useState('login');

  // Account Type for Registration: 'user' | 'institution'
  const [accountType, setAccountType] = useState('user');

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Register form state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regRole, setRegRole] = useState('Student');
  const [regDept, setRegDept] = useState('CSE');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regInstId, setRegInstId] = useState('');
  const [regInstName, setRegInstName] = useState('');

  // Loaded Institutions
  const [institutions, setInstitutions] = useState([]);

  // UI state
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Verification state for Public Home Page
  const [verifyDocId, setVerifyDocId] = useState('');

  // Fetch registered institutions when switching to register mode
  useEffect(() => {
    if (mode === 'register' && fetchInstitutions) {
      fetchInstitutions().then((list) => {
        if (Array.isArray(list)) {
          setInstitutions(list);
          if (list.length > 0 && !regInstId) {
            setRegInstId(list[0].id);
          }
        }
      });
    }
  }, [mode, fetchInstitutions, regInstId]);

  const features = [
    { icon: <Zap size={18} color="#60a5fa" />, text: 'Multi-tenant cloud ERP for higher education institutions' },
    { icon: <Shield size={18} color="#60a5fa" />, text: 'Score-based exam seating & clash-free timetable solver' },
    { icon: <FileCheck size={18} color="#60a5fa" />, text: 'QR-verifiable official academic document issuance' },
    { icon: <Clock size={18} color="#60a5fa" />, text: 'Automated attendance tracking & defaulter analytics' },
  ];

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password);
      if (!result.success) {
        setError(result.error);
      }
    } catch {
      setError('Unable to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!regName.trim()) {
      setError('Full name is required.');
      return;
    }
    if (!regEmail.trim()) {
      setError('Institutional email address is required.');
      return;
    }
    if (!regPassword || regPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError('Passwords do not match. Please re-enter your password.');
      return;
    }

    if (accountType === 'institution' && !regInstName.trim()) {
      setError('College / Institution name is required.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        accountType,
        fullName: regName.trim(),
        email: regEmail.trim(),
        password: regPassword,
        role: accountType === 'institution' ? 'SUPER_ADMIN' : regRole,
        department: regDept,
        institutionId: accountType === 'user' ? regInstId || undefined : undefined,
        institutionName: accountType === 'institution' ? regInstName.trim() : undefined,
      };

      const result = await registerAccount(payload);
      if (!result.success) {
        setError(result.error);
      } else {
        setSuccessMsg('Account created successfully! Signing you in...');
      }
    } catch {
      setError('Unable to complete registration. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = (e) => {
    e.preventDefault();
    if (!verifyDocId.trim()) return;
    window.open(`/api/verify/document/${verifyDocId.trim()}`, '_blank', 'noopener,noreferrer');
  };

  // Render Public Home Landing Page if mode === 'home'
  if (mode === 'home') {
    return (
      <div className="public-home-page" style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)' }}>
        {/* Top Navbar */}
        <header style={{
          background: '#fff', borderBottom: '1px solid var(--border)',
          padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => setMode('home')}>
            <div style={{
              width: 38, height: 38, borderRadius: 8,
              background: 'linear-gradient(135deg, #1B3A6B, #2E75B6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 16, color: '#fff'
            }}>CF</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#1B3A6B' }}>
                CampusFlow Universal ERP
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Multi-Tenant Academic Operations Platform</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-outline btn-sm" onClick={() => { setMode('register'); setError(''); }}>
              <UserPlus size={15} /> Create Account
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => { setMode('login'); setError(''); }}>
              <LogIn size={15} /> Sign In to ERP
            </button>
          </div>
        </header>

        {/* Hero Banner with Official Header */}
        <section style={{ background: '#fff', padding: '32px 24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ maxWidth: 1000, margin: '0 auto' }}>
            <CollegeHeader variant="document" title="UNIVERSAL ACADEMIC PORTAL" subtitle="Multi-Institutional Academic Operations & Official Document Verification System" />
          </div>
        </section>

        {/* Core Content Grid */}
        <section style={{ maxWidth: 1100, margin: '32px auto', padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
          {/* Announcement / Notice Board */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <CheckCircle2 color="var(--accent)" size={20} />
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Universal Platform System Status</h3>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <li style={{ paddingBottom: 12, borderBottom: '1px dashed var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>MULTI-TENANT ARCHITECTURE</div>
                <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>Universal College Onboarding & Cloud Access</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Institutions can register and manage autonomous campus operations securely.</div>
              </li>
              <li style={{ paddingBottom: 12, borderBottom: '1px dashed var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>ACCREDITATION & STANDARDS</div>
                <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>NAAC & NBA Compliant Workflows</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Standardized curriculum, outcome tracking, and exam seating algorithms.</div>
              </li>
              <li>
                <div style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 600 }}>DIGITAL CERTIFICATES</div>
                <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>QR-Verified Document Issuance System Live</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Employers and universities can verify bonafides & transcripts in real time.</div>
              </li>
            </ul>
          </div>

          {/* Document Verification Widget */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <FileCheck color="var(--success)" size={20} />
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Verify Official Document</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Enter the unique document reference ID or scan the QR code printed on official transcripts or bonafide certificates.
            </p>
            <form onSubmit={handleVerify} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                className="form-input"
                placeholder="e.g. CF-2026-000001"
                value={verifyDocId}
                onChange={(e) => setVerifyDocId(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn btn-accent btn-sm">
                <Search size={15} /> Verify
              </button>
            </form>

            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
              Verification opens in a new tab with the document status from the server.
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ textTransform: 'none', background: '#fff', borderTop: '1px solid var(--border)', textAlign: 'center', padding: '24px 16px', marginTop: 48, fontSize: 12, color: 'var(--text-muted)' }}>
          CampusFlow Universal ERP · Multi-Institutional Academic Operations Platform · All Rights Reserved
        </footer>
      </div>
    );
  }

  return (
    <div className="login-page">
      {/* Top Navbar actions (Home link) */}
      <div style={{
        position: 'absolute', top: 20, right: 24, zIndex: 10, display: 'flex', gap: 10
      }}>
        <button
          className="btn btn-outline btn-sm"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', borderColor: 'rgba(255,255,255,0.3)', backdropFilter: 'blur(8px)' }}
          onClick={() => setMode('home')}
        >
          <Home size={15} /> Public Home Page
        </button>
      </div>

      <div className="login-left">
        {/* College / Universal branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 36 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'linear-gradient(135deg, #2E75B6, #60a5fa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 20, color: '#fff'
          }}>CF</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
              CampusFlow Universal ERP
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
              Universal Higher Education Cloud Platform
            </div>
          </div>
        </div>

        <h1>Smart Campus<br />Operations, <span>Simplified.</span></h1>
        <p style={{ marginTop: 8 }}>
          The multi-tenant cloud platform for timetable scheduling, exam seating, attendance tracking,
          and official document generation — built for engineering & autonomous institutions.
        </p>
        <div className="login-features">
          {features.map((f, i) => (
            <div className="login-feature" key={i}>
              <div className="login-feature-icon">{f.icon}</div>
              <span>{f.text}</span>
            </div>
          ))}
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', gap: 12, marginTop: 32, flexWrap: 'wrap' }}>
          <div style={{ padding: '6px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', fontSize: 12, color: '#fff', fontWeight: 600 }}>
            Universal Multi-Tenant ERP
          </div>
          <div style={{ padding: '6px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', fontSize: 12, color: '#fff', fontWeight: 600 }}>
            NAAC / NBA Compatible
          </div>
          <div style={{ padding: '6px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', fontSize: 12, color: '#fff', fontWeight: 600 }}>
            QR Digital Verification
          </div>
        </div>
      </div>

      <div className="login-right">
        <div className="login-card" style={{ maxWidth: 460, width: '100%' }}>
          {/* Mode Switcher Tabs */}
          <div style={{
            display: 'flex', background: 'var(--bg-main)', padding: 4, borderRadius: 10, marginBottom: 24, gap: 4
          }}>
            <button
              type="button"
              style={{
                flex: 1, padding: '8px 12px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.2s',
                background: mode === 'login' ? '#fff' : 'transparent',
                color: mode === 'login' ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: mode === 'login' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
              }}
              onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
            >
              <LogIn size={14} style={{ display: 'inline', marginRight: 6 }} />
              Sign In
            </button>
            <button
              type="button"
              style={{
                flex: 1, padding: '8px 12px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.2s',
                background: mode === 'register' ? '#fff' : 'transparent',
                color: mode === 'register' ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: mode === 'register' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
              }}
              onClick={() => { setMode('register'); setError(''); setSuccessMsg(''); }}
            >
              <UserPlus size={14} style={{ display: 'inline', marginRight: 6 }} />
              Create Account
            </button>
          </div>

          {error && (
            <div style={{
              background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)',
              borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--error)',
              fontWeight: 500, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          {successMsg && (
            <div style={{
              background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.3)',
              borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--success)',
              fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8
            }}>
              <CheckCircle2 size={16} /> {successMsg}
            </div>
          )}

          {/* SIGN IN FORM */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} noValidate>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>Welcome Back</h2>
              <p className="subtitle" style={{ marginBottom: 20 }}>Sign in to your institutional account</p>

              <div className="form-group">
                <label className="form-label">Institutional Email</label>
                <input
                  type="email" className="form-input"
                  placeholder="you@institution.edu"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                    autoComplete="current-password"
                    style={{ paddingRight: 44 }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    style={{
                      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 0,
                    }}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked /> Remember me
                </label>
                <button
                  type="button"
                  style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0 }}
                  onClick={() => setError('Please contact your institution administrator to reset your password.')}
                >
                  Forgot password?
                </button>
              </div>

              <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {loading ? (
                  <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Signing in...</>
                ) : (
                  <><LogIn size={16} /> Sign In</>
                )}
              </button>

              <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-muted)' }}>
                Don't have an institutional account?{' '}
                <button
                  type="button"
                  style={{ color: 'var(--accent)', background: 'none', border: 'none', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                  onClick={() => { setMode('register'); setError(''); }}
                >
                  Create Account
                </button>
              </div>
            </form>
          )}

          {/* CREATE ACCOUNT (REGISTER) FORM */}
          {mode === 'register' && (
            <form onSubmit={handleRegister} noValidate>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>Create Account</h2>
              <p className="subtitle" style={{ marginBottom: 16 }}>Register for institutional ERP access</p>

              {/* Account Type Selector */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button
                  type="button"
                  style={{
                    flex: 1, padding: '6px 10px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                    border: '1px solid var(--border)', cursor: 'pointer',
                    background: accountType === 'user' ? 'var(--primary)' : '#fff',
                    color: accountType === 'user' ? '#fff' : 'var(--text-primary)',
                  }}
                  onClick={() => setAccountType('user')}
                >
                  Student / Staff Account
                </button>
                <button
                  type="button"
                  style={{
                    flex: 1, padding: '6px 10px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                    border: '1px solid var(--border)', cursor: 'pointer',
                    background: accountType === 'institution' ? 'var(--primary)' : '#fff',
                    color: accountType === 'institution' ? '#fff' : 'var(--text-primary)',
                  }}
                  onClick={() => setAccountType('institution')}
                >
                  <Building2 size={12} style={{ display: 'inline', marginRight: 4 }} />
                  Register New College
                </button>
              </div>

              {accountType === 'institution' ? (
                <div className="form-group">
                  <label className="form-label">College / Institution Name</label>
                  <input
                    type="text" className="form-input"
                    placeholder="e.g. St. Xavier's Institute of Technology"
                    value={regInstName}
                    onChange={(e) => { setRegInstName(e.target.value); setError(''); }}
                    required
                  />
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">Select Institution</label>
                  {institutions.length > 0 ? (
                    <select
                      className="form-select"
                      value={regInstId}
                      onChange={(e) => setRegInstId(e.target.value)}
                    >
                      {institutions.map((inst) => (
                        <option key={inst.id} value={inst.id}>
                          {inst.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. CampusFlow University"
                      value={regInstName}
                      onChange={(e) => setRegInstName(e.target.value)}
                    />
                  )}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text" className="form-input"
                  placeholder="e.g. Dr. Ramesh Kumar"
                  value={regName}
                  onChange={(e) => { setRegName(e.target.value); setError(''); }}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Institutional Email</label>
                <input
                  type="email" className="form-input"
                  placeholder="you@institution.edu"
                  value={regEmail}
                  onChange={(e) => { setRegEmail(e.target.value); setError(''); }}
                  required
                />
              </div>

              {accountType === 'user' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Institutional Role</label>
                    <select className="form-select" value={regRole} onChange={(e) => setRegRole(e.target.value)}>
                      <option value="Student">Student</option>
                      <option value="Faculty">Faculty</option>
                      <option value="HOD">HOD</option>
                      <option value="Exam Cell">Exam Cell</option>
                      <option value="Principal">Principal</option>
                      <option value="Super Admin">Super Admin</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Department</label>
                    <select className="form-select" value={regDept} onChange={(e) => setRegDept(e.target.value)}>
                      <option value="CSE">CSE</option>
                      <option value="ECE">ECE</option>
                      <option value="ME">Mechanical</option>
                      <option value="EEE">EEE</option>
                      <option value="Civil">Civil</option>
                      <option value="Exam">Exam Cell</option>
                      <option value="All">All Departments</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password" className="form-input"
                  placeholder="At least 6 characters"
                  value={regPassword}
                  onChange={(e) => { setRegPassword(e.target.value); setError(''); }}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input
                  type="password" className="form-input"
                  placeholder="Re-enter password"
                  value={regConfirmPassword}
                  onChange={(e) => { setRegConfirmPassword(e.target.value); setError(''); }}
                  required
                />
              </div>

              <button type="submit" className="btn btn-accent" disabled={loading} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                {loading ? (
                  <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Creating Account...</>
                ) : (
                  <><UserPlus size={16} /> {accountType === 'institution' ? 'Register College & Admin' : 'Register & Sign In'}</>
                )}
              </button>

              <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-muted)' }}>
                Already have an account?{' '}
                <button
                  type="button"
                  style={{ color: 'var(--accent)', background: 'none', border: 'none', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                  onClick={() => { setMode('login'); setError(''); }}
                >
                  Sign In
                </button>
              </div>
            </form>
          )}

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-muted)' }}>
            CampusFlow Universal ERP · Multi-Institutional Cloud Platform
          </p>
        </div>
      </div>
    </div>
  );
}
