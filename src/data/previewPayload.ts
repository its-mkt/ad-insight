/**
 * 로그인 전 미리보기용 예시 데이터 — 웹앱 응답(RawApiPayload)과 같은 모양으로 화면에서 만든다.
 * 실제 데이터는 한 건도 쓰지 않는다 (경쟁사·봇이 보지 못하게 실제 응답은 승인된 계정만 받는다, 2026-11-18 사용자 결정).
 * 숫자는 달마다 오르내리게 만들어 화면이 실제처럼 보이게 하고, 화면에서는 흐리게 가린 채 '예시 데이터'라고 알린다 (2026-11-19 사용자 결정).
 * 이름은 공개된 분류표(CATEGORY_HIERARCHY)와 일반 단어로만 짓고, 고객 정보 칸은 비워 둔다.
 */
import type { RawApiPayload } from '../types/dashboard';
import { prevM, THIS_M } from '../utils/format';
import { toDayKey } from '../utils/dayRange';

/** 같은 화면이 매번 같은 숫자로 그려지게 고정 씨앗으로 만드는 난수 (mulberry32) */
const rngOf = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** 미리보기가 보여 주는 첫 달 */
const FIRST_MONTH = '2025-01';

/** 광고 구조 — [매체, 유형, 캠페인, 광고그룹, 카테고리, 월 광고비 기준(원)] */
const AD_GROUPS: ReadonlyArray<readonly [string, string, string, string, string, number]> = [
  ['Google', 'SA', '검색_서버', 'Dell 서버', 'Dell 서버', 1_800_000],
  ['Google', 'SA', '검색_서버', 'HPE 서버', 'HPE 서버', 1_500_000],
  ['Google', 'SA', '검색_서버', 'GPU 서버', 'GPU/AI 서버', 1_100_000],
  ['Google', 'SA', '검색_스토리지', 'NAS', 'NAS 스토리지 > 시놀로지', 700_000],
  ['Google', 'SA', '검색_스토리지', 'SAN', 'SAN 스토리지', 600_000],
  ['Google', 'SA', '검색_워크스테이션', '데스크탑 워크스테이션', '데스크탑 워크스테이션', 900_000],
  ['Google', 'DA', '디스플레이_리마케팅', '방문자 리마케팅', '기타', 500_000],
  ['Naver', 'SA', '파워링크_서버', 'Dell 서버', 'Dell 서버', 2_100_000],
  ['Naver', 'SA', '파워링크_서버', 'Lenovo 서버', 'Lenovo 서버', 900_000],
  ['Naver', 'SA', '파워링크_노트북', 'HP 노트북', '노트북 > HP 노트북', 800_000],
  ['Naver', 'SA', '파워링크_네트워크', '방화벽', '네트워크/방화벽 > FortiGate', 650_000],
  ['Naver', 'SA', '파워링크_솔루션', '백업', '백업 솔루션', 450_000],
  ['Naver', 'SA', '쇼핑검색_모니터', '모니터', '모니터', 400_000],
];

/** 견적·주문 유입 경로 (수집 스크립트 quoteSource_ 의 값) 와 비중 */
const SOURCES: ReadonlyArray<readonly [string, number]> = [
  ['네이버(광고)', 30],
  ['구글(광고)', 22],
  ['네이버(검색)', 18],
  ['구글(검색)', 12],
  ['직접', 9],
  ['다음(검색)', 4],
  ['기타', 5],
];

/** 견적이 들어오는 카테고리와 비중 */
const QUOTE_CATS: ReadonlyArray<readonly [string, number]> = [
  ['Dell 서버', 18],
  ['HPE 서버', 14],
  ['Lenovo 서버', 8],
  ['GPU/AI 서버', 9],
  ['NAS 스토리지 > 시놀로지', 8],
  ['SAN 스토리지', 6],
  ['데스크탑 워크스테이션', 7],
  ['노트북 > HP 노트북', 6],
  ['네트워크/방화벽 > FortiGate', 6],
  ['백업 솔루션', 5],
  ['모니터', 5],
  ['기타', 8],
];

const SALES_REPS = ['영업1 과장', '영업2 대리', '영업3 차장'];
const GOODS = ['서버 A', '서버 B', '워크스테이션 C', '노트북 D', '모니터 E', 'NAS F', '스위치 G', 'UPS H'];

