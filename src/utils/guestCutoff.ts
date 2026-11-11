import type { DashboardData, QuoteRawRow, QuoteRow, SpendRow } from '../types/dashboard';
import { inDayRange, toDayKey, type DayRange } from './dayRange';

/**
 * 로그인하지 않은 사람에게는 진행 중인 달을 "어제까지"만 보여 준다.
 * 매체마다 수집 시각이 달라 오늘 값끼리 맞지 않는 시간차를 오해하지 않게 하려는 것이다 (사용자 요청 2026-11-11).
 * - 일별로 쌓이는 값(구글·네이버 광고비, 견적 접수, 고도몰 판매)은 1일~어제로 다시 모은다
 * - 월 합계로만 받는 값(키워드·소재 성과, 일별 자료가 없는 매체 광고비)은 당월을 뺀다
 */

/** 일별 자료로 다시 모을 수 있는 매체 */
const DAILY_MEDIA = ['Google', 'Naver'];

/** 오늘 날짜 키 (YYYY-MM-DD) */
export const todayKey = () => toDayKey(new Date());

/** 어제 날짜 키 — 비로그인 화면이 보여 주는 마지막 날 */
export const guestLastDay = (today = todayKey()): string => {
  const d = new Date(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10) - 1);
  return toDayKey(d);
};

/** 접수 건을 그 달의 카테고리·유입별 건수로 모은다 */
const quoteRowsOf = (raw: QuoteRawRow[], month: string): QuoteRow[] => {
  const agg = new Map<string, QuoteRow>();
  raw.forEach((r) => {
    const k = JSON.stringify([r.category, r.source]);
    const cur = agg.get(k);
    if (cur) cur.count += 1;
    else agg.set(k, { month, category: r.category, source: r.source, count: 1 });
  });
  return [...agg.values()];
};

export interface GuestClip {
  /** 비로그인용으로 자른 자료 */
  data: DashboardData;
  /** 당월이 1일~어제로 잘렸는지 (1일이면 당월 자료가 없다) */
  range: DayRange | null;
  /** 당월 값을 뺀 월 단위 매체 (예: Meta) */
  droppedMedia: string[];
}

/** 진행 중인 달을 1일~어제로 자른다 */
export function clipForGuest(data: DashboardData, today = todayKey()): GuestClip {
  const month = today.slice(0, 7);
  const last = guestLastDay(today);
  const range: DayRange | null = last.startsWith(month) ? { from: `${month}-01`, to: last } : null;
  const beforeToday = <T extends { date: string }>(rows: T[]) => rows.filter((r) => !r.date || r.date < today);
  const quotesRaw = beforeToday(data.quotesRaw);

  // 구글·네이버 당월 광고비 = 일별 자료 1일~어제 합 (일별 자료가 없는 광고그룹은 당월 0 으로 남지 않게 아예 빠진다)
  const dailySpend = new Map<string, SpendRow>();
  if (range) {
    data.spendDaily.forEach((r) => {
      if (!DAILY_MEDIA.includes(r.media) || !inDayRange(r.date, range)) return;
      const k = JSON.stringify([r.media, r.type, r.campaign, r.adgroup]);
      const cur = dailySpend.get(k);
      if (cur) {
        cur.cost += r.cost;
        cur.imp += r.imp;
        cur.clk += r.clk;
        cur.conv += r.conv;
      } else {
        const { date: _date, ...rest } = r;
        dailySpend.set(k, { ...rest, month });
      }
    });
  }
  const droppedMedia = [...new Set(data.spend.filter((r) => r.month === month && !DAILY_MEDIA.includes(r.media) && r.cost > 0).map((r) => r.media))];

  return {
    range,
    droppedMedia,
    data: {
      ...data,
      spend: [...data.spend.filter((r) => r.month !== month), ...dailySpend.values()],
      spendDaily: beforeToday(data.spendDaily),
      quotes: [...data.quotes.filter((r) => r.month !== month), ...quoteRowsOf(quotesRaw.filter((r) => r.date?.startsWith(month)), month)],
      quotesRaw,
      quotesSites: beforeToday(data.quotesSites),
      quotesPhone: beforeToday(data.quotesPhone),
      quotesExtra: beforeToday(data.quotesExtra),
      keywords: data.keywords.filter((r) => r.month !== month),
      adStats: (data.adStats || []).filter((r) => r.month !== month),
    },
  };
}
