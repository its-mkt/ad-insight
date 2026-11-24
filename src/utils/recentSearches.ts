/**
 * 최근 검색어·즐겨찾기 — 이 브라우저에만 남는 편의 기능이다.
 * 관리자는 고객사 이름도 검색하므로 따로 보관한다. 최근 검색어는 로그아웃하면 지우고,
 * 즐겨찾기는 직접 고른 것이라 남겨 두되 관리자 목록이라 로그아웃 상태 화면에는 나오지 않는다.
 * 사이트(아이티켓·온코어)마다 따로 둔다 — 아이티켓은 예전 키 그대로, 다른 사이트는 키 뒤에 :사이트 를 붙인다.
 */
import { readJSON, removeKey, writeJSON } from './storage';

const RECENT_KEYS = { public: 'adi_recent_search', admin: 'adi_recent_search_admin' };
const FAVORITE_KEYS = { public: 'adi_favorite_search', admin: 'adi_favorite_search_admin' };
const MAX_RECENT = 8;

const siteKey = (key: string, site: string) => (site === 'itket' ? key : `${key}:${site}`);
const recentKey = (isLoggedIn: boolean, site: string) => siteKey(isLoggedIn ? RECENT_KEYS.admin : RECENT_KEYS.public, site);
const favoriteKey = (isLoggedIn: boolean, site: string) => siteKey(isLoggedIn ? FAVORITE_KEYS.admin : FAVORITE_KEYS.public, site);

function readList(key: string): string[] {
  const list = readJSON<unknown>(key, []);
  return Array.isArray(list) ? list.filter((q): q is string => typeof q === 'string') : [];
}

// 저장이 막힌 환경에서는 기록 없이 동작한다
function writeList(key: string, list: string[]): string[] {
  if (list.length) writeJSON(key, list);
  else removeKey(key);
  return list;
}

/** 대소문자만 다르면 같은 검색어로 본다 */
export const sameSearch = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

export const loadRecentSearches = (isLoggedIn: boolean, site: string): string[] => readList(recentKey(isLoggedIn, site)).slice(0, MAX_RECENT);

/** 맨 앞에 넣는다. 대소문자만 다른 같은 검색어는 하나로 합친다 */
export const addRecentSearch = (query: string, isLoggedIn: boolean, site: string): string[] =>
  writeList(
    recentKey(isLoggedIn, site),
    [query, ...loadRecentSearches(isLoggedIn, site).filter((q) => !sameSearch(q, query))].slice(0, MAX_RECENT)
  );

export const removeRecentSearch = (query: string, isLoggedIn: boolean, site: string): string[] =>
  writeList(recentKey(isLoggedIn, site), loadRecentSearches(isLoggedIn, site).filter((q) => !sameSearch(q, query)));

export const clearRecentSearches = (isLoggedIn: boolean, site: string): string[] => writeList(recentKey(isLoggedIn, site), []);

export const loadFavoriteSearches = (isLoggedIn: boolean, site: string): string[] => readList(favoriteKey(isLoggedIn, site));

/** 즐겨찾기에 있으면 빼고, 없으면 맨 앞에 넣는다 */
export function toggleFavoriteSearch(query: string, isLoggedIn: boolean, site: string): string[] {
  const list = loadFavoriteSearches(isLoggedIn, site);
  const exists = list.some((q) => sameSearch(q, query));
  return writeList(favoriteKey(isLoggedIn, site), exists ? list.filter((q) => !sameSearch(q, query)) : [query, ...list]);
}
