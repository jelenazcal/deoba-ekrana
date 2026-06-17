'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  title: string;
  role: 'admin' | 'user';
  connectionId: string;
  isApprovedByAdmin: boolean;
  isRejectedByAdmin: boolean;
  canSeeOthersFiles: boolean;
  isOnline: boolean;
  lastActive: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  title: string;
  role: 'admin' | 'user';
  connectionId: string;
  isApprovedByAdmin: boolean;
  isRejectedByAdmin: boolean;
  appSecret: string;
  isFirstLogin: boolean;
}

interface AuthState {
  user: CurrentUser | null;
  token: string | null;
  allUsers: UserSummary[];
  loading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

interface AuthContextProps extends AuthState {
  login: (email: string, password: string) => Promise<any>;
  signup: (payload: { email: string; fullName: string; title: string; passwordPlain: string }) => Promise<any>;
  logout: () => void;
  updateProfileName: (newName: string) => Promise<void>;
  updateUserPermission: (userId: string, fields: any) => Promise<void>;
  refreshUsersDirectory: () => Promise<void>;
  clearError: () => void;
}

const AuthStateContext = createContext<AuthState | undefined>(undefined);
const AuthDispatchContext = createContext<any | undefined>(undefined);

// Helper to generate unique 9 digit Desk ID code "123 456 789"
function generateRandomDeskId(): string {
  const p1 = Math.floor(100 + Math.random() * 900).toString();
  const p2 = Math.floor(100 + Math.random() * 900).toString();
  const p3 = Math.floor(100 + Math.random() * 900).toString();
  return `${p1} ${p2} ${p3}`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => setError(null);

  const verifyOrCreateSession = useCallback(async (forcedName?: string) => {
    if (typeof window === 'undefined') return;

    // Load or generate stable connection ID
    let currentDeskId = localStorage.getItem('omnivault_connection_id');
    if (!currentDeskId || currentDeskId.trim().length < 11) {
      currentDeskId = generateRandomDeskId();
      localStorage.setItem('omnivault_connection_id', currentDeskId);
    }

    // Load or generate default companion display name
    let currentName = forcedName || localStorage.getItem('omnivault_full_name');
    if (!currentName || !currentName.trim()) {
      currentName = `Računar ${currentDeskId.slice(-3)}`;
      localStorage.setItem('omnivault_full_name', currentName);
    }

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'anonymous',
          connectionId: currentDeskId,
          fullName: currentName
        })
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setToken(data.token);
        localStorage.setItem('omnivault_jwt', data.token);
      } else {
        console.error('Failed to boot anonymous JWT session.');
      }
    } catch (err) {
      console.error('Error during automatic session verifyOrCreate', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // On page load, verify or create session anonymously (No login/register obstructive screens required)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    verifyOrCreateSession();
  }, [verifyOrCreateSession]);

  // Fetch list of currently active inline peers from server
  const refreshUsersDirectory = useCallback(async () => {
    const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('omnivault_jwt') : null);
    if (!activeToken) return;

    try {
      const res = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${activeToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setAllUsers(data.users || []);
      }
    } catch (err) {
      console.error('Error retrieving active peers directory', err);
    }
  }, [token]);

  // Dynamic interval polling (real-time presence list)
  useEffect(() => {
    if (!token || !user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshUsersDirectory();
    const interval = setInterval(refreshUsersDirectory, 1500);
    return () => clearInterval(interval);
  }, [token, user, refreshUsersDirectory]);

  // Allow custom display name modifications (synchronizes with server on change)
  const updateProfileName = async (newName: string) => {
    const activeToken = token || localStorage.getItem('omnivault_jwt');
    if (!activeToken) return;

    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({ fullName: newName })
      });
      if (res.ok) {
        localStorage.setItem('omnivault_full_name', newName);
        setUser(prev => prev ? { ...prev, fullName: newName } : null);
        refreshUsersDirectory();
      } else {
        throw new Error('Nije moguće promeniti naziv računara.');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  // Dummy login / signup wrappers to retain standard typescript dependencies cleanly
  const login = async (email: string, password: string) => {
    return Promise.resolve();
  };

  const signup = async (payload: any) => {
    return Promise.resolve();
  };

  // Safe session reset
  const logout = () => {
    if (token) {
      fetch('/api/signaling', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'clear' })
      }).catch(console.error);
    }
    const freshDeskId = generateRandomDeskId();
    const freshName = `Računar ${freshDeskId.slice(-3)}`;
    localStorage.setItem('omnivault_connection_id', freshDeskId);
    localStorage.setItem('omnivault_full_name', freshName);
    localStorage.removeItem('omnivault_jwt');
    verifyOrCreateSession(freshName);
  };

  const updateUserPermission = async (userId: string, fields: any) => {
    return Promise.resolve();
  };

  const stateVal: AuthState = {
    user,
    token,
    allUsers,
    loading,
    isAuthenticated: !!user,
    error,
  };

  const dispatchVal = {
    login,
    signup,
    logout,
    updateProfileName,
    updateUserPermission,
    refreshUsersDirectory,
    clearError,
  };

  return (
    <AuthStateContext.Provider value={stateVal}>
      <AuthDispatchContext.Provider value={dispatchVal}>
        {children}
      </AuthDispatchContext.Provider>
    </AuthStateContext.Provider>
  );
}

export function useAuthState() {
  const context = useContext(AuthStateContext);
  if (!context) throw new Error('useAuthState mora biti korišćen u okviru AuthProvider-a');
  return context;
}

export function useAuthDispatch() {
  const context = useContext(AuthDispatchContext);
  if (!context) throw new Error('useAuthDispatch mora biti korišćen u okviru AuthProvider-a');
  return context;
}
