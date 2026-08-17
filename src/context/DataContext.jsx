import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

const DataContext = createContext(null);

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
  const [timetableSlots, setTimetableSlots] = useState([]);
  
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

  const currentToken = getAccessToken?.() ?? null;

  useEffect(() => {
    let active = true;
    
    // Only load data if we have a token (user is authenticated)
    if (!currentToken) {
      // Clear data when unauthenticated
      setDepartments([]);
      setFacultyList([]);
      setStudentsList([]);
      setClassroomsList([]);
      setSubjectsList([]);
      setExamsList([]);
      setTimetableSlots([]);
      return;
    }

    setDataLoading(true);

    const headers = { Authorization: `Bearer ${currentToken}` };

    Promise.all([
      fetch(`/api/departments`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`/api/faculty`, { headers }).then(r => r.ok ? r.json() : { data: [] }).then(r => r.data || []),
      fetch(`/api/students`, { headers }).then(r => r.ok ? r.json() : { data: [] }).then(r => r.data || []),
      fetch(`/api/classrooms`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`/api/subjects`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`/api/exams`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`/api/institutions`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`/api/attendance/sessions`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`/api/audit?limit=20`, { headers }).then(r => r.ok ? r.json() : { data: [] }).then(r => r.data || []),
      fetch(`/api/timetable`, { headers }).then(r => r.ok ? r.json() : [])
    ])
      .then(([deps, facs, studs, rooms, subs, exms, insts, atts, audts, ttbs]) => {
        if (!active) return;
        setDepartments(deps);
        setFacultyList(facs);
        setStudentsList(studs);
        setClassroomsList(rooms);
        setSubjectsList(subs);
        setExamsList(exms);
        
        // Populate institutions settings dynamically
        if (insts && insts.length > 0) {
          setSettings(prev => ({
            ...prev,
            institutionName: insts[0].name || prev.institutionName,
            address: insts[0].address || prev.address,
            phone: insts[0].phone || prev.phone,
            email: insts[0].email || prev.email,
            website: insts[0].website || prev.website,
            affiliation: insts[0].affiliation || prev.affiliation,
            naacGrade: insts[0].naac_grade || prev.naacGrade,
            aisheCode: insts[0].aishe_code || prev.aisheCode,
            autonomousStatus: insts[0].autonomous_status || prev.autonomousStatus,
            principalName: insts[0].principal_name || prev.principalName,
          }));
        }

        // Map attendance sessions to Dashboard format
        const history = (atts || []).map(a => ({
          id: a.id,
          date: a.session_date,
          subject: a.subject_code || a.subject_name || a.subject_offering_id,
          total: a.record_count || 0,
          present: a.present_count || 0
        }));
        setAttendanceHistory(history);

        // Map audit logs to notifications/recent activity
        const notifications = (audts || []).map(a => ({
          id: a.id,
          type: a.module,
          title: `${a.action} ${a.entity}`,
          time: new Date(a.created_at).toLocaleString(),
          read: true
        }));
        setNotificationsList(notifications);

        // Map timetable
        // Backend doesn't return 'time', so we map 'slotIdx' or just leave it empty.
        // Dashboard uses 'l.time'. We'll populate 'time' with a generic label if missing.
        const timetable = (ttbs || []).map(t => ({
          ...t,
          time: t.time_slot_label || `Slot ${t.slotIdx}`,
        }));
        setTimetableSlots(timetable);
        setDataError('');
      })
      .catch(error => {
        if (active) setDataError('Failed to fetch some data lists');
      })
      .finally(() => {
        if (active) setDataLoading(false);
      });

    return () => { active = false; };
  }, [currentToken]);

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
    timetableSlots,
    seatAllocations: []
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);
