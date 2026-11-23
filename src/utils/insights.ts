import type { CategoryMap, KeywordRow, QuoteRow, SpendRow } from '../types/dashboard';
import { cat1Of, catSum, fmt, fmtWon, quoteCountFor, sumBy, LEGACY_ONLY_CATS } from './format';
import { inMonths } from './allPeriod';

/**
 * 종합 요약 KPI 아래 '자동 인사이트' — 수집된 실제 값만으로 규칙에 따라 요약·추천 문장을 만든다.
 * 추정·예측 값은 만들지 않는다 (숫자는 모두 화면의 다른 표와 같은 계산).
 */

export type InsightTone = 'summary' | 'good' | 'bad' | 'info';

export interface Insight {
  /** 종류 — 아이콘·색을 고른다 */
  tone: InsightTone;
  /** 굵게 보일 머리말 (예: '확대 검토') */
  head: string;
  /** 대상 이름 (카테고리·키워드). 누르면 검색으로 연다 */
  target?: string;
  /** 대상이 카테고리면 1차 이름 — 검색 단계 검색어를 만들 때 쓴다 */
  category?: string;
  /** 본문 */
  text: string;
}

/** 기간 합계 요약 입력 — KPI 카드와 같은 값을 넘긴다 */
export interface InsightTotals {
  spend: number;
  prevSpend: number | null;
  quotes: number;
  prevQuotes: number | null;
  cpa: number;
  prevCpa: number | null;
  /** 비교 기준 문구 ('전월'·'전년 동기'·'전월 동기간'). 비교하지 않으면 없음 */
  cmpLabel?: string;
}

/** 확대 추천: 견적이 이 건수 이상인 카테고리만 (한두 건은 우연일 수 있다) */
const MIN_QUOTES_FOR_SCALE = 3;
/** 확대 추천: 평균 CPA 의 이 배수 이하 */
const SCALE_CPA_RATIO = 0.8;
/** 축소 검토: 평균 CPA 의 이 배수 이상 */
const CUT_CPA_RATIO = 2;
/** 축소 검토: 기간 광고비에서 이 비중 이상을 쓴 카테고리만 */
const CUT_MIN_SHARE = 0.03;
/** 키워드 축소 검토: 전환 없이 이 금액 이상 쓴 키워드만 */
const KW_MIN_COST = 50000;
/** 각 묶음에서 보여 줄 최대 개수 */
const MAX_PER_GROUP = 3;

const pctChange = (cur: number, prev: number | null): number | null =>
  prev != null && prev > 0 ? ((cur - prev) / prev) * 100 : null;

const signedPct = (p: number): string => `${p > 0 ? '+' : ''}${p.toFixed(1)}%`;

/** 기간 합계 한 줄 요약 */
export function summaryInsight(t: InsightTotals): Insight | null {
  if (t.spend <= 0 && t.quotes <= 0) return null;
  const parts: string[] = [];
  const withDelta = (label: string, value: string, cur: number, prev: number | null) => {
    const p = t.cmpLabel ? pctChange(cur, prev) : null;
    parts.push(p == null ? `${label} ${value}` : `${label} ${value}(${signedPct(p)})`);
  };
  // 유입 매체 검색처럼 광고비가 없는 범위는 견적만 말한다 ('광고비 0원'으로 읽히지 않게)
  if (t.spend > 0) withDelta('광고비', `${fmt(t.spend)}원`, t.spend, t.prevSpend);
  withDelta('견적', `${fmt(t.quotes)}건`, t.quotes, t.prevQuotes);
  if (t.cpa > 0) withDelta('CPA', `${fmt(t.cpa)}원`, t.cpa, t.prevCpa);

  let verdict = '';
  const cpaP = t.cmpLabel ? pctChange(t.cpa, t.prevCpa) : null;
  if (cpaP != null && t.cpa > 0) {
    if (cpaP <= -5) verdict = ` 견적 1건을 얻는 비용이 ${t.cmpLabel}보다 ${Math.abs(cpaP).toFixed(0)}% 줄어 효율이 좋아졌습니다.`;
    else if (cpaP >= 5) verdict = ` 견적 1건을 얻는 비용이 ${t.cmpLabel}보다 ${cpaP.toFixed(0)}% 늘어 효율이 낮아졌습니다.`;
    else verdict = ` CPA는 ${t.cmpLabel}과 비슷합니다.`;
  }
  return {
    tone: 'summary',
    head: '요약',
    text: `${parts.join(' · ')}${t.cmpLabel ? ` (${t.cmpLabel} 대비)` : ''}.${verdict}`,
  };
}

