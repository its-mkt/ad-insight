/**
 * GA4 월별 값 — itket-analytics 수집기(Apps Script) 웹앱에서 받는다.
 * - 아이티켓: 기본 모드 응답의 months (형식은 예전 data/ga4/YYYY-MM.json 과 같다).
 *   예전에는 analytics 저장소의 data/ga4 파일을 읽었으나, 2026-11-18 analytics 가 실적 파일을 저장소에서 지우고 웹앱으로만 주게 바뀌었다
 * - 온코어: ?mode=oncore 로 collectOncore 가 모은 값 — total · daily · devices · deviceChannels · conv.byDevice/byDeviceChannel/byMedium (주문 완료만).
 *   온코어는 견적 완료 화면이 없어 견적 전환(conv.*.estimate)은 없다.
 * 수집기 웹앱은 승인된 계정의 로그인 토큰이 있어야 데이터를 준다 (같은 계정·승인 명단, 2026-11-18). 로그인 전 미리보기는 빈 값을 받는다.
 */
import type { SiteId } from '../types/dashboard';
import { currentAccessToken, withAccessToken } from '../lib/access';

const ANALYTICS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwUvlWb29opO4AeQhDqqdDJl_EB5w3csE_F0LnceRqdXaC_NcZiAeqJ3DsoB-zpevFM/exec';
const ONCORE_GA4_URL = `${ANALYTICS_WEBAPP_URL}?mode=oncore`;

const reqs: Partial<Record<SiteId, Promise<Record<string, unknown>>>> = {};

/**
 * 그 사이트 GA4 의 달별 값을 한 번만 받는다 ('YYYY-MM' → 그 달 값). 받지 못하면 빈 값이고 다음 호출 때 다시 묻는다.
 * 온코어는 응답에 site: 'oncore' 가 있을 때만 쓴다 — 수집기에 온코어 모드가 없으면 웹앱이 아이티켓 값을 돌려주므로 그 값을 온코어로 보이지 않게 한다.
 * 아이티켓 응답에는 site 가 없다.
 */
export function loadGa4Months<T>(site: SiteId): Promise<Record<string, T>> {
  const url = site === 'oncore' ? ONCORE_GA4_URL : ANALYTICS_WEBAPP_URL;
  reqs[site] ??= currentAccessToken()
    .then((token) => fetch(withAccessToken(url, token)))
    .then((res) => (res.ok ? res.json() : null))
    .then((j: { error?: string; site?: string; months?: Record<string, unknown> } | null) => {
      const ok = !!j?.months && !j.error && (site === 'oncore' ? j.site === 'oncore' : !j.site);
      if (!ok) throw new Error(j?.error || 'bad_payload');
      return j!.months!;
    })
    .catch(() => {
      delete reqs[site];
      return {};
    });
  return reqs[site] as Promise<Record<string, T>>;
}

/** 온코어 GA4 달별 값 (loadGa4Months('oncore')) */
export const loadOncoreGa4Months = <T,>(): Promise<Record<string, T>> => loadGa4Months<T>('oncore');
