/**
 * 최근 검색어·즐겨찾기 — 이 브라우저에만 남는 편의 기능이다.
 * 관리자는 고객사 이름도 검색하므로 따로 보관한다. 최근 검색어는 로그아웃하면 지우고,
 * 즐겨찾기는 직접 고른 것이라 남겨 두되 관리자 목록이라 로그아웃 상태 화면에는 나오지 않는다.
 */
import { readJSON, removeKey, writeJSON } from './storage';

const RECENT_KEYS = { public: 'adi_recent_search', admin: 'adi_recent_search_admin' };
const FAVORITE_KEYS = { public: 'adi_favorite_search', admin: 'adi_favorite_search_admin' };
const MAX_RECENT = 8;

const recentKey = (isLoggedIn: boolean) => (isLoggedIn ? RECENT_KEYS.admin : RECENT_KEYS.public);
const favoriteKey = (isLoggedIn: boolean) => (isLoggedIn ? FAVORITE_KEYS.admin : FAVORITE_KEYS.public);

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

export const loadRecentSearches = (isLoggedIn: boolean): string[] => readList(recentKey(isLoggedIn)).slice(0, MAX_RECENT);

/** 맨 앞에 넣는다. 대소문자만 다른 같은 검색어는 하나로 합친다 */
export const addRecentSearch = (query: string, isLoggedIn: boolean): string[] =>
  writeList(
    recentKey(isLoggedIn),
    [query, ...loadRecentSearches(isLoggedIn).filter((q) => !sameSearch(q, query))].slice(0, MAX_RECENT)
  );

export const removeRecentSearch = (query: string, isLoggedIn: boolean): string[] =>
  writeList(recentKey(isLoggedIn), loadRecentSearches(isLoggedIn).filter((q) => !sameSearch(q, query)));

export const clearRecentSearches = (isLoggedIn: boolean): string[] => writeList(recentKey(isLoggedIn), []);

export const loadFavoriteSearches = (isLoggedIn: boolean): string[] => readList(favoriteKey(isLoggedIn));

/** 즐겨찾기에 있으면 빼고, 없으면 맨 앞에 넣는다 */
export function toggleFavoriteSearch(query: string, isLoggedIn: boolean): string[] {
  const list = loadFavoriteSearches(isLoggedIn);
  const exists = list.some((q) => sameSearch(q, query));
  return writeList(favoriteKey(isLoggedIn), exists ? list.filter((q) => !sameSearch(q, query)) : [query, ...list]);
}
