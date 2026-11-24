import { createContext } from 'react';
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

/** 지금 사이트의 분류표 — App 이 categoryHierarchyOf 결과를 넣고, useCategoryFilterState 가 읽어 모든 카테고리 필터에 쓴다 */
export const CategoryHierarchyContext = createContext<CatHierarchyNode[]>(CATEGORY_HIERARCHY);

/** 검색 창의 "예:" 검색어 — 아이티켓은 정해 둔 예시, 다른 사이트는 그 사이트에서 많이 쓰인 분류 두 개와 매체 이름 */
export function searchExamplesOf(site: string, hierarchy: CatHierarchyNode[]): string {
  if (site === 'itket') return 'HPE, 워크스테이션, 네이버, cadkorea';
  return [...hierarchy.map((n) => n.cat1).filter((c) => c !== '기타').slice(0, 2), '네이버'].join(', ');
}

/**
 * 카테고리를 지정할 때 고르는 목록 — 사이트 분류표를 앞에 두고, 아이티켓 분류표에만 있는 분류를 뒤에 붙인다.
 * 온코어처럼 데이터로 모은 분류표는 아직 쓰지 않은 분류가 빠져 있어, 새 분류도 고를 수 있게 한다. 아이티켓은 분류표 그대로.
 */
export function pickableHierarchyOf(hierarchy: CatHierarchyNode[]): CatHierarchyNode[] {
  if (hierarchy === CATEGORY_HIERARCHY) return hierarchy;
  const stdOf = (cat1: string) => CATEGORY_HIERARCHY.find((n) => n.cat1 === cat1)?.cat2 ?? [];
  const merged = hierarchy.map((n) => ({ cat1: n.cat1, cat2: [...n.cat2, ...stdOf(n.cat1).filter((c) => !n.cat2.includes(c))] }));
  const have = new Set(hierarchy.map((n) => n.cat1));
  return [...merged, ...CATEGORY_HIERARCHY.filter((n) => !have.has(n.cat1))];
}
