import { createContext } from 'react';
import type { DashboardData } from '../types/dashboard';
import { CATEGORY_HIERARCHY, ONCORE_CATEGORY_HIERARCHY, type CatHierarchyNode } from './constants';
import { parseCatParts } from './format';

/** 사이트별로 정해 둔 분류표 */
const SITE_HIERARCHY: Record<string, CatHierarchyNode[]> = { oncore: ONCORE_CATEGORY_HIERARCHY };

/**
 * 사이트의 표준 카테고리 분류표 — 카테고리 필터(검색 창 등)·카테고리 지정 목록이 항상 보여 줄 1차·2차 목록.
 * 아이티켓은 CATEGORY_HIERARCHY 그대로. 온코어는 ONCORE_CATEGORY_HIERARCHY 에, 데이터(광고그룹 매핑·견적)에만 있는
 * 분류(예전 값 등)를 뒤에 붙인다. 분류표를 정해 두지 않은 사이트는 데이터에 쓰인 분류를 많이 쓰인 순서로 모은다. '기타'는 맨 뒤.
 */
export function categoryHierarchyOf(site: string, data: DashboardData): CatHierarchyNode[] {
  if (site === 'itket') return CATEGORY_HIERARCHY;
  const fromData = usedHierarchyOf(data);
  const defined = SITE_HIERARCHY[site];
  if (!defined) return fromData;
  // 정해 둔 분류표 뒤에 데이터에만 있는 1차·2차를 붙인다 ('기타'는 맨 뒤 그대로)
  const merged = defined.map((n) => {
    const extra = fromData.find((d) => d.cat1 === n.cat1)?.cat2.filter((c) => !n.cat2.includes(c)) ?? [];
    return { cat1: n.cat1, cat2: [...n.cat2, ...extra] };
  });
  const extras = fromData.filter((d) => !defined.some((n) => n.cat1 === d.cat1));
  const etc = merged.filter((n) => n.cat1 === '기타');
  return [...merged.filter((n) => n.cat1 !== '기타'), ...extras.filter((n) => n.cat1 !== '기타'), ...etc];
}

/** 데이터(광고그룹 매핑·견적)에 쓰인 분류를 많이 쓰인 순서로 — '기타'는 맨 뒤 */
function usedHierarchyOf(data: DashboardData): CatHierarchyNode[] {
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

/** 지금 사이트의 분류표 — App 이 categoryHierarchyOf 결과를 넣고, useCategoryFilterState 가 읽어 모든 카테고리 필터에 쓴다 */
export const CategoryHierarchyContext = createContext<CatHierarchyNode[]>(CATEGORY_HIERARCHY);

/** 검색 창의 "예:" 검색어 — 아이티켓은 정해 둔 예시, 다른 사이트는 그 사이트에서 많이 쓰인 분류 두 개와 매체 이름 */
export function searchExamplesOf(site: string, hierarchy: CatHierarchyNode[]): string {
  if (site === 'itket') return 'HPE, 워크스테이션, 네이버, cadkorea';
  return [...hierarchy.map((n) => n.cat1).filter((c) => c !== '기타').slice(0, 2), '네이버'].join(', ');
}

