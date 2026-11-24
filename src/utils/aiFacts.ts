// Claude 분석(InsightPanel 의 aiPage)에 규칙 문장과 함께 보낼 화면 수치 — 표·KPI 를 짧게 줄인 것.
// 견적 고객 정보(이름·회사·메일·제목)와 담당자 이름은 넣지 않는다. 금액은 원 단위 정수.
import type { CampaignKeywordBucket, KeywordRow } from '../types/dashboard';
import type { SearchResult } from './search';
import { mediaKo } from './constants';
import { sumBy, THIS_M, THIS_Y } from './format';

type Row = { month: string; cost?: number; count?: number };

const won = (v: number) => Math.round(v);
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
const inPeriod = (months: string[] | null) => {
  const set = months && new Set(months);
  return (r: Row) => !set || set.has(r.month.slice(0, 7));
};

/** 같은 매체·키워드는 광고그룹·캠페인을 합친다 (규칙 인사이트 keywordInsights 와 같은 기준), 광고비 큰 순 */
function keywordTotals(rows: KeywordRow[]) {
  const map = new Map<string, { media: string; keyword: string; cost: number; clk: number; conv: number }>();
  rows.forEach((r) => {
    if (!r.keyword) return;
    const key = `${r.media}\u0001${r.keyword}`;
    const cur = map.get(key) || { media: r.media, keyword: r.keyword, cost: 0, clk: 0, conv: 0 };
    cur.cost += r.cost;
    cur.clk += r.clk;
    cur.conv += r.conv;
    map.set(key, cur);
  });
  return [...map.values()].sort((a, b) => b.cost - a.cost);
}

export interface SearchAiDataInput {
  query: string;
  result: SearchResult;
  /** 비교 기간 결과 (전월·전년 동기). 없으면 비교하지 않는다 */
  prevResult: SearchResult | null;
  cmpLabel?: string;
  /** 이번 달이 진행 중이면 오늘이 며칠인지 — 비교 기간을 전월 같은 날짜까지로 맞춘다 (전월 전체와 비교하면 덜 찬 이번 달이 줄어든 것처럼 보인다) */
  openDay?: number;
  /** 검색 기간의 달 목록 — null 이면 전체 기간 */
  months: string[] | null;
  /** 전체 광고비 행·견적 행 (같은 기간 전체 대비 비중을 낸다) */
  allSpend: Row[];
  allQuotes: Row[];
  /** 같은 기간 전체 평균 CPA */
  overallCpa: number;
  /** 유입 매체 검색이면 그 매체 이름 — 광고비·CPA 를 보내지 않는다 */
  sourceScope?: string;
  /** 추이 (가로축 이름 · 달/연도별 광고비 · 견적) */
  trend: { labels: string[]; spend: number[]; quotes: number[] };
  /** 견적 구성 [이름, 건수] — 카테고리·유입 매체·문의 유형 */
  breakdowns: { title: string; rows: [string, number][] }[];
  campaigns: CampaignKeywordBucket[];
}

