import { type AccessRole, canViewRole } from './access';
import { readJSON, removeKey, writeJSON } from '../utils/storage';

/** 계정별 마지막 열람 권한 — 다음 접속 때 권한 확인(2~4초)을 기다리지 않고 바로 연다. 12시간 지나면 다시 기다린다 */
const ROLE_CACHE_KEY = 'adi_access_role';
const ROLE_CACHE_MS = 12 * 3600 * 1000;

/** 이 계정이 최근에 받은 볼 수 있는 권한 — 없거나 지났으면 null */
export const readRoleCache = (uid: string): AccessRole | null => {
  const c = readJSON<{ uid: string; role: AccessRole; at: number } | null>(ROLE_CACHE_KEY, null);
  return c && c.uid === uid && Date.now() - c.at < ROLE_CACHE_MS && canViewRole(c.role) ? c.role : null;
};

/** 볼 수 있는 권한만 기억한다 (승인 대기·거절·해제는 매번 확인) — 저장 공간을 못 쓰면 매번 확인한다 */
export const writeRoleCache = (uid: string, role: AccessRole | null): void => {
  if (role && canViewRole(role)) writeJSON(ROLE_CACHE_KEY, { uid, role, at: Date.now() });
  else removeKey(ROLE_CACHE_KEY);
};

/** 개발 서버 전용 테스트 세션 저장 키 */
export const DEV_ADMIN_KEY = 'adi_dev_admin_session';

// 개발 서버 전용 테스트 세션 (운영 빌드에서는 무시) — 타입은 부르는 쪽(AuthUser)이 정한다
export const readDevSession = <T>(): T | null => {
  if (!import.meta.env.DEV) return null;
  return readJSON<T | null>(DEV_ADMIN_KEY, null);
};