/** FIRST_MONTH ~ 이번 달 */
const monthsUntilNow = (): string[] => {
  const out: string[] = [];
  for (let m = THIS_M; m >= FIRST_MONTH; m = prevM(m)) out.unshift(m);
  return out;
};

/** 그 달의 날짜 키 목록 — 이번 달은 오늘까지 */
const daysOf = (month: string): string[] => {
  const [y, m] = month.split('-').map(Number);
  const last = month === THIS_M ? new Date().getDate() : new Date(y, m, 0).getDate();
  return Array.from({ length: last }, (_, i) => toDayKey(new Date(y, m - 1, i + 1)));
};

/** 비중 표에서 하나 고른다 */
const pick = <T,>(rand: () => number, table: ReadonlyArray<readonly [T, number]>): T => {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let x = rand() * total;
  for (const [v, w] of table) if ((x -= w) < 0) return v;
  return table[table.length - 1][0];
};

let base: RawApiPayload | null = null;

/** 예시 응답 바탕 — 한 번 만들어 두고 다시 쓴다 */
function basePayload(): RawApiPayload {
  if (base) return base;
  const rand = rngOf(20261119);
  const months = monthsUntilNow();
  const dailyMonths = [prevM(THIS_M), THIS_M];
  const now = new Date();
  const served = `${toDayKey(now)} ${String(now.getHours()).padStart(2, '0')}:00`;
  // 달마다 같은 흐름(계절성 + 완만한 성장)에 광고그룹마다 흔들림을 더한다
  const trend = (i: number) => 0.85 + i * 0.012 + 0.12 * Math.sin(i * 0.9);
  const progress = (m: string) => (m === THIS_M ? now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() : 1);

  const spendRows = (media: string) => {
    const monthly: Record<string, unknown>[] = [];
    const daily: Record<string, unknown>[] = [];
    months.forEach((month, i) => {
      AD_GROUPS.filter((g) => g[0] === media).forEach(([, type, campaign, adGroup, , base]) => {
        const cost = Math.round((base * trend(i) * (0.8 + rand() * 0.4) * progress(month)) / 10) * 10;
        const cpc = type === 'DA' ? 180 + rand() * 120 : 900 + rand() * 900;
        const clicks = Math.max(1, Math.round(cost / cpc));
        const impressions = Math.round(clicks * (type === 'DA' ? 120 + rand() * 80 : 18 + rand() * 20));
        const conversions = Math.round(clicks * (type === 'DA' ? 0.004 : 0.02 + rand() * 0.02));
        const row = { month, type, campaign, ad_group: adGroup, cost, impressions, clicks, conversions, ...(media === 'Naver' ? { campaign_tp: campaign.startsWith('쇼핑') ? 'SHOPPING' : 'WEB_SITE' } : {}) };
        monthly.push(row);
        if (!dailyMonths.includes(month)) return;
        const days = daysOf(month);
        const weights = days.map((d) => (new Date(d).getDay() % 6 === 0 ? 0.45 : 1) * (0.8 + rand() * 0.4));
        const sum = weights.reduce((s, w) => s + w, 0);
        days.forEach((date, k) => {
          const share = weights[k] / sum;
          daily.push({ date, type, campaign, ad_group: adGroup, cost: Math.round(cost * share), impressions: Math.round(impressions * share), clicks: Math.round(clicks * share), conversions: Math.round(conversions * share), ...(row.campaign_tp ? { campaign_tp: row.campaign_tp } : {}) });
        });
      });
    });
    return { monthly, daily };
  };
  const google = spendRows('Google');
  const naver = spendRows('Naver');

  // 견적 — 접수 건을 먼저 만들고 달별 건수는 그것을 모아 맞춘다
  const quotesRaw: Record<string, unknown>[] = [];
  const quotesExtra: Record<string, unknown>[] = [];
  let sno = 10000;
  months.forEach((month, i) => {
    const days = daysOf(month);
    const count = Math.round((70 + rand() * 25) * trend(i) * progress(month));
    for (let k = 0; k < count; k++) {
      const category = pick(rand, QUOTE_CATS);
      const source = pick(rand, SOURCES);
      quotesRaw.push({
        sno: ++sno,
        subject: `${category.split(' > ').pop()} 견적 문의`,
        name: '',
        company: '',
        email: '',
        date: days[Math.floor(rand() * days.length)],
        category,
        source,
        source_raw: source,
        sales_rep: SALES_REPS[Math.floor(rand() * SALES_REPS.length)],
      });
    }
    const extra = Math.round(count * 0.15);
    for (let k = 0; k < extra; k++) {
      quotesExtra.push({ date: days[Math.floor(rand() * days.length)], origin: k % 3 === 0 ? 'phone' : 'zbyhp', category: pick(rand, QUOTE_CATS), source: k % 3 === 0 ? '전화' : '미수집', sales_rep: SALES_REPS[k % SALES_REPS.length], sno: `x${++sno}` });
    }
  });
  const quoteAgg = new Map<string, { month: string; category: string; source: string; count: number }>();
  quotesRaw.forEach((r) => {
    const month = String(r.date).slice(0, 7);
    const key = `${month}\u0001${r.category}\u0001${r.source}`;
    const cur = quoteAgg.get(key);
    if (cur) cur.count += 1;
    else quoteAgg.set(key, { month, category: String(r.category), source: String(r.source), count: 1 });
  });

  // 고도몰 판매 — 주문 줄을 먼저 만들고 달별 건수·상품·유입을 모은다
  const orderLines: Record<string, unknown>[] = [];
  const ordersDaily: Record<string, unknown>[] = [];
  months.forEach((month, i) => {
    const days = daysOf(month);
    const count = Math.round((60 + rand() * 30) * trend(i) * progress(month));
    const perDay = new Map<string, number>();
    for (let k = 0; k < count; k++) {
      const date = days[Math.floor(rand() * days.length)];
      perDay.set(date, (perDay.get(date) || 0) + 1);
      const goods = Math.floor(rand() * GOODS.length);
      const qty = 1 + Math.floor(rand() * 3);
      orderLines.push({
        month,
        key: `${month.replace('-', '')}${String(k).padStart(4, '0')}`,
        goods_no: String(1000 + goods),
        placed: `${date} 10:00`,
        paid: `${date} 10:05`,
        status: 'p1',
        settle: 'pc',
        member: rand() < 0.6 ? '회원' : '비회원',
        qty,
        amount: qty * (200_000 + goods * 150_000),
        source: pick(rand, SOURCES),
        basis: '',
        detail: '',
        device: rand() < 0.68 ? 'pc' : rand() < 0.95 ? 'mobile' : 'write',
      });
    }
    if (dailyMonths.includes(month)) days.forEach((date) => ordersDaily.push({ date, paid: perDay.get(date) || 0, reached: perDay.get(date) || 0, not_web: 0 }));
  });
  const byMonth = <T,>(rows: Record<string, unknown>[], keyOf: (r: Record<string, unknown>) => string, init: () => T, add: (acc: T, r: Record<string, unknown>) => void) => {
    const map = new Map<string, T>();
    rows.forEach((r) => {
      const k = keyOf(r);
      if (!map.has(k)) map.set(k, init());
      add(map.get(k)!, r);
    });
    return map;
  };
  const ordersMonthly = [...byMonth(orderLines, (r) => String(r.month), () => ({ count: 0 }), (a) => (a.count += 1))].map(([month, a]) => ({ month, count: a.count }));
  const goodsMonthly = [...byMonth(orderLines, (r) => `${r.month}\u0001${r.goods_no}`, () => ({ orders: 0, qty: 0, amount: 0 }), (a, r) => {
    a.orders += 1;
    a.qty += Number(r.qty);
    a.amount += Number(r.amount);
  })].map(([k, a]) => {
    const [month, no] = k.split('\u0001');
    return { month, goods_no: no, goods_name: `예시 상품 · ${GOODS[Number(no) - 1000]}`, ...a };
  });
  const inflowMonthly = [...byMonth(orderLines, (r) => `${r.month}\u0001${r.source}`, () => ({ count: 0 }), (a) => (a.count += 1))].map(([k, a]) => {
    const [month, source] = k.split('\u0001');
    return { month, source, count: a.count };
  });
  const goodsInflow = [...byMonth(orderLines, (r) => `${r.month}\u0001${r.goods_no}\u0001${r.source}`, () => ({ orders: 0 }), (a) => (a.orders += 1))].map(([k, a]) => {
    const [month, goods_no, source] = k.split('\u0001');
    return { month, goods_no, source, orders: a.orders };
  });

  // 기기별 광고 — 광고비를 PC·모바일·태블릿으로 나눈다 (구글은 월, 네이버는 일)
  const DEVICE_SHARE: ReadonlyArray<readonly [string, number]> = [['desktop', 0.62], ['mobile', 0.35], ['tablet', 0.03]];
  const splitDevices = (rows: Record<string, unknown>[], dateKey: 'month' | 'date') =>
    rows.flatMap((r) =>
      DEVICE_SHARE.map(([device, share]) => {
        const s = share * (0.85 + rand() * 0.3);
        return { [dateKey]: r[dateKey], type: r.type, campaign: r.campaign, device, cost: Math.round(Number(r.cost) * s), impressions: Math.round(Number(r.impressions) * s), clicks: Math.round(Number(r.clicks) * s), conversions: Math.round(Number(r.conversions) * s) };
      })
    );

  // 키워드·소재 — 광고그룹마다 몇 개
  const KW_SUFFIX = ['견적', '가격', '구매', '추천', '렌탈'];
  const keywords = (src: Record<string, unknown>[]) =>
    src.flatMap((r) =>
      KW_SUFFIX.slice(0, 3 + Math.floor(rand() * 3)).map((suffix, k) => {
        const s = (0.5 / (k + 1)) * (0.8 + rand() * 0.4);
        return { month: r.month, type: r.type, campaign: r.campaign, ad_group: r.ad_group, keyword: `${r.ad_group} ${suffix}`, match: 'PHRASE', bid: 800 + Math.round(rand() * 20) * 100, quality: 5 + Math.floor(rand() * 5), cost: Math.round(Number(r.cost) * s), impressions: Math.round(Number(r.impressions) * s), clicks: Math.round(Number(r.clicks) * s), conversions: Math.round(Number(r.conversions) * s) };
      })
    );
  const ads = (media: string) =>
    AD_GROUPS.filter((g) => g[0] === media).map(([, type, campaign, adGroup], k) => ({ type, campaign, ad_group: adGroup, ad_id: `${media}-ad-${k}`, title: `${adGroup} 전문 상담`, ad_type: type === 'DA' ? '반응형 디스플레이' : '텍스트', titles: `${adGroup} 전문 상담\n빠른 견적`, descs: '예시 광고 문구입니다', url: '' }));
  const adStats = (media: string, monthly: Record<string, unknown>[]) =>
    monthly.map((r) => {
      const k = AD_GROUPS.filter((g) => g[0] === media).findIndex((g) => g[2] === r.campaign && g[3] === r.ad_group);
      return { month: r.month, ad_id: `${media}-ad-${k}`, cost: r.cost, impressions: r.impressions, clicks: r.clicks, conversions: r.conversions };
    });

  const meta = [{ key: 'updated', value: served }];
  base = {
    served,
    g_meta: meta,
    n_meta: meta,
    q_meta: meta,
    godo_meta: meta,
    g_adgroup_monthly: google.monthly,
    n_adgroup_monthly: naver.monthly,
    g_adgroup_daily: google.daily,
    n_adgroup_daily: naver.daily,
    daily_hist_months: {},
    manual: months.map((month, i) => ({ month, item: 'META', amount: Math.round((300_000 * trend(i) * progress(month)) / 10) * 10 })),
    mapping: AD_GROUPS.map(([media, , campaign, ad_group, category]) => ({ media, campaign, ad_group, category })),
    quotes_monthly: [...quoteAgg.values()],
    quotes_raw: quotesRaw,
    quotes_raw_sites: [],
    quotes_phone: [],
    quotes_stats_extra: quotesExtra,
    godo_orders_monthly: ordersMonthly,
    godo_goods_monthly: goodsMonthly,
    godo_order_inflow_monthly: inflowMonthly,
    godo_orders_daily: ordersDaily,
    godo_goods_inflow_monthly: goodsInflow,
    godo_order_lines: orderLines,
    g_device_monthly: splitDevices(google.monthly, 'month'),
    n_device_daily: splitDevices(naver.daily, 'date'),
    manual_categories: [],
    g_keywords: keywords(google.monthly.filter((r) => r.type === 'SA')),
    n_keywords: keywords(naver.monthly),
    g_ads: ads('Google'),
    n_ads: ads('Naver'),
    g_ad_stats: adStats('Google', google.monthly),
    n_ad_stats: adStats('Naver', naver.monthly),
  } as RawApiPayload;
  return base;
}

