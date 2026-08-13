import { useState, useEffect, useMemo, useCallback } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import {
  downloadFeeReceipt,
  downloadHallTicket,
  downloadAttendanceReport,
  downloadTimetableDocument,
  downloadSeatingDocument,
  downloadOfficialLetter,
} from '../utils/officialDownloads';
import {
  CreditCard, Ticket, ClipboardList, Calendar, LayoutGrid, FileText,
  Download, Eye, X, Trash2,
} from 'lucide-react';

const TEMPLATES = [
  { id: 'fee-receipt', name: 'Fee Receipt', icon: CreditCard, desc: 'Itemized fee receipts with payment details', gradient: ['#16A34A', '#4ade80'] },
  { id: 'hall-ticket', name: 'Hall Ticket', icon: Ticket, desc: 'Exam admit cards for students', gradient: ['#7C3AED', '#a78bfa'] },
  { id: 'attendance', name: 'Attendance Report', icon: ClipboardList, desc: 'Subject-wise attendance summary', gradient: ['#2563EB', '#60a5fa'] },
  { id: 'timetable', name: 'Official Timetable', icon: Calendar, desc: 'Formatted class schedule', gradient: ['#D97706', '#fbbf24'] },
  { id: 'seating', name: 'Seating Arrangement', icon: LayoutGrid, desc: 'Exam hall seating charts', gradient: ['#DC2626', '#f87171'] },
  { id: 'letter', name: 'Official Letter', icon: FileText, desc: 'Custom letters with letterhead', gradient: ['#0891B2', '#22d3ee'] },
];

const DEFAULT_FEE_ITEMS = [
  { name: 'Tuition Fee', amount: 45000 },
  { name: 'Library Fee', amount: 2000 },
  { name: 'Lab Fee', amount: 5000 },
  { name: 'Exam Fee', amount: 3000 },
  { name: 'Sports Fee', amount: 1500 },
  { name: 'Development Fee', amount: 2500 },
];

