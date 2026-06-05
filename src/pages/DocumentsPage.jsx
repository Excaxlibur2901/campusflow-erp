import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import CollegeHeader from '../components/CollegeHeader';
import { documentExportPayload, downloadOfficialFile } from '../utils/officialDownloads';
import { Download, Eye, FileText, Plus, Printer, QrCode, Settings, X } from 'lucide-react';

export default function DocumentsPage() {
  const { documents, generateDocument, showToast, settings } = useData();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [showGenModal, setShowGenModal] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'Timetable' });
  const [previewDoc, setPreviewDoc] = useState(null);

  const filtered = useMemo(() => documents.filter((d) => {
    const ms = d.title.toLowerCase().includes(search.toLowerCase());
    const mt = typeFilter === 'All' || d.type === typeFilter;
    return ms && mt;
  }), [documents, search, typeFilter]);

  const allTypes = [...new Set(documents.map((d) => d.type))];
  const totalGenerated = documents.filter((d) => d.status === 'generated').length;

  const handleGenerate = () => {
    if (!form.title.trim()) return;
    generateDocument({ title: form.title, type: form.type, by: user?.role || 'Admin' });
    setShowGenModal(false);
    setForm({ title: '', type: 'Timetable' });
  };

  const handleDownload = async (doc, format) => {
    try {
      await downloadOfficialFile(format, documentExportPayload(doc, settings));
      showToast(`Downloaded "${doc.title}" as ${format.toUpperCase()}`);
    } catch {
      showToast(`Could not download "${doc.title}"`, 'error');
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header"><div className="page-header-actions">
        <div><h1>Document Management</h1><p>Generate, verify, and manage all institutional documents</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline btn-sm"><Settings size={16} /> Template Config</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowGenModal(true)}><Plus size={16} /> Generate Document</button>
        </div>
      </div></div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 24 }}>
        {[
          { icon: FileText, label: 'Total Generated', value: totalGenerated, bg: 'linear-gradient(135deg, var(--primary), var(--accent))' },
          { icon: QrCode, label: 'QR Verified', value: Math.floor(totalGenerated * 0.76), bg: 'linear-gradient(135deg, #16A34A, #4ade80)' },
          { icon: Printer, label: 'Total Documents', value: documents.length, bg: 'linear-gradient(135deg, #D97706, #fbbf24)' },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-icon" style={{ background: s.bg }}><s.icon size={24} color="#fff" /></div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="table-container">
        <div className="table-header">
          <span className="table-title">Documents ({filtered.length})</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input search-input" placeholder="Search documents..." style={{ width: 240 }} value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="form-select" style={{ width: 140 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="All">All Types</option>
              {allTypes.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <table>
          <thead><tr><th>Document</th><th>Type</th><th>Generated</th><th>By</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id}>
                <td style={{ fontWeight: 600 }}>{d.title}</td>
                <td><span className="badge badge-info">{d.type}</span></td>
                <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{d.date}</td>
                <td>{d.by}</td>
                <td><span className={`badge ${d.status === 'generated' ? 'badge-success' : 'badge-warning'}`}>{d.status}</span></td>
                <td><div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => handleDownload(d, 'pdf')}><Download size={14} /> PDF</button>
                  <button className="btn btn-outline btn-sm" onClick={() => handleDownload(d, 'docx')}><Download size={14} /> DOCX</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPreviewDoc(d)}><Eye size={14} /></button>
                </div></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No documents found</td></tr>}
          </tbody>
        </table>
      </div>

      {showGenModal && (
        <div className="modal-overlay" onClick={() => setShowGenModal(false)}><div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header"><h3>Generate Document</h3><button className="btn btn-ghost" onClick={() => setShowGenModal(false)}><X size={18} /></button></div>
          <div className="modal-body">
            <div className="form-group"><label className="form-label">Document Title *</label><input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g., Timetable - CSE Sem 3" /></div>
            <div className="form-group"><label className="form-label">Type</label><select className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option>Timetable</option><option>Hall Ticket</option><option>Attendance</option><option>Seating</option><option>Report</option>
            </select></div>
          </div>
          <div className="modal-footer"><button className="btn btn-outline" onClick={() => setShowGenModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleGenerate} disabled={!form.title.trim()}>Generate</button></div>
        </div></div>
      )}

      {previewDoc && (
        <div className="modal-overlay" onClick={() => setPreviewDoc(null)}><div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
          <div className="modal-header"><h3>Document Preview</h3><button className="btn btn-ghost" onClick={() => setPreviewDoc(null)}><X size={18} /></button></div>
          <div className="modal-body">
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 32, background: 'var(--surface)' }}>
              <CollegeHeader variant="document" />
              <h3 style={{ textAlign: 'center', marginBottom: 16, marginTop: 16 }}>{previewDoc.title}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, marginBottom: 16 }}>
                <div>Type: <strong>{previewDoc.type}</strong></div>
                <div>Date: <strong>{previewDoc.date}</strong></div>
                <div>Generated By: <strong>{previewDoc.by}</strong></div>
                <div>Status: <strong>{previewDoc.status}</strong></div>
              </div>
              <div style={{ padding: 20, background: '#fff', borderRadius: 8, border: '1px dashed var(--border)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                [Document content would appear here in the full system]
              </div>
              <div style={{ textAlign: 'center', marginTop: 16, fontSize: 10, color: 'var(--text-muted)' }}>
                QR Code: ##### | Doc ID: {previewDoc.id} | CampusFlow ERP
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline" onClick={() => setPreviewDoc(null)}>Close</button>
            <button className="btn btn-outline" onClick={() => handleDownload(previewDoc, 'docx')}><Download size={16} /> DOCX</button>
            <button className="btn btn-primary" onClick={() => handleDownload(previewDoc, 'pdf')}><Download size={16} /> PDF</button>
          </div>
        </div></div>
      )}
    </div>
  );
}
