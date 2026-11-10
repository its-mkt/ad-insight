import { ym } from './format';

/** 일·기간 선택 — 모두 YYYY-MM-DD. 하루만 고르면 from === to */
export interface DayRange {
  from: string;
  to: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Date → 'YYYY-MM-DD' (로컬 날짜 기준) */
export const toDayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 'YYYY-MM-DD' → Date (로컬 자정) */
export const fromDayKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/** 그 달의 날짜 수 ('2026-11' → 30) */
export const daysOfMonth = (month: string): number => new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate();

/** 그 달의 마지막 날 ('2026-11' → '2026-11-30') */
export const lastDayOf = (month: string): string => `${month}-${pad(daysOfMonth(month))}`;

/** 'YYYY-MM-DD' → 'YYYY-MM' */
export const monthOfDay = (day: string): string => day.slice(0, 7);

/** 시작·끝이 뒤바뀌어도 앞뒤를 바로잡는다 */
export const orderedRange = (a: string, b: string): DayRange => (a <= b ? { from: a, to: b } : { from: b, to: a });

/** 범위가 걸친 달 목록 (오름차순) — 월 단위로만 모은 광고 데이터를 고를 때 쓴다 */
export const monthsOfRange = (r: DayRange): string[] => {
  const out: string[] = [];
  let y = +r.from.slice(0, 4);
  let m = +r.from.slice(5, 7);
  const end = monthOfDay(r.to);
  while (ym(y, m) <= end) {
    out.push(ym(y, m));
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
};

/** 날짜가 범위 안인지 (양 끝 포함, 시각이 붙어 있어도 날짜만 본다) */
export const inDayRange = (day: string, r: DayRange): boolean => {
  const d = (day || '').slice(0, 10);
  return !!d && d >= r.from && d <= r.to;
};

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

/** '2026-11-05' → '2026.11.05 (목)' */
export const dayLabel = (day: string): string => `${day.replace(/-/g, '.')} (${WEEKDAY_LABELS[fromDayKey(day).getDay()]})`;

/** 범위 표시 글자 — 하루면 '2026.11.05', 기간이면 '2026.11.01 ~ 11.05' (해가 다르면 끝에도 연도) */
export const rangeLabel = (r: DayRange): string => {
  if (r.from === r.to) return r.from.replace(/-/g, '.');
  const sameYear = r.from.slice(0, 4) === r.to.slice(0, 4);
  const end = sameYear ? r.to.slice(5).replace('-', '.') : r.to.replace(/-/g, '.');
  return `${r.from.replace(/-/g, '.')} ~ ${end}`;
};

/** 일수 (양 끝 포함) */
export const rangeDays = (r: DayRange): number =>
  Math.round((fromDayKey(r.to).getTime() - fromDayKey(r.from).getTime()) / 86400000) + 1;

/** 바로 앞의 같은 일수 구간 — 8일을 고르면 그 직전 8일 (일·기간 보기의 비교 기준) */
export const previousRange = (r: DayRange): DayRange => {
  const to = fromDayKey(r.from);
  to.setDate(to.getDate() - 1);
  const from = new Date(to);
  from.setDate(from.getDate() - (rangeDays(r) - 1));
  return { from: toDayKey(from), to: toDayKey(to) };
};

/** 일·기간 보기에서 화면 문구와 계산에 쓰는 값 */
export interface DayPeriod {
  /** 카드 제목에 붙는 기간 — '11.01~11.08', 하루면 '11.03' */
  label: string;
  /** 선택한 일수 */
  days: number;
  /** 비교 문구 — '직전 8일' */
  cmpLabel: string;
  /** 선택한 날짜 범위 */
  range: DayRange;
}

export const dayPeriodOf = (r: DayRange): DayPeriod => {
  const short = (day: string) => day.slice(5).replace('-', '.');
  const days = rangeDays(r);
  const label = r.from === r.to ? short(r.to) : r.from.slice(0, 4) === r.to.slice(0, 4) ? `${short(r.from)}~${short(r.to)}` : rangeLabel(r);
  return { label, days, cmpLabel: `직전 ${days}일`, range: r };
};
