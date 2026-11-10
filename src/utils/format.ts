import type {
  CategoryBarItem,
  CategoryMap,
  CategoryWeight,
  SourceShareItem,
  MappingRow,
  QuoteRawRow,
  QuoteRow,
  SpendRow,
} from '../types/dashboard';
import { categoryFromAdNames } from './categoryText';

export const fmt = (n: number): string => Math.round(n).toLocaleString('ko-KR');

/** CTR = 클릭 ÷ 노출 × 100, 소수 둘째 자리까지 (노출 0 이면 –) — 표·카드 모두 이 표기를 쓴다 */
export const ctrText = (clk: number, imp: number): string => (imp > 0 ? `${((clk / imp) * 100).toFixed(2)}%` : '–');

/** 만원 단위 약식 표기 (1만 미만은 원 단위) */
export const fmtWon = (n: number): string =>
  n >= 10000 ? `${fmt(Math.round(n / 10000))}만원` : `${fmt(n)}원`;

export const rem = (): number =>
  parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

export const measureSvgText = (() => {
  let ctx: CanvasRenderingContext2D | null = null;
  return (text: string, r: number): number => {
    if (!ctx) {
      const c = document.createElement('canvas');
      ctx = c.getContext('2d');
    }
    if (!ctx) return text.length * r * 0.6;
    ctx.font = `500 ${r}px "Pretendard Variable", "Pretendard", sans-serif`;
    return ctx.measureText(text).width;
  };
})();

export const ym = (y: number | string, m: number | string): string =>
  `${y}-${String(m).padStart(2, '0')}`;

const NOW = new Date();
export const THIS_Y = NOW.getFullYear();
export const THIS_M = ym(THIS_Y, NOW.getMonth() + 1);
export const NOW_MONTH = NOW.getMonth() + 1;

export const prevM = (mo?: string): string => {
  if (!mo || typeof mo !== 'string') return '';
  const [y, m] = mo.split('-').map(Number);
  if (!y || !m) return '';
  return m === 1 ? ym(y - 1, 12) : ym(y, m - 1);
};

export const mLabel = (mo?: string): string => {
  if (!mo || typeof mo !== 'string') return '';
  const m = mo.slice(5);
  const num = +m;
  return isNaN(num) || num === 0 ? mo : `${num}월`;
};

export const sumBy = <T>(rows: T[], f: (r: T) => number): number =>
  rows.reduce((a, r) => a + f(r), 0);

export const niceMax = (v: number): number => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
};

export const axisC = (v: number): string =>
  v >= 1000 ? +(v / 1000).toFixed(1) + 'k' : String(Math.round(v));

export interface PctInfo {
  cls: 'flat' | 'up' | 'down';
  txt: string;
}

export const pct = (a?: number | null, b?: number | null): PctInfo | null => {
  if (!b || a == null) return null;
  const p = Math.round(((a - b) / b) * 1000) / 10;
  const up = p > 0;
  return {
    cls: p === 0 ? 'flat' : up ? 'up' : 'down',
    // 증감이 0% 면 방향이 없으므로 화살표 대신 –
    txt: `${p === 0 ? '–' : up ? '▲' : '▼'} ${Math.abs(p)}%`,
  };
};

export const SERIES_DEFS = [
  { k: 'Google SA', c: '--c-g', f: (r: SpendRow) => r.media === 'Google' && r.type === 'SA' },
  { k: 'Google DA', c: '--c-g2', f: (r: SpendRow) => r.media === 'Google' && r.type === 'DA' },
  { k: 'Naver SA', c: '--c-n', f: (r: SpendRow) => r.media === 'Naver' && r.type === 'SA' },
  { k: 'Naver DA', c: '--c-n2', f: (r: SpendRow) => r.media === 'Naver' && r.type === 'DA' },
  { k: 'Meta', c: '--c-m', f: (r: SpendRow) => r.media === 'Meta' },
];

/** 카테고리 개편 전 7분류 — mapping 시트·견적 데이터에 이 값이 있으면 옛 값으로 보고 새 체계로 다시 계산한다 */
const LEGACY_CATS = new Set(['서버', '워크스테이션', '스토리지', '노트북', 'PC', 'PC·노트북', '모니터', '기타']);
/**
 * 새 분류표에 없거나, 새 분류표에서는 2차 항목으로만 존재하는 옛 이름.
 * 견적 원장에서 이 값이 있으면 옛 체계 행으로 간주하고 allCatKeys 에서 제외한다.
 * → 제외해야 2차 항목(노트북 > HP 노트북 등)의 비례 배분 행과 중복 집계되지 않는다.
 * '모니터'는 새 분류표에서도 1차 직접 항목이므로 제외 대상이 아니다.
 * '기타'도 새 분류표에 있고 catch-all 로 쓰이므로 여기에 넣지 않는다.
 */
