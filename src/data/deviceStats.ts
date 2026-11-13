/**
 * 기기별(PC·모바일·태블릿) 통계 자료. 모두 실제로 수집한 값만 담고, 수집되지 않은 달·항목은 비워 둔다 (추정·배분 없음).
 *  - 광고: 시트 g_device_monthly(Google Ads 스크립트, 월) · n_device_daily(네이버 /stats pcMblTp, 일 — 최근 7일만 조회돼 날마다 쌓는다) — applyAdDevices
 *  - 방문·전환: itket-analytics GA4 월별 파일의 devices · deviceChannels · conv.byDevice · conv.byDeviceChannel — loadGa4Devices
 *  - 판매: 고도몰 주문 줄(godo_order_lines)의 device(주문 형태) — godomallOrders.ts
 */
import { THIS_M } from '../utils/format';

export type DeviceKey = 'desktop' | 'mobile' | 'tablet' | 'other';

/** 화면에 늘어놓는 순서 */
export const DEVICE_KEYS: DeviceKey[] = ['desktop', 'mobile', 'tablet', 'other'];

export const DEVICE_LABELS: Record<DeviceKey, string> = { desktop: 'PC', mobile: '모바일', tablet: '태블릿', other: '기타' };

/** GA4 기본 채널 그룹 → 한글 이름 (목록에 없는 새 채널은 영문 그대로 둔다) */
const CHANNEL_LABELS: Record<string, string> = {
  'Paid Search': '검색 광고',
  'Organic Search': '자연 검색',
  Display: '배너 광고',
  'Paid Video': '동영상 광고',
  'Organic Video': '동영상 (광고 아님)',
  Direct: '직접 방문',
  Referral: '다른 사이트 링크',
  'Cross-network': '구글 통합 광고 (PMax 등)',
  'AI Assistant': 'AI 서비스',
  'Organic Social': 'SNS (광고 아님)',
  'Paid Social': 'SNS 광고',
  'Paid Shopping': '쇼핑 광고',
  'Organic Shopping': '쇼핑 (광고 아님)',
  'Paid Other': '기타 광고',
  Email: '이메일',
  SMS: '문자',
  Affiliates: '제휴',
  Audio: '오디오 광고',
  'Mobile Push Notifications': '앱 푸시',
  Unassigned: '분류 안 됨',
};
export const channelLabelOf = (ch: string) => CHANNEL_LABELS[ch] ?? ch;

/** 차트 색 (CSS 변수) */
export const DEVICE_COLORS: Record<DeviceKey, string> = { desktop: '--acc', mobile: '--c-it', tablet: '--c-ka', other: '--c-rest' };

/** GA4·Google Ads 의 기기 이름(desktop·mobile·tablet …, 대소문자 무관) → 화면 키 */
export function deviceKeyOf(raw: unknown): DeviceKey {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === 'desktop' || v === 'mobile' || v === 'tablet' ? v : 'other';
}

/* ── 광고 ── */

export interface AdDeviceRow {
  media: 'Google' | 'Naver';
  /** 'YYYY-MM' */
  month: string;
  /** 'SA' | 'DA' */
  type: string;
  campaign: string;
  device: DeviceKey;
  cost: number;
  imp: number;
  clk: number;
  conv: number;
}

export const AD_DEVICE_ROWS: AdDeviceRow[] = [];
/** 매체별로 기기 자료가 있는 달 — 없는 달은 '수집 전'이고 0 이 아니다 */
export const AD_DEVICE_MONTHS: Record<'Google' | 'Naver', Set<string>> = { Google: new Set(), Naver: new Set() };
/** 일별로 쌓는 매체(네이버)의 첫 수집일 'YYYY-MM-DD' — 그 달은 이날부터의 값이다 */
export const AD_DEVICE_FROM: Partial<Record<'Google' | 'Naver', string>> = {};

type RawRow = Record<string, unknown>;

/** 수집 시트의 기기별 광고 행을 반영한다. 구글은 월(month) 행, 네이버는 일(date) 행을 달로 묶는다 */
export function applyAdDevices(google: RawRow[], naver: RawRow[]): void {
  AD_DEVICE_ROWS.length = 0;
  AD_DEVICE_MONTHS.Google.clear();
  AD_DEVICE_MONTHS.Naver.clear();
  delete AD_DEVICE_FROM.Google;
  delete AD_DEVICE_FROM.Naver;
  const push = (media: 'Google' | 'Naver', rows: RawRow[]) =>
    rows.forEach((r) => {
      const date = String(r.date ?? '').slice(0, 10);
      const month = String(r.month ?? date).slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) return;
      AD_DEVICE_MONTHS[media].add(month);
      if (date && (!AD_DEVICE_FROM[media] || date < AD_DEVICE_FROM[media]!)) AD_DEVICE_FROM[media] = date;
      AD_DEVICE_ROWS.push({
        media,
        month,
        type: String(r.type ?? ''),
        campaign: String(r.campaign ?? ''),
        device: deviceKeyOf(r.device),
        cost: Number(r.cost) || 0,
        imp: Number(r.impressions) || 0,
        clk: Number(r.clicks) || 0,
        conv: Number(r.conversions) || 0,
      });
    });
  push('Google', google);
  push('Naver', naver);
}

