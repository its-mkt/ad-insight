import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  isDevAdmin?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isLoggedIn: boolean;
  loginWithPassword: (loginId: string, password: string) => Promise<{ error?: string }>;
  loginAsDevAdmin: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEV_ADMIN_KEY = 'adi_dev_admin_session';

// 아이디만 입력하면 이 도메인을 붙여 Supabase Auth 이메일로 사용 (계정은 Supabase 대시보드에서만 생성, 회원가입 없음)
const LOGIN_EMAIL_DOMAIN = 'gmail.com';

const toLoginEmail = (loginId: string) => {
  const id = loginId.trim().toLowerCase();
  return id.includes('@') ? id : `${id}@${LOGIN_EMAIL_DOMAIN}`;
};

const toAuthUser = (sessionUser: Session['user']): AuthUser => ({
  id: sessionUser.id,
  email: sessionUser.email || '',
  name: sessionUser.user_metadata?.name || sessionUser.email?.split('@')[0],
});

// 개발 서버 전용 테스트 세션 (운영 빌드에서는 무시)
const readDevSession = (): AuthUser | null => {
  if (!import.meta.env.DEV) return null;
  try {
    const dev = localStorage.getItem(DEV_ADMIN_KEY);
    return dev ? JSON.parse(dev) : null;
  } catch {
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // 예전 방식(코드 내장 비밀번호)으로 운영에 남은 로컬 세션 제거
    if (!import.meta.env.DEV) {
      try {
        localStorage.removeItem(DEV_ADMIN_KEY);
      } catch {
        // ignore
      }
    }

    // 1. Supabase Auth 세션 확인
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ? toAuthUser(session.user) : readDevSession());
      })
      // 세션 확인이 실패해도 로딩에 멈춰 있지 않게 비로그인으로 넘긴다
      .catch(() => setUser(readDevSession()))
      .finally(() => setLoading(false));

    // 2. Supabase Auth 상태 변화 리스너
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? toAuthUser(session.user) : readDevSession());
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loginWithPassword = async (loginId: string, password: string): Promise<{ error?: string }> => {
    if (!loginId.trim() || !password) {
      return { error: '아이디와 비밀번호를 입력해주세요.' };
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: toLoginEmail(loginId),
      password,
    });
    if (error) {
      console.error('Login error:', error.message);
      return { error: '아이디 또는 비밀번호가 일치하지 않습니다.' };
    }
    return {};
  };

  const loginAsDevAdmin = () => {
    const devUser: AuthUser = {
      id: 'dev_admin_local',
      email: 'admin@itket.com',
      name: '관리자 (Admin)',
      isDevAdmin: true,
    };
    try {
      localStorage.setItem(DEV_ADMIN_KEY, JSON.stringify(devUser));
    } catch {
      // ignore
    }
    setUser(devUser);
  };

  const logout = async () => {
    try {
      localStorage.removeItem(DEV_ADMIN_KEY);
    } catch {
      // ignore
    }
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isLoggedIn: !!user,
        loginWithPassword,
        loginAsDevAdmin,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