export const LEGACY_ONLY_CATS = new Set(['서버', '워크스테이션', '스토리지', 'PC', 'PC·노트북', '노트북']);
/** 상위 카테고리 색 (건수 순). 이보다 많으면 색이 서로 비슷해져 나머지는 회색(--c-rest)으로 둔다 */
export const QUOTE_COLORS = ['--c-it', '--c-g', '--c-m', '--c-ka', '--c-n', '--c-pink'];
/** 차트에서 상위 카테고리 밖을 묶는 이름 */
export const QUOTE_OTHER = '그 외';
/** 견적 추이 차트의 계열 색 — '그 외'는 회색 */
export const quoteSeriesColor = (key: string, index: number): string =>
  key === QUOTE_OTHER ? '--c-rest' : QUOTE_COLORS[index] || '--c-rest';

/** 카테고리의 1차 ('SAN 스토리지 > 화웨이' → 'SAN 스토리지') */
export const cat1Of = (cat: string): string => {
  const i = cat.indexOf(' > ');
  return i >= 0 ? cat.slice(0, i) : cat;
};

export interface CpaRankItem {
  k: string;
  cpa: number;
  quotes: number;
}

/**
 * 1차 카테고리별 CPA 를 낮은 순으로. 견적이 없는 2차의 광고비도 1차 광고비에 포함한다 (카테고리 효율 표와 같은 계산).
 * 광고비나 견적이 없으면 단가를 낼 수 없어 뺀다.
 */
export function cpaRankByCat1(items: { k: string; cost: number; quotes: number }[]): CpaRankItem[] {
  const map = new Map<string, { cost: number; quotes: number }>();
  items.forEach(({ k, cost, quotes }) => {
    const key = cat1Of(k);
    const cur = map.get(key) || { cost: 0, quotes: 0 };
    map.set(key, { cost: cur.cost + cost, quotes: cur.quotes + quotes });
  });
  return [...map]
    .filter(([, v]) => v.cost > 0 && v.quotes > 0)
    .map(([k, v]) => ({ k, cpa: v.cost / v.quotes, quotes: v.quotes }))
    .sort((a, b) => a.cpa - b.cpa || b.quotes - a.quotes);
}

/** 견적 1차 카테고리를 건수 큰 순으로 ('기타'는 맨 뒤). 표의 행 순서에 쓴다 */
export function quoteCat1Order(rows: QuoteRow[]): string[] {
  const tot: Record<string, number> = {};
  rows.forEach((r) => {
    const c = cat1Of(r.category || '기타');
    tot[c] = (tot[c] || 0) + r.count;
  });
  return Object.keys(tot).sort((a, b) => (a === '기타' ? 1 : b === '기타' ? -1 : tot[b] - tot[a]));
}

/**
 * 차트용 카테고리 묶음 — 건수 상위 n개 1차 카테고리 + 나머지(기타 포함)는 '그 외'.
 * keyOf 로 견적 행의 카테고리를 차트 계열 이름으로 바꾼다.
 */
export function quoteChartCats(rows: QuoteRow[], n = 6): { keys: string[]; keyOf: (cat: string) => string } {
  const top = quoteCat1Order(rows)
    .filter((c) => c !== '기타')
    .slice(0, n);
  const set = new Set(top);
  const keyOf = (cat: string) => {
    const c = cat1Of(cat || '기타');
    return set.has(c) ? c : QUOTE_OTHER;
  };
  const hasOther = rows.some((r) => keyOf(r.category) === QUOTE_OTHER);
  return { keys: hasOther ? [...top, QUOTE_OTHER] : top, keyOf };
}

