import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

const DataContext = createContext(null);
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

export function DataProvider({ children, getAccessToken }) {
  const [toasts, setToasts] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');

  // Data lists required by dashboard and modules
  const [departments, setDepartments] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const [studentsList, setStudentsList] = useState([]);
  const [classroomsList, setClassroomsList] = useState([]);
  const [subjectsList, setSubjectsList] = useState([]);
  const [examsList, setExamsList] = useState([]);
  const [notificationsList, setNotificationsList] = useState([]);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  
  // Settings & Theme UI preferences stored safely in localStorage
  const [settings, setSettingsState] = useState(() => {
    try {
      const stored = localStorage.getItem('cf_ui_settings');
      return stored ? JSON.parse(stored) : {
        institutionName: 'CampusFlow ERP College',
        address: 'University Campus Road, Tech City',
        phone: '+91 9876543210',
        email: 'info@campusflow.edu',
        website: 'https://campusflow.edu',
        affiliation: 'Approved by AICTE | Affiliated to State Technological University',
        naacGrade: 'A+',
        aisheCode: 'C-12345',
        autonomousStatus: 'Autonomous',
        principalName: 'Dr. S. K. Sharma',
      };
    } catch {
      return { institutionName: 'CampusFlow ERP College' };
    }
  });

  const setSettings = useCallback((newSettings) => {
    setSettingsState(prev => {
      const updated = typeof newSettings === 'function' ? newSettings(prev) : { ...prev, ...newSettings };
      try {
        localStorage.setItem('cf_ui_settings', JSON.stringify(updated));
      } catch {
        // UI storage fallback
      }
      return updated;
    });
  }, []);

  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const accessTokenRef = useRef(null);

  useEffect(() => {
    accessTokenRef.current = getAccessToken?.() ?? null;
  }, [getAccessToken]);

  useEffect(() => {
    let active = true;
    const token = accessTokenRef.current;
    
    // Only load data if we have a token (user is authenticated)
    if (!token) return;

    setDataLoading(true);

    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(`${API_BASE}/api/departments`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${API_BASE}/api/faculty`, { headers }).then(r => r.ok ? r.json() : { data: [] }).then(r => r.data || []),
      fetch(`${API_BASE}/api/students`, { headers }).then(r => r.ok ? r.json() : { data: [] }).then(r => r.data || []),
      fetch(`${API_BASE}/api/classrooms`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${API_BASE}/api/subjects`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${API_BASE}/api/exams`, { headers }).then(r => r.ok ? r.json() : [])
    ])
      .then(([deps, facs, studs, rooms, subs, exms]) => {
        if (!active) return;
        setDepartments(deps);
        setFacultyList(facs);
        setStudentsList(studs);
        setClassroomsList(rooms);
        setSubjectsList(subs);
        setExamsList(exms);
        setDataError('');
      })
      .catch(error => {
        if (active) setDataError('Failed to fetch some data lists');
      })
      .finally(() => {
        if (active) setDataLoading(false);
      });

    return () => { active = false; };
  }, [getAccessToken]);

  const value = {
    dataLoading,
    dataError,
    toasts,
    showToast,
    settings,
    setSettings,
    departments,
    facultyList,
    studentsList,
    classroomsList,
    subjectsList,
    examsList,
    notificationsList,
    attendanceHistory,
    timetableSlots: [],
    seatAllocations: []
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);
