import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { UserProfile } from '../types/auth';

const SESSION_KEY = 'belinda-session';

interface AuthContextValue {
  profile: UserProfile | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<string | null>;
  signOut: () => void;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
  canAccessRegion: (region: string) => boolean;
  canAccessGroup: (group: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as UserProfile;
        setProfile(parsed);
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
    setLoading(false);
  }, []);

  const signIn = async (username: string, password: string): Promise<string | null> => {
    if (!supabase) return 'Supabase не настроен';

    // Сначала ищем пользователя по логину
    const { data: byUsername, error: err1 } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('username', username.trim())
      .maybeSingle();

    if (err1) return `Ошибка БД: ${err1.message}`;
    if (!byUsername) return `Пользователь «${username.trim()}» не найден в базе`;
    if (byUsername.password !== password) return 'Неверный пароль';
    if (!byUsername.is_active) return 'Аккаунт деактивирован. Обратитесь к администратору.';
    const data = byUsername;

    setProfile(data as UserProfile);
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch { /* noop */ }
    return null;
  };

  const signOut = () => {
    setProfile(null);
    try { localStorage.removeItem(SESSION_KEY); } catch { /* noop */ }
  };

  const refreshProfile = async () => {
    if (!profile || !supabase) return;
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', profile.id)
      .maybeSingle();
    if (data) {
      setProfile(data as UserProfile);
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch { /* noop */ }
    }
  };

  const isAdmin = profile?.role === 'admin';

  const canAccessRegion = (region: string): boolean => {
    if (!profile) return false;
    if (profile.role === 'admin') return true;
    if (!profile.allowed_regions || profile.allowed_regions.length === 0) return true;
    const norm = region.trim().toLowerCase();
    return profile.allowed_regions.some(r => r.trim().toLowerCase() === norm);
  };

  const canAccessGroup = (group: string): boolean => {
    if (!profile) return false;
    if (profile.role === 'admin') return true;
    if (!profile.allowed_groups || profile.allowed_groups.length === 0) return true;
    const norm = group.trim().toLowerCase();
    return profile.allowed_groups.some(g => g.trim().toLowerCase() === norm);
  };

  return (
    <AuthContext.Provider value={{ profile, loading, signIn, signOut, isAdmin, refreshProfile, canAccessRegion, canAccessGroup }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
