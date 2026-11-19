import type { RawApiPayload, SiteId } from '../types/dashboard';
import { removeKey } from './storage';

/**
 * 마지막으로 받은 API 응답을 브라우저에 저장해 다음 방문 때 먼저 그린다.
 * 응답이 5MB를 넘어 localStorage 한도를 넘기므로 IndexedDB 에 둔다.
 * 계정마다 따로 저장하고 그 계정이 다시 로그인했을 때만 꺼낸다 — 로그아웃해도 지우지 않아 다시 로그인하면 바로 그린다
 * (2026-11-19 사용자 결정: 공용 PC 없음). 사이트마다 마지막 계정 하나만 남긴다.
 */
const DB_NAME = 'adi';
const STORE = 'cache';
const KEY = 'payload';
/** 사이트별 저장 키 앞부분 — 아이티켓은 예전 키 이름을 그대로 쓴다 */
const baseOf = (site: SiteId) => (site === 'itket' ? KEY : KEY + ':' + site);
/** 사이트·계정별 저장 키 */
const keyOf = (site: SiteId, uid: string) => `${baseOf(site)}@${uid}`;
/** 그 사이트의 저장 키인지 (계정 상관없이, 계정을 붙이기 전 예전 키 포함) */
const isSiteKey = (key: IDBValidKey, site: SiteId) => typeof key === 'string' && (key === baseOf(site) || key.startsWith(baseOf(site) + '@'));
// 예전 localStorage 캐시 — 지울 때 함께 지운다
const LEGACY_KEY = 'adi_data_cache';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 이 계정이 이 사이트에서 마지막으로 받은 응답 (없으면 null) */
export async function readCachedPayload(site: SiteId, uid: string): Promise<RawApiPayload | null> {
  if (!uid) return null;
  try {
    const db = await openDb();
    const saved = await new Promise<RawApiPayload | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(keyOf(site, uid));
      req.onsuccess = () => resolve(req.result as RawApiPayload | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return saved || null;
  } catch {
    return null;
  }
}

/** 저장해 둔 응답을 모두 지운다 — 열람 권한이 없는 계정으로 확인됐을 때 이 브라우저에 데이터가 남지 않게 */
export async function clearCachedPayloads(): Promise<void> {
  removeKey(LEGACY_KEY);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // 저장 공간을 쓸 수 없는 브라우저 — 지울 것도 없다
  }
}

/** 브라우저에는 공개 데이터만 남긴다 — 관리자 응답의 고객 정보는 저장하지 않는다 */
function toPublicPayload(payload: RawApiPayload): RawApiPayload {
  const { quotes_raw_sites: _sites, quotes_phone: _phone, godo_order_customers: _customers, ...rest } = payload;
  return {
    ...rest,
    quotes_raw: rest.quotes_raw?.map(({ name: _name, company: _company, email: _email, ...row }) => row),
    manual_categories: rest.manual_categories?.map(({ updated_by: _by, ...row }) => row),
  };
}

/** 이 계정의 응답으로 저장한다 — 같은 사이트의 다른 계정(과 계정을 붙이기 전 예전 키) 응답은 지운다 */
export async function writeCachedPayload(payload: RawApiPayload, site: SiteId, uid: string): Promise<void> {
  if (!uid) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const key = keyOf(site, uid);
      const keysReq = store.getAllKeys();
      keysReq.onsuccess = () => {
        keysReq.result.filter((k) => isSiteKey(k, site) && k !== key).forEach((k) => store.delete(k));
        store.put(toPublicPayload(payload), key);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // 저장 공간이 없거나 사생활 보호 모드 — 다음 방문 때 실데이터를 다시 받으면 된다
  }
}
