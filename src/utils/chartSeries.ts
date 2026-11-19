import type { QuoteRow, SpendRow } from '../types/dashboard';
import { quoteChartCats, quoteSeriesColor, rowsByPeriod, SERIES_DEFS, sumBy } from './format';

/**
 * 매체·유형별 광고비 추이 계열 (SERIES_DEFS 순서·색). 값이 모두 0인 계열은 빼고, v 는 만원 단위, raw 는 원 단위.
 * @param rowsAt 기간 키(YYYY-MM·YYYY)별 광고비 행 — rowsByPeriod(spend) 결과
 * @param axis 가로축 기간 키 목록
 */
export const spendSeriesOf = (rowsAt: (key: string) => SpendRow[], axis: string[]) =>
  SERIES_DEFS.map((s) => ({
    ...s,
    raw: axis.map((key) => sumBy(rowsAt(key).filter(s.f), (r) => r.cost)),
  }))
    .filter((s) => s.raw.some((v) => v))
    .map((s) => ({ ...s, v: s.raw.map((v) => v / 1e4) }));

/**
 * 견적 추이 계열 — 건수 상위 6개 1차 카테고리 + '그 외'. 값이 모두 0인 계열은 뺀다.
 * @param rows 견적 행
 * @param axis 가로축 기간 키 목록
 * @param rowsAt 이미 만든 rowsByPeriod(rows) 가 있으면 넘긴다 (없으면 새로 만든다)
 */
export function quoteSeriesOf(rows: QuoteRow[], axis: string[], rowsAt: (key: string) => QuoteRow[] = rowsByPeriod(rows)) {
  const cats = quoteChartCats(rows);
  return cats.keys
    .map((k, ci) => ({
      k,
      c: quoteSeriesColor(k, ci),
      v: axis.map((key) => sumBy(rowsAt(key).filter((r) => cats.keyOf(r.category) === k), (r) => r.count)),
    }))
    .filter((s) => s.v.some((x) => x));
}
