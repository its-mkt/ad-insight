import type { QuoteRawRow, SiteId } from '../types/dashboard';

/** 견적이 들어온 사이트 — zbyhp·cadkorea·oncore 가 아니면 아이티켓(사이트 값이 비어 있는 옛 행 포함) */
export const siteOriginOf = (r: QuoteRawRow): string =>
  r.site === 'zbyhp' || r.site === 'cadkorea' || r.site === 'oncore' ? r.site : 'itket';

/** 접수처 — 전화문의 시트 건은 시트의 경로(전화·톡플러스·메일, 그 밖은 '기타')로 나눈다 (견적 접수 목록·접수처 비중) */
export const originOf = (r: QuoteRawRow): string => r.inquiryType || siteOriginOf(r);

/** KPI 카드 하단의 접수처 묶음 — 전화문의 시트 건은 경로와 상관없이 한 칸으로 묶는다 */
export const PHONE_ORIGIN_GROUP = '전화/톡플러스';
export const ORIGIN_GROUPS = ['itket', 'zbyhp', 'cadkorea', PHONE_ORIGIN_GROUP];
export const originGroupOf = (r: QuoteRawRow): string => (r.inquiryType ? PHONE_ORIGIN_GROUP : siteOriginOf(r));

/** 접수처 묶음별 건수 — 0건인 묶음도 순서대로 남긴다 (KpiDetailItems 용). 아이티켓이 아닌 사이트는 그 사이트 한 칸 */
export const originGroupCounts = (rows: QuoteRawRow[], site: SiteId = 'itket'): [string, number][] => {
  if (site !== 'itket') return [[site, rows.length]];
  const counts: Record<string, number> = {};
  rows.forEach((r) => {
    const k = originGroupOf(r);
    counts[k] = (counts[k] || 0) + 1;
  });
  return ORIGIN_GROUPS.map((k): [string, number] => [k, counts[k] ?? 0]);
};
