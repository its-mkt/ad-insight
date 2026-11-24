import type { DashboardData } from '../types/dashboard';
import { CATEGORY_HIERARCHY, type CatHierarchyNode } from './constants';
import { parseCatParts } from './format';

/**
 * 사이트의 표준 카테고리 분류표 — 카테고리 필터(검색 창 등)가 항상 보여 줄 1차·2차 목록.
 * 아이티켓은 정해 둔 분류표(CATEGORY_HIERARCHY)를 쓰고, 분류표가 따로 없는 사이트(온코어)는
 * 그 사이트 데이터(광고그룹 매핑·견적)에 실제로 쓰인 분류를 많이 쓰인 순서로 모은다. '기타'는 맨 뒤.
 */
export function categoryHierarchyOf(site: string, data: DashboardData): CatHierarchyNode[] {
  if (site === 'itket') return CATEGORY_HIERARCHY;
  const count = new Map<string, number>();
  const cat2Count = new Map<string, Map<string, number>>();
  const add = (raw?: string) => {
    const cat = String(raw || '').trim();
    if (!cat) return;
    const { cat1, cat2 } = parseCatParts(cat);
    count.set(cat1, (count.get(cat1) || 0) + 1);
    if (cat2) {
      const m = cat2Count.get(cat1) || new Map<string, number>();
      m.set(cat2, (m.get(cat2) || 0) + 1);
      cat2Count.set(cat1, m);
    }
  };
  data.mapping.forEach((r) => add(r.category));
  [data.quotesRaw, data.quotesSites, data.quotesPhone, data.quotesExtra].forEach((rows) => rows.forEach((r) => add(r.category)));
  const byCount = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return byCount(count)
    .sort((a, b) => Number(a === '기타') - Number(b === '기타'))
    .map((cat1) => ({ cat1, cat2: cat2Count.has(cat1) ? byCount(cat2Count.get(cat1)!) : [] }));
}
