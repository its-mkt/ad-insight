import type { RawApiPayload, SiteId } from '../types/dashboard';

/**
 * 마지막으로 받은 API 응답을 브라우저에 저장해 다음 방문 때 먼저 그린다.
 * 응답이 5MB를 넘어 localStorage 한도를 넘기므로 IndexedDB 에 둔다.
 */
const DB_NAME = 'adi';
const STORE = 'cache';
const KEY = 'payload';
/** 사이트별 저장 키 — 아이티켓은 예전 키를 그대로 쓴다 */
const keyOf = (site: SiteId) => (site === 'itket' ? KEY : KEY + ':' + site);
// 예전 localStorage 캐시 — 한 번 옮기고 지운다
const LEGACY_KEY = 'adi_data_cache';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readLegacy(): RawApiPayload | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    localStorage.removeItem(LEGACY_KEY);
    return raw ? (JSON.parse(raw) as RawApiPayload) : null;
  } catch {
    return null;
  }
}

export async function readCachedPayload(site: SiteId = 'itket'): Promise<RawApiPayload | null> {
  if (site !== 'itket') {
    try {
      const db = await openDb();
      const saved = await new Promise<RawApiPayload | undefined>((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(keyOf(site));
        req.onsuccess = () => resolve(req.result as RawApiPayload | undefined);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return saved || null;
    } catch {
      return null;
    }
  }
  try {
    const db = await openDb();
    const saved = await new Promise<RawApiPayload | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result as RawApiPayload | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    const legacy = readLegacy();
    return saved || legacy;
  } catch {
    return readLegacy();
  }
}

/** 브라우저에는 공개 데이터만 남긴다 — 관리자 응답의 고객 정보는 저장하지 않는다 */
function toPublicPayload(payload: RawApiPayload): RawApiPayload {
  const { quotes_raw_sites: _sites, quotes_phone: _phone, ...rest } = payload;
  return {
    ...rest,
    quotes_raw: rest.quotes_raw?.map(({ name: _name, company: _company, email: _email, ...row }) => row),
    manual_categories: rest.manual_categories?.map(({ updated_by: _by, ...row }) => row),
  };
}

export async function writeCachedPayload(payload: RawApiPayload, site: SiteId = 'itket'): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(toPublicPayload(payload), keyOf(site));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // 저장 공간이 없거나 사생활 보호 모드 — 다음 방문 때 실데이터를 다시 받으면 된다
  }
}
