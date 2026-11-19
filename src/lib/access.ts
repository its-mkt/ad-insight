import { supabase } from './supabase';
import { getCfg } from '../hooks/useDashboardData';

/**
 * 열람 권한 — 수집기 웹앱(Apps Script)이 로그인 토큰과 데이터 시트의 admins·members 명단으로 판정한다.
 * admin(최고 관리자) · manager(관리자) · member(승인됨) · pending(승인 대기) · rejected(거절) · revoked(해제) · none(가입 요청 없음)
 * · invalid(토큰 만료·오류) · guest(로그인 안 함)
 */
export type AccessRole = 'admin' | 'manager' | 'member' | 'pending' | 'rejected' | 'revoked' | 'none' | 'invalid' | 'guest';

/** 데이터를 받을 수 있는 권한인지 */
export const canViewRole = (role: AccessRole | null): boolean => role === 'admin' || role === 'manager' || role === 'member';

/** 원문 데이터·설정 화면(계정 관리·이용 현황·데이터 연결)을 받는 등급 — 최고 관리자·관리자 */
export const isStaffRole = (role: AccessRole | null): boolean => role === 'admin' || role === 'manager';

/** 데이터를 받다가 권한이 없다고 답하면(승인 해제 등) 보내는 알림 — AuthContext 가 권한을 다시 확인한다 */
export const ACCESS_CHANGED_EVENT = 'adi:access-changed';

/** 지금 로그인 토큰 (없으면 '') */
export async function currentAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

/** 웹앱 주소 뒤에 로그인 토큰을 붙인다 — 토큰이 없으면 주소 그대로 */
export const withAccessToken = (url: string, token: string): string =>
  token ? `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}` : url;

/** 로그인 토큰의 권한만 묻는다 (데이터 없이 빠르게 답한다). 확인에 실패하면 null */
export async function fetchAccessRole(token: string): Promise<AccessRole | null> {
  if (!token) return 'guest';
  try {
    const { url } = getCfg('itket');
    const res = await fetch(withAccessToken(`${url}${url.includes('?') ? '&' : '?'}whoami=1`, token));
    const j = (await res.json()) as { role?: AccessRole };
    return j.role || null;
  } catch {
    return null;
  }
}

/** 웹앱에 회원 관련 요청을 보낸다 (가입 요청·명단·승인) */
export async function postMemberAction<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T & { error?: string }> {
  const { url } = getCfg('itket');
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
  return (await res.json()) as T & { error?: string };
}