/* ── GA4 방문·전환 ── */

/** 전환 종류 — itket-analytics CFG.CONVERSIONS 의 id */
export type Ga4ConvId = 'estimate' | 'order';

export interface Ga4DeviceMonth {
  /** 기기별 세션 */
  sessions: Partial<Record<DeviceKey, number>>;
  /** 기기 × 기본 채널 그룹 세션 — 수집 전 파일이면 null */
  channels: { device: DeviceKey; channel: string; sessions: number }[] | null;
  /** 기기별 전환 세션 (견적·주문 완료 화면) — 수집 전 파일이면 null */
  conv: Record<Ga4ConvId, Partial<Record<DeviceKey, number>>> | null;
  /** 기기 × 채널 전환 세션 — 수집 전 파일이면 null */
  convChannels: Record<Ga4ConvId, { device: DeviceKey; channel: string; s: number }[]> | null;
}

interface Ga4MonthFile {
  total?: { sessions?: number };
  devices?: { deviceCategory: string; sessions: number }[];
  deviceChannels?: { deviceCategory: string; sessionDefaultChannelGroup: string; sessions: number }[];
  conv?: {
    byDevice?: Partial<Record<Ga4ConvId, { k: string; s: number }[]>>;
    byDeviceChannel?: Partial<Record<Ga4ConvId, { k: string; s: number }[]>>;
  };
}

const CONV_IDS: Ga4ConvId[] = ['estimate', 'order'];

function parseGa4(file: Ga4MonthFile): Ga4DeviceMonth {
  const sessions: Partial<Record<DeviceKey, number>> = {};
  (file.devices ?? []).forEach((r) => {
    const d = deviceKeyOf(r.deviceCategory);
    sessions[d] = (sessions[d] ?? 0) + (Number(r.sessions) || 0);
  });
  const byDevice = file.conv?.byDevice;
  const byDeviceChannel = file.conv?.byDeviceChannel;
  // 'mobile | Paid Search' 처럼 기기와 채널을 ' | ' 로 이은 키
  const split = (k: string) => {
    const i = k.indexOf(' | ');
    return { device: deviceKeyOf(i < 0 ? k : k.slice(0, i)), channel: i < 0 ? '' : k.slice(i + 3) };
  };
  return {
    sessions,
    channels: file.deviceChannels
      ? file.deviceChannels.map((r) => ({ device: deviceKeyOf(r.deviceCategory), channel: r.sessionDefaultChannelGroup, sessions: Number(r.sessions) || 0 }))
      : null,
    conv: byDevice
      ? (Object.fromEntries(
          CONV_IDS.map((id) => {
            const out: Partial<Record<DeviceKey, number>> = {};
            (byDevice[id] ?? []).forEach((r) => {
              const d = deviceKeyOf(r.k);
              out[d] = (out[d] ?? 0) + (Number(r.s) || 0);
            });
            return [id, out];
          })
        ) as Ga4DeviceMonth['conv'])
      : null,
    convChannels: byDeviceChannel
      ? (Object.fromEntries(CONV_IDS.map((id) => [id, (byDeviceChannel[id] ?? []).map((r) => ({ ...split(r.k), s: Number(r.s) || 0 }))])) as Ga4DeviceMonth['convChannels'])
      : null,
  };
}

const ga4Cache = new Map<string, Promise<Ga4DeviceMonth | null>>();

/** GA4 수집이 시작된 달 (itket-analytics config startMonth) */
export const GA4_FIRST_MONTH = '2025-01';

/** 고른 달들의 GA4 기기 자료를 받는다. 받지 못했거나 측정이 없는 달은 결과에 없다 (0 이 아니다) */
export async function loadGa4Devices(months: string[]): Promise<Record<string, Ga4DeviceMonth>> {
  const wanted = months.filter((m) => m >= GA4_FIRST_MONTH && m <= THIS_M);
  const got = await Promise.all(
    wanted.map((m) => {
      let p = ga4Cache.get(m);
      if (!p) {
        p = fetch(`https://raw.githubusercontent.com/its-mkt/analytics/main/data/ga4/${m}.json`)
          .then((res) => (res.ok ? (res.json() as Promise<Ga4MonthFile>) : null))
          .then((file) => (file?.total?.sessions ? parseGa4(file) : null))
          .catch(() => null);
        ga4Cache.set(m, p);
      }
      return p.then((v) => [m, v] as const);
    })
  );
  return Object.fromEntries(got.filter(([, v]) => v)) as Record<string, Ga4DeviceMonth>;
}

/* ── 고도몰 판매 ── */

/** 고도몰 주문 형태(orderTypeFl) → 화면 이름. pc·mobile 은 기기, write 는 관리자가 직접 넣은 주문 */
export function orderDeviceLabel(code: string): string {
  const v = code.trim().toLowerCase();
  if (!v) return '미수집';
  if (v === 'pc') return DEVICE_LABELS.desktop;
  if (v === 'mobile') return DEVICE_LABELS.mobile;
  if (v === 'write') return '수기 주문';
  return v;
}
