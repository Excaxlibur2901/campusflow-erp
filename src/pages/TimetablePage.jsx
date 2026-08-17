import { useCallback, useMemo, useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { days, timeSlots } from '../data/mockData';
import { downloadOfficialFile } from '../utils/officialDownloads';
import {
  BookOpen,
  Building,
  Clock,
  Download,
  Lock,
  Trash2,
  Unlock,
  Users,
  Zap,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

const lunchAfterSlot = 3;

const tabs = [
  { id: 'admin', label: 'Admin View' },
  { id: 'student', label: 'Student View' },
  { id: 'faculty', label: 'Faculty View' },
  { id: 'classroom', label: 'Classroom View' },
];

const timetableBranches = ['IT', 'AIML', 'CO', 'EC'];

const formatFacultyName = (name = '') => {
  const parts = name.split(' ').filter(Boolean);
  return parts.length > 1 ? parts.slice(-2).join(' ') : name;
};

export default function TimetablePage() {
  const { getAccessToken } = useAuth();

  const [activeTab, setActiveTab] = useState('admin');
  const [selectedDept, setSelectedDept] = useState('CSE');
  const [selectedSem, setSelectedSem] = useState('3');
  const [selectedSection, setSelectedSection] = useState('A');
  const [effectiveFrom] = useState(new Date().toISOString().split('T')[0]);

  // Timetable & DB State
  const [timetableSlots, setTimetableSlots] = useState([]);
  const [departments, setDepartments] = useState([]);

  // Generation & Validation State
  const [generating, setGenerating] = useState(false);
  const [genReport, setGenReport] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToastMsg({ text: msg, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Load Reference Data & Timetable Slots from Backend REST API
  const loadTimetable = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [ttRes, deptRes] = await Promise.all([
        // Load every branch for the selected semester so the admin view can
        // display branch-specific schedules and expose cross-branch clashes.
        fetch(`/api/timetable?semester=${selectedSem}`, { headers }),
        fetch('/api/departments', { headers }),
      ]);

      if (ttRes.ok) setTimetableSlots(await ttRes.json());
      if (deptRes.ok) setDepartments(await deptRes.json());
    } catch {
      // Best effort load
    }
  }, [getAccessToken, selectedSem]);

  useEffect(() => {
    loadTimetable();
  }, [loadTimetable]);

  // A timetable/report belongs to the selected department, semester, and
  // section. Do not leave the previous semester's generation result visible
  // while the newly selected context is loading.
  useEffect(() => {
    setGenReport(null);
    setErrorMsg('');
  }, [selectedDept, selectedSem, selectedSection]);

  const contextMatches = useCallback((slot) => (
    (!slot.semester || String(slot.semester) === String(selectedSem))
  ), [selectedSem]);

  const scopedSlots = useMemo(
    () => timetableSlots.filter(contextMatches),
    [timetableSlots, contextMatches],
  );

  const branchGroups = useMemo(() => timetableBranches.map((branch) => ({
    branch,
    slots: scopedSlots.filter((slot) => slot.dept === branch),
  })), [scopedSlots]);

  const totalTeachingSlots = days.length * timeSlots.length;
  const filledCount = scopedSlots.length;
  const lockedCount = scopedSlots.filter((slot) => slot.locked).length;

  const getSlot = useCallback(
    (day, slotIdx, branch = selectedDept) => scopedSlots.find((slot) => (
      slot.dept === branch
      && slot.section === selectedSection
      && slot.day === day
      && (slot.slot === slotIdx || slot.slotIdx === slotIdx)
    )),
    [scopedSlots, selectedDept, selectedSection],
  );

  // Backend Generate API Call
  const handleGenerate = async () => {
    setGenerating(true);
    setGenReport(null);
    setErrorMsg('');

    try {
      const token = await getAccessToken();
      const res = await fetch('/api/timetable/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          dept: selectedDept,
          semester: Number(selectedSem),
          sectionCode: selectedSection,
          days,
          timeSlots,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setGenReport(data.report || data);

        if (data.hardConflicts && data.hardConflicts.length > 0) {
          setErrorMsg(`Generation failed with ${data.hardConflicts.length} hard constraint conflict(s). Hard clashes cannot be displayed as success.`);
          showToast('Timetable generation failed due to hard conflicts', 'error');
        } else {
          showToast('Timetable successfully generated with zero hard conflicts!');
          await loadTimetable();
        }
      } else {
        const err = await res.json().catch(() => ({}));
        // 409 responses contain the engine report (including the exact
        // subject/resource conflict). Preserve it instead of hiding it behind
        // the generic error banner.
        if (err.report) setGenReport(err.report);
        setErrorMsg(err.error || err.report?.error || 'Failed to generate timetable.');
        showToast('Timetable generation failed', 'error');
      }
    } catch {
      setErrorMsg('Network error generating timetable.');
    } finally {
      setGenerating(false);
    }
  };

  const toggleLock = async (slotId, currentLocked) => {
    if (!slotId) return;
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/timetable/entries/${slotId}/lock`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ locked: !currentLocked }),
      });
      if (res.ok) {
        await loadTimetable();
        showToast(`Slot ${!currentLocked ? 'locked' : 'unlocked'}`);
      }
    } catch {
      // Toggle error
    }
  };

  const clearSlot = async (slotId, isLocked) => {
    if (!slotId) return;
    if (isLocked) {
      showToast('Cannot delete a locked slot. Unlock it first.', 'warning');
      return;
    }
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/timetable/entries/${slotId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await loadTimetable();
        showToast('Slot cleared', 'info');
      }
    } catch {
      // Clear error
    }
  };

  const handleDownload = async (format, title) => {
    try {
      await downloadOfficialFile(format, {
        settings: { institutionName: 'CampusFlow ERP' },
        title,
        subtitle: `Department of ${selectedDept} - Sem ${selectedSem} (Sec ${selectedSection})`,
        details: [
          { label: 'Department', value: selectedDept },
          { label: 'Semester', value: `Semester ${selectedSem}` },
          { label: 'Section', value: selectedSection },
          { label: 'Effective From', value: effectiveFrom },
          { label: 'Teaching Slots', value: `${filledCount}/${totalTeachingSlots}` },
          { label: 'Locked Slots', value: lockedCount },
        ],
        columns: ['Day', ...timeSlots],
        rows: days.map((day) => [
          day,
          ...timeSlots.map((_, slotIdx) => {
            const slot = getSlot(day, slotIdx);
            return slot ? `${slot.subject} (${slot.room})` : '—';
          }),
        ]),
        filename: `${selectedDept}_Sem${selectedSem}_Sec${selectedSection}_Timetable`,
      });
      showToast(`${title} exported as ${format.toUpperCase()}`);
    } catch {
      showToast('Export failed', 'error');
    }
  };

  return (
    <div className="fade-in">
      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, background: toastMsg.type === 'error' ? 'var(--error)' : 'var(--success)', color: '#fff', padding: '10px 16px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontSize: 13, fontWeight: 600 }}>
          {toastMsg.text}
        </div>
      )}

      <div className="page-header">
        <div className="page-header-actions">
          <div>
            <h1>Academic Timetable</h1>
            <p>Constraint-based timetable scheduling and resource optimization</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={handleGenerate} disabled={generating}>
              <Zap size={16} /> {generating ? 'Generating...' : 'Auto-Generate'}
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => handleDownload('pdf', 'Official Timetable Schedule')}>
              <Download size={16} /> Export PDF
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Building size={16} color="var(--text-muted)" />
            <label className="form-label" style={{ margin: 0 }}>Dept:</label>
            <select className="form-select" style={{ width: 100 }} value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}>
              {departments.map((d) => <option key={d.id} value={d.code}>{d.code}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={16} color="var(--text-muted)" />
            <label className="form-label" style={{ margin: 0 }}>Sem:</label>
            <select className="form-select" style={{ width: 80 }} value={selectedSem} onChange={(e) => setSelectedSem(e.target.value)}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={String(s)}>Sem {s}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} color="var(--text-muted)" />
            <label className="form-label" style={{ margin: 0 }}>Sec:</label>
            <select className="form-select" style={{ width: 80 }} value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)}>
              <option value="A">Sec A</option>
              <option value="B">Sec B</option>
            </select>
          </div>
        </div>
      </div>

      {/* GENERATION REPORT BANNER */}
      {genReport && (
        <div className="card" style={{ marginBottom: 20, border: `2px solid ${genReport.hardConflicts?.length ? 'var(--error)' : 'var(--success)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            {genReport.hardConflicts?.length ? (
              <AlertTriangle size={20} color="var(--error)" />
            ) : (
              <CheckCircle2 size={20} color="var(--success)" />
            )}
            <h3 style={{ fontSize: 16, fontWeight: 700, color: genReport.hardConflicts?.length ? 'var(--error)' : 'var(--success)' }}>
              Generation Result: {genReport.hardConflicts?.length ? 'FAILED (Hard Conflicts Present)' : 'SUCCESS (Zero Hard Conflicts)'}
            </h3>
            <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 14 }}>Score: {genReport.score}</span>
          </div>

          {genReport.hardConflicts?.length > 0 && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: 12, borderRadius: 6, marginBottom: 8 }}>
              <strong style={{ color: 'var(--error)', fontSize: 13 }}>Hard Conflict Clashes:</strong>
              <ul style={{ margin: '4px 0 0 16px', fontSize: 13, color: 'var(--error)' }}>
                {genReport.hardConflicts.map((c, i) => (
                  <li key={i}>{c.message || c.detail || `${c.type} on ${c.day} slot ${c.slotIdx + 1}`}</li>
                ))}
              </ul>
            </div>
          )}

          {genReport.unscheduledHours?.length > 0 && (
            <div style={{ color: 'var(--warning)', fontSize: 13, marginTop: 4 }}>
              <strong>Unscheduled Hours:</strong> {genReport.unscheduledHours.map(u => `${u.subjectCode} (${u.remainingHours}h remaining)`).join(', ')}
            </div>
          )}
        </div>
      )}

      {errorMsg && !genReport && (
        <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--error)', borderRadius: 8, color: 'var(--error)', fontSize: 13, marginBottom: 20 }}>
          {errorMsg}
        </div>
      )}

      <div className="tabs">{tabs.map((t) => (<button key={t.id} className={`tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>))}</div>

      {activeTab === 'admin' && (
        <div style={{ display: 'grid', gap: 24 }}>
          {branchGroups.map(({ branch, slots: branchSlots }) => (
            <section key={branch} className="table-container" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-light)' }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>The Shirpur Education Society's R. C. Patel College of Engineering and Polytechnic, Shirpur</div>
                <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 13 }}>Branch: {branch} &nbsp;•&nbsp; Semester: {selectedSem} &nbsp;•&nbsp; Section: {selectedSection}</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ minWidth: 760, tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 118 }}>Time Slot</th>
                      {days.map((day) => <th key={day} style={{ textAlign: 'center', fontSize: 12 }}>{day}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {timeSlots.map((timeSlot, slotIdx) => (
                      <tr key={timeSlot}>
                        <th style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />{timeSlot}
                        </th>
                        {days.map((day) => {
                          const slot = branchSlots.find((candidate) => (
                            candidate.section === selectedSection
                            && candidate.day === day
                            && (candidate.slot === slotIdx || candidate.slotIdx === slotIdx)
                          ));
                          const isLunch = slotIdx === lunchAfterSlot;
                          return (
                            <td key={`${day}-${slotIdx}`} style={{ padding: 4, height: 76, verticalAlign: 'top' }}>
                              {isLunch ? (
                                <div style={{ height: '100%', minHeight: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-light)', color: 'var(--text-muted)', fontSize: 11, fontWeight: 700 }}>BREAK</div>
                              ) : slot ? (
                                <div style={{ background: slot.locked ? 'rgba(59, 130, 246, 0.12)' : 'var(--surface-light)', border: `1px solid ${slot.locked ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 6, padding: 6, minHeight: 64, fontSize: 11 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                                    <span style={{ fontWeight: 800, color: 'var(--primary)' }}>{slot.subject}</span>
                                    <span style={{ display: 'flex', gap: 2 }}>
                                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1 }} onClick={() => toggleLock(slot.id, slot.locked)} title={slot.locked ? 'Unlock' : 'Lock'}>
                                        {slot.locked ? <Lock size={12} color="var(--primary)" /> : <Unlock size={12} color="var(--text-muted)" />}
                                      </button>
                                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1, color: 'var(--error)' }} onClick={() => clearSlot(slot.id, slot.locked)} title="Clear">
                                        <Trash2 size={12} />
                                      </button>
                                    </span>
                                  </div>
                                  <div style={{ marginTop: 6, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatFacultyName(slot.faculty)}</div>
                                  <div style={{ marginTop: 3, fontWeight: 700, color: 'var(--accent)' }}>{slot.room}</div>
                                </div>
                              ) : (
                                <div style={{ height: '100%', minHeight: 64, border: '1px dashed var(--border)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>—</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