export default function DocumentsPage() {
  const { showToast, settings } = useData();
  const { getAccessToken } = useAuth();

  const [documents, setDocuments] = useState([]);
  const [studentsList, setStudentsList] = useState([]);
  const [examsList, setExamsList] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');

  // Form state
  const [studentId, setStudentId] = useState('');
  const [examId, setExamId] = useState('');
  const [feeItems] = useState(DEFAULT_FEE_ITEMS.map((f) => ({ ...f })));
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [transactionId, setTransactionId] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('1');
  const [letterRecipientName, setLetterRecipientName] = useState('');
  const [letterRecipientAddress] = useState('');
  const [letterSubject, setLetterSubject] = useState('');
  const [letterBody, setLetterBody] = useState('');
  const [letterSignatory] = useState('');
  const [letterDesignation] = useState('');

  // Load Data from PostgreSQL APIs
  const loadData = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [dRes, sRes, eRes, deptRes] = await Promise.all([
        fetch('/api/documents', { headers }),
        fetch('/api/students?limit=200', { headers }),
        fetch('/api/exams', { headers }),
        fetch('/api/departments', { headers }),
      ]);

      if (dRes.ok) {
        const dData = await dRes.json();
        setDocuments(dData.map(d => ({
          id: d.id,
          title: d.title,
          type: d.document_type,
          number: d.document_number,
          date: d.generated_at ? new Date(d.generated_at).toISOString().split('T')[0] : 'N/A',
          by: d.generated_by || 'system',
          status: d.status,
          verificationUrl: d.verification_url,
        })));
      }

      if (sRes.ok) {
        const sData = await sRes.json();
        setStudentsList((sData.data || sData).map(s => ({
          id: s.id,
          name: s.full_name || s.name || '',
          rollNo: s.roll_number || s.rollNo || '',
          dept: s.dept_code || s.dept || 'CSE',
          semester: s.semester || 3,
        })));
      }

      if (eRes.ok) setExamsList(await eRes.json());
      if (deptRes.ok) setDepartments(await deptRes.json());
    } catch {
      // Best effort load
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered documents
  const filtered = useMemo(() => documents.filter((d) => {
    const ms = d.title.toLowerCase().includes(search.toLowerCase());
    const mt = typeFilter === 'All' || d.type === typeFilter;
    return ms && mt;
  }), [documents, search, typeFilter]);

  const allTypes = useMemo(() => [...new Set(documents.map((d) => d.type))], [documents]);

  const getStudent = (id) => studentsList.find((s) => s.id === id);
  const getExam = (id) => examsList.find((e) => e.id === id);
  const studentLabel = (s) => `${s.name} — ${s.rollNo} (${s.dept})`;
  const examLabel = (e) => `${e.name} — ${e.date || 'Scheduled'}`;

  const handleRegisterDocument = async (docType, title, payload = {}) => {
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ documentType: docType, title, payload }),
      });
      if (res.ok) {
        await loadData();
        showToast(`Document "${title}" generated and registered.`);
      }
    } catch {
      // Best effort register
    }
  };

  const handleRevokeDocument = async (docId) => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/documents/${docId}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await loadData();
        showToast('Document officially revoked', 'warning');
      }
    } catch {
      showToast('Failed to revoke document', 'error');
    }
  };

  const generateAndDownload = async (format) => {
    if (!selectedTemplate) return;
    const tId = selectedTemplate.id;

    if (tId === 'fee-receipt') {
      const s = getStudent(studentId);
      await downloadFeeReceipt(format, { student: s, settings, feeItems, paymentMode, transactionId });
      await handleRegisterDocument('Fee Receipt', `Fee Receipt - ${s?.name || 'Student'}`, { studentId });
    } else if (tId === 'hall-ticket') {
      const s = getStudent(studentId);
      const e = getExam(examId);
      await downloadHallTicket(format, { student: s, exam: e, settings });
      await handleRegisterDocument('Hall Ticket', `Hall Ticket - ${s?.name || 'Student'}`, { studentId, examId });
    } else if (tId === 'attendance') {
      await downloadAttendanceReport(format, { settings, department: deptFilter || 'CSE', semester: yearFilter });
      await handleRegisterDocument('Attendance Report', `Attendance - ${deptFilter || 'CSE'}`, { department: deptFilter });
    } else if (tId === 'timetable') {
      await downloadTimetableDocument(format, { settings, department: deptFilter || 'CSE', year: yearFilter });
      await handleRegisterDocument('Timetable', `Timetable - ${deptFilter || 'CSE'}`, { department: deptFilter });
    } else if (tId === 'seating') {
      const e = getExam(examId);
      await downloadSeatingDocument(format, { settings, exam: e });
      await handleRegisterDocument('Seating Chart', `Seating - ${e?.name || 'Exam'}`, { examId });
    } else if (tId === 'letter') {
      await downloadOfficialLetter(format, {
        settings, subject: letterSubject, body: letterBody,
        recipientName: letterRecipientName, recipientAddress: letterRecipientAddress,
        signatory: letterSignatory, designation: letterDesignation,
      });
      await handleRegisterDocument('Official Letter', `Letter - ${letterSubject || 'Communication'}`, {});
    }

    setSelectedTemplate(null);
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-actions">
          <div><h1>Official Documents</h1><p>Generate, verify, and export official college documents</p></div>
        </div>
      </div>

      {/* TEMPLATES GRID */}
      <h3 style={{ marginBottom: 12, fontWeight: 700 }}>Generate Document</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        {TEMPLATES.map((tmpl) => {
          const Icon = tmpl.icon;
          return (
            <div
              key={tmpl.id}
              className="card"
              style={{ cursor: 'pointer', transition: 'all 0.2s', border: '1px solid var(--border)' }}
              onClick={() => setSelectedTemplate(tmpl)}
            >
              <div style={{ width: 44, height: 44, borderRadius: 10, background: tmpl.gradient[0], color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Icon size={22} />
              </div>
              <h4 style={{ margin: '0 0 4px', fontWeight: 700 }}>{tmpl.name}</h4>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{tmpl.desc}</p>
            </div>
          );
        })}
      </div>

      {/* DOCUMENT REGISTRY TABLE */}
      <div className="table-container">
        <div className="table-header">
          <span className="table-title">Document Verification Registry ({documents.length})</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input search-input" placeholder="Search registry..." style={{ width: 200 }} value={search} onChange={e => setSearch(e.target.value)} />
            <select className="form-select" style={{ width: 140 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="All">All Types</option>
              {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <table>
          <thead>
            <tr><th>Ref Number</th><th>Document Title</th><th>Type</th><th>Issue Date</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading documents from database...</td></tr>
            ) : filtered.map((d) => (
              <tr key={d.id}>
                <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{d.number}</td>
                <td style={{ fontWeight: 500 }}>{d.title}</td>
                <td><span className="badge badge-info">{d.type}</span></td>
                <td>{d.date}</td>
                <td>
                  <span className={`badge ${d.status === 'revoked' ? 'badge-error' : 'badge-success'}`}>
                    {d.status === 'revoked' ? 'REVOKED' : 'VALID'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <a className="btn btn-outline btn-sm" href={`/verify/document/${d.id}`} target="_blank" rel="noreferrer">
                      <Eye size={14} /> Verify
                    </a>
                    {d.status !== 'revoked' && (
                      <button className="btn btn-outline btn-sm" style={{ color: 'var(--error)' }} onClick={() => handleRevokeDocument(d.id)}>
                        <Trash2 size={14} /> Revoke
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No documents in registry.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* GENERATION MODAL */}
      {selectedTemplate && (
        <div className="modal-overlay" onClick={() => setSelectedTemplate(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Generate {selectedTemplate.name}</h3>
              <button className="btn btn-ghost" onClick={() => setSelectedTemplate(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {selectedTemplate.id === 'fee-receipt' && (
                <div>
                  <div className="form-group">
                    <label className="form-label">Select Student *</label>
                    <select className="form-select" value={studentId} onChange={e => setStudentId(e.target.value)}>
                      <option value="">Select Student...</option>
                      {studentsList.map(s => <option key={s.id} value={s.id}>{studentLabel(s)}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group"><label className="form-label">Payment Mode</label><input className="form-input" value={paymentMode} onChange={e => setPaymentMode(e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Transaction ID</label><input className="form-input" value={transactionId} onChange={e => setTransactionId(e.target.value)} placeholder="e.g. TXN1002003" /></div>
                  </div>
                </div>
              )}

              {selectedTemplate.id === 'hall-ticket' && (
                <div>
                  <div className="form-group">
                    <label className="form-label">Select Student *</label>
                    <select className="form-select" value={studentId} onChange={e => setStudentId(e.target.value)}>
                      <option value="">Select Student...</option>
                      {studentsList.map(s => <option key={s.id} value={s.id}>{studentLabel(s)}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Select Examination *</label>
                    <select className="form-select" value={examId} onChange={e => setExamId(e.target.value)}>
                      <option value="">Select Exam...</option>
                      {examsList.map(e => <option key={e.id} value={e.id}>{examLabel(e)}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {(selectedTemplate.id === 'timetable' || selectedTemplate.id === 'attendance') && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Department</label>
                    <select className="form-select" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
                      <option value="">Select Department...</option>
                      {departments.map(d => <option key={d.id} value={d.code}>{d.code} - {d.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Semester / Year</label>
                    <select className="form-select" value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={String(s)}>Semester {s}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {selectedTemplate.id === 'letter' && (
                <div>
                  <div className="form-group"><label className="form-label">Recipient Name</label><input className="form-input" value={letterRecipientName} onChange={e => setLetterRecipientName(e.target.value)} placeholder="e.g. The Controller of Examinations" /></div>
                  <div className="form-group"><label className="form-label">Subject</label><input className="form-input" value={letterSubject} onChange={e => setLetterSubject(e.target.value)} placeholder="Letter Subject Line" /></div>
                  <div className="form-group"><label className="form-label">Letter Body</label><textarea className="form-input" rows={4} value={letterBody} onChange={e => setLetterBody(e.target.value)} placeholder="Type official communication..." /></div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setSelectedTemplate(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => generateAndDownload('pdf')}><Download size={14} /> Download PDF</button>
              <button className="btn btn-accent" onClick={() => generateAndDownload('docx')}><Download size={14} /> Download DOCX</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
