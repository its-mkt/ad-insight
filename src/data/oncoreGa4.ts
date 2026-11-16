/**
 * 온코어 GA4 월별 값 — itket-analytics 수집기(Apps Script)의 collectOncore 가 모아 웹앱 ?mode=oncore 로 내려준다.
 * 형식은 아이티켓 월별 파일(data/ga4/YYYY-MM.json)의 일부와 같다: total · daily · devices · deviceChannels · conv.byDevice/byDeviceChannel/byMedium (주문 완료만).
 * 온코어는 견적 완료 화면이 없어 견적 전환(conv.*.estimate)은 없다.
 */
export const ONCORE_GA4_URL = 'https://script.google.com/macros/s/AKfycbwUvlWb29opO4AeQhDqqdDJl_EB5w3csE_F0LnceRqdXaC_NcZiAeqJ3DsoB-zpevFM/exec?mode=oncore';

let req: Promise<Record<string, unknown>> | null = null;

/**
 * 온코어 GA4 의 달별 값을 한 번만 받는다 ('YYYY-MM' → 그 달 값). 받지 못하면 빈 값이고 다음 호출 때 다시 묻는다.
 * 응답에 site: 'oncore' 가 있을 때만 쓴다 — 수집기에 온코어 모드가 없으면 웹앱이 아이티켓 값을 돌려주므로 그 값을 온코어로 보이지 않게 한다.
 */
export function loadOncoreGa4Months<T>(): Promise<Record<string, T>> {
  req ??= fetch(ONCORE_GA4_URL)
    .then((res) => (res.ok ? res.json() : null))
    .then((j: { site?: string; months?: Record<string, unknown> } | null) => (j?.site === 'oncore' && j.months ? j.months : {}))
    .catch(() => {
      req = null;
      return {};
    });
  return req as Promise<Record<string, T>>;
}