// 캠페인명+광고그룹명 → 카테고리 정밀 매핑 테이블 (엑셀 "카테고리 분류_최종(ads)" 기준)
// 순서 중요: 광고그룹 지정 항목이 캠페인 전체 항목보다 앞에 위치해야 한다.
// 광고그룹 칸이 '' 이면 해당 캠페인의 모든 광고그룹에 적용된다.
const CAT_LOOKUP: ReadonlyArray<readonly [camp: string, grp: string, cat: string]> = [
  // 광고그룹으로 2차 분기
  ['LG전자',        '사이니지',         'LG전자 > 사이니지'],
  ['LG전자',        '전자칠판',         'LG전자 > 전자칠판'],
  ['SAN 스토리지',  '화웨이',           'SAN 스토리지 > 화웨이'],
  ['SAN 스토리지',  'NetAPP',           'SAN 스토리지 > NetAPP'],
  ['SAN 스토리지',  'MSA',              'SAN 스토리지 > MSA'],
  ['네트워크/방화벽','화웨이',           '네트워크/방화벽 > 화웨이'],
  ['네트워크/방화벽','FortiGate',        '네트워크/방화벽 > FortiGate'],
  ['네트워크/방화벽','PaloAlto',         '네트워크/방화벽 > PaloAlto'],
  ['소프트웨어',    '보안 소프트웨어',   '소프트웨어 > 보안 소프트웨어'],
  ['소프트웨어',    '기타 소프트웨어',   '소프트웨어 > 기타 소프트웨어'],
  // 캠페인명 자체가 노트북 2차
  ['HP 노트북',     '',                 '노트북 > HP 노트북'],
  ['Lenovo 노트북', '',                 '노트북 > Lenovo 노트북'],
  // 캠페인명 = 1차 카테고리
  ['3Dconnexion',           '', '3Dconnexion'],
  ['Dell 서버',             '', 'Dell 서버'],
  ['HPE 서버',              '', 'HPE 서버'],
  ['Lenovo 서버',           '', 'Lenovo 서버'],
  ['서버공통(주변장비)',     '', '서버공통(주변장비)'],
  ['GPU/AI 서버',           '', 'GPU/AI 서버'],
  ['LG전자',                '', 'LG전자'],
  ['MS서피스',              '', 'MS서피스'],
  ['데스크탑',              '', '데스크탑'],
  ['모니터',                '', '모니터'],
  ['데스크탑 워크스테이션', '', '데스크탑 워크스테이션'],
  ['AI Station',            '', 'AI Station'],
  ['모바일 워크스테이션',   '', '모바일 워크스테이션'],
  ['UPS',                   '', 'UPS'],
  ['NAS 스토리지',          '', 'NAS 스토리지'],
  ['SAN 스토리지',          '', 'SAN 스토리지'],
  ['네트워크/방화벽',       '', '네트워크/방화벽'],
  ['이중화 솔루션',         '', '이중화 솔루션'],
  ['백업 솔루션',           '', '백업 솔루션'],
  ['가상화 솔루션',         '', '가상화 솔루션'],
  ['화상회의솔루션',        '', '화상회의솔루션'],
  ['소프트웨어',            '', '소프트웨어'],
  ['GstarCAD',              '', 'GstarCAD'],
  ['유지보수/기술문의',     '', '유지보수/기술문의'],
  ['리스/렌탈/데모',        '', '리스/렌탈/데모'],
  // 이름만으로 카테고리를 알 수 없는 예외 캠페인 (엑셀 37~59행). 광고그룹 지정 항목을 먼저 둔다.
  // 구글·네이버 공통 적용 — 자사 광고·중소기업패키지·GDN_자사몰_최신 은 카테고리 없음('기타')이라 적지 않는다
  ['GDN_방화벽',            '(2606) GDN_방화벽_화웨이',    '네트워크/방화벽 > 화웨이'],
  ['GDN_방화벽',            '(2606) GDN_방화벽_FortiGate', '네트워크/방화벽 > FortiGate'],
  ['GDN_방화벽',            '(2606) GDN_방화벽_PaloAlto',  '네트워크/방화벽 > PaloAlto'],
  ['GDN_SAN스토리지',       'GDN_화웨이 스토리지',         'SAN 스토리지 > 화웨이'],
  ['★HPE_MDF',             '', 'HPE 서버'],
  ['★HPE_MDF_0706~',       '', 'HPE 서버'],
  ['HP 데모',               '', '리스/렌탈/데모'],
  ['GDN_이중화솔루션',      '', '이중화 솔루션'],
  ['GDN_HP노트북',          '', '노트북 > HP 노트북'],
  ['GDN_유지보수',          '', '유지보수/기술문의'],
  ['GDN_HP모니터',          '', '모니터'],
  ['GDN_GPU',               '', 'GPU/AI 서버'],
  ['GDN_방화벽',            '', '네트워크/방화벽'],
  ['GDN_HPE 서버',          '', 'HPE 서버'],
  ['GDN_Dell 서버',         '', 'Dell 서버'],
  ['GDN_화웨이MDF',         '', 'SAN 스토리지 > 화웨이'],
  ['GDN_SAN스토리지',       '', 'SAN 스토리지'],
  ['GDN_GstarCAD',          '', 'GstarCAD'],
  ['GDN_HP데스크탑',        '', '데스크탑'],
  ['GDN_ZBook',             '', '모바일 워크스테이션'],
  ['GDN_3Dconnexion',       '', '3Dconnexion'],
  ['GDN_데스크탑 워크스테이션', '', '데스크탑 워크스테이션'],
];

