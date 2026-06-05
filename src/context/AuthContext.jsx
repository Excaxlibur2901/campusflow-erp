import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const login = (role) => {
    const users = {
      'Super Admin': { name: 'Admin User', email: 'admin@campusflow.edu', role: 'Super Admin', initials: 'AU', dept: 'All' },
      'Principal': { name: 'Dr. S.R. Kulkarni', email: 'principal@campusflow.edu', role: 'Principal', initials: 'SK', dept: 'All' },
      'HOD': { name: 'Dr. Rajesh Kumar', email: 'hod.cse@campusflow.edu', role: 'HOD', initials: 'RK', dept: 'CSE' },
      'Faculty': { name: 'Prof. Anita Desai', email: 'anita@campusflow.edu', role: 'Faculty', initials: 'AD', dept: 'CSE' },
      'Exam Cell': { name: 'Mr. Pankaj Bhosle', email: 'exam@campusflow.edu', role: 'Exam Cell', initials: 'PB', dept: 'Exam' },
      'Student': { name: 'Aarav Patel', email: 'aarav@campusflow.edu', role: 'Student', initials: 'AP', dept: 'CSE' },
    };
    setUser(users[role]);
  };

  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
