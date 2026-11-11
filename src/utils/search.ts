import type { AdRow, CategoryMap, DashboardData, KeywordGroup, KeywordRow, QuoteRawRow, SpendRow } from '../types/dashboard';
import { mergeKeywordMonths, periodStartsOf } from './allPeriod';
import { adStatKey, type AdStat } from './creativeImage';
import { catsOf, parseCatParts } from './format';
import { inDayRange, type DayRange } from './dayRange';
import { goodsCategoryOf } from './categoryText';
import { GODOMALL_GOODS, GODOMALL_ORDER_LINES, GODOMALL_ORDERS, salesInRange, type GodoOrderLine } from '../data/godomallOrders';

export type SearchTab = 'groups' | 'keywords' | 'ads' | 'quotes';

export interface SearchAd {
  ad: AdRow;
  stat?: AdStat;
}

export interface SearchResult {
  /** 이름·카테고리·매체가 일치한 광고그룹, 광고비 큰 순 */
  groups: SpendRow[];
  /** 글자가 일치한 키워드 (달별 실적 합침), 광고비 큰 순 */
  keywords: KeywordRow[];
  /** 제목·설명 또는 소속 광고그룹이 일치한 소재, 광고비 큰 순 */
  ads: SearchAd[];
  /** 일치한 견적, 최신 순 */
  quotes: QuoteRawRow[];
  /** 합계의 원본 행 — 일치한 광고그룹 실적과, 그 밖의 광고그룹에서 일치한 키워드 실적 */
  spendRows: SpendRow[];
  cost: number;
  imp: number;
  clk: number;
  conv: number;
  /** 광고그룹은 일치하지 않고 키워드만 일치한 광고그룹 수 */
  keywordOnlyGroups: number;
  /** 아이티켓 사이트 견적 수 (구성 표시용 — CPA 는 전체 견적 기준) */
  itketQuotes: number;
  /** 추정 CPA — 광고비와 견적이 모두 있는 달만 계산한다 */
  cpa: number;
  /** 추정 CPA 의 분자·분모 — 광고비와 견적이 모두 있는 달만 */
  cpaCost: number;
  cpaQuotes: number;
  /** 매체·유입 경로로 찾은 결과라 CPA 를 계산하지 않았다 (견적의 유입 추적이 광고비보다 늦게 시작해 기간이 맞지 않는다) */
  cpaHidden: boolean;
  /** 일치한 고도몰 판매 건수 (주문 수) — 판매 자료가 없는 기간이면 null */
  sales: number | null;
  /** 일치한 판매 주문 줄 (주문 × 제품) */
  salesLines: SearchSaleLine[];
}

/** 검색에 일치한 판매 주문 줄 — 제품명과, 제품명으로 찾은 카테고리를 함께 담는다 */
export interface SearchSaleLine extends GodoOrderLine {
  goodsName: string;
  category: string;
}

/** 판매 주문 줄에 제품명·카테고리를 붙인다. 제품명은 그 달 판매 제품 목록의 이름, 없으면 다른 달의 이름 */
function saleLinesWithGoods(): SearchSaleLine[] {
  const byMonth = new Map<string, string>();
  const byNo = new Map<string, string>();
  Object.entries(GODOMALL_GOODS).forEach(([month, rows]) =>
    rows.forEach((g) => {
      byMonth.set(`${month}|${g.no}`, g.name);
      byNo.set(g.no, g.name);
    })
  );
  return GODOMALL_ORDER_LINES.map((line) => {
    const goodsName = byMonth.get(`${line.month}|${line.goodsNo}`) ?? byNo.get(line.goodsNo) ?? '';
    // 견적 제목과 같은 분류 규칙(categoryText)에 판매 제품 보정 규칙을 더해 제품명을 카테고리로 바꾼다
    return { ...line, goodsName, category: goodsCategoryOf(goodsName) };
  });
}

/** 고도몰 판매는 모두 아이티켓 쇼핑몰 주문이다 — "아이티켓"으로 찾으면 견적처럼 접수처로 일치시킨다 */
const SALES_SITE = '아이티켓';

