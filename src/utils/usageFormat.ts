import type { ViewId } from '../types/dashboard';
import { VIEW_TITLES } from './constants';
import { fromDayKey, WEEKDAY_LABELS } from './dayRange';

/** 이용 현황 화면의 표기 도우미 */

/** 초 → "1시간 5분" · "12분 30초" · "40초" */
export const durationText = (sec: number) => {
  const s = Math.round(sec);
  if (s <= 0) return '–';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return m ? `${h}시간 ${m}분` : `${h}시간`;
  if (m) return s % 60 && m < 10 ? `${m}분 ${s % 60}초` : `${m}분`;
  return `${s}초`;
};

/** '2026-11-05' → '11/5' (그래프 가로축) */
export const daySlashLabel = (key: string) => `${+key.slice(5, 7)}/${+key.slice(8, 10)}`;

/** '2026-11-05' → '26.11.05 (목)' */
export const dayWithWeekday = (key: string) => `${key.slice(2).replace(/-/g, '.')} (${WEEKDAY_LABELS[fromDayKey(key).getDay()]})`;

/** '2026-11' · '2026-11-05' → '2026.11' */
export const monthText = (key: string) => key.slice(0, 7).replace('-', '.');

/** ISO 시각 → "11.19 14:32" (한국 시간) */
export const lastAtText = (iso: string) => {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '–';
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(k.getUTCMonth() + 1)}.${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
};

/** 화면 id → 메뉴 이름 (모르는 id 는 그대로) */
export const viewTitle = (id: string) => VIEW_TITLES[id as ViewId] ?? id;