/** 검색 결과 화면의 수치 요약 */
export function searchAiData(i: SearchAiDataInput): Record<string, unknown> {
  const { result: r, prevResult: p, sourceScope } = i;
  const inP = inPeriod(i.months);
  const totalSpend = sumBy(i.allSpend.filter(inP), (x) => x.cost || 0);
  const totalQuotes = sumBy(i.allQuotes.filter(inP), (x) => x.count || 0);
  const ads = !sourceScope;
  const cpaOk = ads && !r.cpaHidden && r.cpa > 0;

  return {
    검색어: i.query,
    검색범위: sourceScope ? `유입 매체 "${sourceScope}" 견적만 (광고비와 연결되지 않음)` : '이름·카테고리·키워드가 일치한 광고그룹·키워드·소재와 견적',
    이번기간: {
      ...(ads && {
        광고비: won(r.cost),
        광고비_전체대비_비중_pct: pct(r.cost, totalSpend),
        매체별_광고비: Object.fromEntries(
          (['Naver', 'Google', 'Meta'] as const)
            .map((m) => [mediaKo(m), won(sumBy(r.spendRows.filter((x) => x.media === m), (x) => x.cost))] as const)
            .filter(([, v]) => v > 0)
        ),
        노출: r.imp,
        클릭: r.clk,
        매체집계_전환: r.conv,
      }),
      견적: r.quotes.length,
      견적_전체대비_비중_pct: pct(r.quotes.length, totalQuotes),
      ...(r.sales != null && { 판매_주문: r.sales }),
      ...(cpaOk && { 추정CPA: won(r.cpa), 같은기간_전체평균CPA: won(i.overallCpa) }),
    },
    ...(i.openDay && { 이번기간_집계: `1~${i.openDay}일 (진행 중인 달)` }),
    ...(p &&
      i.cmpLabel &&
      (i.openDay
        ? {
            // 진행 중인 달은 전월 같은 날짜까지의 견적으로 비교한다. 광고비는 달 합계로만 있어 같은 기간 값이 없으므로 참고로만 둔다
            [`비교기간_${i.cmpLabel}_같은기간`]: { 범위: `1~${i.openDay}일`, 견적: p.quotes.filter((q) => Number(q.date.slice(8, 10)) <= i.openDay!).length },
            [`참고_${i.cmpLabel}_한달전체`]: {
              설명: '한 달 전체 값이라 진행 중인 이번 달과 바로 비교하면 안 됨',
              ...(ads && { 광고비: won(p.cost) }),
              견적: p.quotes.length,
              ...(cpaOk && p.cpa > 0 && { 추정CPA: won(p.cpa) }),
            },
          }
        : {
            [`비교기간_${i.cmpLabel}`]: {
              ...(ads && { 광고비: won(p.cost), 매체집계_전환: p.conv }),
              견적: p.quotes.length,
              ...(cpaOk && p.cpa > 0 && { 추정CPA: won(p.cpa) }),
            },
          })),
    추이: i.trend.labels.map((label, k) => ({
      기간: label,
      ...(ads && { 광고비: won(i.trend.spend[k] || 0) }),
      견적: i.trend.quotes[k] || 0,
    })),
    견적구성: Object.fromEntries(i.breakdowns.map((b) => [b.title, b.rows.slice(0, 5).map(([k, n]) => `${k} ${n}건`)])),
    ...(ads && {
      캠페인_광고비순: i.campaigns.slice(0, 5).map((c) => ({ 캠페인: c.campaign, 매체: c.medias.map(mediaKo).join('·'), 광고비: won(c.cost) })),
      키워드_광고비순: keywordTotals(r.keywords).slice(0, 10).map((k) => ({
        키워드: k.keyword,
        매체: mediaKo(k.media),
        광고비: won(k.cost),
        클릭: k.clk,
        전환: k.conv,
      })),
      키워드_수: keywordTotals(r.keywords).length,
    }),
  };
}

/**
 * AI 요약을 받을 기간이 끝났는지 — 끝난 기간(지난달·지난해)은 숫자가 더 바뀌지 않아 받아 둔 답을 날짜가 바뀌어도 계속 쓴다.
 * 전체 기간·올해 합계·이번 달·이번 달 날짜는 진행 중이다
 */
export function isClosedAiPeriod(p: { selectedMonth?: string; allPeriod?: boolean; yearTotal?: boolean; dayTo?: string }): boolean {
  if (p.allPeriod) return false;
  if (p.dayTo) return p.dayTo.slice(0, 7) < THIS_M;
  if (!p.selectedMonth) return false;
  if (p.yearTotal) return Number(p.selectedMonth.slice(0, 4)) < THIS_Y;
  return p.selectedMonth < THIS_M;
}

/** 이번 달 한 달을 보고 있으면 오늘이 며칠인지 (진행 중인 달의 비교를 전월 같은 날짜까지로 맞출 때), 아니면 undefined */
export function aiOpenDay(p: { selectedMonth?: string; allPeriod?: boolean; yearTotal?: boolean; dayRange?: unknown }): number | undefined {
  return !p.dayRange && !p.allPeriod && !p.yearTotal && p.selectedMonth === THIS_M ? new Date().getDate() : undefined;
}
