import { yearRangeLabel } from './allPeriod';
import { daysOfMonth, lastDayOf, lastYearDay, rangeLabel, sameRangeLastMonth, type DayRange } from './dayRange';
import { prevM } from './format';

/** 이용 현황 수집을 시작한 달 — '전체' 기간의 시작 */
export const USAGE_START = '2026-11-01';

export interface UsagePeriod {
  cur: DayRange;
  /** 비교 기간 (전체 기간은 없음) */
  prev: DayRange | null;
  /** 화면에 보이는 기간 이름 */
  label: string;
  cmpLabel?: string;
}

/** 상단 기간 선택 → 조회할 날짜 범위와 비교 범위. 오늘 이후는 자른다 */
export function usagePeriodOf(month: string, allPeriod: boolean, yearTotal: boolean, dayRange: DayRange | null, today: string): UsagePeriod {
  const clip = (r: DayRange): DayRange => ({ from: r.from, to: r.to > today ? today : r.to });
  if (dayRange) {
    const cur = clip(dayRange);
    return { cur, prev: sameRangeLastMonth(cur), label: rangeLabel(cur), cmpLabel: '전월 동기간 대비' };
  }
  if (allPeriod) return { cur: { from: USAGE_START, to: today }, prev: null, label: '전체 기간' };
  if (yearTotal) {
    const cur = clip({ from: `${month.slice(0, 4)}-01-01`, to: lastDayOf(month) });
    return { cur, prev: { from: lastYearDay(cur.from), to: lastYearDay(cur.to) }, label: yearRangeLabel(month), cmpLabel: '전년 동기 대비' };
  }
  const cur = clip({ from: `${month}-01`, to: lastDayOf(month) });
  const pm = prevM(month);
  // 진행 중인 달은 전월 같은 날짜까지와 비교한다
  const partial = cur.to < lastDayOf(month);
  const prevDay = Math.min(+cur.to.slice(8, 10), daysOfMonth(pm));
  return {
    cur,
    prev: { from: `${pm}-01`, to: partial ? `${pm}-${String(prevDay).padStart(2, '0')}` : lastDayOf(pm) },
    label: `${month.slice(0, 4)}년 ${+month.slice(5, 7)}월`,
    cmpLabel: partial ? '전월 동기간 대비' : '전월 대비',
  };
}