interface Cat1Stat {
  k: string;
  cost: number;
  quotes: number;
}

/**
 * 1차 카테고리별 광고비·견적 — 카테고리 효율 화면과 같은 계산 (견적은 달마다 quoteCountFor 로 세어 더한다).
 * '기타'는 평균 계산에는 넣고, 추천 대상에서만 뺀다 (categoryInsights).
 */
export function cat1Stats(categoryMap: CategoryMap, spend: SpendRow[], quotes: QuoteRow[], months: string[]): Cat1Stat[] {
  const map = new Map<string, Cat1Stat>();
  const add = (cat: string, cost: number, q: number) => {
    const k = cat1Of(cat);
    const cur = map.get(k) || { k, cost: 0, quotes: 0 };
    cur.cost += cost;
    cur.quotes += q;
    map.set(k, cur);
  };
  months.forEach((mo) => {
    const inMo = inMonths([mo]);
    const catSpend = catSum(categoryMap, spend.filter(inMo), (r) => r.cost);
    const qRows = quotes.filter(inMo);
    const keys = new Set([
      ...Object.keys(catSpend),
      ...qRows.map((r) => r.category).filter((c): c is string => !!c && !LEGACY_ONLY_CATS.has(c)),
    ]);
    keys.forEach((c) => add(c, catSpend[c] || 0, quoteCountFor(qRows, c, catSpend)));
  });
  return [...map.values()].filter((c) => c.cost > 0 || c.quotes > 0);
}

/** 카테고리 확대·축소 추천 */
export function categoryInsights(stats: Cat1Stat[]): Insight[] {
  const totCost = sumBy(stats, (c) => c.cost);
  const totQuotes = sumBy(stats, (c) => c.quotes);
  if (totCost <= 0 || totQuotes <= 0) return [];
  const avg = totCost / totQuotes;
  const out: Insight[] = [];
  // '기타'는 제품군이 아니라 추천에서 뺀다 (평균에는 포함)
  const pool = stats.filter((c) => c.k !== '기타');

  pool
    .filter((c) => c.cost > 0 && c.quotes >= MIN_QUOTES_FOR_SCALE && c.cost / c.quotes <= avg * SCALE_CPA_RATIO)
    .sort((a, b) => b.quotes - a.quotes)
    .slice(0, MAX_PER_GROUP)
    .forEach((c) => {
      const cpa = c.cost / c.quotes;
      out.push({
        tone: 'good',
        head: '확대 검토',
        target: c.k,
        category: c.k,
        text: `CPA ${fmt(cpa)}원으로 평균(${fmt(avg)}원)보다 ${Math.round((1 - cpa / avg) * 100)}% 낮고 견적 ${fmt(c.quotes)}건 — 다음 달 이 카테고리 위주로 예산 비중을 늘려 볼 만합니다.`,
      });
    });

  pool
    .filter((c) => c.cost >= totCost * CUT_MIN_SHARE && (c.quotes === 0 || c.cost / c.quotes >= avg * CUT_CPA_RATIO))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, MAX_PER_GROUP)
    .forEach((c) => {
      const share = Math.round((c.cost / totCost) * 100);
      out.push({
        tone: 'bad',
        head: '축소 검토',
        target: c.k,
        category: c.k,
        text:
          c.quotes === 0
            ? `광고비 ${fmtWon(c.cost)}(전체의 ${share}%)를 썼지만 견적이 없습니다 — 예산을 줄이거나 키워드·소재를 점검해 보세요.`
            : `CPA ${fmt(c.cost / c.quotes)}원으로 평균의 ${(c.cost / c.quotes / avg).toFixed(1)}배 (광고비 ${fmtWon(c.cost)} · 견적 ${fmt(c.quotes)}건) — 효율 높은 카테고리로 예산을 옮기는 것을 검토해 보세요.`,
      });
    });
  return out;
}

const mediaName = (m: string): string => (m === 'Naver' ? '네이버' : m === 'Google' ? '구글' : m === 'Meta' ? '메타' : m);

