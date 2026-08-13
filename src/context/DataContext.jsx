import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { defaultState } from '../data/defaultState';

const DataContext = createContext(null);
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

/** Ref to the current access token — injected by DataProvider after auth. */
const accessTokenRef = { current: null };

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
  const token = accessTokenRef.current;
  const response = await fetch(`${API_BASE}/api/state`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(patch),
  });

  // 401 means session expired — don't throw data-sync error, just silently fail
  if (response.status === 401) return;
  if (!response.ok) throw new Error('Unable to save data to PostgreSQL.');
  return response.json();
};

export function DataProvider({ children, getAccessToken }) {
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

  // Keep accessTokenRef in sync with the latest token from AuthContext
  useEffect(() => {
    accessTokenRef.current = getAccessToken?.() ?? null;
  });

  useEffect(() => {
    let active = true;

    const token = getAccessToken?.();
    fetch(`${API_BASE}/api/state`, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((response) => {
        if (response.status === 401) {
          // Not authenticated yet — use cached localStorage state
          if (active) setDataLoading(false);
          return null;
        }
        if (!response.ok) throw new Error('Unable to load PostgreSQL data.');
        return response.json();
      })
      .then((state) => {
        if (!active || !state) return;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const token = getAccessToken?.();
    try {
      await fetch(`${API_BASE}/api/reset`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
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

  // currentUserRef is populated by DataProvider consumers (App) after auth
  const currentUserEmailRef = { current: 'system' };

  const addAudit = (userEmail, action, module, entity) => {
    const now = new Date();
    const time = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    setAuditLogsList(prev => [{ id: `a${Date.now()}`, user: userEmail || currentUserEmailRef.current || 'system', action, module, entity, time, ip: 'N/A' }, ...prev]);
  };

  const addDepartment = (dept, userEmail) => { setDepartments(prev => [...prev, { ...dept, id: `d${Date.now()}`, active: true, faculty: 0, students: 0 }]); showToast(`Department "${dept.name}" added`); addAudit(userEmail,'CREATE','Departments',dept.name); };
  const updateDepartment = (id, u, userEmail) => { setDepartments(prev => prev.map(d => d.id === id ? { ...d, ...u } : d)); showToast('Department updated'); addAudit(userEmail,'UPDATE','Departments',u.name||id); };
  const deleteDepartment = (id, userEmail) => { const d = departments.find(x => x.id === id); setDepartments(prev => prev.filter(x => x.id !== id)); showToast(`"${d?.name}" deleted`,'error'); addAudit(userEmail,'DELETE','Departments',d?.name||id); };

  const addFaculty = (f, userEmail) => { setFacultyList(prev => [...prev, { ...f, id: `f${Date.now()}` }]); showToast(`Faculty "${f.name}" added`); addAudit(userEmail,'CREATE','Faculty',f.name); };
  const updateFaculty = (id, u, userEmail) => { setFacultyList(prev => prev.map(f => f.id === id ? { ...f, ...u } : f)); showToast('Faculty updated'); addAudit(userEmail,'UPDATE','Faculty',u.name||id); };
  const deleteFaculty = (id, userEmail) => { const f = facultyList.find(x => x.id === id); setFacultyList(prev => prev.filter(x => x.id !== id)); showToast(`"${f?.name}" removed`,'error'); addAudit(userEmail,'DELETE','Faculty',f?.name||id); };

  const addSubject = (s, userEmail) => { setSubjectsList(prev => [...prev, { ...s, id: `s${Date.now()}` }]); showToast(`Subject "${s.name}" added`); addAudit(userEmail,'CREATE','Subjects',s.name); };
  const updateSubject = (id, u, userEmail) => { setSubjectsList(prev => prev.map(s => s.id === id ? { ...s, ...u } : s)); showToast('Subject updated'); addAudit(userEmail,'UPDATE','Subjects',u.name||id); };
  const deleteSubject = (id, userEmail) => { const s = subjectsList.find(x => x.id === id); setSubjectsList(prev => prev.filter(x => x.id !== id)); showToast(`"${s?.name}" deleted`,'error'); addAudit(userEmail,'DELETE','Subjects',s?.name||id); };

  const addClassroom = (r, userEmail) => { setClassroomsList(prev => [...prev, { ...r, id: `r${Date.now()}` }]); showToast(`Room "${r.code}" added`); addAudit(userEmail,'CREATE','Classrooms',r.code); };
  const updateClassroom = (id, u, userEmail) => { setClassroomsList(prev => prev.map(r => r.id === id ? { ...r, ...u } : r)); showToast('Room updated'); addAudit(userEmail,'UPDATE','Classrooms',u.code||id); };
  const deleteClassroom = (id, userEmail) => { const r = classroomsList.find(x => x.id === id); setClassroomsList(prev => prev.filter(x => x.id !== id)); showToast(`"${r?.code}" deleted`,'error'); addAudit(userEmail,'DELETE','Classrooms',r?.code||id); };

  const addStudent = (s, userEmail) => { setStudentsList(prev => [...prev, { ...s, id: `st${Date.now()}`, attendance: 100 }]); showToast(`Student "${s.name}" enrolled`); addAudit(userEmail,'CREATE','Students',s.name); };
  const updateStudent = (id, u, userEmail) => { setStudentsList(prev => prev.map(s => s.id === id ? { ...s, ...u } : s)); showToast('Student updated'); addAudit(userEmail,'UPDATE','Students',u.name||id); };
  const deleteStudent = (id, userEmail) => { const s = studentsList.find(x => x.id === id); setStudentsList(prev => prev.filter(x => x.id !== id)); showToast(`"${s?.name}" removed`,'error'); addAudit(userEmail,'DELETE','Students',s?.name||id); };

  const addExam = (e, userEmail) => { setExamsList(prev => [...prev, { ...e, id: `e${Date.now()}` }]); showToast(`Exam "${e.name}" created`); addAudit(userEmail,'CREATE','Exams',e.name); };
  const updateExam = (id, u, userEmail) => { setExamsList(prev => prev.map(e => e.id === id ? { ...e, ...u } : e)); showToast('Exam updated'); addAudit(userEmail,'UPDATE','Exams',u.name||id); };
  const deleteExam = (id, userEmail) => { const e = examsList.find(x => x.id === id); setExamsList(prev => prev.filter(x => x.id !== id)); showToast(`"${e?.name}" deleted`,'error'); addAudit(userEmail,'DELETE','Exams',e?.name||id); };

  const markAllRead = () => { setNotificationsList(prev => prev.map(n => ({ ...n, read: true }))); showToast('All marked as read'); };
  const markRead = (id) => { setNotificationsList(prev => prev.map(n => n.id === id ? { ...n, read: true } : n)); };
  const addNotification = (n) => { setNotificationsList(prev => [{ ...n, id: `n${Date.now()}`, read: false, time: 'Just now' }, ...prev]); };
  const deleteNotification = (id) => { setNotificationsList(prev => prev.filter(n => n.id !== id)); showToast('Notification dismissed'); };

  const submitAttendance = (record, userEmail) => {
    setAttendanceHistory(prev => [record, ...prev]);
    showToast('Attendance submitted!');
    addAudit(userEmail,'SUBMIT','Attendance',`${record.subject} ${record.date}`);
    addNotification({ type: 'attendance', title: 'Attendance Submitted', message: `Attendance for ${record.subject} on ${record.date} submitted.` });
  };

  const generateDocument = (doc, userEmail) => {
    setDocuments(prev => [{ ...doc, id: `doc${Date.now()}`, date: new Date().toISOString().split('T')[0], status: 'generated' }, ...prev]);
    showToast(`"${doc.title}" generated`);
    addAudit(userEmail,'GENERATE','Documents',doc.title);
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
