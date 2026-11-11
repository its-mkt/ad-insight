import type { DashboardData, QuoteRawRow, QuoteRow, SpendDailyRow, SpendRow } from '../types/dashboard';
import { prevM } from './format';
import { inDayRange, monthsOfRange, previousRange, type DayRange } from './dayRange';

const DAILY_MEDIA = ['Google', 'Naver'];
type DailyCoverage = Pick<DashboardData, 'spend' | 'spendDaily' | 'dailyRecentFrom' | 'dailyHistMonths' | 'dailyLoadedMonths'>;

/** 그 달에 월 광고비가 있는 매체 — 집행이 없던 매체는 일별 자료를 요구하지 않는다 */
const mediaOfMonth = (data: DailyCoverage, month: string): string[] =>
  DAILY_MEDIA.filter((m) => data.spend.some((r) => r.media === m && r.month === month));

/** 일·기간 전체의 광고비가 일별 자료로 갖춰졌는지 — 아니면 월 단위로 보여 준다 */
export function rangeCovered(data: DailyCoverage, range: DayRange): boolean {
  if (!data.spendDaily.length) return false;
  return monthsOfRange(range).every((month) => {
    const start = month === range.from.slice(0, 7) ? range.from : `${month}-01`;
    return mediaOfMonth(data, month).every(
      (m) => start >= (data.dailyRecentFrom[m] ?? '9999') || (data.dailyLoadedMonths.includes(month) && (data.dailyHistMonths[m] || []).includes(month))
    );
  });
}

/** 이 기간과 직전 같은 일수를 계산하려면 더 받아야 하는 달 */
export function dailyMonthsToLoad(data: DailyCoverage, range: DayRange): string[] {
  const months = new Set([...monthsOfRange(range), ...monthsOfRange(previousRange(range))]);
  return [...months].filter(
    (month) =>
      !data.dailyLoadedMonths.includes(month) &&
      DAILY_MEDIA.some((m) => `${month}-01` < (data.dailyRecentFrom[m] ?? '9999') && (data.dailyHistMonths[m] || []).includes(month))
  );
}

/** 받아 온 일별 과거분을 합친다 — 최근 구간과 겹치는 날은 더 새로 수집한 최근 구간을 쓴다 */
export function withDailyHist(data: DashboardData, rows: SpendDailyRow[], months: string[]): DashboardData {
  if (!months.length) return data;
  return {
    ...data,
    spendDaily: [...data.spendDaily, ...rows.filter((r) => r.date < (data.dailyRecentFrom[r.media] ?? '9999'))],
    dailyLoadedMonths: months,
  };
}

/** 범위 안 일별 광고비를 광고그룹별로 합쳐, 종료일이 속한 달(month)의 월 행으로 만든다 */
function spendInRange(daily: SpendDailyRow[], range: DayRange, month: string): SpendRow[] {
  const agg = new Map<string, SpendRow>();
  daily.forEach((r) => {
    if (!inDayRange(r.date, range)) return;
    const k = [r.media, r.type, r.campaign, r.adgroup].join('\u0001');
    const cur = agg.get(k);
    if (cur) {
      cur.cost += r.cost;
      cur.imp += r.imp;
      cur.clk += r.clk;
      cur.conv += r.conv;
    } else {
      const { date: _date, ...rest } = r;
      agg.set(k, { ...rest, month });
    }
  });
  return [...agg.values()];
}

/** 견적 날짜의 달을 month 로 맞춘다 — 여러 달에 걸친 기간을 종료일의 달 하나로 합쳐 보기 위함 (표시용 날짜는 같은 달 안에서만 의미가 있다) */
const shiftToMonth = <T extends QuoteRawRow>(rows: T[], range: DayRange, month: string): T[] =>
  rows
    .filter((r) => inDayRange(r.date, range))
    .map((r) => (r.date.slice(0, 7) === month ? r : { ...r, date: `${month}${r.date.slice(7)}` }));

interface ApplyOptions {
  /** 견적도 기간에 맞춰 다시 센다. 검색 결과는 견적을 실제 날짜로 직접 거르므로 끈다 */
  quotes?: boolean;
}

/** 접수 건을 month 한 달의 카테고리·유입별 건수로 모은다 */
const quoteRowsOf = (raw: QuoteRawRow[], month: string): QuoteRow[] => {
  const agg = new Map<string, QuoteRow>();
  raw.forEach((r) => {
    const k = [month, r.category, r.source].join('\u0001');
    const cur = agg.get(k);
    if (cur) cur.count += 1;
    else agg.set(k, { month, category: r.category, source: r.source, count: 1 });
  });
  return [...agg.values()];
};

/**
 * 일·기간으로 본다 — 광고비·노출·클릭·전환은 일별 자료로, 견적은 접수일로 다시 모아 "종료일이 속한 달" 한 달로 넘긴다.
 * 그 전달 자리에는 직전 같은 일수의 값을 넣어, 화면들의 "기준월 vs 전월" 비교가 그대로 같은 일수끼리의 비교가 되게 한다.
 * 직전 구간이 일별 자료 밖이면 광고비 비교값은 비워 둔다 (달 전체와 비교하면 오해를 부른다).
 * 일별 자료가 없는 것(키워드·소재 성과, GFA·Meta 등 월 단위 매체)은 이 달 값이 그대로 남거나 빠진다.
 * 기간이 일별 구간 밖이면 원본을 그대로 돌려준다 (월 단위로 보여 준다).
 */
export function applyDayRange(data: DashboardData, range: DayRange | null, opts: ApplyOptions = {}): DashboardData {
  if (!range || !rangeCovered(data, range)) return data;
  const month = range.to.slice(0, 7);
  const months = new Set(monthsOfRange(range));
  // 검색 결과는 일·기간에서 비교를 하지 않으므로 전달을 바꾸지 않는다
  if (opts.quotes === false) {
    return { ...data, spend: [...data.spend.filter((r) => !months.has(r.month)), ...spendInRange(data.spendDaily, range, month)] };
  }

  const prevMonth = prevM(month);
  const before = previousRange(range);
  months.add(prevMonth);
  const both = <T extends QuoteRawRow>(rows: T[]): T[] => [...shiftToMonth(rows, range, month), ...shiftToMonth(rows, before, prevMonth)];
  return {
    ...data,
    spend: [
      ...data.spend.filter((r) => !months.has(r.month)),
      ...spendInRange(data.spendDaily, range, month),
      ...(rangeCovered(data, before) ? spendInRange(data.spendDaily, before, prevMonth) : []),
    ],
    quotes: [
      ...data.quotes.filter((r) => !months.has(r.month)),
      ...quoteRowsOf(shiftToMonth(data.quotesRaw, range, month), month),
      ...quoteRowsOf(shiftToMonth(data.quotesRaw, before, prevMonth), prevMonth),
    ],
    quotesRaw: both(data.quotesRaw),
    quotesSites: both(data.quotesSites),
    quotesPhone: both(data.quotesPhone),
    quotesExtra: both(data.quotesExtra),
  };
}