/** 키워드 축소·유지 추천 — 매체 전환(conv) 기준. 같은 매체·키워드는 광고그룹을 합쳐 본다. months 를 안 주면 받은 행 전체 */
export function keywordInsights(rows: KeywordRow[], months?: string[]): Insight[] {
  const map = new Map<string, { media: string; keyword: string; cost: number; clk: number; conv: number }>();
  (months ? rows.filter(inMonths(months)) : rows).forEach((r) => {
    if (!r.keyword) return;
    const key = `${r.media}\u0001${r.keyword}`;
    const cur = map.get(key) || { media: r.media, keyword: r.keyword, cost: 0, clk: 0, conv: 0 };
    cur.cost += r.cost;
    cur.clk += r.clk;
    cur.conv += r.conv;
    map.set(key, cur);
  });
  const list = [...map.values()];
  const totCost = sumBy(list, (k) => k.cost);
  const totConv = sumBy(list, (k) => k.conv);
  if (totCost <= 0) return [];
  const out: Insight[] = [];

  list
    .filter((k) => k.conv === 0 && k.cost >= KW_MIN_COST)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, MAX_PER_GROUP)
    .forEach((k) =>
      out.push({
        tone: 'bad',
        head: '키워드 점검',
        target: k.keyword,
        text: `${mediaName(k.media)} · 광고비 ${fmtWon(k.cost)}, 클릭 ${fmt(k.clk)}회인데 전환 0건 — 입찰가를 낮추거나 제외 키워드로 돌리는 것을 검토해 보세요.`,
      })
    );

  if (totConv > 0) {
    const avgConvCost = totCost / totConv;
    list
      .filter((k) => k.conv >= 2 && k.cost / k.conv <= avgConvCost * 0.5)
      .sort((a, b) => b.conv - a.conv)
      .slice(0, 2)
      .forEach((k) =>
        out.push({
          tone: 'good',
          head: '키워드 유지',
          target: k.keyword,
          text: `${mediaName(k.media)} · 전환 ${fmt(k.conv)}건, 전환당 ${fmt(k.cost / k.conv)}원으로 키워드 평균(${fmt(avgConvCost)}원)의 절반 이하 — 노출이 끊기지 않게 입찰을 유지·확대해 보세요.`,
        })
      );
  }
  return out;
}

/** 카드 아래 기준 설명 — 카테고리·키워드 추천을 함께 보여 주는 화면 */
export const INSIGHT_FOOT_CAT_KW =
  '※ 견적은 카테고리 효율 화면과 같은 기준, 키워드는 매체 전환 기준입니다. 견적이 3건 미만인 카테고리는 확대 추천에서 뺍니다.';
export const INSIGHT_FOOT_CAT = '※ 견적은 위 표와 같은 기준입니다. 견적이 3건 미만인 카테고리는 확대 추천에서 뺍니다. \'기타\'는 평균에만 넣습니다.';
export const INSIGHT_FOOT_KW = '※ 매체 전환(광고 플랫폼이 집계한 전환) 기준이며, 견적 건수와는 다릅니다.';
export const INSIGHT_FOOT_MEDIA = '※ 매체 전환(광고 플랫폼이 집계한 전환) 기준입니다. 전환이 3건 미만인 매체는 비교하지 않습니다.';
export const INSIGHT_FOOT_QUOTE = '※ 1차 카테고리·유입 경로별로 3건 이상, 30% 이상 달라진 것만 보여 줍니다.';

/** 키워드 화면 요약 — 광고비·클릭·전환과 비교 기준 대비 증감 */
export function adTotalsInsight(
  cur: { cost: number; clk: number; conv: number },
  prev: { cost: number; clk: number; conv: number } | null,
  cmpLabel?: string
): Insight | null {
  if (cur.cost <= 0) return null;
  const d = (c: number, p: number | undefined) => {
    const v = cmpLabel && p != null ? pctChange(c, p) : null;
    return v == null ? '' : `(${signedPct(v)})`;
  };
  const cpc = cur.clk > 0 ? cur.cost / cur.clk : 0;
  const prevCpc = prev && prev.clk > 0 ? prev.cost / prev.clk : undefined;
  const convCost = cur.conv > 0 ? cur.cost / cur.conv : 0;
  const prevConvCost = prev && prev.conv > 0 ? prev.cost / prev.conv : undefined;
  const parts = [
    `광고비 ${fmt(cur.cost)}원${d(cur.cost, prev?.cost)}`,
    `클릭 ${fmt(cur.clk)}회${d(cur.clk, prev?.clk)}`,
    ...(cpc ? [`CPC ${fmt(cpc)}원${d(cpc, prevCpc)}`] : []),
    `전환 ${fmt(cur.conv)}건${d(cur.conv, prev?.conv)}`,
    ...(convCost ? [`전환당 ${fmt(convCost)}원${d(convCost, prevConvCost)}`] : []),
  ];
  return { tone: 'summary', head: '요약', text: `${parts.join(' · ')}${cmpLabel && prev ? ` (${cmpLabel} 대비)` : ''}.` };
}

