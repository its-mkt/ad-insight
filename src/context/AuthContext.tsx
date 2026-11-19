import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { ACCESS_CHANGED_EVENT, type AccessRole, canViewRole, isStaffRole, currentAccessToken, fetchAccessRole, postMemberAction } from '../lib/access';
import { clearCachedPayloads } from '../utils/payloadCache';
import { squareJpeg } from '../utils/image';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  /** 회사 (가입 요청·내 계정 설정에서 정한다 — 옛 가입자는 비어 있을 수 있다) */
  company?: string;
  /** 가입 요청 때 적은 팀 (옛 가입자는 '회사·팀'을 한 칸에 적었다) */
  team?: string;
  /** 프로필 사진 주소 (Supabase Storage avatars) */
  avatarUrl?: string;
  isDevAdmin?: boolean;
}

/** 회원가입 2단계(정보 입력)에서 받는 값 — 이메일 인증을 마친 뒤 계정에 정한다 */
export interface SignUpInfo {
  name: string;
  company: string;
  team: string;
  /** 로그인에 쓸 비밀번호 */
  password: string;
}

/** 내 계정 설정에서 고치는 기본 정보 */
export interface ProfileInfo {
  name: string;
  company: string;
  team: string;
}

/** 계정 변경 결과 — error: 저장 실패 · warning: 계정에는 저장됐지만 덧붙은 작업(명단 반영 등)이 실패 */
export interface AccountResult {
  error?: string;
  warning?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  /** 저장된 로그인과 열람 권한을 확인하는 중 */
  loading: boolean;
  /** 최고 관리자·관리자로 로그인했는지 — 원문 데이터·설정 화면이 열린다 (예전부터 쓰던 이름이라 그대로 둔다) */
  isLoggedIn: boolean;
  /** 최고 관리자인지 — 견적 원본 관리 화면·계정 등급 변경·계정 삭제 */
  isSuperAdmin: boolean;
  /** 로그인했는지 (권한과 상관없이) */
  isSignedIn: boolean;
  /** 열람 권한 — 확인 전이거나 확인에 실패하면 null */
  role: AccessRole | null;
  /** 데이터를 볼 수 있는지 (관리자·승인된 계정) */
  canView: boolean;
  /** 이메일로 6자리 인증번호를 보낸다 — signup 이면 처음 쓰는 이메일도 계정을 만든다(회원가입 1단계), 아니면 가입된 이메일만(비밀번호 찾기) */
  sendEmailCode: (email: string, signup?: boolean) => Promise<{ error?: string; /** 회원가입인데 이미 가입된 이메일이라 보내지 않았다 */ registered?: boolean }>;
  /** 이메일(gmail 은 아이디만)·비밀번호로 로그인한다 */
  loginWithPassword: (loginId: string, password: string) => Promise<{ error?: string }>;
  /** 회원가입 1단계 — 인증번호를 확인한다. 확인되면 로그인된 채로 2단계(정보 입력)로 넘어간다 (signupInProgress) */
  verifyEmailCode: (email: string, code: string) => Promise<{ error?: string }>;
  /** 회원가입 2단계 — 이름·소속·비밀번호를 정하고 관리자에게 열람 승인을 요청한다 */
  completeSignup: (info: SignUpInfo) => Promise<{ error?: string }>;
  /** 회원가입 도중(인증은 됐고 정보 입력 전) — 접속 화면이 승인 요청 화면으로 넘어가지 않고 가입 폼을 유지한다 */
  signupInProgress: boolean;
  /** 회원가입을 그만둔다 (인증으로 로그인된 상태도 정리) */
  cancelSignup: () => Promise<void>;
  /** 비밀번호 찾기 — 메일 인증번호를 확인한 뒤 새 비밀번호로 바꾸고 로그인한다 */
  resetPasswordWithCode: (email: string, code: string, newPassword: string) => Promise<{ error?: string }>;
  /** 로그인한 계정으로 승인을 (다시) 요청한다 — 요청 기록이 없거나 거절·해제된 경우 */
  requestAccess: (name: string, company: string, team: string) => Promise<{ error?: string }>;
  /** 내 계정 설정 — 이름·회사·팀을 바꾸고 관리자 명단(members 탭)에도 반영한다 */
  updateProfile: (info: ProfileInfo) => Promise<AccountResult>;
  /** 내 계정 설정 — 현재 비밀번호를 확인한 뒤 새 비밀번호로 바꾼다 */
  changePassword: (current: string, next: string) => Promise<AccountResult>;
  /** 내 계정 설정 — 프로필 사진을 올린다 (null 이면 지운다) */
  updateAvatar: (file: Blob | null) => Promise<AccountResult>;
  /** 열람 권한을 다시 확인한다 (승인됐는지 볼 때) */
  refreshRole: () => void;
  loginAsDevAdmin: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEV_ADMIN_KEY = 'adi_dev_admin_session';
/** 회원가입 2단계 진행 중 표시 (sessionStorage) */
const SIGNUP_STEP_KEY = 'adi_signup_step';

/** 계정별 마지막 열람 권한 — 다음 접속 때 권한 확인(2~4초)을 기다리지 않고 바로 연다. 12시간 지나면 다시 기다린다 */
const ROLE_CACHE_KEY = 'adi_access_role';
const ROLE_CACHE_MS = 12 * 3600 * 1000;
const readRoleCache = (uid: string): AccessRole | null => {
  try {
    const c = JSON.parse(localStorage.getItem(ROLE_CACHE_KEY) || 'null') as { uid: string; role: AccessRole; at: number } | null;
    return c && c.uid === uid && Date.now() - c.at < ROLE_CACHE_MS && canViewRole(c.role) ? c.role : null;
  } catch {
    return null;
  }
};
/** 볼 수 있는 권한만 기억한다 (승인 대기·거절·해제는 매번 확인) */
const writeRoleCache = (uid: string, role: AccessRole | null) => {
  try {
    if (role && canViewRole(role)) localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ uid, role, at: Date.now() }));
    else localStorage.removeItem(ROLE_CACHE_KEY);
  } catch {
    // 저장 공간을 못 쓰면 매번 확인한다
  }
};

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
  company: sessionUser.user_metadata?.company,
  team: sessionUser.user_metadata?.team,
  avatarUrl: sessionUser.user_metadata?.avatar_url || undefined,
});