/** 검색 결과를 광고그룹 표로 — 합계에 들어간 실적 그대로 묶어, 표의 합이 위쪽 광고비 카드와 같다. 펼치면 그 그룹의 키워드가 나온다 */
export function resultAdGroups(result: SearchResult): KeywordGroup[] {
  const map = new Map<string, KeywordGroup & { totals: { imp: number; clk: number; conv: number } }>();
  const keyOf = (r: { media: string; campaign: string; adgroup: string }) => [r.media, r.campaign, r.adgroup].join('\u0001');
  result.spendRows.forEach((r) => {
    const k = keyOf(r);
    let g = map.get(k);
    if (!g) {
      g = { media: r.media, campaign: r.campaign, adgroup: r.adgroup, cost: 0, list: [], totals: { imp: 0, clk: 0, conv: 0 } };
      map.set(k, g);
    }
    g.cost += r.cost;
    g.totals.imp += r.imp;
    g.totals.clk += r.clk;
    g.totals.conv += r.conv;
  });
  result.keywords.forEach((kw) => map.get(keyOf(kw))?.list.push(kw));
  return [...map.values()].sort((a, b) => b.cost - a.cost);
}

/** 매체 코드의 한글 이름 — "네이버" 로 찾아도 Naver 광고가 나오게 한다 */
const MEDIA_KO: Record<string, string> = { Google: '구글', Naver: '네이버', Meta: '메타' };

const compact = (s?: string | number): string => String(s ?? '').toLowerCase().replace(/\s+/g, '');

/**
 * 단계 선택 검색 — "캠페인 › 광고그룹 › 키워드" 형태의 검색어.
 * 글자 포함이 아니라 이름이 정확히 같은 항목만 찾는다. 광고그룹·키워드는 생략할 수 있다.
 * 검색어 문자열 하나로 표현하므로 즐겨찾기·최근 검색어·주소(#search?q=)가 그대로 동작한다.
 */
export interface SearchScope {
  campaign: string;
  adgroup?: string;
  keyword?: string;
  /** 표준 카테고리로 찾을 때 — "카테고리: 1차 › 2차". 이때 campaign 은 비어 있다 */
  cat1?: string;
  cat2?: string;
  /** 유입 매체로 찾을 때 — "유입 매체: 구글(광고)". 견적의 유입 매체 값이 정확히 같은 것만 본다. 이때 campaign 은 비어 있다 */
  source?: string;
}

export const SCOPE_SEP = '›';
const CATEGORY_PREFIX = '카테고리:';
const SOURCE_PREFIX = '유입 매체:';

export function parseScope(query: string): SearchScope | null {
  if (query.trim().startsWith(SOURCE_PREFIX)) {
    const source = query.trim().slice(SOURCE_PREFIX.length).trim();
    return source ? { campaign: '', source } : null;
  }
  if (query.trim().startsWith(CATEGORY_PREFIX)) {
    const [cat1, cat2] = query.trim().slice(CATEGORY_PREFIX.length).split(SCOPE_SEP).map((p) => p.trim());
    return cat1 ? { campaign: '', cat1, cat2: cat2 || undefined } : null;
  }
  if (!query.includes(SCOPE_SEP)) return null;
  const [campaign, adgroup, keyword] = query.split(SCOPE_SEP).map((p) => p.trim());
  return campaign ? { campaign, adgroup: adgroup || undefined, keyword: keyword || undefined } : null;
}

export const formatScope = (parts: (string | undefined)[]): string =>
  parts.filter(Boolean).join(` ${SCOPE_SEP} `);

/** 표준 카테고리 단계 검색어 — "카테고리: HPE 서버" 또는 "카테고리: 노트북 › HP 노트북" */
export const formatCategoryScope = (cat1: string, cat2?: string): string =>
  `${CATEGORY_PREFIX} ${formatScope([cat1, cat2])}`;

/** 유입 매체 단계 검색어 — "유입 매체: 구글(광고)". 종합 요약의 유입 매체 표 이름을 눌렀을 때 쓴다 */
export const formatSourceScope = (source: string): string => `${SOURCE_PREFIX} ${source}`;

/** 검색어를 띄어쓰기로 나눈다. 비교할 때 양쪽 공백을 무시하므로 "HP 서버" 는 "HP서버" 도 찾는다 */
export const searchTokens = (query: string): string[] =>
  query.toLowerCase().split(/\s+/).filter(Boolean);

const matches = (tokens: string[], fields: (string | number | undefined)[]): boolean => {
  const text = fields.map(compact).join('\u0001');
  return tokens.every((t) => text.includes(t));
};

const groupKey = (r: { media: string; type: string; campaign: string; adgroup: string }): string =>
  [r.media, r.type, r.campaign.trim(), r.adgroup.trim()].join('\u0001');

