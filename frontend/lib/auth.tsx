'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setToken } from './api';
import type { User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (creds: { email?: string; phone?: string; password: string }) => Promise<User>;
  register: (data: { email?: string; phone?: string; password: string; name?: string }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const { user } = await api<{ user: User }>('/auth/me');
      setUser(user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login: AuthState['login'] = async (creds) => {
    const { accessToken, user } = await api<{ accessToken: string; user: User }>('/auth/login', {
      method: 'POST',
      body: creds,
    });
    setToken(accessToken);
    setUser(user);
    return user;
  };

  const register: AuthState['register'] = async (data) => {
    const { accessToken, user } = await api<{ accessToken: string; user: User }>('/auth/register', {
      method: 'POST',
      body: data,
    });
    setToken(accessToken);
    setUser(user);
    return user;
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// Home route per role.
export function homeForRole(role: User['role']): string {
  switch (role) {
    case 'ADMIN': return '/admin';
    case 'OFFICIAL': return '/official';
    case 'AUTHORITY': return '/official';
    default: return '/citizen';
  }
}
