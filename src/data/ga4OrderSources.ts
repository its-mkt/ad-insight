/**
 * GA4 의 '주문 완료' 페이지(/order/order_end.php) 도달 세션을 유입 출처/매체별로 센 값 (itket-analytics 수집분).
 * 고도몰 결제완료 건수와 기준이 달라 참고값이다. 아래 값은 초기값이고, 최근 달은 화면에서 itket-analytics 수집본으로 덮는다 (loadLatestGa4OrderSources)
 */
import type { SiteId } from '../types/dashboard';
import { prevM, THIS_M } from '../utils/format';
import { loadGa4Months, loadOncoreGa4Months } from './oncoreGa4';

export let GA4_ORDER_SOURCES_AS_OF = '2026-11-09';

/** GA4 가 달 중간부터 측정한 달 → 측정 시작일 (GA4 일별 수집본의 첫 날). 그 달 판매는 고도몰 일별 실측값으로 이 날부터 센다 */
export const GA4_PARTIAL_START: Record<string, { from: number }> = {
  '2026-07': { from: 9 },
};

/** 값이 있는 달만 담는다 — 없는 달은 측정되지 않았다는 뜻이고 0건이 아니다 */
export const GA4_ORDER_SOURCES: Record<string, Record<string, number>> = {
  '2025-01': { '(direct) / (none)': 4, 'google / cpc': 1, 'naver / organic': 1 },
  '2025-02': { 'naver / organic': 4, '(direct) / (none)': 3, 'google / cpc': 1 },
  '2025-03': { '(direct) / (none)': 4, 'naver / organic': 2 },
  '2025-04': { 'naver / organic': 2, '(direct) / (none)': 1 },
  '2025-05': { '(direct) / (none)': 1 },
  '2025-06': { '(direct) / (none)': 3 },
  '2025-07': { 'naver / organic': 5, '(direct) / (none)': 3 },
  '2026-07': { '(direct) / (none)': 4, 'google / cpc': 2, 'm.search.naver.com / referral': 2, 'naver / organic': 2 },
  '2026-08': { '(direct) / (none)': 7, 'google / cpc': 1, 'm.search.naver.com / referral': 1 },
  '2026-09': { '(direct) / (none)': 6, 'google / cpc': 5, 'chatgpt.com / ai-assistant': 1, 'google / organic': 1, 'naver / organic': 1 },
  '2026-10': { '(direct) / (none)': 3, 'chatgpt.com / ai-assistant': 2, 'naver / organic': 1 },
  '2026-11': { 'google / cpc': 2, 'daum / organic': 1 },
};

interface Ga4MonthFile {
  total?: { sessions?: number };
  daily?: { date: string }[];
  conv?: { byMedium?: { order?: { k: string; s: number }[] }; purchase?: { byMedium?: { k: string; s: number }[] } };
}

/** 서버가 결제 주문마다 보낸 GA4 purchase 로 센 달. 이 달의 GA4 값은 판매 건수와 같은 기준이다 */
export const GA4_PURCHASE_MONTHS = new Set<string>();

async function fetchLatest(): Promise<boolean> {
  const months: string[] = [];
  for (let m = THIS_M; m >= GA4_ORDER_SOURCES_AS_OF.slice(0, 7); m = prevM(m)) months.unshift(m);
  const all = await loadGa4Months<Ga4MonthFile>('itket');
  const files = months.map((m) => all[m] ?? null);
  // 받지 못했으면(로그인 전·네트워크) 다음 호출 때 다시 묻는다
  if (!Object.keys(all).length) latest = null;
  let changed = false;
  let purchaseStarted = false;
  files.forEach((file, i) => {
    if (!file?.total?.sessions) return; // 받지 못했거나 측정이 없는 달은 그대로 둔다
    const purchase = file.conv?.purchase?.byMedium ?? [];
    // purchase 를 보내기 시작한 달은 앞부분이 비어 있으므로 다음 달부터 그 값을 쓴다
    const usePurchase = purchaseStarted && purchase.length > 0;
    if (purchase.length > 0) purchaseStarted = true;
    if (usePurchase) GA4_PURCHASE_MONTHS.add(months[i]);
    GA4_ORDER_SOURCES[months[i]] = Object.fromEntries((usePurchase ? purchase : file.conv?.byMedium?.order ?? []).map((row) => [row.k, row.s]));
    const lastDay = file.daily?.[file.daily.length - 1]?.date;
    if (lastDay && lastDay > GA4_ORDER_SOURCES_AS_OF) GA4_ORDER_SOURCES_AS_OF = lastDay;
    changed = true;
  });
  return changed;
}

