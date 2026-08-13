import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  HelpCircle,
  ShieldCheck,
  Building,
  Calendar,
  FileText,
  ArrowLeft,
} from 'lucide-react';

export default function VerificationPage() {
  const { documentId } = useParams();
  const [loading, setLoading] = useState(true);
  const [docData, setDocData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function verifyDoc() {
      if (!documentId) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/documents/verify/${documentId}`);
        const data = await res.json();
        setDocData(data);
      } catch {
        setErrorMsg('Network error verifying document. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    verifyDoc();
  }, [documentId]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background, #f8fafc)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 640, background: '#fff', borderRadius: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.08)', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        
        {/* Header Banner */}
        <div style={{ background: '#1B3A6B', padding: '24px 28px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 700 }}>
              <ShieldCheck size={24} color="#38bdf8" /> CampusFlow ERP
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#93c5fd' }}>Official Document Verification Portal</p>
          </div>
          <Link to="/" style={{ color: '#fff', textDecoration: 'none', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.15)', padding: '6px 12px', borderRadius: 6 }}>
            <ArrowLeft size={14} /> Home
          </Link>
        </div>

        <div style={{ padding: '28px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 16px', border: '3px solid #cbd5e1', borderTopColor: '#1B3A6B', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <h3 style={{ fontSize: 16, color: '#334155' }}>Verifying Document Authenticity...</h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Checking cryptographic signature and registration status.</p>
            </div>
          ) : errorMsg ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#ef4444' }}>
              <AlertTriangle size={48} style={{ marginBottom: 12 }} />
              <h3>Verification Error</h3>
              <p style={{ fontSize: 14, color: '#64748b' }}>{errorMsg}</p>
            </div>
          ) : !docData || docData.status === 'NOT_FOUND' ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <HelpCircle size={36} color="#ef4444" />
              </div>
              <h2 style={{ fontSize: 20, color: '#991b1b', margin: 0, fontWeight: 700 }}>DOCUMENT NOT FOUND</h2>
              <p style={{ color: '#64748b', fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>
                No registered official document matching ID <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{documentId}</code> was found in our verification registry.
              </p>
              <div style={{ marginTop: 24, padding: 12, background: '#fff1f2', borderRadius: 8, border: '1px solid #fecdd3', fontSize: 13, color: '#9f1239' }}>
                ⚠️ Warning: This document may be fraudulent or fake.
              </div>
            </div>
          ) : docData.status === 'REVOKED' ? (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <AlertTriangle size={36} color="#dc2626" />
              </div>
              <h2 style={{ fontSize: 22, color: '#991b1b', margin: 0, fontWeight: 800 }}>DOCUMENT REVOKED</h2>
              <p style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>
                This official document was previously issued but has been <strong>REVOKED</strong> by institutional authority.
              </p>

              <div style={{ marginTop: 20, textAlign: 'left', background: '#f8fafc', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, marginBottom: 6 }}>
                  <span style={{ color: '#64748b' }}>Doc Number:</span>
                  <strong style={{ color: '#1e293b' }}>{docData.documentNumber}</strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, marginBottom: 6 }}>
                  <span style={{ color: '#64748b' }}>Title:</span>
                  <strong style={{ color: '#1e293b' }}>{docData.title}</strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
                  <span style={{ color: '#64748b' }}>Revoked On:</span>
                  <span style={{ color: '#dc2626', fontWeight: 600 }}>{docData.revokedAt ? new Date(docData.revokedAt).toLocaleString() : 'Date unavailable'}</span>
                </div>
              </div>
            </div>
          ) : docData.status === 'EXPIRED' ? (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fffbebeb', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Clock size={36} color="#d97706" />
              </div>
              <h2 style={{ fontSize: 22, color: '#92400e', margin: 0, fontWeight: 800 }}>DOCUMENT EXPIRED</h2>
              <p style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>
                This official document has passed its expiration date and is no longer active.
              </p>

              <div style={{ marginTop: 20, textAlign: 'left', background: '#f8fafc', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, marginBottom: 6 }}>
                  <span style={{ color: '#64748b' }}>Doc Number:</span>
                  <strong style={{ color: '#1e293b' }}>{docData.documentNumber}</strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
                  <span style={{ color: '#64748b' }}>Expired On:</span>
                  <span style={{ color: '#d97706', fontWeight: 600 }}>{docData.expiresAt ? new Date(docData.expiresAt).toLocaleDateString() : 'Expired'}</span>
                </div>
              </div>
            </div>
          ) : (
            /* VALID DOCUMENT DISPLAY */
            <div>
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <CheckCircle2 size={38} color="#16a34a" />
                </div>
                <h2 style={{ fontSize: 22, color: '#15803d', margin: 0, fontWeight: 800 }}>OFFICIAL DOCUMENT VERIFIED</h2>
                <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
                  This document is authentic, valid, and registered in the institutional ERP database.
                </p>
              </div>

              {/* Document Metadata Table */}
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: 20, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, fontSize: 13, borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 10 }}>
                  <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={14} /> Ref Number:</span>
                  <strong style={{ color: '#1B3A6B', fontFamily: 'monospace', fontSize: 14 }}>{docData.documentNumber}</strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, fontSize: 13, borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 10 }}>
                  <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={14} /> Document Type:</span>
                  <strong style={{ color: '#334155' }}>{docData.documentType}</strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, fontSize: 13, borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 10 }}>
                  <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={14} /> Document Title:</span>
                  <strong style={{ color: '#334155' }}>{docData.title}</strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, fontSize: 13, borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 10 }}>
                  <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}><Building size={14} /> Institution:</span>
                  <strong style={{ color: '#334155' }}>{docData.institution || 'CampusFlow Institution'}</strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, fontSize: 13, borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 10 }}>
                  <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}><Calendar size={14} /> Issue Date:</span>
                  <strong style={{ color: '#334155' }}>{docData.generatedAt ? new Date(docData.generatedAt).toLocaleDateString() : 'N/A'}</strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, fontSize: 13 }}>
                  <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}><ShieldCheck size={14} /> Status:</span>
                  <span style={{ display: 'inline-block', background: '#dcfce7', color: '#15803d', fontWeight: 700, padding: '2px 8px', borderRadius: 4, width: 'fit-content', fontSize: 12 }}>
                    VALID & ACTIVE
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                🔒 Tamper-Proof Cryptographic Verification • Powered by CampusFlow ERP
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
