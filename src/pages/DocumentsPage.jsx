import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import CollegeHeader from '../components/CollegeHeader';
import {
  downloadFeeReceipt,
  downloadHallTicket,
  downloadAttendanceReport,
  downloadTimetableDocument,
  downloadSeatingDocument,
  downloadOfficialLetter,
  downloadOfficialFile,
  documentExportPayload,
} from '../utils/officialDownloads';
import { days, timeSlots } from '../data/mockData';
import {
  CreditCard, Ticket, ClipboardList, Calendar, LayoutGrid, FileText,
  Download, Eye, Plus, X, ChevronRight, ChevronLeft, Sparkles, Trash2,
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
  const {
    documents, generateDocument, showToast, settings,
    studentsList, examsList, departments,
    timetableSlots, seatAllocations, attendanceHistory,
    subjectsList, classroomsList,
  } = useData();
  const { user } = useAuth();

  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [previewDoc, setPreviewDoc] = useState(null);

  // Form state
  const [studentId, setStudentId] = useState('');
  const [examId, setExamId] = useState('');
  const [feeItems, setFeeItems] = useState(DEFAULT_FEE_ITEMS.map((f) => ({ ...f })));
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [transactionId, setTransactionId] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('1');
  const [letterRecipientName, setLetterRecipientName] = useState('');
  const [letterRecipientAddress, setLetterRecipientAddress] = useState('');
  const [letterSubject, setLetterSubject] = useState('');
  const [letterBody, setLetterBody] = useState('');
  const [letterSignatory, setLetterSignatory] = useState('');
  const [letterDesignation, setLetterDesignation] = useState('');

  // Filtered documents
  const filtered = useMemo(() => documents.filter((d) => {
    const ms = d.title.toLowerCase().includes(search.toLowerCase());
    const mt = typeFilter === 'All' || d.type === typeFilter;
    return ms && mt;
  }), [documents, search, typeFilter]);

  const allTypes = [...new Set(documents.map((d) => d.type))];

  // Stats
  const today = new Date().toISOString().split('T')[0];
  const generatedToday = documents.filter((d) => d.date === today).length;
  const uniqueTypes = new Set(documents.map((d) => d.type)).size;

  // Helpers
  const getStudent = (id) => studentsList.find((s) => s.id === id);
  const getExam = (id) => examsList.find((e) => e.id === id);
  const studentLabel = (s) => `${s.name} — ${s.rollNo || s.rollNumber} (${s.dept || s.department})`;
  const examLabel = (e) => `${e.name} — ${e.date}`;

  // Reset form
  const resetForm = () => {
    setStudentId('');
    setExamId('');
    setFeeItems(DEFAULT_FEE_ITEMS.map((f) => ({ ...f })));
    setPaymentMode('Cash');
    setTransactionId('');
    setDeptFilter('');
    setYearFilter('1');
    setLetterRecipientName('');
    setLetterRecipientAddress('');
    setLetterSubject('');
    setLetterBody('');
    setLetterSignatory('');
    setLetterDesignation('');
  };

  const openWizard = (templateId) => {
    setSelectedTemplate(templateId);
    setWizardStep(1);
    resetForm();
    setLetterSignatory(settings.principalName || '');
    setLetterDesignation('Principal');
    if (departments.length > 0) setDeptFilter(departments[0].name);
  };

  const closeWizard = () => {
    setSelectedTemplate(null);
    setWizardStep(1);
  };

  // Validation
  const isStep1Valid = () => {
    switch (selectedTemplate) {
      case 'fee-receipt':
        return !!studentId && feeItems.length > 0 && feeItems.every((f) => f.name.trim() && f.amount > 0);
      case 'hall-ticket':
        return !!studentId && !!examId;
      case 'attendance':
        return !!studentId;
      case 'timetable':
        return !!deptFilter && !!yearFilter;
      case 'seating':
        return !!examId;
      case 'letter':
        return !!letterRecipientName.trim() && !!letterSubject.trim() && !!letterBody.trim();
      default:
        return false;
    }
  };

  // Build title for document
  const buildDocTitle = () => {
    switch (selectedTemplate) {
      case 'fee-receipt': {
        const st = getStudent(studentId);
        return `Fee Receipt — ${st ? st.name : 'Student'}`;
      }
      case 'hall-ticket': {
        const st = getStudent(studentId);
        const ex = getExam(examId);
        return `Hall Ticket — ${st ? st.name : 'Student'} — ${ex ? ex.name : 'Exam'}`;
      }
      case 'attendance': {
        const st = getStudent(studentId);
        return `Attendance Report — ${st ? st.name : 'Student'}`;
      }
      case 'timetable':
        return `Timetable — ${deptFilter} Year ${yearFilter}`;
      case 'seating': {
        const ex = getExam(examId);
        return `Seating — ${ex ? ex.name : 'Exam'}`;
      }
      case 'letter':
        return `Letter — ${letterSubject}`;
      default:
        return 'Document';
    }
  };

  // Compute attendance data for a student
  const computeAttendance = (sid) => {
    const st = getStudent(sid);
    if (!st) return { records: [], subjects: [] };
    const studentName = st.name;
    const records = attendanceHistory.filter((r) =>
      r.records && r.records.some((rec) => rec.name === studentName)
    );
    const subjectSet = new Set(records.map((r) => r.subject));
    const subjects = [...subjectSet];
    const summary = subjects.map((subj) => {
      const subjRecords = records.filter((r) => r.subject === subj);
      let present = 0;
      let total = 0;
      subjRecords.forEach((r) => {
        const rec = r.records.find((x) => x.name === studentName);
        if (rec) {
          total++;
          if (rec.status === 'P') present++;
        }
      });
      return { subject: subj, present, total, percent: total > 0 ? Math.round((present / total) * 100) : 0 };
    });
    return { records, subjects, summary };
  };

  // Get timetable slots for dept/year
  const getFilteredSlots = () => {
    const sem = String(yearFilter);
    return timetableSlots.filter((s) =>
      (s.dept === deptFilter || s.department === deptFilter) &&
      (s.semester === sem || s.year === sem)
    );
  };

  // Get seat allocations for an exam
  const getSeatingData = () => {
    return seatAllocations;
  };

  // Download handler
  const handleDownload = async (format) => {
    try {
      const st = getStudent(studentId);
      const ex = getExam(examId);

      switch (selectedTemplate) {
        case 'fee-receipt':
          await downloadFeeReceipt(format, {
            student: st,
            settings,
            feeItems,
            paymentMode,
            transactionId: transactionId || `TXN${Date.now()}`,
          });
          break;
        case 'hall-ticket':
          await downloadHallTicket(format, { student: st, settings, exam: ex });
          break;
        case 'attendance': {
          const { records, subjects } = computeAttendance(studentId);
          await downloadAttendanceReport(format, { student: st, settings, records, subjects });
          break;
        }
        case 'timetable':
          await downloadTimetableDocument(format, {
            settings,
            department: deptFilter,
            year: yearFilter,
            slots: getFilteredSlots(),
            days,
            timeSlots,
          });
          break;
        case 'seating':
          await downloadSeatingDocument(format, {
            settings,
            exam: ex,
            allocations: getSeatingData(),
            classrooms: classroomsList,
          });
          break;
        case 'letter':
          await downloadOfficialLetter(format, {
            settings,
            subject: letterSubject,
            body: letterBody,
            recipientName: letterRecipientName,
            recipientAddress: letterRecipientAddress,
            signatory: letterSignatory || settings.principalName || 'Principal',
            designation: letterDesignation || 'Principal',
          });
          break;
        default:
          break;
      }

      const templateObj = TEMPLATES.find((t) => t.id === selectedTemplate);
      generateDocument({
        title: buildDocTitle(),
        type: templateObj ? templateObj.name : selectedTemplate,
        by: user?.role || 'Admin',
      });
      showToast(`"${buildDocTitle()}" downloaded as ${format.toUpperCase()}`);
      closeWizard();
    } catch (err) {
      console.error(err);
      showToast('Download failed. Please try again.', 'error');
    }
  };

  // Re-download a previously generated document
  const handleReDownload = async (doc, format) => {
    try {
      await downloadOfficialFile(format, documentExportPayload(doc, settings));
      showToast(`Downloaded "${doc.title}" as ${format.toUpperCase()}`);
    } catch {
      showToast(`Could not download "${doc.title}"`, 'error');
    }
  };

  // Fee items management
  const addFeeItem = () => setFeeItems([...feeItems, { name: '', amount: 0 }]);
  const removeFeeItem = (idx) => setFeeItems(feeItems.filter((_, i) => i !== idx));
  const updateFeeItem = (idx, field, val) => {
    const updated = [...feeItems];
    updated[idx] = { ...updated[idx], [field]: field === 'amount' ? Number(val) || 0 : val };
    setFeeItems(updated);
  };
  const feeTotal = feeItems.reduce((sum, f) => sum + (f.amount || 0), 0);

  // ── Render ──

  const renderStep1Form = () => {
    switch (selectedTemplate) {
      case 'fee-receipt':
        return (
          <>
            <div className="form-group">
              <label className="form-label">Student *</label>
              {studentsList.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Add students first in the Students module.</p>
              ) : (
                <select className="form-select" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                  <option value="">Select student…</option>
                  {studentsList.map((s) => <option key={s.id} value={s.id}>{studentLabel(s)}</option>)}
                </select>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Fee Items</label>
              {feeItems.map((item, idx) => (
                <div key={idx} className="doc-fee-row">
                  <input className="form-input" placeholder="Fee name" value={item.name} onChange={(e) => updateFeeItem(idx, 'name', e.target.value)} />
                  <input className="form-input fee-amount" type="number" placeholder="Amount" value={item.amount || ''} onChange={(e) => updateFeeItem(idx, 'amount', e.target.value)} />
                  <button className="btn btn-ghost btn-sm" onClick={() => removeFeeItem(idx)} title="Remove"><Trash2 size={14} /></button>
                </div>
              ))}
              <button className="btn btn-outline btn-sm" onClick={addFeeItem} style={{ marginTop: 4 }}><Plus size={14} /> Add Item</button>
              <div className="doc-fee-total">
                <span>Total</span>
                <span>₹{feeTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Payment Mode</label>
                <select className="form-select" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                  <option>Cash</option><option>Online</option><option>DD</option><option>Cheque</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Transaction ID</label>
                <input className="form-input" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="Auto-generated if empty" />
              </div>
            </div>
          </>
        );

      case 'hall-ticket':
        return (
          <>
            <div className="form-group">
              <label className="form-label">Student *</label>
              {studentsList.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Add students first in the Students module.</p>
              ) : (
                <select className="form-select" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                  <option value="">Select student…</option>
                  {studentsList.map((s) => <option key={s.id} value={s.id}>{studentLabel(s)}</option>)}
                </select>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Exam *</label>
              {examsList.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Add exams first in the Exams module.</p>
              ) : (
                <select className="form-select" value={examId} onChange={(e) => setExamId(e.target.value)}>
                  <option value="">Select exam…</option>
                  {examsList.map((e) => <option key={e.id} value={e.id}>{examLabel(e)}</option>)}
                </select>
              )}
            </div>
          </>
        );

      case 'attendance':
        return (
          <div className="form-group">
            <label className="form-label">Student *</label>
            {studentsList.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Add students first in the Students module.</p>
            ) : (
              <select className="form-select" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">Select student…</option>
                {studentsList.map((s) => <option key={s.id} value={s.id}>{studentLabel(s)}</option>)}
              </select>
            )}
          </div>
        );

      case 'timetable':
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Department *</label>
              <select className="form-select" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
                <option value="">Select department…</option>
                {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Year *</label>
              <select className="form-select" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year</option>
                <option value="4">4th Year</option>
              </select>
            </div>
          </div>
        );

      case 'seating':
        return (
          <div className="form-group">
            <label className="form-label">Exam *</label>
            {examsList.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Add exams first in the Exams module.</p>
            ) : (
              <select className="form-select" value={examId} onChange={(e) => setExamId(e.target.value)}>
                <option value="">Select exam…</option>
                {examsList.map((e) => <option key={e.id} value={e.id}>{examLabel(e)}</option>)}
              </select>
            )}
          </div>
        );

      case 'letter':
        return (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Recipient Name *</label>
                <input className="form-input" value={letterRecipientName} onChange={(e) => setLetterRecipientName(e.target.value)} placeholder="e.g., Mr. John Doe" />
              </div>
              <div className="form-group">
                <label className="form-label">Recipient Address</label>
                <textarea className="form-input" rows={2} value={letterRecipientAddress} onChange={(e) => setLetterRecipientAddress(e.target.value)} placeholder="Full address…" style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Subject *</label>
              <input className="form-input" value={letterSubject} onChange={(e) => setLetterSubject(e.target.value)} placeholder="Subject of the letter" />
            </div>
            <div className="form-group">
              <label className="form-label">Body *</label>
              <textarea className="form-input" rows={6} value={letterBody} onChange={(e) => setLetterBody(e.target.value)} placeholder="Body text of the letter…" style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Signatory Name</label>
                <input className="form-input" value={letterSignatory} onChange={(e) => setLetterSignatory(e.target.value)} placeholder={settings.principalName || 'Principal Name'} />
              </div>
              <div className="form-group">
                <label className="form-label">Designation</label>
                <input className="form-input" value={letterDesignation} onChange={(e) => setLetterDesignation(e.target.value)} placeholder="Principal" />
              </div>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  const renderPreview = () => {
    const st = getStudent(studentId);
    const ex = getExam(examId);

    switch (selectedTemplate) {
      case 'fee-receipt':
        return (
          <>
            <div className="doc-preview-title">Fee Receipt</div>
            <dl className="doc-preview-details">
              <dt>Student Name</dt><dd>{st ? st.name : '—'}</dd>
              <dt>Roll No</dt><dd>{st ? (st.rollNo || st.rollNumber) : '—'}</dd>
              <dt>Department</dt><dd>{st ? (st.dept || st.department) : '—'}</dd>
              <dt>Year / Sem</dt><dd>{st ? (st.semester || st.year || '—') : '—'}</dd>
              <dt>Payment Mode</dt><dd>{paymentMode}</dd>
              <dt>Transaction ID</dt><dd>{transactionId || 'Auto'}</dd>
            </dl>
            <div className="doc-preview-section">
              <h4>Fee Breakdown</h4>
              <table className="doc-preview-table">
                <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>Amount (₹)</th></tr></thead>
                <tbody>
                  {feeItems.map((f, i) => (
                    <tr key={i}><td>{f.name}</td><td style={{ textAlign: 'right' }}>{f.amount.toLocaleString('en-IN')}</td></tr>
                  ))}
                  <tr style={{ fontWeight: 700 }}><td>Total</td><td style={{ textAlign: 'right' }}>₹{feeTotal.toLocaleString('en-IN')}</td></tr>
                </tbody>
              </table>
            </div>
          </>
        );

      case 'hall-ticket':
        return (
          <>
            <div className="doc-preview-title">Admit Card / Hall Ticket</div>
            <dl className="doc-preview-details">
              <dt>Student Name</dt><dd>{st ? st.name : '—'}</dd>
              <dt>Roll No</dt><dd>{st ? (st.rollNo || st.rollNumber) : '—'}</dd>
              <dt>Department</dt><dd>{st ? (st.dept || st.department) : '—'}</dd>
              <dt>Examination</dt><dd>{ex ? ex.name : '—'}</dd>
              <dt>Exam Date</dt><dd>{ex ? ex.date : '—'}</dd>
              <dt>Timing</dt><dd>{ex ? `${ex.startTime} – ${ex.endTime}` : '—'}</dd>
            </dl>
            {ex && ex.subjects && ex.subjects.length > 0 && (
              <div className="doc-preview-section">
                <h4>Subjects</h4>
                <ul style={{ paddingLeft: 18 }}>
                  {ex.subjects.map((subj, i) => <li key={i}>{subj}</li>)}
                </ul>
              </div>
            )}
            <div className="doc-preview-section">
              <h4>Instructions</h4>
              <ul style={{ paddingLeft: 18 }}>
                <li>Carry this admit card to the exam hall.</li>
                <li>Bring a valid photo ID along with this card.</li>
                <li>Report 30 minutes before the scheduled time.</li>
                <li>Electronic devices are not permitted.</li>
              </ul>
            </div>
          </>
        );

      case 'attendance': {
        const attData = computeAttendance(studentId);
        return (
          <>
            <div className="doc-preview-title">Attendance Report</div>
            <dl className="doc-preview-details">
              <dt>Student Name</dt><dd>{st ? st.name : '—'}</dd>
              <dt>Roll No</dt><dd>{st ? (st.rollNo || st.rollNumber) : '—'}</dd>
              <dt>Department</dt><dd>{st ? (st.dept || st.department) : '—'}</dd>
              <dt>Overall %</dt><dd>{st ? `${st.attendance}%` : '—'}</dd>
            </dl>
            {attData.summary && attData.summary.length > 0 ? (
              <div className="doc-preview-section">
                <h4>Subject-wise Attendance</h4>
                <table className="doc-preview-table">
                  <thead><tr><th>Subject</th><th>Present</th><th>Total</th><th>%</th></tr></thead>
                  <tbody>
                    {attData.summary.map((row, i) => (
                      <tr key={i}><td>{row.subject}</td><td>{row.present}</td><td>{row.total}</td><td>{row.percent}%</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="doc-preview-section">
                <p style={{ color: '#6B7280', fontStyle: 'italic' }}>No attendance records found for this student. Overall attendance: {st ? `${st.attendance}%` : '—'}</p>
              </div>
            )}
          </>
        );
      }

      case 'timetable':
        return (
          <>
            <div className="doc-preview-title">Official Timetable</div>
            <dl className="doc-preview-details">
              <dt>Department</dt><dd>{deptFilter}</dd>
              <dt>Year</dt><dd>Year {yearFilter}</dd>
              <dt>Academic Session</dt><dd>{new Date().getFullYear()}–{new Date().getFullYear() + 1}</dd>
              <dt>Slots</dt><dd>{getFilteredSlots().length} scheduled</dd>
            </dl>
            <div className="doc-preview-section">
              <p style={{ color: '#6B7280', fontStyle: 'italic', textAlign: 'center', padding: 16 }}>Full timetable grid will be included in the downloaded document</p>
            </div>
          </>
        );

      case 'seating':
        return (
          <>
            <div className="doc-preview-title">Seating Arrangement</div>
            <dl className="doc-preview-details">
              <dt>Examination</dt><dd>{ex ? ex.name : '—'}</dd>
              <dt>Date</dt><dd>{ex ? ex.date : '—'}</dd>
              <dt>Halls</dt><dd>{ex && ex.halls ? ex.halls.join(', ') : '—'}</dd>
              <dt>Total Allocations</dt><dd>{seatAllocations.length}</dd>
            </dl>
            <div className="doc-preview-section">
              <p style={{ color: '#6B7280', fontStyle: 'italic', textAlign: 'center', padding: 16 }}>
                {seatAllocations.length} seat allocations across {ex && ex.halls ? ex.halls.length : 0} hall(s) will be included in the downloaded document
              </p>
            </div>
          </>
        );

      case 'letter':
        return (
          <>
            <div className="doc-preview-title">Official Letter</div>
            <dl className="doc-preview-details">
              <dt>To</dt><dd>{letterRecipientName || '—'}</dd>
              <dt>Date</dt><dd>{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
              <dt>Ref No.</dt><dd>{`CF/${new Date().getFullYear()}/${String(Date.now()).slice(-5)}`}</dd>
              <dt>From</dt><dd>{settings.institutionName || 'Institution'}</dd>
            </dl>
            {letterRecipientAddress && (
              <div className="doc-preview-section">
                <p style={{ whiteSpace: 'pre-line' }}>{letterRecipientAddress}</p>
              </div>
            )}
            <div className="doc-preview-section">
              <h4>Subject: {letterSubject || '—'}</h4>
              <p style={{ whiteSpace: 'pre-line', marginTop: 8 }}>{letterBody || '—'}</p>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  const templateObj = TEMPLATES.find((t) => t.id === selectedTemplate);

  return (
    <div className="fade-in">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-actions">
          <div>
            <h1>Document Center</h1>
            <p>Generate officially valid documents with institutional letterhead & QR verification</p>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 24 }}>
        {[
          { icon: FileText, label: 'Total Documents', value: documents.length, bg: 'linear-gradient(135deg, var(--primary), var(--accent))' },
          { icon: Sparkles, label: 'Generated Today', value: generatedToday, bg: 'linear-gradient(135deg, #16A34A, #4ade80)' },
          { icon: LayoutGrid, label: 'Document Types', value: uniqueTypes, bg: 'linear-gradient(135deg, #D97706, #fbbf24)' },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-icon" style={{ background: s.bg }}><s.icon size={24} color="#fff" /></div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Template Gallery */}
      <div style={{ marginBottom: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Template Gallery</h2>
      </div>
      <div className="doc-template-grid">
        {TEMPLATES.map((tpl) => (
          <div key={tpl.id} className="doc-template-card" onClick={() => openWizard(tpl.id)}>
            <div className="doc-template-icon" style={{ background: `linear-gradient(135deg, ${tpl.gradient[0]}, ${tpl.gradient[1]})` }}>
              <tpl.icon size={24} color="#fff" />
            </div>
            <div className="doc-template-name">{tpl.name}</div>
            <div className="doc-template-desc">{tpl.desc}</div>
            <button className="btn btn-primary btn-sm doc-template-btn" onClick={(e) => { e.stopPropagation(); openWizard(tpl.id); }}>
              <Sparkles size={14} /> Generate
            </button>
          </div>
        ))}
      </div>

      {/* Generated Documents Table */}
      <div className="table-container">
        <div className="table-header">
          <span className="table-title">Generated Documents ({filtered.length})</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input search-input" placeholder="Search documents..." style={{ width: 240 }} value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="form-select" style={{ width: 140 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="All">All Types</option>
              {allTypes.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="doc-empty-state">
            <FileText size={48} />
            <h3>No documents generated yet</h3>
            <p>Select a template above to generate your first document</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Document</th><th>Type</th><th>Date</th><th>By</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 600 }}>{d.title}</td>
                  <td><span className="badge badge-info">{d.type}</span></td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{d.date}</td>
                  <td>{d.by}</td>
                  <td><span className={`badge ${d.status === 'generated' ? 'badge-success' : 'badge-warning'}`}>{d.status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => handleReDownload(d, 'pdf')}><Download size={14} /> PDF</button>
                      <button className="btn btn-outline btn-sm" onClick={() => handleReDownload(d, 'docx')}><Download size={14} /> DOCX</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setPreviewDoc(d)}><Eye size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Generation Wizard Modal ── */}
      {selectedTemplate && (
        <div className="modal-overlay" onClick={closeWizard}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {templateObj && (
                  <span className="doc-template-icon" style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: `linear-gradient(135deg, ${templateObj.gradient[0]}, ${templateObj.gradient[1]})`,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <templateObj.icon size={16} color="#fff" />
                  </span>
                )}
                Generate {templateObj ? templateObj.name : ''}
              </h3>
              <button className="btn btn-ghost" onClick={closeWizard}><X size={18} /></button>
            </div>

            {/* Wizard Steps */}
            <div style={{ padding: '16px 24px 0' }}>
              <div className="doc-wizard-steps">
                <div className={`doc-wizard-step ${wizardStep === 1 ? 'active' : ''}`}>
                  <span className="doc-wizard-step-num">1</span>
                  <span>Configure</span>
                </div>
                <div className="doc-wizard-divider" />
                <div className={`doc-wizard-step ${wizardStep === 2 ? 'active' : ''}`}>
                  <span className="doc-wizard-step-num">2</span>
                  <span>Preview & Export</span>
                </div>
              </div>
            </div>

            <div className="modal-body">
              {wizardStep === 1 ? (
                renderStep1Form()
              ) : (
                <div className="doc-preview-paper">
                  <div className="doc-preview-border" />
                  <div className="doc-preview-watermark">OFFICIAL COPY</div>
                  <CollegeHeader variant="document" />
                  {renderPreview()}
                  <div className="doc-preview-signatures">
                    <div className="doc-preview-sig">
                      <div className="doc-preview-sig-line" />
                      <div className="doc-preview-sig-name">Student Signature</div>
                      <div className="doc-preview-sig-role">Candidate</div>
                    </div>
                    <div className="doc-preview-sig">
                      <div className="doc-preview-sig-line" />
                      <div className="doc-preview-sig-name">{selectedTemplate === 'letter' ? (letterSignatory || settings.principalName || 'Principal') : (settings.principalName || 'Head of Department')}</div>
                      <div className="doc-preview-sig-role">{selectedTemplate === 'letter' ? (letterDesignation || 'Principal') : 'Authorized Signatory'}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              {wizardStep === 1 ? (
                <>
                  <button className="btn btn-outline" onClick={closeWizard}>Cancel</button>
                  <button className="btn btn-primary" disabled={!isStep1Valid()} onClick={() => setWizardStep(2)}>
                    Next: Preview <ChevronRight size={16} />
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-outline" onClick={() => setWizardStep(1)}>
                    <ChevronLeft size={16} /> Back
                  </button>
                  <button className="btn btn-outline" onClick={() => handleDownload('docx')}>
                    <Download size={16} /> Download DOCX
                  </button>
                  <button className="btn btn-primary" onClick={() => handleDownload('pdf')}>
                    <Download size={16} /> Download PDF
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Preview Modal for existing documents ── */}
      {previewDoc && (
        <div className="modal-overlay" onClick={() => setPreviewDoc(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h3>Document Preview</h3>
              <button className="btn btn-ghost" onClick={() => setPreviewDoc(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="doc-preview-paper">
                <div className="doc-preview-border" />
                <div className="doc-preview-watermark">OFFICIAL COPY</div>
                <CollegeHeader variant="document" />
                <div className="doc-preview-title">{previewDoc.title}</div>
                <dl className="doc-preview-details">
                  <dt>Type</dt><dd>{previewDoc.type}</dd>
                  <dt>Date</dt><dd>{previewDoc.date}</dd>
                  <dt>Generated By</dt><dd>{previewDoc.by}</dd>
                  <dt>Status</dt><dd>{previewDoc.status}</dd>
                </dl>
                <div style={{ textAlign: 'center', marginTop: 20, fontSize: 10, color: '#6B7280' }}>
                  Doc ID: {previewDoc.id} | CampusFlow ERP
                </div>
                <div className="doc-preview-signatures">
                  <div className="doc-preview-sig">
                    <div className="doc-preview-sig-line" />
                    <div className="doc-preview-sig-name">Verified Copy</div>
                    <div className="doc-preview-sig-role">System Generated</div>
                  </div>
                  <div className="doc-preview-sig">
                    <div className="doc-preview-sig-line" />
                    <div className="doc-preview-sig-name">{settings.principalName || 'Authorized Signatory'}</div>
                    <div className="doc-preview-sig-role">Principal</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setPreviewDoc(null)}>Close</button>
              <button className="btn btn-outline" onClick={() => handleReDownload(previewDoc, 'docx')}><Download size={16} /> DOCX</button>
              <button className="btn btn-primary" onClick={() => handleReDownload(previewDoc, 'pdf')}><Download size={16} /> PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