/** 견적이 들어온 사이트 이름 — 아이티켓 원장은 비어 있고, 전화문의는 문의 유형으로 찾는다 */
const siteNameOf = (r: QuoteRawRow): string => (!r.site ? '아이티켓' : r.site === 'phone' ? '' : r.site);

const sumInto = (a: SpendRow, b: SpendRow): void => {
  a.cost += b.cost;
  a.imp += b.imp;
  a.clk += b.clk;
  a.conv += b.conv;
};

/** 이름이 일치하는 견적을 찾을 행 — 어드민 원본이 내려오면 그쪽(제목·고객 정보 있음), 아니면 통계용 행을 쓴다 */
const quoteRowsOf = (data: DashboardData): QuoteRawRow[] => {
  const adminRows = [...(data.quotesSites || []), ...(data.quotesPhone || [])];
  return [...data.quotesRaw, ...(adminRows.length ? adminRows : data.quotesExtra || [])];
};

/**
 * 검색어에 맞는 광고·견적을 모아 요약한다. months 가 null 이면 전체 기간이다.
 * 광고비는 일치한 광고그룹과, 그 밖의 광고그룹에서 일치한 키워드만 더해 같은 금액을 두 번 세지 않는다.
  * 카테고리로만 일치한 광고그룹은 분류표의 비율만큼만 더해 카테고리 효율 화면의 금액과 맞춘다.
 * range 가 있으면 견적은 그 날짜 안의 것만 본다. 광고비(data.spend)가 이미 그 기간의 일별 합계로 바뀌어 있으면(exactSpend) 기간이 맞으므로 CPA 도 계산하고,
 * 아니면 광고는 월 단위(범위가 걸친 달 전체)라 CPA 를 계산하지 않는다.
 */