/**
 * 캠페인명과 광고그룹명으로 카테고리를 결정한다.
 * mapping 시트에 수동 지정이 없을 때 폴백으로 사용된다.
 * - 캠페인명에 " > " 가 포함되면 GDN 캠페인명 자체가 카테고리 경로이므로 그대로 반환
 * - CAT_LOOKUP 에서 캠페인(+광고그룹) 정확 일치 우선 탐색
 * - 일치 없으면 광고그룹·캠페인 이름으로 찾는다 (옛 캠페인명, 쇼핑검색·자사몰처럼 여러 카테고리를 담는 캠페인)
 */
export function standardCategoryOf(campaign = '', adgroup = ''): string {
  const c = String(campaign).trim();
  const g = String(adgroup).trim();

  // GDN 등 캠페인명 자체에 경로가 인코딩된 경우 ("SAN 스토리지 > 화웨이" 등)
  if (c.includes(' > ')) return c;

  for (const [camp, grp, cat] of CAT_LOOKUP) {
    if (c === camp && (grp === '' || g === grp)) return cat;
  }

  return categoryFromAdNames(c, g);
}

/** "1차 > 2차" 형태의 카테고리 문자열을 분리. ">" 없으면 cat2는 빈 문자열 */
export function parseCatParts(cat: string): { cat1: string; cat2: string } {
  const idx = cat.indexOf(' > ');
  return idx >= 0 ? { cat1: cat.slice(0, idx), cat2: cat.slice(idx + 3) } : { cat1: cat, cat2: '' };
}

export function buildCategoryMap(mapping: MappingRow[]): CategoryMap {
  const map: CategoryMap = new Map();
  mapping
    .filter((r) => String(r.category || '').trim())
    .forEach((r) => {
      const k = [
        String(r.media || '').trim(),
        String(r.campaign || '').trim(),
        String(r.ad_group || '').trim(),
      ].join('\u0001');
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push({
        c: String(r.category).trim(),
        w: (Number(r.ratio) || 100) / 100,
      });
    });
  return map;
}

export function catsOf(map: CategoryMap, r: SpendRow): CategoryWeight[] {
  const camp = r.campaign.trim();
  const grp = r.adgroup.trim();
  const hit =
    map.get([r.media, camp, grp].join('\u0001')) || map.get([r.media, camp, ''].join('\u0001'));
  // mapping 시트에 예전 분류(서버·워크스테이션·스토리지…)만 남아 있으면 새 카테고리 체계로 다시 계산한다
  if (hit && !hit.every(({ c }) => LEGACY_CATS.has(c))) return hit;
  return [{ c: standardCategoryOf(camp, grp), w: 1 }];
}

export function catSum(
  map: CategoryMap,
  rows: SpendRow[],
  f: (r: SpendRow) => number
): Record<string, number> {
  const o: Record<string, number> = {};
  rows.forEach((r) =>
    catsOf(map, r).forEach(({ c, w }) => {
      o[c] = (o[c] || 0) + f(r) * w;
    })
  );
  return o;
}

export function sourceColorVar(source: string): string {
  if (source === '네이버(광고)' || source === 'Naver') return '--c-n';
  if (source.startsWith('네이버')) return '--c-n2';
  if (source === '구글(광고)' || source === 'Google') return '--c-g';
  if (source.startsWith('구글')) return '--c-g2';
  if (source.startsWith('Meta')) return '--c-m';
  if (source.startsWith('카카오')) return '--c-ka';
  if (source === '직접') return '--c-it';
  return '--sub';
}

