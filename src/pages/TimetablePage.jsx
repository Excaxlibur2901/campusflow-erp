import { Fragment, useCallback, useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { days, timeSlots } from '../data/mockData';
import { downloadOfficialFile } from '../utils/officialDownloads';
import CollegeHeader from '../components/CollegeHeader';
import {
  BookOpen,
  Building,
  Calendar,
  CheckCircle,
  Clock,
  Download,
  Lock,
  Trash2,
  Unlock,
  Users,
  Zap,
} from 'lucide-react';

const lunchAfterSlot = 3;

const tabs = [
  { id: 'admin', label: 'Admin View' },
  { id: 'student', label: 'Student View' },
  { id: 'faculty', label: 'Faculty View' },
  { id: 'classroom', label: 'Classroom View' },
];

const formatFacultyName = (name = '') => {
  const parts = name.split(' ').filter(Boolean);
  return parts.length > 1 ? parts.slice(-2).join(' ') : name;
};

export default function TimetablePage() {
  const {
    timetableSlots,
    setTimetableSlots,
    departments,
    subjectsList,
    facultyList,
    classroomsList,
    settings,
    showToast,
    addAudit,
  } = useData();

  const [activeTab, setActiveTab] = useState('admin');
  const [selectedDept, setSelectedDept] = useState('CSE');
  const [selectedSem, setSelectedSem] = useState('3');
  const [selectedSection, setSelectedSection] = useState('A');
  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [generating, setGenerating] = useState(false);

  const activeDepartment = useMemo(
    () => departments.find((d) => d.code === selectedDept),
    [departments, selectedDept],
  );

  const contextMatches = useCallback((slot) => (
    slot.section === selectedSection
    && (!slot.dept || slot.dept === selectedDept)
    && (!slot.semester || String(slot.semester) === String(selectedSem))
  ), [selectedDept, selectedSection, selectedSem]);

  const scopedSlots = useMemo(
    () => timetableSlots.filter(contextMatches),
    [timetableSlots, contextMatches],
  );

  const totalTeachingSlots = days.length * timeSlots.length;
  const filledCount = scopedSlots.length;
  const lockedCount = scopedSlots.filter((slot) => slot.locked).length;
  const selectedSubjects = subjectsList.filter(
    (subject) => subject.dept === selectedDept && subject.semester === Number(selectedSem),
  );
  const selectedFacultyList = facultyList.filter((faculty) => faculty.dept === selectedDept);
  const selectedRooms = classroomsList.filter(
    (room) => room.type === 'lecture' || (room.type === 'lab' && (room.dept === selectedDept || !room.dept)),
  );

  const getSlot = useCallback(
    (day, slotIdx) => scopedSlots.find((slot) => slot.day === day && slot.slot === slotIdx),
    [scopedSlots],
  );

  const getFacultySlot = useCallback(
    (day, slotIdx) => timetableSlots.find((slot) => slot.day === day && slot.slot === slotIdx && slot.faculty === selectedFaculty),
    [selectedFaculty, timetableSlots],
  );

  const getRoomSlot = useCallback(
    (day, slotIdx) => timetableSlots.find((slot) => slot.day === day && slot.slot === slotIdx && slot.room === selectedRoom),
    [selectedRoom, timetableSlots],
  );

  const toggleLock = (day, slotIdx) => {
    setTimetableSlots((prev) => prev.map((slot) => (
      contextMatches(slot) && slot.day === day && slot.slot === slotIdx
        ? { ...slot, locked: !slot.locked }
        : slot
    )));
  };

  const clearSlot = (day, slotIdx) => {
    setTimetableSlots((prev) => prev.filter((slot) => !(
      contextMatches(slot) && slot.day === day && slot.slot === slotIdx && !slot.locked
    )));
    showToast('Slot cleared', 'info');
  };

  const clearUnlocked = () => {
    setTimetableSlots((prev) => prev.filter((slot) => !contextMatches(slot) || slot.locked));
    showToast('Unlocked timetable slots cleared', 'info');
  };

  const handleGenerate = useCallback(() => {
    setGenerating(true);

    setTimeout(() => {
      const deptSubjects = subjectsList.filter(
        (subject) => subject.dept === selectedDept && subject.semester === Number(selectedSem),
      );
      const deptFaculty = facultyList.filter((faculty) => faculty.dept === selectedDept);
      const rooms = classroomsList.filter(
        (room) => room.type === 'lecture' || (room.type === 'lab' && (room.dept === selectedDept || !room.dept)),
      );

      if (deptSubjects.length === 0 || deptFaculty.length === 0 || rooms.length === 0) {
        showToast('Add subjects, faculty, and rooms before generating a timetable', 'warning');
        setGenerating(false);
        return;
      }

      const isThisContext = (slot) => (
        slot.section === selectedSection
        && (!slot.dept || slot.dept === selectedDept)
        && (!slot.semester || String(slot.semester) === String(selectedSem))
      );
      const locked = timetableSlots.filter((slot) => isThisContext(slot) && slot.locked);
      const nextSlots = timetableSlots.filter((slot) => !isThisContext(slot) || slot.locked);
      const usedSlots = new Set(locked.map((slot) => `${slot.day}-${slot.slot}`));
      const busyFaculty = new Set(nextSlots.map((slot) => `${slot.day}-${slot.slot}-${slot.faculty}`));
      const busyRooms = new Set(nextSlots.map((slot) => `${slot.day}-${slot.slot}-${slot.room}`));
      const subjectHours = {};

      deptSubjects.forEach((subject) => {
        subjectHours[subject.code] = {
          remaining: Number(subject.weeklyHours) || 1,
          type: subject.type,
        };
      });
      locked.forEach((slot) => {
        if (subjectHours[slot.subject]) subjectHours[slot.subject].remaining -= 1;
      });

      for (const day of days) {
        const daySubjects = new Set(locked.filter((slot) => slot.day === day).map((slot) => slot.subject));

        for (let slotIdx = 0; slotIdx < timeSlots.length; slotIdx += 1) {
          const key = `${day}-${slotIdx}`;
          if (usedSlots.has(key)) continue;

          const availableSubjects = Object.entries(subjectHours)
            .filter(([, data]) => data.remaining > 0)
            .sort((a, b) => b[1].remaining - a[1].remaining);
          if (availableSubjects.length === 0) continue;

          const [subjectCode, subjectData] = availableSubjects.find(([code]) => !daySubjects.has(code)) || availableSubjects[0];
          const faculty = deptFaculty.find((item) => !busyFaculty.has(`${day}-${slotIdx}-${item.name}`)) || deptFaculty[0];
          const preferredRoomType = subjectData.type === 'lab' ? 'lab' : 'lecture';
          const roomPool = rooms.filter((room) => room.type === preferredRoomType);
          const room = (roomPool.find((item) => !busyRooms.has(`${day}-${slotIdx}-${item.code}`)) || roomPool[0] || rooms[0]);

          if (!faculty || !room) continue;

          const createSlot = (targetSlot) => {
            nextSlots.push({
              day,
              slot: targetSlot,
              dept: selectedDept,
              semester: Number(selectedSem),
              subject: subjectCode,
              faculty: faculty.name,
              room: room.code,
              section: selectedSection,
              locked: false,
            });
            subjectHours[subjectCode].remaining -= 1;
            daySubjects.add(subjectCode);
            usedSlots.add(`${day}-${targetSlot}`);
            busyFaculty.add(`${day}-${targetSlot}-${faculty.name}`);
            busyRooms.add(`${day}-${targetSlot}-${room.code}`);
          };

          createSlot(slotIdx);

          if (
            subjectData.type === 'lab'
            && slotIdx < timeSlots.length - 1
            && subjectHours[subjectCode].remaining > 0
            && !usedSlots.has(`${day}-${slotIdx + 1}`)
          ) {
            createSlot(slotIdx + 1);
          }
        }
      }

      setTimetableSlots(nextSlots);
      setGenerating(false);
      showToast('Timetable generated successfully!');
      addAudit('admin@campus.edu', 'GENERATE', 'Timetable', `${selectedDept} Sem${selectedSem} Sec${selectedSection}`);
    }, 900);
  }, [
    addAudit,
    classroomsList,
    facultyList,
    selectedDept,
    selectedSection,
    selectedSem,
    setTimetableSlots,
    showToast,
    subjectsList,
    timetableSlots,
  ]);

  const getExportRows = () => days.map((day) => {
    const row = [day, activeDepartment?.name || selectedDept, selectedSection];
    timeSlots.forEach((time, slotIdx) => {
      if (slotIdx === lunchAfterSlot) row.push('LUNCH BREAK');
      const slot = getSlot(day, slotIdx);
      row.push(slot ? `${slot.subject} | ${slot.faculty} | ${slot.room}` : '-');
    });
    return row;
  });

  const exportTimetable = async (format) => {
    try {
      await downloadOfficialFile(format, {
        settings,
        title: 'One Week Time Table',
        subtitle: `${activeDepartment?.name || selectedDept} - Semester ${selectedSem} - Section ${selectedSection}`,
        details: [
          { label: 'Department', value: activeDepartment?.name || selectedDept },
          { label: 'Semester', value: selectedSem },
          { label: 'Division', value: selectedSection },
          { label: 'W.E.F.', value: effectiveFrom },
        ],
        columns: ['Date / Day', 'Branch', 'Division', ...timeSlots.flatMap((time, idx) => (
          idx === lunchAfterSlot ? ['Lunch Break', time] : [time]
        ))],
        rows: getExportRows(),
        filename: `timetable_${selectedDept}_sem${selectedSem}_${selectedSection}`,
      });
      showToast(`Timetable exported as ${format.toUpperCase()}`);
    } catch {
      showToast('Timetable export failed', 'error');
    }
  };

  const renderCell = (slot, day, slotIdx, showLock) => (
    <td className={`official-tt-cell ${slot ? 'filled' : 'empty'} ${slot?.locked ? 'locked' : ''}`}>
      {slot ? (
        <div className="official-slot">
          <strong>{slot.subject}</strong>
          <span>{formatFacultyName(slot.faculty)}</span>
          <em>{slot.room}</em>
          {showLock && (
            <div className="slot-actions">
              <button type="button" onClick={() => toggleLock(day, slotIdx)} title={slot.locked ? 'Unlock slot' : 'Lock slot'}>
                {slot.locked ? <Lock size={13} /> : <Unlock size={13} />}
              </button>
              {!slot.locked && (
                <button type="button" onClick={() => clearSlot(day, slotIdx)} title="Clear slot">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <span className="free-slot">Free</span>
      )}
    </td>
  );

  const renderOfficialSheet = (slotGetter, showLock = false) => (
    <section className="official-sheet">
      <CollegeHeader
        variant="document"
        title="One Week Time Table"
        subtitle={`${activeDepartment?.name || selectedDept} - Second Year UG`}
        meta={[
          { label: 'Semester', value: `Sem ${selectedSem}` },
          { label: 'Division', value: selectedSection },
          { label: 'A.Y.', value: '2025-26' },
          { label: 'W.E.F.', value: effectiveFrom },
        ]}
      />

      <div className="official-tt-scroll">
        <table className="official-tt-table">
          <thead>
            <tr>
              <th>Date / Day</th>
              <th>Branch</th>
              <th>Division</th>
              {timeSlots.map((time, idx) => (
                <Fragment key={time}>
                  {idx === lunchAfterSlot && <th className="lunch-head">Lunch Break</th>}
                  <th>{time}</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day}>
                <th className="day-cell">{day}</th>
                <td className="branch-cell">{activeDepartment?.name || selectedDept}</td>
                <td className="division-cell">{selectedSection}</td>
                {timeSlots.map((time, slotIdx) => (
                  <Fragment key={`${day}-${time}`}>
                    {slotIdx === lunchAfterSlot && <td className="lunch-cell">LUNCH BREAK</td>}
                    {renderCell(slotGetter(day, slotIdx), day, slotIdx, showLock)}
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="fade-in timetable-page">
      <div className="page-header timetable-page-heading">
        <div>
          <h1>Smart Timetable Scheduler</h1>
          <p>Generate, review, lock, and export official college timetable sheets.</p>
        </div>
        <div className="timetable-actions">
          <button className="btn btn-outline btn-sm" onClick={() => exportTimetable('pdf')}><Download size={16} /> PDF</button>
          <button className="btn btn-outline btn-sm" onClick={() => exportTimetable('docx')}><Download size={16} /> DOCX</button>
          <button className="btn btn-primary btn-sm" onClick={handleGenerate} disabled={generating}>
            <Zap size={16} /> {generating ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>

      <div className="timetable-shell">
        <aside className="timetable-controls">
          <div className="timetable-control-section">
            <div className="section-kicker">Timetable Setup</div>
            <div className="form-group">
              <label className="form-label">Department</label>
              <select className="form-select" value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}>
                {departments.map((dept) => <option key={dept.id} value={dept.code}>{dept.code} - {dept.name}</option>)}
              </select>
            </div>
            <div className="control-grid-2">
              <div className="form-group">
                <label className="form-label">Semester</label>
                <select className="form-select" value={selectedSem} onChange={(e) => setSelectedSem(e.target.value)}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => <option key={sem} value={sem}>Sem {sem}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Division</label>
                <select className="form-select" value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)}>
                  <option>A</option>
                  <option>B</option>
                  <option>C</option>
                  <option>D</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">W.E.F.</label>
              <input className="form-input" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </div>
          </div>

          <div className="timetable-control-section">
            <div className="section-kicker">Views</div>
            <div className="timetable-view-tabs">
              {tabs.map((tab) => (
                <button key={tab.id} type="button" className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>
                  {tab.label}
                </button>
              ))}
            </div>
            {activeTab === 'faculty' && (
              <div className="form-group">
                <label className="form-label">Faculty</label>
                <select className="form-select" value={selectedFaculty} onChange={(e) => setSelectedFaculty(e.target.value)}>
                  <option value="">Select Faculty</option>
                  {facultyList.map((faculty) => <option key={faculty.id} value={faculty.name}>{faculty.name}</option>)}
                </select>
              </div>
            )}
            {activeTab === 'classroom' && (
              <div className="form-group">
                <label className="form-label">Room</label>
                <select className="form-select" value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)}>
                  <option value="">Select Room</option>
                  {classroomsList.map((room) => <option key={room.id} value={room.code}>{room.code} - {room.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="timetable-stats">
            <div><Calendar size={16} /><span>{filledCount}/{totalTeachingSlots}</span><small>Filled slots</small></div>
            <div><Lock size={16} /><span>{lockedCount}</span><small>Locked</small></div>
            <div><BookOpen size={16} /><span>{selectedSubjects.length}</span><small>Subjects</small></div>
            <div><Users size={16} /><span>{selectedFacultyList.length}</span><small>Faculty</small></div>
            <div><Building size={16} /><span>{selectedRooms.length}</span><small>Rooms</small></div>
            <div><Clock size={16} /><span>{timeSlots.length}</span><small>Periods/day</small></div>
          </div>

          <button className="btn btn-outline btn-sm" onClick={clearUnlocked} style={{ width: '100%' }}>
            <Trash2 size={15} /> Clear Unlocked
          </button>
        </aside>

        <main className="timetable-board">
          {generating ? (
            <div className="timetable-generating">
              <div className="spinner" />
              <h3>Generating timetable...</h3>
              <p>Balancing subject hours, faculty availability, rooms, and locked cells.</p>
            </div>
          ) : (
            <>
              {activeTab === 'admin' && renderOfficialSheet(getSlot, true)}
              {activeTab === 'student' && renderOfficialSheet(getSlot)}
              {activeTab === 'faculty' && (
                selectedFaculty
                  ? renderOfficialSheet(getFacultySlot)
                  : <div className="timetable-empty"><Users size={30} /><h3>Select a faculty member</h3><p>Their weekly teaching schedule will appear here.</p></div>
              )}
              {activeTab === 'classroom' && (
                selectedRoom
                  ? renderOfficialSheet(getRoomSlot)
                  : <div className="timetable-empty"><CheckCircle size={30} /><h3>Select a classroom</h3><p>Room occupancy and free periods will appear here.</p></div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
