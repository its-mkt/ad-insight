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

/** 회원가입 및 열람 요청 때 함께 적는 값 */
export interface SignUpInfo {
  name: string;
  team: string;
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
  /** 이메일로 6자리 인증번호를 보낸다 — signup 을 주면 처음 쓰는 이메일도 계정을 만든다(회원가입), 없으면 가입된 이메일만 */
  sendEmailCode: (email: string, signup?: SignUpInfo) => Promise<{ error?: string }>;
  /** 이메일(gmail 은 아이디만)·비밀번호로 로그인한다 — 비밀번호가 있는 계정(관리자 등)만 */
  loginWithPassword: (loginId: string, password: string) => Promise<{ error?: string }>;
  /** 인증번호로 로그인한다 — signup 이면 로그인 직후 관리자에게 열람 승인을 요청한다 */
  verifyEmailCode: (email: string, code: string, signup?: SignUpInfo) => Promise<{ error?: string }>;
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

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

const toAuthUser = (sessionUser: Session['user']): AuthUser => ({
  id: sessionUser.id,
  email: sessionUser.email || '',
  name: sessionUser.user_metadata?.name || sessionUser.email?.split('@')[0],
  team: sessionUser.user_metadata?.team,
});

/** 인증번호 보내기·확인 오류 → 화면 문구 */
const codeErrorText = (message: string): string => {
  if (/signups not allowed|user not found/i.test(message)) return '가입된 이메일이 아닙니다. 아래 "회원가입 및 열람 요청"을 먼저 해 주세요.';
  if (/expired|invalid/i.test(message)) return '인증번호가 맞지 않거나 시간이 지났습니다. 다시 받아 주세요.';
  if (/rate|too many|seconds/i.test(message)) return '요청이 많아 잠시 막혔습니다. 1분 뒤 다시 시도해 주세요.';
  return '처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
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

  const sendEmailCode = async (email: string, signup?: SignUpInfo): Promise<{ error?: string }> => {
    const mail = toLoginEmail(email);
    if (!isEmail(mail)) return { error: '이메일 주소를 확인해 주세요.' };
    if (signup && (!signup.name.trim() || !signup.team.trim())) return { error: '이름과 소속을 입력해 주세요.' };
    const { error } = await supabase.auth.signInWithOtp({
      email: mail,
      options: {
        shouldCreateUser: !!signup,
        data: signup ? { name: signup.name.trim(), team: signup.team.trim() } : undefined,
        emailRedirectTo: window.location.origin + import.meta.env.BASE_URL,
      },
    });
    if (error) {
      console.error('Send code error:', error.message);
      return { error: codeErrorText(error.message) };
    }
    return {};
  };

  const loginWithPassword = async (loginId: string, password: string): Promise<{ error?: string }> => {
    if (!loginId.trim() || !password) return { error: '이메일과 비밀번호를 입력해 주세요.' };
    const { error } = await supabase.auth.signInWithPassword({ email: toLoginEmail(loginId), password });
    if (error) {
      console.error('Login error:', error.message);
      if (/rate|too many/i.test(error.message)) return { error: '요청이 많아 잠시 막혔습니다. 1분 뒤 다시 시도해 주세요.' };
      return { error: '이메일 또는 비밀번호가 맞지 않습니다. 비밀번호가 없는 계정은 인증번호로 로그인해 주세요.' };
    }
    return {};
  };

  const verifyEmailCode = async (email: string, code: string, signup?: SignUpInfo): Promise<{ error?: string }> => {
    const token = code.replace(/\D/g, '');
    if (token.length < 6) return { error: '메일로 받은 6자리 인증번호를 입력해 주세요.' };
    const { data, error } = await supabase.auth.verifyOtp({ email: toLoginEmail(email), token, type: 'email' });
    if (error || !data.session) {
      console.error('Verify code error:', error?.message);
      return { error: codeErrorText(error?.message || 'invalid') };
    }
    if (!signup) return {};
    // 인증된 로그인 토큰으로 열람 승인을 요청한다 — 웹앱이 토큰의 이메일로 명단에 올린다
    const req = await postMemberAction({ action: 'requestAccess', access_token: data.session.access_token, email: data.session.user.email, name: signup.name.trim(), team: signup.team.trim() }).catch(() => ({ error: 'network' }));
    if (req.error) return { error: req.error === 'too_many' ? '요청이 많아 잠시 막혔습니다. 한 시간 뒤 다시 시도해 주세요.' : '로그인은 됐지만 열람 요청을 보내지 못했습니다. 잠시 뒤 다시 요청해 주세요.' };
    refreshRole();
    return {};
  };

  const requestAccess = async (name: string, team: string): Promise<{ error?: string }> => {
    if (!user?.email || !name.trim() || !team.trim()) return { error: '이름과 소속을 입력해 주세요.' };
    const req = await postMemberAction({ action: 'requestAccess', access_token: await currentAccessToken(), email: user.email, name: name.trim(), team: team.trim() }).catch(() => ({ error: 'network' }));
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
        sendEmailCode,
        loginWithPassword,
        verifyEmailCode,
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
