import { useEffect, useState } from 'react';
import { trackCategoryFilter } from '../../lib/usage';
import { CATEGORY_HIERARCHY } from '../../utils/constants';
import { parseCatParts } from '../../utils/format';
import { Dropdown, type DropdownOption } from './Dropdown';

/** 1차·2차 카테고리 선택 상태. 1차를 바꾸면 2차는 '전체'로 돌아간다 (뷰 최상단에서 호출) */
export function useCategoryFilterState() {
  const [cat1, setCat1State] = useState('');
  const [cat2, setCat2] = useState('');
  const setCat1 = (v: string) => {
    setCat1State(v);
    setCat2('');
  };
  // 이용 현황 '카테고리별 이용' 기록 — 고른 카테고리와 그 상태로 본 시간. 화면을 떠나면 해제
  useEffect(() => {
    trackCategoryFilter(cat2 ? `${cat1} > ${cat2}` : cat1);
  }, [cat1, cat2]);
  useEffect(() => () => trackCategoryFilter(''), []);
  return { cat1, cat2, setCat1, setCat2 };
}

export interface CategoryFilterModel {
  cat1: string;
  cat2: string;
  cat1Options: DropdownOption<string>[];
  cat2Options: DropdownOption<string>[];
  /** 선택한 1차 카테고리에 2차가 있어 2차 선택박스를 쓸 수 있는지 */
  hasCat2: boolean;
  setCat1: (v: string) => void;
  setCat2: (v: string) => void;
}

/**
 * 분류표(CATEGORY_HIERARCHY)의 1차·2차에 화면 데이터의 카테고리 키("1차" 또는 "1차 > 2차")를 더해 필터 옵션을 만든다.
 * 선택값이 목록에 없으면 '전체'로 취급한다.
 */
export function buildCategoryFilter(
  keys: string[],
  state: ReturnType<typeof useCategoryFilterState>
): CategoryFilterModel {
  // 1차: 분류표(CATEGORY_HIERARCHY) 전체를 항상 보여 주고, 데이터에만 있는 값(옛 견적 분류 등)은 뒤에 붙인다
  const cat1Set = [
    ...new Set([
      ...CATEGORY_HIERARCHY.map((n) => n.cat1),
      ...keys.map((k) => parseCatParts(k).cat1),
    ]),
  ];
  const cat1 = cat1Set.includes(state.cat1) ? state.cat1 : '';

  // 2차: 분류표에 정의된 하위 카테고리는 이번 달 데이터가 없어도 보여 주고(고르면 빈 결과), 그 밖의 값은 뒤에 붙인다
  const cat2Of = (c1: string) => {
    const inData = [
      ...new Set(
        keys
          .filter((k) => parseCatParts(k).cat1 === c1)
          .map((k) => parseCatParts(k).cat2)
          .filter(Boolean)
      ),
    ];
    const known = CATEGORY_HIERARCHY.find((n) => n.cat1 === c1)?.cat2 ?? [];
    return [...known, ...inData.filter((c) => !known.includes(c))];
  };
  const cat2Set = cat1 ? cat2Of(cat1) : [];
  const cat2 = cat2Set.includes(state.cat2) ? state.cat2 : '';

  return {
    cat1,
    cat2,
    cat1Options: [
      { value: '', label: '1차 전체' },
      ...cat1Set.map((c) => {
        // 2차 카테고리가 있는 1차만 목록에 개수를 붙인다 (선택된 값 표시에는 붙지 않음)
        const n = cat2Of(c).length;
        return { value: c, label: c, hint: n ? `· ${n}` : undefined };
      }),
    ],
    cat2Options: [{ value: '', label: '2차 전체' }, ...cat2Set.map((c) => ({ value: c, label: c }))],
    hasCat2: cat2Set.length > 0,
    setCat1: state.setCat1,
    setCat2: state.setCat2,
  };
}

/** 카테고리 키가 선택한 1차·2차 조건에 맞는지 */
export function matchesCategory(key: string, cat1: string, cat2: string): boolean {
  const p = parseCatParts(key);
  if (cat1 && p.cat1 !== cat1) return false;
  if (cat2 && p.cat2 !== cat2) return false;
  return true;
}

/** 카테고리 키별 집계 객체에서 조건에 맞는 키만 남긴다 */
export function filterByCategory<T>(rec: Record<string, T>, cat1: string, cat2: string): Record<string, T> {
  if (!cat1 && !cat2) return rec;
  return Object.fromEntries(Object.entries(rec).filter(([k]) => matchesCategory(k, cat1, cat2)));
}

/** 1차 카테고리 선택박스 + 2차 카테고리 선택박스. 2차는 1차에 하위 카테고리가 있을 때만 활성화된다 */
export function CategoryFilter({ filter }: { filter: CategoryFilterModel }) {
  return (
    <>
      <Dropdown
        options={filter.cat1Options}
        value={filter.cat1}
        onChange={filter.setCat1}
        ariaLabel="1차 카테고리 필터"
        id="dd-cat1"
      />
      <Dropdown
        options={filter.cat2Options}
        value={filter.cat2}
        onChange={filter.setCat2}
        ariaLabel="2차 카테고리 필터"
        id="dd-cat2"
        disabled={!filter.hasCat2}
      />
    </>
  );
}
