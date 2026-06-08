import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { pb } from '../lib/pb';

export interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(
    pb.authStore.isValid ? (pb.authStore.record as unknown as AuthUser) : null
  );

  useEffect(() => {
    return pb.authStore.onChange((_, record) => {
      setUser(record ? (record as unknown as AuthUser) : null);
    });
  }, []);

  async function login(email: string, password: string) {
    const auth = await pb.collection('users').authWithPassword(email, password);
    setUser(auth.record as unknown as AuthUser);
  }

  async function register(email: string, password: string) {
    await pb.collection('users').create({ email, password, passwordConfirm: password });
    await login(email, password);
  }

  function logout() {
    pb.authStore.clear();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
