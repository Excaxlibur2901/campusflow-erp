import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { defaultState } from '../data/defaultState';

const DataContext = createContext(null);
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const cacheKey = (key) => `cf_${key}`;

const load = (key, fallback) => {
  try {
    const v = localStorage.getItem(cacheKey(key));
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};

const save = (key, val) => {
  localStorage.setItem(cacheKey(key), JSON.stringify(val));
};

const patchRemote = async (patch) => {
  const response = await fetch(`${API_BASE}/api/state`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });

  if (!response.ok) throw new Error('Unable to save data to PostgreSQL.');
  return response.json();
};

export function DataProvider({ children }) {
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [setupDone, setSetupDone] = useState(() => load('setupDone', defaultState.setupDone));
  const [departments, setDepartmentsRaw] = useState(() => load('departments', defaultState.departments));
  const [facultyList, setFacultyListRaw] = useState(() => load('faculty', defaultState.faculty));
  const [subjectsList, setSubjectsListRaw] = useState(() => load('subjects', defaultState.subjects));
  const [classroomsList, setClassroomsListRaw] = useState(() => load('classrooms', defaultState.classrooms));
  const [studentsList, setStudentsListRaw] = useState(() => load('students', defaultState.students));
  const [examsList, setExamsListRaw] = useState(() => load('exams', defaultState.exams));
  const [notificationsList, setNotificationsListRaw] = useState(() => load('notifications', defaultState.notifications));
  const [auditLogsList, setAuditLogsListRaw] = useState(() => load('audit', defaultState.audit));
  const [timetableSlots, setTimetableSlotsRaw] = useState(() => load('timetable', defaultState.timetable));
  const [seatAllocations, setSeatAllocationsRaw] = useState(() => load('seats', defaultState.seats));
  const [attendanceHistory, setAttendanceHistoryRaw] = useState(() => load('attendanceHistory', defaultState.attendanceHistory));
  const [documents, setDocumentsRaw] = useState(() => load('documents', defaultState.documents));
  const [toasts, setToasts] = useState([]);
  const [settings, setSettingsRaw] = useState(() => load('settings', defaultState.settings));

  const applyState = useCallback((state) => {
    setSetupDone(state.setupDone ?? defaultState.setupDone);
    setDepartmentsRaw(state.departments ?? defaultState.departments);
    setFacultyListRaw(state.faculty ?? defaultState.faculty);
    setSubjectsListRaw(state.subjects ?? defaultState.subjects);
    setClassroomsListRaw(state.classrooms ?? defaultState.classrooms);
    setStudentsListRaw(state.students ?? defaultState.students);
    setExamsListRaw(state.exams ?? defaultState.exams);
    setNotificationsListRaw(state.notifications ?? defaultState.notifications);
    setAuditLogsListRaw(state.audit ?? defaultState.audit);
    setTimetableSlotsRaw(state.timetable ?? defaultState.timetable);
    setSeatAllocationsRaw(state.seats ?? defaultState.seats);
    setAttendanceHistoryRaw(state.attendanceHistory ?? defaultState.attendanceHistory);
    setDocumentsRaw(state.documents ?? defaultState.documents);
    setSettingsRaw(state.settings ?? defaultState.settings);
  }, []);

  useEffect(() => {
    let active = true;

    fetch(`${API_BASE}/api/state`)
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load PostgreSQL data.');
        return response.json();
      })
      .then((state) => {
        if (!active) return;
        applyState(state);
        Object.entries(state).forEach(([key, value]) => save(key, value));
        setDataError('');
      })
      .catch((error) => {
        if (active) setDataError(error.message);
      })
      .finally(() => {
        if (active) setDataLoading(false);
      });

    return () => {
      active = false;
    };
  }, [applyState]);

  const persist = useCallback((patch) => {
    Object.entries(patch).forEach(([key, value]) => save(key, value));
    patchRemote(patch).catch((error) => {
      console.error(error);
      setDataError(error.message);
    });
  }, []);

  const setDepartments = (v) => {
    const next = typeof v === 'function' ? v(departments) : v;
    setDepartmentsRaw(next);
    persist({ departments: next });
  };
  const setFacultyList = (v) => {
    const next = typeof v === 'function' ? v(facultyList) : v;
    setFacultyListRaw(next);
    persist({ faculty: next });
  };
  const setSubjectsList = (v) => {
    const next = typeof v === 'function' ? v(subjectsList) : v;
    setSubjectsListRaw(next);
    persist({ subjects: next });
  };
  const setClassroomsList = (v) => {
    const next = typeof v === 'function' ? v(classroomsList) : v;
    setClassroomsListRaw(next);
    persist({ classrooms: next });
  };
  const setStudentsList = (v) => {
    const next = typeof v === 'function' ? v(studentsList) : v;
    setStudentsListRaw(next);
    persist({ students: next });
  };
  const setExamsList = (v) => {
    const next = typeof v === 'function' ? v(examsList) : v;
    setExamsListRaw(next);
    persist({ exams: next });
  };
  const setNotificationsList = (v) => {
    const next = typeof v === 'function' ? v(notificationsList) : v;
    setNotificationsListRaw(next);
    persist({ notifications: next });
  };
  const setAuditLogsList = (v) => {
    const next = typeof v === 'function' ? v(auditLogsList) : v;
    setAuditLogsListRaw(next);
    persist({ audit: next });
  };
  const setTimetableSlots = (v) => {
    const next = typeof v === 'function' ? v(timetableSlots) : v;
    setTimetableSlotsRaw(next);
    persist({ timetable: next });
  };
  const setSeatAllocations = (v) => {
    const next = typeof v === 'function' ? v(seatAllocations) : v;
    setSeatAllocationsRaw(next);
    persist({ seats: next });
  };
  const setAttendanceHistory = (v) => {
    const next = typeof v === 'function' ? v(attendanceHistory) : v;
    setAttendanceHistoryRaw(next);
    persist({ attendanceHistory: next });
  };
  const setDocuments = (v) => {
    const next = typeof v === 'function' ? v(documents) : v;
    setDocumentsRaw(next);
    persist({ documents: next });
  };
  const setSettings = (v) => {
    const next = typeof v === 'function' ? v(settings) : v;
    setSettingsRaw(next);
    persist({ settings: next });
  };

  const completeSetup = () => {
    setSetupDone(true);
    persist({ setupDone: true });
  };

  const resetAll = async () => {
    try {
      await fetch(`${API_BASE}/api/reset`, { method: 'POST' });
    } finally {
      Object.keys(localStorage).filter(k => k.startsWith('cf_')).forEach(k => localStorage.removeItem(k));
      window.location.reload();
    }
  };

  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const addAudit = (user, action, module, entity) => {
    const now = new Date();
    const time = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    setAuditLogsList(prev => [{ id: `a${Date.now()}`, user, action, module, entity, time, ip: '192.168.1.' + Math.floor(Math.random()*100+1) }, ...prev]);
  };

  const addDepartment = (dept) => { setDepartments(prev => [...prev, { ...dept, id: `d${Date.now()}`, active: true, faculty: 0, students: 0 }]); showToast(`Department "${dept.name}" added`); addAudit('admin@campus.edu','CREATE','Departments',dept.name); };
  const updateDepartment = (id, u) => { setDepartments(prev => prev.map(d => d.id === id ? { ...d, ...u } : d)); showToast('Department updated'); addAudit('admin@campus.edu','UPDATE','Departments',u.name||id); };
  const deleteDepartment = (id) => { const d = departments.find(x => x.id === id); setDepartments(prev => prev.filter(x => x.id !== id)); showToast(`"${d?.name}" deleted`,'error'); addAudit('admin@campus.edu','DELETE','Departments',d?.name||id); };

  const addFaculty = (f) => { setFacultyList(prev => [...prev, { ...f, id: `f${Date.now()}` }]); showToast(`Faculty "${f.name}" added`); addAudit('admin@campus.edu','CREATE','Faculty',f.name); };
  const updateFaculty = (id, u) => { setFacultyList(prev => prev.map(f => f.id === id ? { ...f, ...u } : f)); showToast('Faculty updated'); addAudit('admin@campus.edu','UPDATE','Faculty',u.name||id); };
  const deleteFaculty = (id) => { const f = facultyList.find(x => x.id === id); setFacultyList(prev => prev.filter(x => x.id !== id)); showToast(`"${f?.name}" removed`,'error'); addAudit('admin@campus.edu','DELETE','Faculty',f?.name||id); };

  const addSubject = (s) => { setSubjectsList(prev => [...prev, { ...s, id: `s${Date.now()}` }]); showToast(`Subject "${s.name}" added`); addAudit('admin@campus.edu','CREATE','Subjects',s.name); };
  const updateSubject = (id, u) => { setSubjectsList(prev => prev.map(s => s.id === id ? { ...s, ...u } : s)); showToast('Subject updated'); addAudit('admin@campus.edu','UPDATE','Subjects',u.name||id); };
  const deleteSubject = (id) => { const s = subjectsList.find(x => x.id === id); setSubjectsList(prev => prev.filter(x => x.id !== id)); showToast(`"${s?.name}" deleted`,'error'); addAudit('admin@campus.edu','DELETE','Subjects',s?.name||id); };

  const addClassroom = (r) => { setClassroomsList(prev => [...prev, { ...r, id: `r${Date.now()}` }]); showToast(`Room "${r.code}" added`); addAudit('admin@campus.edu','CREATE','Classrooms',r.code); };
  const updateClassroom = (id, u) => { setClassroomsList(prev => prev.map(r => r.id === id ? { ...r, ...u } : r)); showToast('Room updated'); addAudit('admin@campus.edu','UPDATE','Classrooms',u.code||id); };
  const deleteClassroom = (id) => { const r = classroomsList.find(x => x.id === id); setClassroomsList(prev => prev.filter(x => x.id !== id)); showToast(`"${r?.code}" deleted`,'error'); addAudit('admin@campus.edu','DELETE','Classrooms',r?.code||id); };

  const addStudent = (s) => { setStudentsList(prev => [...prev, { ...s, id: `st${Date.now()}`, attendance: 100 }]); showToast(`Student "${s.name}" enrolled`); addAudit('admin@campus.edu','CREATE','Students',s.name); };
  const updateStudent = (id, u) => { setStudentsList(prev => prev.map(s => s.id === id ? { ...s, ...u } : s)); showToast('Student updated'); addAudit('admin@campus.edu','UPDATE','Students',u.name||id); };
  const deleteStudent = (id) => { const s = studentsList.find(x => x.id === id); setStudentsList(prev => prev.filter(x => x.id !== id)); showToast(`"${s?.name}" removed`,'error'); addAudit('admin@campus.edu','DELETE','Students',s?.name||id); };

  const addExam = (e) => { setExamsList(prev => [...prev, { ...e, id: `e${Date.now()}` }]); showToast(`Exam "${e.name}" created`); addAudit('exam@campus.edu','CREATE','Exams',e.name); };
  const updateExam = (id, u) => { setExamsList(prev => prev.map(e => e.id === id ? { ...e, ...u } : e)); showToast('Exam updated'); addAudit('exam@campus.edu','UPDATE','Exams',u.name||id); };
  const deleteExam = (id) => { const e = examsList.find(x => x.id === id); setExamsList(prev => prev.filter(x => x.id !== id)); showToast(`"${e?.name}" deleted`,'error'); addAudit('exam@campus.edu','DELETE','Exams',e?.name||id); };

  const markAllRead = () => { setNotificationsList(prev => prev.map(n => ({ ...n, read: true }))); showToast('All marked as read'); };
  const markRead = (id) => { setNotificationsList(prev => prev.map(n => n.id === id ? { ...n, read: true } : n)); };
  const addNotification = (n) => { setNotificationsList(prev => [{ ...n, id: `n${Date.now()}`, read: false, time: 'Just now' }, ...prev]); };
  const deleteNotification = (id) => { setNotificationsList(prev => prev.filter(n => n.id !== id)); showToast('Notification dismissed'); };

  const submitAttendance = (record) => {
    setAttendanceHistory(prev => [record, ...prev]);
    showToast('Attendance submitted!');
    addAudit('faculty@campus.edu','SUBMIT','Attendance',`${record.subject} ${record.date}`);
    addNotification({ type: 'attendance', title: 'Attendance Submitted', message: `Attendance for ${record.subject} on ${record.date} submitted.` });
  };

  const generateDocument = (doc) => {
    setDocuments(prev => [{ ...doc, id: `doc${Date.now()}`, date: new Date().toISOString().split('T')[0], status: 'generated' }, ...prev]);
    showToast(`"${doc.title}" generated`);
    addAudit('admin@campus.edu','GENERATE','Documents',doc.title);
  };

  const value = {
    dataLoading, dataError,
    setupDone, completeSetup, resetAll,
    departments, setDepartments, addDepartment, updateDepartment, deleteDepartment,
    facultyList, setFacultyList, addFaculty, updateFaculty, deleteFaculty,
    subjectsList, setSubjectsList, addSubject, updateSubject, deleteSubject,
    classroomsList, setClassroomsList, addClassroom, updateClassroom, deleteClassroom,
    studentsList, setStudentsList, addStudent, updateStudent, deleteStudent,
    examsList, setExamsList, addExam, updateExam, deleteExam,
    notificationsList, setNotificationsList, markAllRead, markRead, addNotification, deleteNotification,
    auditLogsList, setAuditLogsList,
    timetableSlots, setTimetableSlots,
    seatAllocations, setSeatAllocations,
    attendanceHistory, submitAttendance,
    documents, setDocuments, generateDocument,
    settings, setSettings,
    toasts, showToast, addAudit,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);
