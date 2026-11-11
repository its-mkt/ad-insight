import type { DashboardData, KeywordRow } from '../types/dashboard';
import { ym } from './format';

/** 기간 선택의 '전체' 를 쓸 수 있는 화면 — 연도 '전체' 는 전 기간, 월 '전체' 는 선택 연도 합계 */
export const TOTAL_PERIOD_VIEWS = ['overview', 'ads', 'cat-efficiency', 'keywords', 'quotes', 'purchases', 'devices', 'admin', 'usage'];

/** 여러 달의 같은 키워드를 한 줄로 합친다. 실적은 더하고 입찰가·품질지수는 가장 최근 달 값을 쓴다 */
export function mergeKeywordMonths(rows: KeywordRow[]): KeywordRow[] {
  const merged = new Map<string, KeywordRow>();
  [...rows]
    .sort((a, b) => a.month.localeCompare(b.month))
    .forEach((k) => {
      const key = [k.media, k.campaign, k.adgroup, k.keyword, k.match || ''].join('\u0001');
      const prev = merged.get(key);
      merged.set(
        key,
        prev
          ? { ...k, cost: prev.cost + k.cost, imp: prev.imp + k.imp, clk: prev.clk + k.clk, conv: prev.conv + k.conv }
          : k
      );
    });
  return [...merged.values()];
}

/** 그 연도에서 합계를 낼 마지막 달 — 올해는 데이터가 있는 최신 달, 지난해는 12월 */
export const lastMonthOfYear = (month: string, max: string): string => {
  const year = month.slice(0, 4);
  return year === max.slice(0, 4) ? max : ym(year, 12);
};

/** '2026-11' → ['2026-01', …, '2026-11'] */
export const monthsUpTo = (month: string): string[] =>
  Array.from({ length: +month.slice(5, 7) }, (_, i) => ym(month.slice(0, 4), i + 1));

/** 같은 달들의 1년 전 — 전년 동기 비교용 */
export const sameMonthsLastYear = (months: string[]): string[] =>
  months.map((m) => ym(+m.slice(0, 4) - 1, +m.slice(5, 7)));

/** 월 목록에 드는 행만 고르는 조건 */
export const inMonths = (months: string[]) => {
  const set = new Set(months);
  return (r: { month: string }): boolean => set.has(r.month);
};

/** '2026-11' → '2026년 1~11월' ('2026-01' 이면 '2026년 1월') */
export const yearRangeLabel = (month: string): string => {
  const mm = +month.slice(5, 7);
  return `${month.slice(0, 4)}년 ${mm === 1 ? '1월' : `1~${mm}월`}`;
};

/** '2025-01' → '2025.01', 데이터가 없어 달이 비어 있으면 '–' */
export const dotYm = (mo: string): string => (mo ? mo.replace('-', '.') : '–');

/** 월 목록 → 중복 없는 연도 목록 (오름차순) */
export const yearsOf = (months: string[]): string[] =>
  [...new Set(months.filter(Boolean).map((m) => m.slice(0, 4)))].sort();

export const firstMonth = (months: string[]): string => months.filter(Boolean).sort()[0] || '';

/** 기간에 행이 없고 마지막 수집 달도 기간 끝보다 앞인 매체 — 필터로 빠졌거나 집행이 없는 경우(0원)와 구분한다 */
export function uncollectedMedia(
  spend: { media: string; month: string }[],
  months: string[],
  medias: string[] = ['Naver', 'Google']
): string[] {
  if (!months.length) return [];
  const end = months.reduce((last, mo) => (mo > last ? mo : last), '');
  const period = inMonths(months);
  return medias.filter((media) => {
    const list = spend.filter((r) => r.media === media);
    return !list.some(period) && list.every((r) => r.month < end);
  });
}

const MEDIA_LABELS: Record<string, string> = { Naver: '네이버', Google: '구글' };

/** KPI 카드 하단에 덧붙이는 항목 — 합계가 미수집 매체를 뺀 값임을 밝힌다 */
export const uncollectedItems = (
  spend: { media: string; month: string }[],
  months: string[],
  medias?: string[]
): [string, string][] =>
  uncollectedMedia(spend, months, medias).map((media) => [MEDIA_LABELS[media] ?? media, '미수집']);

export interface PeriodStarts {
  /** 아이티켓 견적의 첫 달 — 다른 사이트·전화문의를 합친 건수의 시작 달은 그 데이터에서 따로 구한다 */
  quotes: string;
  google: string;
  naver: string;
  /** 메타 광고비의 첫 달 — 수동 입력분이라 CPA 시작 달 계산에는 넣지 않는다 */
  meta: string;
  /** CPA 시작 달 — 견적·구글·네이버 광고비가 모두 있는 첫 달 */
  cpaFrom: string;
}

/** 데이터마다 시작 시기가 달라, 광고비와 견적을 맞대는 지표는 모두 있는 달부터 계산한다 */
export function periodStartsOf(data: Pick<DashboardData, 'spend' | 'quotes'>): PeriodStarts {
  const quotes = firstMonth(data.quotes.map((r) => r.month));
  const google = firstMonth(data.spend.filter((r) => r.media === 'Google').map((r) => r.month));
  const naver = firstMonth(data.spend.filter((r) => r.media === 'Naver').map((r) => r.month));
  const meta = firstMonth(data.spend.filter((r) => r.media === 'Meta').map((r) => r.month));
  const cpaFrom = [quotes, google, naver].filter(Boolean).sort().pop() || '';
  return { quotes, google, naver, meta, cpaFrom };
}