interface MediaAgg {
  cost: number;
  clk: number;
  conv: number;
}

const aggBy = <K extends string>(rows: SpendRow[], keyOf: (r: SpendRow) => K): Map<K, MediaAgg> => {
  const map = new Map<K, MediaAgg>();
  rows.forEach((r) => {
    const k = keyOf(r);
    const cur = map.get(k) || { cost: 0, clk: 0, conv: 0 };
    cur.cost += r.cost;
    cur.clk += r.clk;
    cur.conv += r.conv;
    map.set(k, cur);
  });
  return map;
};

/** 매체 광고비 화면 — 매체 간 전환당 비용 비교, 비용은 늘었는데 전환이 준 매체, 전환 없는 큰 캠페인 */
export function mediaInsights(cur: SpendRow[], prev: SpendRow[] | null, cmpLabel?: string): Insight[] {
  const totCost = sumBy(cur, (r) => r.cost);
  if (totCost <= 0) return [];
  const out: Insight[] = [];
  const byMedia = aggBy(cur, (r) => r.media);

  // 매체 간 전환당 비용 — 전환 3건 이상인 매체끼리만
  const ranked = [...byMedia]
    .filter(([, v]) => v.conv >= 3 && v.cost > 0)
    .map(([m, v]) => ({ m, cpa: v.cost / v.conv, conv: v.conv, cost: v.cost }))
    .sort((a, b) => a.cpa - b.cpa);
  if (ranked.length >= 2) {
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    if (best.cpa <= worst.cpa * 0.7) {
      out.push({
        tone: 'good',
        head: '매체 비교',
        target: mediaName(best.m),
        text: `전환당 ${fmt(best.cpa)}원으로 ${mediaName(worst.m)}(${fmt(worst.cpa)}원)보다 ${Math.round((1 - best.cpa / worst.cpa) * 100)}% 낮습니다 — 다음 달 ${mediaName(best.m)} 비중을 늘려 볼 만합니다.`,
      });
    }
  }

  // 비용은 10% 이상 늘었는데 전환은 줄어든 매체
  if (prev && cmpLabel) {
    const prevMedia = aggBy(prev, (r) => r.media);
    byMedia.forEach((v, m) => {
      const p = prevMedia.get(m);
      if (!p || p.cost <= 0) return;
      const costP = pctChange(v.cost, p.cost);
      if (costP != null && costP >= 10 && v.conv < p.conv) {
        out.push({
          tone: 'bad',
          head: '효율 하락',
          target: mediaName(m),
          text: `광고비는 ${cmpLabel}보다 ${costP.toFixed(0)}% 늘었지만 전환은 ${fmt(p.conv)}건 → ${fmt(v.conv)}건으로 줄었습니다 — 늘어난 예산이 어느 캠페인에 쓰였는지 확인해 보세요.`,
        });
      }
    });
  }

  // 전환 없이 광고비 비중 5% 이상을 쓴 캠페인
  const byCamp = aggBy(cur, (r) => `${r.media}\u0001${r.campaign}`);
  [...byCamp]
    .filter(([, v]) => v.conv === 0 && v.cost >= totCost * 0.05)
    .sort((a, b) => b[1].cost - a[1].cost)
    .slice(0, MAX_PER_GROUP)
    .forEach(([k, v]) => {
      const [m, camp] = k.split('\u0001');
      out.push({
        tone: 'bad',
        head: '캠페인 점검',
        target: camp || '(이름 없음)',
        text: `${mediaName(m)} · 광고비 ${fmtWon(v.cost)}(전체의 ${Math.round((v.cost / totCost) * 100)}%), 클릭 ${fmt(v.clk)}회인데 전환 0건 — 예산·타기팅을 점검해 보세요.`,
      });
    });
  return out;
}

