import type { SiteId } from '../types/dashboard';

/** 아이티켓 수집기 웹앱(Apps Script) 주소 — 환경 변수·localStorage('adi_cfg')로 바꿀 수 있다 */
export const DEFAULT_URL =
  'https://script.google.com/macros/s/AKfycbzQS9yMlp9L_eRaH77QWLsY6GOY7L5hyRk1fkuaAHg8GvJmHHwhPRgr2zWldgbX5-cNcg/exec';
export const DEFAULT_KEY = '2d3b0cc2b04a4873a835583968ca7a0b';

/**
 * 아이티켓이 아닌 사이트의 수집기 웹앱 (사이트마다 Apps Script 프로젝트·데이터 시트가 따로다, apps-script/Code.gs 머리말 참고).
 * 주소·키가 비어 있으면 그 사이트는 '데이터 연결 준비 중' 안내만 보여 준다.
 */
export const SITE_SOURCES: Record<Exclude<SiteId, 'itket'>, { url: string; key: string }> = {
  oncore: {
    url:
      import.meta.env?.VITE_ONCORE_URL ||
      'https://script.google.com/macros/s/AKfycbzG-C3hj6HF_JuKzzjUGOvtRIzM5KLqGrJCBeDfNsQnzw7dHqw60T5Wm3yUunmBUrbT/exec',
    key: import.meta.env?.VITE_ONCORE_KEY || 'b3be208f75a04416914854086cfb72e5',
  },
};

/** 그 사이트의 수집기 웹앱 주소·키 */
export function getCfg(site: SiteId = 'itket'): { url: string; key: string } {
  if (site !== 'itket') return SITE_SOURCES[site];
  const envUrl = import.meta.env?.VITE_ADI_URL;
  const envKey = import.meta.env?.VITE_ADI_KEY;
  let s: { url?: string; key?: string } = {};
  try {
    s = JSON.parse(localStorage.getItem('adi_cfg') || '{}');
  } catch {
    // ignore
  }
  const pick = (...vals: Array<unknown>) => {
    for (const v of vals) {
      if (v && String(v).trim()) return String(v).trim();
    }
    return '';
  };
  return {
    url: pick(s.url, envUrl) || DEFAULT_URL,
    key: pick(s.key, envKey) || DEFAULT_KEY,
  };
}

/** 그 사이트의 수집기 웹앱이 연결돼 있는지 — 데이터는 로그인 토큰으로 받으므로 주소만 있으면 된다 */
export function siteConnected(site: SiteId): boolean {
  return !!getCfg(site).url;
}

/** 웹앱 주소에 조회 값을 붙인다 — 비밀키는 있을 때만 (새 웹앱은 데이터 조회에 키를 보지 않는다, 2026-11-19 보안 점검) */
export const webAppUrl = (c: { url: string; key: string }, params: Record<string, string> = {}): string => {
  const q = new URLSearchParams(c.key ? { key: c.key, ...params } : params).toString();
  return q ? `${c.url}${c.url.includes('?') ? '&' : '?'}${q}` : c.url;
};