let latest: Promise<boolean> | null = null;

/** 기준일이 있는 달부터 이번 달까지의 GA4 값을 한 번만 받는다. 값을 반영했으면 true, 실패하면 초기값을 그대로 둔다 */
export function loadLatestGa4OrderSources(): Promise<boolean> {
  return (latest ??= fetchLatest());
}

/** 한 사이트의 GA4 주문 완료 출처 값 묶음 — 화면은 이 묶음만 보고 그린다 */
export interface Ga4OrderSourceSet {
  /** 달 → 출처/매체 → 주문 완료 세션 (측정된 달만) */
  sources: Record<string, Record<string, number>>;
  /** 마지막으로 받은 날 'YYYY-MM-DD' (없으면 '') */
  asOf: string;
  /** 서버 purchase 이벤트 기준인 달 (아이티켓만) */
  purchaseMonths: Set<string>;
  /** 달 중간부터 측정한 달 → 측정 시작일 */
  partialStart: Record<string, { from: number }>;
}

/** 온코어 — itket-analytics collectOncore 가 모은 주문 완료 화면 세션 (purchase 전송 없음) */
const ONCORE_SET: Ga4OrderSourceSet = { sources: {}, asOf: '', purchaseMonths: new Set(), partialStart: {} };

interface OncoreMonth {
  total?: { sessions?: number };
  daily?: { date: string }[];
  conv?: { byMedium?: { order?: { k: string; s: number }[] } };
}

let oncoreLatest: Promise<boolean> | null = null;
function fetchOncore(): Promise<boolean> {
  return loadOncoreGa4Months<OncoreMonth>().then((all) => {
    const months = Object.keys(all).filter((m) => all[m]?.total?.sessions).sort();
    months.forEach((m, i) => {
      const file = all[m];
      ONCORE_SET.sources[m] = Object.fromEntries((file.conv?.byMedium?.order ?? []).map((row) => [row.k, row.s]));
      const days = file.daily ?? [];
      // 측정을 시작한 첫 달이 1일부터가 아니면 그날부터 센다
      if (i === 0 && days.length && +days[0].date.slice(8, 10) > 1) ONCORE_SET.partialStart[m] = { from: +days[0].date.slice(8, 10) };
      const lastDay = days[days.length - 1]?.date;
      if (lastDay && lastDay > ONCORE_SET.asOf) ONCORE_SET.asOf = lastDay;
    });
    if (!months.length) oncoreLatest = null; // 받지 못했으면 다음에 다시 묻는다
    return months.length > 0;
  });
}

/** 그 사이트의 GA4 주문 완료 출처 값 (그릴 때마다 부른다 — 받은 뒤 값이 바뀐다) */
export function ga4OrderSourceSet(site: SiteId): Ga4OrderSourceSet {
  if (site === 'oncore') return ONCORE_SET;
  return { sources: GA4_ORDER_SOURCES, asOf: GA4_ORDER_SOURCES_AS_OF, purchaseMonths: GA4_PURCHASE_MONTHS, partialStart: GA4_PARTIAL_START };
}

/** 그 사이트의 최신 GA4 값을 한 번만 받는다. 값을 반영했으면 true */
export function loadGa4OrderSources(site: SiteId): Promise<boolean> {
  if (site === 'oncore') return (oncoreLatest ??= fetchOncore());
  return loadLatestGa4OrderSources();
}

/** GA4 출처/매체 → 화면 이름 (견적 유입 매체와 같은 이름을 쓴다) */
export const GA4_SOURCE_LABELS: Record<string, string> = {
  '(direct) / (none)': '직접',
  'google / cpc': '구글(광고)',
  'google / organic': '구글(검색)',
  'naver / organic': '네이버(검색)',
  'daum / organic': '다음(검색)',
  'm.search.naver.com / referral': '네이버(검색)',
  'chatgpt.com / ai-assistant': 'ChatGPT',
};