/**
 * 유입 매체 뱃지·막대 색. 구글·네이버는 매체 그룹 색(--grp-*)을 따라 다른 화면(광고비 표 등)과 맞추고,
 * 광고는 진하게·검색/블로그는 연하게 구분한다. 직접은 포인트(인디고), 그 밖은 중립 회색.
 */
export function sourceTone(source: string): { bg: string; ink: string; bar: string } {
  const lighter = (ink: string) => `color-mix(in srgb, ${ink} 45%, var(--card))`;
  const isAd = source.includes('광고') || source === 'Google' || source === 'Naver';
  if (source.startsWith('구글') || source === 'Google') {
    const ink = 'var(--grp-google-ink)';
    return { bg: 'var(--grp-google-bg)', ink, bar: isAd ? ink : lighter(ink) };
  }
  if (source.startsWith('네이버') || source === 'Naver') {
    const ink = 'var(--grp-naver-ink)';
    return { bg: 'var(--grp-naver-bg)', ink, bar: isAd ? ink : lighter(ink) };
  }
  if (source === '직접') return { bg: 'var(--accbg)', ink: 'var(--accink)', bar: 'var(--acc)' };
  if (source.startsWith('Meta')) {
    return { bg: 'color-mix(in srgb, var(--c-m) 14%, var(--card))', ink: 'var(--c-m)', bar: 'var(--c-m)' };
  }
  if (source.startsWith('카카오')) {
    return { bg: 'color-mix(in srgb, var(--c-ka) 16%, var(--card))', ink: 'var(--ink2)', bar: 'var(--c-ka)' };
  }
  return { bg: 'var(--bg)', ink: 'var(--sub)', bar: 'var(--line2)' };
}

export function buildSourceShareData(
  quotesRaw: QuoteRawRow[],
  yearPrefix: string,
  quotesMonthly?: QuoteRow[],
  /** 이 달(YYYY-MM)까지만 센다 — 누적 수치가 선택한 달 이후를 포함하지 않게 */
  lastMonth?: string
): { bySource: Record<string, number>; topSourceKey: string; items: SourceShareItem[] } {
  const bySource: Record<string, number> = {};
  const withinPeriod = (date: string) => date.startsWith(yearPrefix) && (!lastMonth || date.slice(0, 7) <= lastMonth);
  const rawFiltered = quotesRaw.filter(
    (r) => r.date && withinPeriod(r.date) && r.source && r.source !== '미수집'
  );

  if (rawFiltered.length > 0) {
    rawFiltered.forEach((r) => {
      bySource[r.source] = (bySource[r.source] || 0) + 1;
    });
  } else if (quotesMonthly?.length) {
    quotesMonthly
      .filter((r) => r.month && withinPeriod(r.month) && r.source && r.source !== '미수집')
      .forEach((r) => {
        bySource[r.source] = (bySource[r.source] || 0) + r.count;
      });
  }

  const sortedKeys = Object.keys(bySource).sort((a, b) => bySource[b] - bySource[a]);
  const topSourceKey = sortedKeys[0] || '–';
  const total = Object.values(bySource).reduce((a, b) => a + b, 0);
  const items: SourceShareItem[] = total
    ? sortedKeys.map((k) => {
        const rawPct = (bySource[k] / total) * 100;
        const v = rawPct > 0 && rawPct < 0.1 ? 0.1 : Math.round(rawPct * 10) / 10;
        return {
          k,
          c: sourceColorVar(k),
          v,
          count: bySource[k],
        };
      })
    : [];

  return { bySource, topSourceKey, items };
}

/** 현재 기간 항목에 비교 기간의 점유율·건수를 붙인다. 현재 기간에 없는 매체는 목록에 올리지 않는다 */
export function withSourceCompare(cur: SourceShareItem[], prev: SourceShareItem[]): SourceShareItem[] {
  const prevOf = new Map(prev.map((p) => [p.k, p]));
  return cur.map((s) => ({
    ...s,
    prevV: prevOf.get(s.k)?.v ?? 0,
    prevCount: prevOf.get(s.k)?.count ?? 0,
  }));
}