/** 웹앱 ?preview=devices 응답 — 달 → 매체 → 기기 → 지표 비중(0~1), 달 → 주문 형태 → 주문 수 비중 */
export interface PreviewDeviceShares {
  ads: Record<string, Partial<Record<'Google' | 'Naver', Record<string, { cost: number; imp: number; clk: number; conv: number }>>>>;
  orders: Record<string, Record<string, number>>;
}

/** 받은 값이 비중 응답 모양인지 */
export const isPreviewDeviceShares = (j: unknown): j is PreviewDeviceShares =>
  !!j && typeof j === 'object' && typeof (j as PreviewDeviceShares).ads === 'object' && typeof (j as PreviewDeviceShares).orders === 'object';

const withShares = new WeakMap<PreviewDeviceShares, RawApiPayload>();

/**
 * 기기 자료만 실제 비중으로 바꾼다 — 예시 광고비·주문 수를 실제 비중대로 나눠, 화면이 계산하는 비중이 실제와 같아진다.
 * 비중 자료가 없는 달·매체는 기기 줄을 만들지 않고(실제처럼 '수집 전'), 주문 형태는 비워 둔다(미수집).
 */
function applyShares(p: RawApiPayload, shares: PreviewDeviceShares): RawApiPayload {
  const split = (rows: Record<string, unknown>[], media: 'Google' | 'Naver', dateKey: 'month' | 'date') =>
    rows.flatMap((r) => {
      const byDev = shares.ads[String(r[dateKey]).slice(0, 7)]?.[media];
      if (!byDev) return [];
      return Object.entries(byDev).map(([device, s]) => ({
        [dateKey]: r[dateKey],
        type: r.type,
        campaign: r.campaign,
        device,
        // 반올림하지 않는다 — 하루 전환처럼 작은 값을 반올림하면 합친 비중이 실제와 달라진다 (화면은 비중만 보여 준다)
        cost: Number(r.cost) * s.cost,
        impressions: Number(r.impressions) * s.imp,
        clicks: Number(r.clicks) * s.clk,
        conversions: Number(r.conversions) * s.conv,
      }));
    });
  // 주문 형태 — 그 달 주문을 비중대로 앞에서부터 나눠 준다 (최대 나머지 방식)
  const lines = p.godo_order_lines || [];
  const byMonth = new Map<string, Record<string, unknown>[]>();
  lines.forEach((l) => {
    const m = String(l.month);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(l);
  });
  const orderLines = [...byMonth].flatMap(([m, rows]) => {
    const s = shares.orders[m];
    if (!s) return rows.map((l) => ({ ...l, device: '' }));
    const n = rows.length;
    const quota = Object.entries(s).map(([d, w]) => ({ d, exact: w * n, k: Math.floor(w * n) }));
    let left = n - quota.reduce((t, q) => t + q.k, 0);
    [...quota].sort((a, b) => b.exact - b.k - (a.exact - a.k)).forEach((q) => {
      if (left > 0) {
        q.k += 1;
        left -= 1;
      }
    });
    const devices = quota.flatMap((q) => Array<string>(q.k).fill(q.d));
    return rows.map((l, i) => ({ ...l, device: devices[i] ?? '' }));
  });
  return {
    ...p,
    g_device_monthly: split(p.g_adgroup_monthly as Record<string, unknown>[], 'Google', 'month'),
    n_device_daily: split(p.n_adgroup_daily as Record<string, unknown>[], 'Naver', 'date'),
    godo_order_lines: orderLines,
  };
}

/** 미리보기 예시 응답 — shares 가 있으면 기기 자료를 실제 비중으로 바꾼 응답 */
export function previewPayload(shares?: PreviewDeviceShares | null): RawApiPayload {
  if (!shares) return basePayload();
  if (!withShares.has(shares)) withShares.set(shares, applyShares(basePayload(), shares));
  return withShares.get(shares)!;
}

/** 미리보기의 기기 비중이 실제 값인지 — 기기별 통계 화면이 비중 칸만 흐림 없이 보여 줄지 정한다 */
let realDevices = false;
export const previewRealDevices = () => realDevices;
export const setPreviewRealDevices = (on: boolean) => {
  realDevices = on;
};
