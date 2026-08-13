import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

// Default institutional accounts
const DEFAULT_ACCOUNTS = [
  { email: 'admin@campusflow.edu', password: 'Admin@123', name: 'System Administrator', role: 'Super Admin', initials: 'SA', dept: 'All' },
  { email: 'principal@campusflow.edu', password: 'Admin@123', name: 'Principal', role: 'Principal', initials: 'PR', dept: 'All' },
  { email: 'hod@campusflow.edu', password: 'Admin@123', name: 'Head of Department', role: 'HOD', initials: 'HD', dept: 'CSE' },
  { email: 'faculty@campusflow.edu', password: 'Admin@123', name: 'Faculty Member', role: 'Faculty', initials: 'FM', dept: 'CSE' },
  { email: 'exam@campusflow.edu', password: 'Admin@123', name: 'Exam Cell Officer', role: 'Exam Cell', initials: 'EX', dept: 'Exam' },
  { email: 'student@campusflow.edu', password: 'Admin@123', name: 'Student', role: 'Student', initials: 'ST', dept: 'CSE' },
];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('cf_current_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [accounts, setAccounts] = useState(() => {
    try {
      const saved = localStorage.getItem('cf_registered_accounts');
      if (saved) {
        const parsed = JSON.parse(saved);
        return [...DEFAULT_ACCOUNTS, ...parsed.filter(p => !DEFAULT_ACCOUNTS.some(d => d.email.toLowerCase() === p.email.toLowerCase()))];
      }
    } catch {
      // ignore
    }
    return DEFAULT_ACCOUNTS;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('cf_current_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('cf_current_user');
    }
  }, [user]);

  /**
   * Validate credentials and log in.
   * Returns { success: true, user } or { success: false, error: string }
   */
  const login = (email, password) => {
    if (!email || !email.trim()) {
      return { success: false, error: 'Email address is required.' };
    }
    if (!password || password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }

    const account = accounts.find(
      (a) => a.email.toLowerCase() === email.trim().toLowerCase() && a.password === password
    );

    if (!account) {
      return { success: false, error: 'Invalid email or password. Please check your credentials.' };
    }

    const safeUser = {
      email: account.email,
      name: account.name,
      role: account.role,
      initials: account.initials,
      dept: account.dept,
    };
    setUser(safeUser);
    return { success: true, user: safeUser };
  };

  /**
   * Register a new user account.
   */
  const registerAccount = (data) => {
    const { name, email, password, role, dept } = data;
    if (!name || !name.trim()) return { success: false, error: 'Full name is required.' };
    if (!email || !email.trim()) return { success: false, error: 'Institutional email is required.' };
    if (!password || password.length < 6) return { success: false, error: 'Password must be at least 6 characters.' };
    if (!role) return { success: false, error: 'Please select your institutional role.' };

    const exists = accounts.some(a => a.email.toLowerCase() === email.trim().toLowerCase());
    if (exists) {
      return { success: false, error: 'An account with this email address already exists.' };
    }

    const nameParts = name.trim().split(' ');
    const initials = nameParts.length >= 2 
      ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();

    const newAccount = {
      name: name.trim(),
      email: email.trim(),
      password,
      role,
      dept: dept || 'CSE',
      initials,
    };

    const updatedAccounts = [...accounts, newAccount];
    setAccounts(updatedAccounts);

    // Save only user-created accounts to localStorage
    const userCreatedOnly = updatedAccounts.filter(
      a => !DEFAULT_ACCOUNTS.some(d => d.email.toLowerCase() === a.email.toLowerCase())
    );
    localStorage.setItem('cf_registered_accounts', JSON.stringify(userCreatedOnly));

    // Automatically log in newly registered user
    const safeUser = {
      email: newAccount.email,
      name: newAccount.name,
      role: newAccount.role,
      initials: newAccount.initials,
      dept: newAccount.dept,
    };
    setUser(safeUser);
    return { success: true, user: safeUser };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('cf_current_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, registerAccount, logout, defaultAccounts: DEFAULT_ACCOUNTS }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
