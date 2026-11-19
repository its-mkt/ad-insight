/**
 * 브라우저 저장소(localStorage·sessionStorage) 읽기·쓰기 — 저장소가 막힌 창(시크릿·차단)에서도 오류 없이 넘어간다.
 * 읽기는 실패하면 기본값, 쓰기·지우기는 실패해도 조용히 무시한다.
 */

/** 저장소 종류 — local(브라우저에 계속 남음) · session(이 탭에만) */
export type StoreKind = 'local' | 'session';

// 저장소 접근 자체가 막힌 창에서는 여기서 오류가 나므로 늘 try 안에서 부른다
const storeOf = (kind: StoreKind): Storage => (kind === 'session' ? sessionStorage : localStorage);

/** 저장된 문자열 — 없거나 읽지 못하면 null */
export function readString(key: string, kind: StoreKind = 'local'): string | null {
  try {
    return storeOf(kind).getItem(key);
  } catch {
    return null;
  }
}

/** 문자열을 저장한다 (실패는 무시) */
export function writeString(key: string, value: string, kind: StoreKind = 'local'): void {
  try {
    storeOf(kind).setItem(key, value);
  } catch {
    // 저장소가 막힌 창
  }
}

/** 저장된 값을 지운다 (실패는 무시) */
export function removeKey(key: string, kind: StoreKind = 'local'): void {
  try {
    storeOf(kind).removeItem(key);
  } catch {
    // 저장소가 막힌 창
  }
}

/** JSON 으로 저장된 값 — 없거나 빈 값이거나 읽기·해석에 실패하면 fallback (모양은 부르는 쪽이 확인한다) */
export function readJSON<T>(key: string, fallback: T, kind: StoreKind = 'local'): T {
  try {
    const raw = storeOf(kind).getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** 값을 JSON 으로 저장한다 (실패는 무시) */
export function writeJSON(key: string, value: unknown, kind: StoreKind = 'local'): void {
  try {
    storeOf(kind).setItem(key, JSON.stringify(value));
  } catch {
    // 저장소가 막힌 창
  }
}