export function buildCategoryBarItems(
  curSpendByCat: Record<string, number>,
  prevSpendByCat: Record<string, number>,
  quoteCountOf: (category: string) => number,
  includeQuotes = true,
  topLimit = 7,
  sortBy: 'spend' | 'quotes' = 'spend'
): CategoryBarItem[] {
  // "1차 > 2차" 형식 키를 1차 카테고리 단위로 합산
  const aggCur: Record<string, number> = {};
  const aggPrev: Record<string, number> = {};
  const aggQ: Record<string, number> = {};
  const inputKeys = [...new Set([...Object.keys(curSpendByCat), ...Object.keys(prevSpendByCat)])];

  inputKeys.forEach((k) => {
    const sep = k.indexOf(' > ');
    const pk = sep >= 0 ? k.slice(0, sep) : k;
    aggCur[pk]  = (aggCur[pk]  || 0) + (curSpendByCat[k]  || 0);
    aggPrev[pk] = (aggPrev[pk] || 0) + (prevSpendByCat[k] || 0);
    aggQ[pk]    = (aggQ[pk]    || 0) + quoteCountOf(k);
  });

  const allKeys = Object.keys(aggCur).sort((a, b) => {
    if (sortBy === 'quotes') {
      const qDiff = (aggQ[b] || 0) - (aggQ[a] || 0);
      if (qDiff !== 0) return qDiff;
    }
    return (aggCur[b] || 0) - (aggCur[a] || 0);
  });

  const topKeys = allKeys.slice(0, topLimit);
  const restKeys = allKeys.slice(topLimit);

  const items: CategoryBarItem[] = topKeys.map((k) => ({
    k,
    cur:  aggCur[k]  / 1e4,
    prev: aggPrev[k] / 1e4,
    ...(includeQuotes ? { q: aggQ[k] } : {}),
  }));

  if (restKeys.length) {
    items.push({
      k: `기타 ${restKeys.length}개`,
      cur:  sumBy(restKeys, (k) => aggCur[k]  || 0) / 1e4,
      prev: sumBy(restKeys, (k) => aggPrev[k] || 0) / 1e4,
      ...(includeQuotes ? { q: sumBy(restKeys, (k) => aggQ[k] || 0) } : {}),
    });
  }

  return items;
}

/** 광고 카테고리(새 체계) → 견적 데이터 카테고리(개편 전 체계) 역매핑 */
export const AD_TO_QUOTE_CAT: Record<string, string> = {
  'HPE 서버': '서버', 'Dell 서버': '서버', 'Lenovo 서버': '서버',
  'GPU/AI 서버': '서버', '서버공통(주변장비)': '서버',
  '데스크탑 워크스테이션': '워크스테이션', '모바일 워크스테이션': '워크스테이션',
  'AI Station': '워크스테이션',
  'SAN 스토리지': '스토리지', 'NAS 스토리지': '스토리지',
  'SAN 스토리지 > 화웨이': '스토리지', 'SAN 스토리지 > NetAPP': '스토리지',
  'SAN 스토리지 > MSA': '스토리지', 'NAS 스토리지 > 시놀로지': '스토리지',
  '노트북 > HP 노트북': '노트북', '노트북 > Lenovo 노트북': '노트북',
  'MS서피스': 'PC', '데스크탑': 'PC',
  '모니터': '모니터',
};

/**
 * 새 광고 카테고리에 대응하는 견적 건수를 반환한다.
 * 견적 시트가 아직 옛 7분류를 쓰면 같은 그룹 내 광고비 비율로 비례 배분한다.
 */
export function quoteCountFor(
  quotesForMonth: QuoteRow[],
  cat: string,
  catSpend: Record<string, number>
): number {
  const direct = quotesForMonth.filter((r) => r.category === cat).reduce((a, r) => a + r.count, 0);
  if (direct > 0) return direct;

  const quoteCat = AD_TO_QUOTE_CAT[cat];
  if (!quoteCat) return 0;

  const groupTotal = quotesForMonth
    .filter((r) => r.category === quoteCat)
    .reduce((a, r) => a + r.count, 0);
  if (!groupTotal) return 0;

  const siblings = Object.keys(AD_TO_QUOTE_CAT).filter((k) => AD_TO_QUOTE_CAT[k] === quoteCat);
  const siblingSpend = siblings.reduce((s, k) => s + (catSpend[k] || 0), 0);
  const mySpend = catSpend[cat] || 0;
  if (!siblingSpend) return Math.round(groupTotal / siblings.length);
  return Math.round(groupTotal * (mySpend / siblingSpend));
}

/** 수동 지정 키 — 아이티켓은 sno, 다른 사이트는 sno 가 겹칠 수 있어 "사이트:sno" */
export const quoteKey = (q: { site?: string; sno?: string | number }): string =>
  q.site ? `${q.site}:${q.sno ?? ''}` : String(q.sno ?? '');
