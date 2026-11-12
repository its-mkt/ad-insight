import type { SiteId, ViewId } from '../types/dashboard';
import { VALID_VIEWS } from './constants';

export const SITES: SiteId[] = ['itket', 'oncore'];

/** 지금 열 수 있는 사이트 — 막힌 사이트 주소는 아이티켓으로 연다 (온코어 수집기가 아직 연결 전이면 화면에서 안내를 보여 준다) */
export const SITE_ENABLED: Record<SiteId, boolean> = { itket: true, oncore: true };

export interface Route {
  site: SiteId;
  view: ViewId;
  /** 검색 화면의 검색어 (다른 화면은 빈 문자열) */
  query: string;
}

/** '/itket/quotes', 'itket/search' 같은 경로 조각과 '?q=' 문자열 → 사이트·화면·검색어 */
function routeOf(path: string, params: string): Route {
  const parts = path.split('/').filter(Boolean);
  const named: SiteId = SITES.includes(parts[0] as SiteId) ? (parts.shift() as SiteId) : 'itket';
  const site: SiteId = SITE_ENABLED[named] ? named : 'itket';
  const name = (parts[0] || 'overview') as ViewId;
  const view = VALID_VIEWS.includes(name) ? name : 'overview';
  return { site, view, query: view === 'search' ? (new URLSearchParams(params).get('q') || '').trim() : '' };
}

/**
 * 지금 주소 → 사이트·화면·검색어.
 * 경로('/itket', '/oncore/quotes', '/itket/search?q=HPE')가 기준이고, 예전 해시 주소('#quotes', '#itket/quotes', '#search?q=HPE')도 읽는다.
 * 사이트가 없으면 아이티켓으로 연다.
 */
export function parseRoute(loc: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location): Route {
  const hash = loc.hash.replace(/^#/, '');
  if (hash) {
    const [path, params = ''] = hash.split('?');
    return routeOf(path, params);
  }
  return routeOf(loc.pathname, loc.search.replace(/^\?/, ''));
}

/** 사이트·화면·검색어 → 주소 경로. 종합 요약은 사이트만('/itket') */
export function routePath(site: SiteId, view: ViewId, query = ''): string {
  if (view === 'overview') return `/${site}`;
  return `/${site}/${view}${view === 'search' && query ? `?q=${encodeURIComponent(query)}` : ''}`;
}

/** 지금 주소가 정식 경로와 다르면(사이트 없는 '/', 예전 해시 '#quotes' 등) 기록을 남기지 않고 정식 경로로 바꾼다. 읽은 경로를 돌려준다 */
export function normalizeRoutePath(): Route {
  const route = parseRoute();
  const path = routePath(route.site, route.view, route.query);
  if (window.location.pathname + window.location.search + window.location.hash !== path) window.history.replaceState(null, '', path);
  return route;
}

/** 새로고침 없이 앱 안의 다른 주소로 간다 — App 이 popstate 를 듣고 화면을 바꾼다 */
export function navigateTo(path: string): void {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
