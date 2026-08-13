import { createContext, useContext, useState, useCallback } from 'react';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dataLoading] = useState(false);
  const [dataError] = useState('');
  const [setupDone] = useState(true);

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

  const value = {
    dataLoading,
    dataError,
    setupDone,
    toasts,
    showToast,
    settings,
    setSettings,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);