/** 프로필 사진 저장소 (Supabase Storage, 공개 읽기 · 본인 폴더만 쓰기 — supabase/avatars.sql) */
const AVATAR_BUCKET = 'avatars';
const avatarPath = (uid: string) => `${uid}/avatar.jpg`;

/** 명단(members 탭)·알림의 소속 칸 — 회사와 팀을 '회사 · 팀' 한 칸으로 적는다 (회사가 없으면 팀만) */
const affiliationText = (company: string, team: string): string => (company.trim() ? `${company.trim()} · ${team.trim()}` : team.trim());

/** 개발용 테스트 계정은 Supabase 계정이 없어 바꿀 수 없다 */
const DEV_ACCOUNT_ERROR = '개발용 테스트 계정은 바꿀 수 없습니다. 실제 계정으로 로그인해 주세요.';

/** 이름·회사·팀 중 빈 칸이 있으면 안내 문구, 셋 다 있으면 빈 문자열 */
const missingProfileText = (name: string, company: string, team: string): string =>
  !name.trim() || !company.trim() || !team.trim() ? '이름·회사·팀을 모두 입력해 주세요.' : '';

/** 인증번호 보내기·확인 오류 → 화면 문구 */
const codeErrorText = (message: string): string => {
  if (/signups not allowed|user not found/i.test(message)) return '가입된 이메일이 아닙니다. 아래 "회원가입 및 열람 요청"을 먼저 해 주세요.';
  if (/expired|invalid/i.test(message)) return '인증번호가 맞지 않거나 시간이 지났습니다. 다시 받아 주세요.';
  if (/rate|too many|seconds/i.test(message)) return '요청이 많아 잠시 막혔습니다. 1분 뒤 다시 시도해 주세요.';
  return '처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
};