export function searchDashboard(
  data: DashboardData,
  categoryMap: CategoryMap,
  query: string,
  months: string[] | null,
  range: DayRange | null = null,
  exactSpend = false
): SearchResult {
  // 단계 선택 검색이면 글자 검색 대신 이름이 같은 항목만 본다
  const scope = parseScope(query);
  const sameName = (a?: string, b?: string) => compact(a) === compact(b);
  const inScope = (r: { campaign: string; adgroup: string }) =>
    !!scope && sameName(r.campaign, scope.campaign) && (!scope.adgroup || sameName(r.adgroup, scope.adgroup));
  // SA·DA 는 글자 포함으로 찾으면 "samsung" 같은 이름까지 걸리므로 광고 구분으로만 본다
  const allTokens = scope ? [] : searchTokens(query);
  const typeTokens = allTokens.filter((t) => t === 'sa' || t === 'da');
  const tokens = allTokens.filter((t) => t !== 'sa' && t !== 'da');
  const typeOk = (type: string) => typeTokens.length === 0 || typeTokens.some((t) => t === type.toLowerCase());
  const textHit = (type: string, fields: (string | undefined)[]) =>
    tokens.length > 0 && typeOk(type) && matches(tokens, fields);
  const set = months && new Set(months);
  const inPeriod = (month: string) => !set || set.has(month);

  // 광고그룹
  let channelSearch = false;
  const weights = new Map<string, number>();
  /** 광고그룹이 검색어에 해당하는 비율 — 이름·매체·SA/DA 가 맞으면 1, 카테고리만 맞으면 그 카테고리의 비율, 아니면 0 */
  const groupWeight = (r: { media: string; type: string; campaign: string; adgroup: string }): number => {
    const k = groupKey(r);
    const known = weights.get(k);
    if (known !== undefined) return known;
    // 유입 매체 검색은 견적만 본다 — 광고그룹·키워드·소재는 유입 매체 값과 이어지지 않는다
    if (scope?.source) {
      weights.set(k, 0);
      return 0;
    }
    if (scope?.cat1) {
      // 표준 카테고리로 찾기 — 분류표 비율만큼만 더한다 (카테고리 효율 화면의 금액과 맞춘다)
      const cats = catsOf(categoryMap, { ...r, month: '', cost: 0, imp: 0, clk: 0, conv: 0 });
      const w = cats
        .filter(({ c }) => {
          const p = parseCatParts(c);
          return p.cat1 === scope.cat1 && (!scope.cat2 || p.cat2 === scope.cat2);
        })
        .reduce((a, { w: cw }) => a + cw, 0);
      weights.set(k, w);
      return w;
    }
    if (scope) {
      // 키워드까지 골랐으면 광고그룹 전체가 아니라 그 키워드의 실적만 더하므로, 광고그룹은 일치로 치지 않는다
      const w = !scope.keyword && inScope(r) ? 1 : 0;
      weights.set(k, w);
      return w;
    }
    const names = [r.media, MEDIA_KO[r.media], r.campaign, r.adgroup];
    const cats = catsOf(categoryMap, { ...r, month: '', cost: 0, imp: 0, clk: 0, conv: 0 });
    let weight = 0;
    if (!typeOk(r.type)) weight = 0;
    else if (matches(tokens, names)) weight = 1;
    else if (matches(tokens, [...names, ...cats.map(({ c }) => c)])) {
      const catWeight = cats.filter(({ c }) => matches(tokens, [c])).reduce((a, { w }) => a + w, 0);
      // catWeight=0: 토큰이 이름·카테고리에 나뉘어 맞는 경우 → 비율 미정이므로 전체(1)
      // catWeight<0.2: 카테고리 연결 비율이 낮아 관련성이 약한 그룹 → 제외
      weight = catWeight === 0 ? 1 : catWeight >= 0.2 ? catWeight : 0;
    }
    // 이름·카테고리로는 안 맞고 매체 덕분에 맞았다
    if (weight && !matches(tokens, [r.campaign, r.adgroup, ...cats.map(({ c }) => c)])) channelSearch = true;
    weights.set(k, weight);
    return weight;
  };
  const groupMap = new Map<string, SpendRow>();
  const spendRows: SpendRow[] = [];
  data.spend.forEach((r) => {
    if (!inPeriod(r.month)) return;
    const w = groupWeight(r);
    if (!w) return;
    const row = w === 1 ? r : { ...r, cost: r.cost * w, imp: r.imp * w, clk: r.clk * w, conv: r.conv * w };
    spendRows.push(row);
    const k = groupKey(r);
    const cur = groupMap.get(k);
    if (cur) sumInto(cur, row);
    else groupMap.set(k, { ...row });
  });
  const groups = [...groupMap.values()].sort((a, b) => b.cost - a.cost);

  // 키워드 — 글자가 맞거나 일치한 광고그룹에 속한 것. 합계에는 일치하지 않은 광고그룹의 것만 더한다 (광고그룹 실적에 이미 들어 있다)
  const keywordHits = data.keywords.filter(
    (k) =>
      inPeriod(k.month) &&
      (scope
        ? scope.source
          ? false
          : scope.cat1
            ? groupWeight(k) > 0
            : inScope(k) && (!scope.keyword || sameName(k.keyword, scope.keyword))
        : groupWeight(k) > 0 || textHit(k.type, [k.keyword]))
  );
  const keywordOnly = new Set<string>();
  keywordHits.forEach((k) => {
    if (groupWeight(k)) return;
    keywordOnly.add(groupKey(k));
    spendRows.push({
      month: k.month,
      media: k.media,
      type: k.type,
      campaign: k.campaign,
      adgroup: k.adgroup,
      cost: k.cost,
      imp: k.imp,
      clk: k.clk,
      conv: k.conv,
    });
  });
  const keywords = mergeKeywordMonths(keywordHits).sort((a, b) => b.cost - a.cost || b.clk - a.clk);

  // 소재
  const stats = new Map<string, AdStat>();
  (data.adStats || []).forEach((s) => {
    if (!inPeriod(s.month)) return;
    const k = adStatKey(s.media, s.adId);
    const cur = stats.get(k);
    if (cur) {
      cur.cost += s.cost;
      cur.imp += s.imp;
      cur.clk += s.clk;
      cur.conv += s.conv;
    } else {
      stats.set(k, { cost: s.cost, imp: s.imp, clk: s.clk, conv: s.conv });
    }
  });
  const ads = data.ads
    .filter((a) => groupWeight(a) > 0 || textHit(a.type, [a.title, ...(a.titles || []), ...(a.descs || [])]))
    .map((ad) => ({ ad, stat: stats.get(adStatKey(ad.media, ad.adId)) }))
    .sort((a, b) => (b.stat?.cost || 0) - (a.stat?.cost || 0));

  // 견적 — 고객 정보는 로그인한 관리자에게만 내려오므로 없으면 찾지 못한다.
  // 단계 선택 검색은 가장 아래 단계의 이름(키워드 > 광고그룹 > 캠페인)이 견적의 유입 상세·제목에 들어 있는 것만 본다
  const quoteTokens = scope ? [compact(scope.keyword || scope.adgroup || scope.campaign)] : tokens;
  const quotes = quoteRowsOf(data)
    .filter((r) => {
      // 유입 매체 검색: 견적의 유입 매체가 정확히 같은 것. 광고비 없이 견적만이라 CPA 는 계산하지 않는다
      if (scope?.source) {
        if (!r.date || !inPeriod(r.date.slice(0, 7)) || !r.source) return false;
        const hit = sameName(r.source, scope.source);
        if (hit) channelSearch = true;
        return hit;
      }
      // 표준 카테고리 검색: 견적의 카테고리가 같은 1차(·2차)인 것
      if (scope?.cat1) {
        if (!r.date || !inPeriod(r.date.slice(0, 7)) || !r.category) return false;
        const p = parseCatParts(r.category);
        return p.cat1 === scope.cat1 && (!scope.cat2 || p.cat2 === scope.cat2);
      }
      if (!quoteTokens.length || !r.date || !inPeriod(r.date.slice(0, 7))) return false;
      const plain = [r.subject, r.category, r.sourceDetail, r.salesRep, r.sno, r.company, r.name, r.receiver];
      if (matches(quoteTokens, plain)) return true;
      if (scope) return false;
      const channel = matches(tokens, [...plain, r.source, r.inquiryType, siteNameOf(r)]);
      if (channel) channelSearch = true;
      return channel;
    })
    .filter((r) => !range || inDayRange(r.date, range))
    .sort((a, b) => b.date.localeCompare(a.date));

  // 판매 — 견적과 같은 규칙으로 고도몰 결제 주문을 거른다. 주문의 유입 경로·상세가 기록돼 있지 않으면(현재 전부 미수집)
  // 캠페인·광고그룹·키워드와는 제품명·제품 카테고리에 그 이름이 들어 있을 때만 이어진다
  const saleInPeriod = (l: GodoOrderLine) => (range ? inDayRange(l.paid, range) : inPeriod(l.month));
  const salesLines = saleLinesWithGoods()
    .filter((l) => {
      if (!saleInPeriod(l)) return false;
      if (scope?.source) return sameName(l.source, scope.source);
      if (scope?.cat1) {
        const p = parseCatParts(l.category);
        return p.cat1 === scope.cat1 && (!scope.cat2 || p.cat2 === scope.cat2);
      }
      if (!quoteTokens.length) return false;
      const plain = [l.goodsName, l.category, l.detail];
      if (matches(quoteTokens, plain)) return true;
      if (scope) return false;
      return matches(tokens, [...plain, l.source === '미수집' ? '' : l.source, SALES_SITE]);
    })
    .sort((a, b) => b.paid.localeCompare(a.paid));
  // 판매 건수는 주문 수 — 한 주문에 제품이 여럿이면 한 번만 센다 (월별 판매 건수와 같은 기준)
  const salesCovered =
    GODOMALL_ORDER_LINES.length > 0 &&
    (range ? salesInRange(range.from, range.to) !== null : !months || months.some((m) => m in GODOMALL_ORDERS));
  const sales = salesCovered ? new Set(salesLines.map((l) => l.key)).size : null;

  const sum = (f: (r: SpendRow) => number) => spendRows.reduce((a, r) => a + f(r), 0);
  const isItket = (r: QuoteRawRow) => !r.site && !r.inquiryType;
  const cpaFrom = periodStartsOf(data).cpaFrom;
  const cpaCost = spendRows.filter((r) => r.month >= cpaFrom).reduce((a, r) => a + r.cost, 0);
  // CPA 는 아이티켓·다른 사이트·전화문의를 모두 더한 견적 수로 나눈다 (2026-11-06 사용자 결정)
  const cpaQuotes = quotes.filter((r) => r.date.slice(0, 7) >= cpaFrom).length;

  return {
    groups,
    keywords,
    ads,
    quotes,
    spendRows,
    cost: sum((r) => r.cost),
    imp: sum((r) => r.imp),
    clk: sum((r) => r.clk),
    conv: sum((r) => r.conv),
    keywordOnlyGroups: keywordOnly.size,
    itketQuotes: quotes.filter(isItket).length,
    cpa: !channelSearch && (!range || exactSpend) && cpaQuotes > 0 ? cpaCost / cpaQuotes : 0,
    cpaCost,
    cpaQuotes,
    cpaHidden: channelSearch || (!!range && !exactSpend),
    sales,
    salesLines,
  };
}
