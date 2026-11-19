import { inMonths } from './allPeriod';
import { sumBy } from './format';

type SpendLike = { month: string; cost: number };
type QuoteLike = { month: string; count: number };

/** 고른 달들의 CPA(광고비 ÷ 견적) — CPA 시작 달(cpaFrom) 이전 달은 뺀다. 견적이 없으면 0 */
export function cpaInMonths(spend: SpendLike[], quotes: QuoteLike[], months: string[], cpaFrom: string): number {
  const valid = inMonths(months.filter((mo) => mo >= cpaFrom));
  const q = sumBy(quotes.filter(valid), (r) => r.count);
  return q > 0 ? sumBy(spend.filter(valid), (r) => r.cost) / q : 0;
}

/** CPA 시작 달부터 전체 기간의 광고비·견적·CPA (견적이 없으면 CPA 0) */
export function cpaSince(spend: SpendLike[], quotes: QuoteLike[], cpaFrom: string): { spend: number; quotes: number; cpa: number } {
  const s = sumBy(spend.filter((r) => r.month >= cpaFrom), (r) => r.cost);
  const q = sumBy(quotes.filter((r) => r.month >= cpaFrom), (r) => r.count);
  return { spend: s, quotes: q, cpa: q > 0 ? s / q : 0 };
}