/** 비밀번호 정하기(updateUser) 오류 → 화면 문구 */
const passwordErrorText = (message: string): string => {
  if (/different from the old|same/i.test(message)) return '지금 쓰는 비밀번호와 다른 비밀번호로 정해 주세요.';
  if (/weak|short|at least|characters/i.test(message)) return '비밀번호가 너무 쉽거나 짧습니다. 6자 이상으로 다시 정해 주세요.';
  return '비밀번호를 정하지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
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
  // 회원가입 도중 표시 — 2단계(정보 입력)에서 새로 고침해도 이어서 하도록 이 탭(sessionStorage)에 남긴다
  const [signupInProgress, setSignupInProgressState] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SIGNUP_STEP_KEY) === '1';
    } catch {
      return false;
    }
  });
  const setSignupInProgress = useCallback((on: boolean) => {
    setSignupInProgressState(on);
    try {
      if (on) sessionStorage.setItem(SIGNUP_STEP_KEY, '1');
      else sessionStorage.removeItem(SIGNUP_STEP_KEY);
    } catch {
      // 저장하지 못하면 새로 고침 때 승인 요청 화면으로 간다
    }
  }, []);
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
    } = supabase.auth.onAuthStateChange((event, session) => {
      // 로그아웃·세션 만료면 남은 가입 도중 표시를 지운다 (비로그인에게 2단계 폼이 보이지 않게)
      if (event === 'SIGNED_OUT') setSignupInProgress(false);
      setUser(session?.user ? toAuthUser(session.user) : readDevSession());
      setSessionLoading(false);
    });

    // 데이터를 받다가 권한이 없다는 답을 받으면 다시 확인한다
    window.addEventListener(ACCESS_CHANGED_EVENT, refreshRole);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener(ACCESS_CHANGED_EVENT, refreshRole);
    };
  }, [refreshRole, setSignupInProgress]);

  // 3. 계정이 바뀌거나 다시 확인을 요청하면 열람 권한을 웹앱에 묻는다 (토큰 갱신처럼 계정이 그대로면 묻지 않는다).
  //    웹앱 확인은 2~4초 걸리므로, 이 계정이 최근에 받은 권한이 있으면 그 권한으로 바로 화면을 열고 뒤에서 다시 확인한다.
  //    데이터는 웹앱이 토큰으로 따로 막으므로 기억한 권한이 틀려도 데이터가 새지 않는다 (해제되면 다시 확인 후 잠김)
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
    const uid = userKey.split('|')[0];
    const remembered = readRoleCache(uid);
    if (remembered) {
      setRole(remembered);
      setRoleLoading(false);
    } else setRoleLoading(true);
    currentAccessToken()
      .then(fetchAccessRole)
      .then((next) => {
        if (!alive) return;
        // 만료된 로그인은 지우고 로그인 화면으로 (setTimeout: 인증 콜백 안에서 Supabase 를 다시 부르면 멈출 수 있다)
        if (next === 'invalid') setTimeout(() => supabase.auth.signOut(), 0);
        // 확인에 실패(null)했는데 기억한 권한이 있으면 그대로 둔다 — 웹앱 일시 장애로 잠기지 않게
        if (next === null && remembered) return;
        setRole(next);
        writeRoleCache(uid, next);
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

  const sendEmailCode = async (email: string, signup = false): Promise<{ error?: string; registered?: boolean }> => {
    const mail = toLoginEmail(email);
    if (!isEmail(mail)) return { error: '이메일 주소를 확인해 주세요.' };
    // 회원가입이면 인증번호를 보내기 전에 이미 가입된 이메일인지 본다 — 확인이 안 되면(함수 없음·네트워크) 막지 않고 보낸다
    if (signup) {
      const reg = await supabase.rpc('email_registered', { p_email: mail });
      if (reg.error) console.error('Check registered error:', reg.error.message);
      else if (reg.data === true) return { error: '이미 가입된 이메일입니다. 로그인하거나 비밀번호를 찾아 주세요.', registered: true };
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: mail,
      options: { shouldCreateUser: signup, emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
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
      return { error: '이메일 또는 비밀번호가 맞지 않습니다. 잊으셨으면 "비밀번호를 잊으셨나요?"에서 새로 정해 주세요.' };
    }
    return {};
  };

  const verifyEmailCode = async (email: string, code: string): Promise<{ error?: string }> => {
    const token = code.replace(/\D/g, '');
    if (token.length < 6) return { error: '메일로 받은 6자리 인증번호를 입력해 주세요.' };
    // 인증되면 곧바로 로그인 상태가 되므로, 그 전에 '가입 도중'으로 표시해 접속 화면이 가입 폼을 그대로 두게 한다
    setSignupInProgress(true);
    const { data, error } = await supabase.auth.verifyOtp({ email: toLoginEmail(email), token, type: 'email' });
    if (error || !data.session) {
      setSignupInProgress(false);
      console.error('Verify code error:', error?.message);
      return { error: codeErrorText(error?.message || 'invalid') };
    }
    return {};
  };

  const completeSignup = async ({ name, company, team, password }: SignUpInfo): Promise<{ error?: string }> => {
    const missing = missingProfileText(name, company, team);
    if (missing) return { error: missing };
    if (!password) return { error: '비밀번호를 입력해 주세요.' };
    if (password.length < 6) return { error: '비밀번호는 6자 이상으로 정해 주세요.' };
    // 인증으로 로그인된 세션에 비밀번호·이름·소속을 정한다 — 다음부터 비밀번호로 로그인한다
    const pw = await supabase.auth.updateUser({ password, data: { name: name.trim(), company: company.trim(), team: team.trim() } });
    if (pw.error) {
      console.error('Set password error:', pw.error.message);
      return { error: passwordErrorText(pw.error.message) };
    }
    // 인증된 로그인 토큰으로 열람 승인을 요청한다 — 웹앱이 토큰의 이메일로 명단에 올린다
    const token = await currentAccessToken();
    const req = await postMemberAction({ action: 'requestAccess', access_token: token, email: pw.data.user?.email, name: name.trim(), team: affiliationText(company, team) }).catch(() => ({ error: 'network' }));
    if (req.error) return { error: req.error === 'too_many' ? '요청이 많아 잠시 막혔습니다. 한 시간 뒤 다시 시도해 주세요.' : '열람 요청을 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.' };
    setSignupInProgress(false);
    refreshRole();
    return {};
  };

  const cancelSignup = async () => {
    setSignupInProgress(false);
    await supabase.auth.signOut();
  };

  const resetPasswordWithCode = async (email: string, code: string, newPassword: string): Promise<{ error?: string }> => {
    const token = code.replace(/\D/g, '');
    if (token.length < 6) return { error: '메일로 받은 6자리 인증번호를 입력해 주세요.' };
    if (newPassword.length < 6) return { error: '새 비밀번호는 6자 이상으로 정해 주세요.' };
    const { data, error } = await supabase.auth.verifyOtp({ email: toLoginEmail(email), token, type: 'email' });
    if (error || !data.session) {
      console.error('Verify code error:', error?.message);
      return { error: codeErrorText(error?.message || 'invalid') };
    }
    const pw = await supabase.auth.updateUser({ password: newPassword });
    if (pw.error) {
      console.error('Reset password error:', pw.error.message);
      return { error: passwordErrorText(pw.error.message) + ' (로그인은 됐습니다)' };
    }
    return {};
  };

  const requestAccess = async (name: string, company: string, team: string): Promise<{ error?: string }> => {
    const missing = missingProfileText(name, company, team);
    if (!user?.email || missing) return { error: missing || '로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.' };
    const req = await postMemberAction({ action: 'requestAccess', access_token: await currentAccessToken(), email: user.email, name: name.trim(), team: affiliationText(company, team) }).catch(() => ({ error: 'network' }));
    if (req.error) return { error: '승인 요청을 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.' };
    refreshRole();
    return {};
  };

  const updateProfile = async ({ name, company, team }: ProfileInfo): Promise<AccountResult> => {
    if (!user) return { error: '로그인이 필요합니다.' };
    if (user.isDevAdmin) return { error: DEV_ACCOUNT_ERROR };
    const next = { name: name.trim().slice(0, 40), company: company.trim().slice(0, 40), team: team.trim().slice(0, 40) };
    if (!next.name || !next.company || !next.team) return { error: '이름·회사·팀을 모두 입력해 주세요.' };
    const res = await supabase.auth.updateUser({ data: next });
    if (res.error) {
      console.error('Update profile error:', res.error.message);
      return { error: '저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.' };
    }
    // 관리자가 보는 명단에도 같은 이름·소속을 적는다 — 실패해도 계정에는 저장돼 있다
    const sync = await postMemberAction({ action: 'updateProfile', access_token: await currentAccessToken(), name: next.name, team: affiliationText(next.company, next.team) }).catch(() => ({ error: 'network' }));
    if (sync.error) {
      console.warn('Profile sync error:', sync.error);
      return { warning: '계정에는 저장됐지만 관리자 명단에는 아직 반영되지 않았습니다. 잠시 뒤 한 번 더 저장해 주세요.' };
    }
    return {};
  };

  const changePassword = async (current: string, next: string): Promise<AccountResult> => {
    if (!user?.email) return { error: '로그인이 필요합니다.' };
    if (user.isDevAdmin) return { error: DEV_ACCOUNT_ERROR };
    if (!current) return { error: '현재 비밀번호를 입력해 주세요.' };
    if (next.length < 6) return { error: '새 비밀번호는 6자 이상으로 정해 주세요.' };
    if (current === next) return { error: '지금 쓰는 비밀번호와 다른 비밀번호로 정해 주세요.' };
    // 자리를 비운 사이 남이 바꾸지 못하게 현재 비밀번호를 먼저 확인한다 (같은 계정으로 다시 로그인)
    const check = await supabase.auth.signInWithPassword({ email: user.email, password: current });
    if (check.error) {
      console.error('Check password error:', check.error.message);
      if (/rate|too many/i.test(check.error.message)) return { error: '요청이 많아 잠시 막혔습니다. 1분 뒤 다시 시도해 주세요.' };
      return { error: '현재 비밀번호가 맞지 않습니다. 잊으셨으면 로그아웃한 뒤 "비밀번호를 잊으셨나요?"에서 새로 정해 주세요.' };
    }
    const pw = await supabase.auth.updateUser({ password: next });
    if (pw.error) {
      console.error('Change password error:', pw.error.message);
      return { error: passwordErrorText(pw.error.message) };
    }
    return {};
  };

  const updateAvatar = async (file: Blob | null): Promise<AccountResult> => {
    if (!user) return { error: '로그인이 필요합니다.' };
    if (user.isDevAdmin) return { error: DEV_ACCOUNT_ERROR };
    const bucket = supabase.storage.from(AVATAR_BUCKET);
    const path = avatarPath(user.id);
    if (!file) {
      const rm = await bucket.remove([path]);
      if (rm.error) console.warn('Remove avatar error:', rm.error.message); // 파일이 이미 없어도 계정에서는 지운다
      const res = await supabase.auth.updateUser({ data: { avatar_url: null } });
      return res.error ? { error: '사진을 지우지 못했습니다. 잠시 뒤 다시 시도해 주세요.' } : {};
    }
    let blob: Blob;
    try {
      blob = await squareJpeg(file);
    } catch {
      return { error: '사진을 읽지 못했습니다. JPG·PNG 같은 사진 파일을 골라 주세요.' };
    }
    const up = await bucket.upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
    if (up.error) {
      console.error('Upload avatar error:', up.error.message);
      if (/bucket not found/i.test(up.error.message)) return { error: '프로필 사진 저장소가 아직 준비되지 않았습니다. 관리자에게 문의해 주세요.' };
      return { error: '사진을 올리지 못했습니다. 잠시 뒤 다시 시도해 주세요.' };
    }
    // 같은 주소에 덮어쓰므로 바뀐 사진이 바로 보이게 버전을 붙인다
    const url = `${bucket.getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
    const res = await supabase.auth.updateUser({ data: { avatar_url: url } });
    return res.error ? { error: '사진을 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.' } : {};
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
    setSignupInProgress(false);
    try {
      localStorage.removeItem(DEV_ADMIN_KEY);
    } catch {
      // ignore
    }
    writeRoleCache('', null);
    await clearCachedPayloads();
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading: sessionLoading || roleLoading,
        isLoggedIn: isStaffRole(role),
        isSuperAdmin: role === 'admin',
        isSignedIn: !!user,
        role,
        canView,
        sendEmailCode,
        loginWithPassword,
        verifyEmailCode,
        completeSignup,
        signupInProgress: signupInProgress && !!user,
        cancelSignup,
        resetPasswordWithCode,
        requestAccess,
        updateProfile,
        changePassword,
        updateAvatar,
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
