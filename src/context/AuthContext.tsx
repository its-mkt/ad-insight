import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { ACCESS_CHANGED_EVENT, type AccessRole, canViewRole, currentAccessToken, fetchAccessRole, postMemberAction } from '../lib/access';
import { clearCachedPayloads } from '../utils/payloadCache';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  /** 가입 요청 때 적은 소속(팀) */
  team?: string;
  avatarUrl?: string;
  isDevAdmin?: boolean;
}

/** 가입 요청 입력값 */
export interface SignUpInput {
  name: string;
  team: string;
  email: string;
  password: string;
}

interface AuthContextType {
  user: AuthUser | null;
  /** 저장된 로그인과 열람 권한을 확인하는 중 */
  loading: boolean;
  /** 관리자로 로그인했는지 — 원문 데이터·설정 화면이 열린다 (예전부터 쓰던 이름이라 그대로 둔다) */
  isLoggedIn: boolean;
  /** 로그인했는지 (권한과 상관없이) */
  isSignedIn: boolean;
  /** 열람 권한 — 확인 전이거나 확인에 실패하면 null */
  role: AccessRole | null;
  /** 데이터를 볼 수 있는지 (관리자·승인된 계정) */
  canView: boolean;
  loginWithPassword: (loginId: string, password: string) => Promise<{ error?: string }>;
  /** 가입 + 관리자에게 승인 요청. 메일 인증이 켜져 있으면 needsEmailConfirm */
  signUp: (input: SignUpInput) => Promise<{ error?: string; needsEmailConfirm?: boolean }>;
  /** 로그인한 계정으로 승인을 (다시) 요청한다 — 요청 기록이 없거나 거절·해제된 경우 */
  requestAccess: (name: string, team: string) => Promise<{ error?: string }>;
  /** 열람 권한을 다시 확인한다 (승인됐는지 볼 때) */
  refreshRole: () => void;
  loginAsDevAdmin: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEV_ADMIN_KEY = 'adi_dev_admin_session';

// 아이디만 입력하면 이 도메인을 붙여 Supabase Auth 이메일로 사용 (예전 관리자 계정 호환)
const LOGIN_EMAIL_DOMAIN = 'gmail.com';

const toLoginEmail = (loginId: string) => {
  const id = loginId.trim().toLowerCase();
  return id.includes('@') ? id : `${id}@${LOGIN_EMAIL_DOMAIN}`;
};

const toAuthUser = (sessionUser: Session['user']): AuthUser => ({
  id: sessionUser.id,
  email: sessionUser.email || '',
  name: sessionUser.user_metadata?.name || sessionUser.email?.split('@')[0],
  team: sessionUser.user_metadata?.team,
});

/** Supabase 가입 오류 → 화면 문구 */
const signUpErrorText = (message: string): string => {
  if (/password/i.test(message)) return '비밀번호는 6자 이상으로 입력해 주세요.';
  if (/rate|too many|seconds/i.test(message)) return '요청이 많아 잠시 막혔습니다. 몇 분 뒤 다시 시도해 주세요.';
  if (/invalid.*email|email.*invalid/i.test(message)) return '이메일 주소를 확인해 주세요.';
  return '가입하지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
};

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
  const [sessionLoading, setSessionLoading] = useState<boolean>(true);
  const [role, setRole] = useState<AccessRole | null>(null);
  const [roleLoading, setRoleLoading] = useState<boolean>(true);
  const [roleTick, setRoleTick] = useState(0);
  const refreshRole = useCallback(() => setRoleTick((n) => n + 1), []);

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
      .finally(() => setSessionLoading(false));