/** 견적 상세 화면 — 1차 카테고리·유입 경로별 견적 증감 (3건 이상·30% 이상 달라진 것만) */
export function quoteInsights(cur: QuoteRow[], prev: QuoteRow[], cmpLabel: string): Insight[] {
  const out: Insight[] = [];
  const sumByKey = (rows: QuoteRow[], keyOf: (r: QuoteRow) => string) => {
    const o: Record<string, number> = {};
    rows.forEach((r) => {
      const k = keyOf(r);
      if (k) o[k] = (o[k] || 0) + r.count;
    });
    return o;
  };
  const changes = (keyOf: (r: QuoteRow) => string) => {
    const c = sumByKey(cur, keyOf);
    const p = sumByKey(prev, keyOf);
    return [...new Set([...Object.keys(c), ...Object.keys(p)])]
      .map((k) => ({ k, cur: c[k] || 0, prev: p[k] || 0 }))
      .filter((x) => x.k !== '기타' && Math.abs(x.cur - x.prev) >= 3 && (x.prev === 0 || Math.abs(x.cur - x.prev) / x.prev >= 0.3));
  };

  const cats = changes((r) => cat1Of(r.category || ''));
  cats
    .filter((x) => x.cur > x.prev)
    .sort((a, b) => b.cur - b.prev - (a.cur - a.prev))
    .slice(0, MAX_PER_GROUP)
    .forEach((x) =>
      out.push({
        tone: 'good',
        head: '견적 증가',
        target: x.k,
        category: x.k,
        text: `${cmpLabel} ${fmt(x.prev)}건 → ${fmt(x.cur)}건 — 수요가 오르는 중이니 이 카테고리 광고 예산을 유지·확대해 볼 만합니다.`,
      })
    );
  cats
    .filter((x) => x.cur < x.prev)
    .sort((a, b) => a.cur - a.prev - (b.cur - b.prev))
    .slice(0, MAX_PER_GROUP)
    .forEach((x) =>
      out.push({
        tone: 'bad',
        head: '견적 감소',
        target: x.k,
        category: x.k,
        text: `${cmpLabel} ${fmt(x.prev)}건 → ${fmt(x.cur)}건 — 광고 노출·키워드 순위·소재에 변화가 있었는지 점검해 보세요.`,
      })
    );

  // '미수집'은 유입 경로가 아니라 기록 누락이라 뺀다
  changes((r) => (r.source === '미수집' ? '' : r.source || ''))
    .sort((a, b) => Math.abs(b.cur - b.prev) - Math.abs(a.cur - a.prev))
    .slice(0, 2)
    .forEach((x) =>
      out.push({
        tone: 'info',
        head: '유입 경로',
        target: x.k,
        text: `${cmpLabel} ${fmt(x.prev)}건 → ${fmt(x.cur)}건으로 ${x.cur > x.prev ? '늘었습니다' : '줄었습니다'}.`,
      })
    );
  return out;
}

/** 카테고리별 광고비·견적을 1차로 합친다 (카테고리 효율 화면의 2차 행 → 1차 추천) */
export function groupCat1(items: { k: string; cost: number; quotes: number }[]): Cat1Stat[] {
  const map = new Map<string, Cat1Stat>();
  items.forEach(({ k, cost, quotes }) => {
    const key = cat1Of(k);
    const cur = map.get(key) || { k: key, cost: 0, quotes: 0 };
    cur.cost += cost;
    cur.quotes += quotes;
    map.set(key, cur);
  });
  return [...map.values()];
}

/** 검색 결과 — 검색한 범위의 추정 CPA 를 같은 기간 전체 평균 CPA 와 비교한다 (±20% 안이면 말하지 않음) */
export function scopeCpaInsight(query: string, scopeCpa: number, overallCpa: number): Insight | null {
  if (scopeCpa <= 0 || overallCpa <= 0) return null;
  const ratio = scopeCpa / overallCpa;
  if (ratio <= 0.8) {
    return {
      tone: 'good',
      head: '확대 검토',
      target: query,
      text: `추정 CPA ${fmt(scopeCpa)}원으로 같은 기간 전체 평균(${fmt(overallCpa)}원)보다 ${Math.round((1 - ratio) * 100)}% 낮습니다 — 예산 비중을 늘려 볼 만합니다.`,
    };
  }
  if (ratio >= 1.2) {
    return {
      tone: 'bad',
      head: '축소 검토',
      target: query,
      text: `추정 CPA ${fmt(scopeCpa)}원으로 같은 기간 전체 평균(${fmt(overallCpa)}원)의 ${ratio.toFixed(1)}배입니다 — 아래 키워드·광고그룹 중 전환 없는 곳부터 줄여 보세요.`,
    };
  }
  return null;
}

export const INSIGHT_FOOT_SEARCH = '※ 검색어와 일치한 광고그룹·키워드·견적만으로 계산합니다. CPA는 추정이며, 키워드는 매체 전환 기준입니다.';

/** 견적 원장 행(1건씩)을 집계 행으로 — quoteInsights 에 넘길 때 쓴다 */
export const quoteRowsOfRaw = (rows: { date: string; category: string; source: string }[]): QuoteRow[] =>
  rows.map((r) => ({ month: (r.date || '').slice(0, 7), category: r.category || '', source: r.source || '', count: 1 }));
