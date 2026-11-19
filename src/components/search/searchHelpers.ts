import type { KeywordRow, QuoteRawRow } from '../../types/dashboard';

/** 견적 표에서 값이 없는 칸 */
export const CUSTOMER_FALLBACK = '–';

export const BREAKDOWN_LIMIT = 5;
export const INQUIRY_WEB = '견적문의';

/** 견적을 키별로 세어 많은 순으로 — 비어 있는 값은 emptyLabel 로 모아 맨 뒤에 둔다 */
export function breakdownOf(rows: QuoteRawRow[], keyOf: (r: QuoteRawRow) => string, emptyLabel: string) {
  const counts = new Map<string, number>();
  rows.forEach((r) => {
    const k = keyOf(r) || emptyLabel;
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => (a[0] === emptyLabel ? 1 : b[0] === emptyLabel ? -1 : b[1] - a[1]));
}

export type KeywordSort = 'bid' | 'quality' | 'imp' | 'clk' | 'ctr' | 'conv' | 'cpc' | 'cost';
export const KEYWORD_COLS: { key: KeywordSort; label: string }[] = [
  { key: 'bid', label: '입찰가' },
  { key: 'quality', label: '품질지수' },
  { key: 'imp', label: '노출' },
  { key: 'clk', label: '클릭' },
  { key: 'ctr', label: 'CTR' },
  { key: 'conv', label: '광고전환' },
  { key: 'cpc', label: '평균 CPC' },
  { key: 'cost', label: '광고비' },
];
/** 열 종류별 공통 너비 클래스 — 입찰가·평균 CPC 는 단가, CTR 은 비율, 광고비는 금액, 나머지는 건수 폭 */
export const SKW_COL_CLASS: Record<KeywordSort, string> = {
  bid: 'col-skw-unit',
  quality: 'col-skw-count',
  imp: 'col-skw-count',
  clk: 'col-skw-count',
  ctr: 'col-skw-rate',
  conv: 'col-skw-count',
  cpc: 'col-skw-unit',
  cost: 'col-skw-cost',
};
export const keywordMetric = (k: KeywordRow, key: KeywordSort): number =>
  key === 'ctr' ? (k.imp > 0 ? k.clk / k.imp : 0) : key === 'cpc' ? (k.clk > 0 ? k.cost / k.clk : -1) : k[key];

/** 견적 상세 머리말의 칩으로 올릴 짧은 항목, 그리고 한 줄 전체 폭을 쓰는 긴 항목 */
export const QUOTE_CHIP_LABELS = ['번호', '사이트', '문의 유형'];
export const QUOTE_WIDE_LABEL = '유입 경로';

/** 견적 상세 펼침의 항목 — 값이 있는 것만 */
export const quoteDetails = (r: QuoteRawRow): [string, string][] =>
  (
    [
      ['번호', String(r.sno ?? '')],
      ['사이트', !r.site ? '아이티켓' : r.site === 'phone' ? '전화문의' : r.site],
      ['유입 경로', [r.source, r.sourceDetail].filter(Boolean).join(' - ')],
      ['문의 유형', r.inquiryType || INQUIRY_WEB],
      ['이메일', r.email || ''],
      ['전화번호', r.phone || ''],
      ['접수자', r.receiver || ''],
    ] as [string, string][]
  ).filter(([, v]) => v);