    // 2. Supabase Auth 상태 변화 리스너
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? toAuthUser(session.user) : readDevSession());
      setSessionLoading(false);
    });

    // 데이터를 받다가 권한이 없다는 답을 받으면 다시 확인한다
    window.addEventListener(ACCESS_CHANGED_EVENT, refreshRole);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener(ACCESS_CHANGED_EVENT, refreshRole);
    };
  }, [refreshRole]);

  // 3. 계정이 바뀌거나 다시 확인을 요청하면 열람 권한을 웹앱에 묻는다 (토큰 갱신처럼 계정이 그대로면 묻지 않는다)
  const userKey = user ? `${user.id}|${user.isDevAdmin ? 'dev' : ''}` : '';
  useEffect(() => {
    if (sessionLoading) return;
    let alive = true;
    if (!userKey) {
      setRole('guest');
      setRoleLoading(false);
      return;
    }
    if (userKey.endsWith('|dev')) {
      setRole('admin');
      setRoleLoading(false);
      return;
    }
    setRoleLoading(true);
    currentAccessToken()
      .then(fetchAccessRole)
      .then(async (next) => {
        if (!alive) return;
        // 만료된 로그인은 지우고 로그인 화면으로 (setTimeout: 인증 콜백 안에서 Supabase 를 다시 부르면 멈출 수 있다)
        if (next === 'invalid') setTimeout(() => supabase.auth.signOut(), 0);
        setRole(next);
      })
      .finally(() => alive && setRoleLoading(false));
    return () => {
      alive = false;
    };
  }, [sessionLoading, userKey, roleTick]);

  // 볼 권한이 없으면 이 브라우저에 남은 지난 응답도 지운다
  const canView = canViewRole(role);
  useEffect(() => {
    if (!roleLoading && role && !canView) void clearCachedPayloads();
  }, [roleLoading, role, canView]);

  const loginWithPassword = async (loginId: string, password: string): Promise<{ error?: string }> => {
    if (!loginId.trim() || !password) {
      return { error: '이메일과 비밀번호를 입력해주세요.' };
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: toLoginEmail(loginId),
      password,
    });
    if (error) {
      console.error('Login error:', error.message);
      if (/confirm/i.test(error.message)) return { error: '가입 메일의 인증 링크를 먼저 눌러 주세요.' };
      return { error: '이메일 또는 비밀번호가 일치하지 않습니다.' };
    }
    return {};
  };

  const signUp = async ({ name, team, email, password }: SignUpInput): Promise<{ error?: string; needsEmailConfirm?: boolean }> => {
    const mail = email.trim().toLowerCase();
    if (!name.trim() || !team.trim() || !mail || !password) return { error: '이름·소속·이메일·비밀번호를 모두 입력해 주세요.' };
    const { data, error } = await supabase.auth.signUp({
      email: mail,
      password,
      options: { data: { name: name.trim(), team: team.trim() }, emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    });
    if (error) {
      console.error('Sign-up error:', error.message);
      return { error: signUpErrorText(error.message) };
    }
    const req = await postMemberAction({ action: 'requestAccess', email: mail, name: name.trim(), team: team.trim() }).catch(() => ({ error: 'network' }));
    if (req.error) return { error: req.error === 'too_many' ? '요청이 많아 잠시 막혔습니다. 한 시간 뒤 다시 시도해 주세요.' : '가입은 됐지만 승인 요청을 보내지 못했습니다. 로그인한 뒤 다시 요청해 주세요.' };
    if (!data.session) return { needsEmailConfirm: true };
    return {};
  };

  const requestAccess = async (name: string, team: string): Promise<{ error?: string }> => {
    if (!user?.email || !name.trim() || !team.trim()) return { error: '이름과 소속을 입력해 주세요.' };
    const req = await postMemberAction({ action: 'requestAccess', email: user.email, name: name.trim(), team: team.trim() }).catch(() => ({ error: 'network' }));
    if (req.error) return { error: '승인 요청을 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.' };
    refreshRole();
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
    await clearCachedPayloads();
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading: sessionLoading || roleLoading,
        isLoggedIn: role === 'admin',
        isSignedIn: !!user,
        role,
        canView,
        loginWithPassword,
        signUp,
        requestAccess,
        refreshRole,
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
