import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  AdRow,
  AdStatRow,
  DashboardData,
  KeywordRow,
  ManualRow,
  QuoteRow,
  RawAdApiRow,
  RawAdStatApiRow,
  RawApiPayload,
  RawQuotePhoneApiRow, RawQuoteStatsExtraApiRow, RawQuoteRawApiRow,
  RawKeywordApiRow,
  RawMetaApiRow,
  RawSpendApiRow,
  SpendRow,
  SpendDailyRow,
  QuoteRawRow,
  QuoteManualMark,
  SyncStatus,
  SiteId,
} from '../types/dashboard';
import { buildCategoryMap, LEGACY_ONLY_CATS, quoteKey, THIS_M } from '../utils/format';
import { SITE_DEFAULT_CATEGORY } from '../utils/constants';
import { setSalesSite, applyGodoDaily, applyGodoGoods, applyGodoGoodsInflow, applyGodoOrderCustomers, applyGodoOrderInflow, applyGodoOrderLines, applyGodoOrders } from '../data/godomallOrders';
import { applyAdDevices } from '../data/deviceStats';
import { quoteCategoryOf } from '../utils/categoryText';
import { adStatKey } from '../utils/creativeImage';
import { readCachedPayload, writeCachedPayload } from '../utils/payloadCache';
import { supabase } from '../lib/supabase';

export const DEFAULT_URL =
  'https://script.google.com/macros/s/AKfycbzQS9yMlp9L_eRaH77QWLsY6GOY7L5hyRk1fkuaAHg8GvJmHHwhPRgr2zWldgbX5-cNcg/exec';
export const DEFAULT_KEY = '2d3b0cc2b04a4873a835583968ca7a0b';

/**
 * 아이티켓이 아닌 사이트의 수집기 웹앱 (사이트마다 Apps Script 프로젝트·데이터 시트가 따로다, apps-script/Code.gs 머리말 참고).
 * 주소·키가 비어 있으면 그 사이트는 '데이터 연결 준비 중' 안내만 보여 준다.
 */
export const SITE_SOURCES: Record<Exclude<SiteId, 'itket'>, { url: string; key: string }> = {
  oncore: {
    url:
      import.meta.env?.VITE_ONCORE_URL ||
      'https://script.google.com/macros/s/AKfycbzG-C3hj6HF_JuKzzjUGOvtRIzM5KLqGrJCBeDfNsQnzw7dHqw60T5Wm3yUunmBUrbT/exec',
    key: import.meta.env?.VITE_ONCORE_KEY || 'b3be208f75a04416914854086cfb72e5',
  },
};

/** 그 사이트의 수집기 웹앱이 연결돼 있는지 */
export function siteConnected(site: SiteId): boolean {
  const c = getCfg(site);
  return !!(c.url && c.key);
}

export function getCfg(site: SiteId = 'itket'): { url: string; key: string } {
  if (site !== 'itket') return SITE_SOURCES[site];
  const c = window.ADI || {};
  const envUrl = import.meta.env?.VITE_ADI_URL;
  const envKey = import.meta.env?.VITE_ADI_KEY;
  let s: { url?: string; key?: string } = {};
  try {
    s = JSON.parse(localStorage.getItem('adi_cfg') || '{}');
  } catch {
    // ignore
  }
  const pick = (...vals: Array<unknown>) => {
    for (const v of vals) {
      if (v && String(v).trim()) return String(v).trim();
    }
    return '';
  };
  return {
    url: pick(s.url, envUrl, c.url) || DEFAULT_URL,
    key: pick(s.key, envKey, c.key) || DEFAULT_KEY,
  };
}

function emptyData(): DashboardData {
  return {
    updated: '',
    sources: { google: '', naver: '' },
    spend: [],
    spendDaily: [],
    dailyRecentFrom: {},
    dailyHistMonths: {},
    dailyLoadedMonths: [],
    manual: [],
    mapping: [],
    quotes: [],
    quotesRaw: [],
    quotesSites: [],
    quotesPhone: [],
    quotesExtra: [],
    keywords: [],
    ads: [],
    adStats: [],
  };
}

function fmtUpdatedTimestamp(s: string): string {
  if (!s) return '';
  if (s.includes('T')) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const pad = (v: number) => String(v).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }
  return s;
}

/**
 * 수집 스크립트가 아직 개편 전 7분류(서버·워크스테이션·스토리지…)로 견적을 나눠 보냈으면,
 * 원장(quotes_raw)의 제목·광고 꼬리표로 새 분류표에 맞춰 다시 분류하고 월별 건수도 원장에서 다시 센다.
 * 수집 스크립트(quoteCategory_)가 새 분류로 바뀐 뒤에는 그대로 통과한다.
 */
function withCurrentQuoteCategories(data: DashboardData, manual: Map<string, string>): DashboardData {
  const legacy = data.quotes.some((r) => LEGACY_ONLY_CATS.has(r.category));
  // 제목이 없는 원장(배포에 묶인 data/latest.json 스냅숏 등)은 다시 분류할 근거가 없어 그대로 둔다
  if (!legacy || !data.quotesRaw.some((r) => r.subject)) return data;
  // 어드민에서 수동 지정한 견적은 자동 분류로 덮지 않는다
  const quotesRaw = data.quotesRaw.map((r) => ({
    ...r,
    category: manual.get(String(r.sno ?? '')) || quoteCategoryOf(r.subject || '', r.sourceDetail),
  }));
  const agg = new Map<string, QuoteRow>();
  quotesRaw.forEach((r) => {
    const month = r.date.slice(0, 7);
    const k = [month, r.category, r.source].join('\u0001');
    const cur = agg.get(k);
    if (cur) cur.count += 1;
    else agg.set(k, { month, category: r.category, source: r.source, count: 1 });
  });
  return { ...data, quotes: [...agg.values()], quotesRaw };
}

/**
 * 영업담당 표기를 사람마다 가장 최근 직급 하나로 맞춘다 ("이병태 차장"·"이병태 부장" → "이병태 부장").
 * 직급이 바뀌어도 한 사람으로 집계하기 위함이며, 직급 없이 이름만 적힌 건은 직급 있는 표기를 우선한다.
 * rows 는 접수일 오름차순이어야 한다.
 */
function withLatestRepTitles<T extends { salesRep?: string }>(rows: T[]): T[] {
  return applyRepTitles(rows, latestRepTitles(rows));
}

const repNameOf = (rep: string) => rep.split(' ')[0];

/** 이름 → 사람마다 쓸 표기. rows 는 접수일 오름차순이어야 한다 */
function latestRepTitles(rows: { salesRep?: string }[]): Map<string, string> {
  const latest = new Map<string, string>();
  rows.forEach(({ salesRep: rep }) => {
    if (rep && (rep.includes(' ') || !latest.has(repNameOf(rep)))) latest.set(repNameOf(rep), rep);
  });
  return latest;
}

function applyRepTitles<T extends { salesRep?: string }>(rows: T[], latest: Map<string, string>): T[] {
  return rows.map((r) => (r.salesRep ? { ...r, salesRep: latest.get(repNameOf(r.salesRep)) ?? r.salesRep } : r));
}

/**
 * 화면에 쓰는 견적 — 아이티켓에 다른 사이트(zbyhp·cadkorea)·전화문의를 더한다.
 * 건수뿐 아니라 CPA·견적전환율·카테고리 효율도 이 값으로 계산한다 (2026-11-06 사용자 결정).
 * data.quotes 는 아이티켓 원본이라 어드민·데이터 점검에서만 직접 쓴다.
 */
export function quoteStatsOf(
  data: Pick<DashboardData, 'quotes' | 'quotesRaw' | 'quotesExtra'> & Partial<Pick<DashboardData, 'quotesSites' | 'quotesPhone'>>
): { quotes: QuoteRow[]; quotesRaw: QuoteRawRow[] } {
  const extra = withExtraDetails(data.quotesExtra || [], data.quotesSites || [], data.quotesPhone || []);
  if (!extra.length) return { quotes: data.quotes, quotesRaw: data.quotesRaw };
  const agg = new Map<string, QuoteRow>();
  const add = (month: string, category: string, source: string, count: number) => {
    const k = [month, category, source].join('\u0001');
    const cur = agg.get(k);
    if (cur) cur.count += count;
    else agg.set(k, { month, category, source, count });
  };
  data.quotes.forEach((r) => add(r.month, r.category, r.source, r.count));
  extra.forEach((r) => add(r.date.slice(0, 7), r.category, r.source, 1));
  return {
    quotes: [...agg.values()],
    quotesRaw: withLatestRepTitles([...data.quotesRaw, ...extra].sort((a, b) => a.date.localeCompare(b.date))),
  };
}

/** quoteStatsOf 를 견적 원본이 바뀔 때만 다시 계산한다 (화면마다 같은 메모를 복사하지 않게) */
export function useQuoteStats(
  data: Pick<DashboardData, 'quotes' | 'quotesRaw' | 'quotesExtra'> & Partial<Pick<DashboardData, 'quotesSites' | 'quotesPhone'>>
): { quotes: QuoteRow[]; quotesRaw: QuoteRawRow[] } {
  const { quotes, quotesRaw, quotesExtra, quotesSites, quotesPhone } = data;
  return useMemo(
    () => quoteStatsOf({ quotes, quotesRaw, quotesExtra, quotesSites, quotesPhone }),
    [quotes, quotesRaw, quotesExtra, quotesSites, quotesPhone]
  );
}

/**
 * 건수 통계용 다른 사이트·전화문의 행(고객 정보 없음)에 원본 행의 SNO·제목·회사·작성자·연락처를 붙인다.
 * 원본(quotes_raw_sites·quotes_phone)을 받은 경우에만 채워지고, 분류·유입 경로 등 집계 값은 통계 행 그대로 둔다.
 * 같은 사이트·같은 날·같은 영업담당 행을 차례로 짝짓는다.
 */
function withExtraDetails(extra: QuoteRawRow[], sites: QuoteRawRow[], phone: QuoteRawRow[]): QuoteRawRow[] {
  if (!sites.length && !phone.length) return extra;
  const keyOf = (site: string, date: string, rep?: string) => [site, date.slice(0, 10), rep || ''].join('|');
  const pool = new Map<string, QuoteRawRow[]>();
  const put = (site: string, r: QuoteRawRow) => {
    const k = keyOf(site, r.date, r.salesRep);
    const bucket = pool.get(k);
    if (bucket) bucket.push(r);
    else pool.set(k, [r]);
  };
  sites.forEach((r) => r.site && put(r.site, r));
  phone.forEach((r) => put('phone', r));
  return extra.map((r) => {
    const src = pool.get(keyOf(r.site || '', r.date, r.salesRep))?.shift();
    if (!src) return r;
    const { sno, subject, company, name, email, phone: tel, receiver, sourceDetail } = src;
    return { ...r, sno, subject, company, name, email, phone: tel, receiver, sourceDetail: r.sourceDetail || sourceDetail, autoCategory: src.autoCategory, manual: src.manual };
  });
}

/**
 * 관리자 원본(고객 정보·다른 사이트·전화문의)을 아직 받는 중인가 — 화면은 처음에 고객 정보가 빠진 저장본을 먼저 보여 주므로,
 * 로그인한 상태에서 실데이터를 받는 동안 빈 상세 칸을 '–' 대신 로딩으로 보여 줄 때 쓴다
 */
export const quoteDetailsPending = (data: Pick<DashboardData, 'quotesSites' | 'quotesPhone'>, isSyncing: boolean, isLoggedIn: boolean): boolean =>
  isLoggedIn && isSyncing && !(data.quotesSites?.length || data.quotesPhone?.length);

/** 고른 달의 일별 광고비 과거분을 받는다 (최근 구간보다 앞선 날짜를 고를 때) */
export async function fetchDailyHist(months: string[], site: SiteId = 'itket'): Promise<SpendDailyRow[]> {
  const c = getCfg(site);
  const res = await fetch(`${c.url}${c.url.includes('?') ? '&' : '?'}key=${encodeURIComponent(c.key)}&daily=${months.join(',')}`);
  const j = (await res.json()) as { error?: string; g_adgroup_daily_hist?: RawSpendApiRow[]; n_adgroup_daily_hist?: RawSpendApiRow[] };
  if (j.error) throw new Error(j.error);
  // fromApi 를 거치면 판매·기기 등 전역 저장소가 빈 값으로 덮이므로 일별 행만 따로 만든다
  return spendDailyOf(j.g_adgroup_daily_hist, j.n_adgroup_daily_hist);
}

const toSpendRow = (media: string, r: RawSpendApiRow): SpendRow => {
  const n = (v: unknown) => Number(v) || 0;
  return {
    month: String(r.month ?? '').trim().slice(0, 7),
    media,
    type: String(r.type || 'SA').trim(),
    campaign: String(r.campaign ?? '').trim(),
    adgroup: String(r.ad_group ?? '').trim(),
    cost: n(r.cost),
    imp: n(r.impressions),
    clk: n(r.clicks),
    conv: n(r.conversions),
    ...(r.campaign_tp ? { campaignTp: String(r.campaign_tp).trim() } : {}),
  };
};

/** 일별 광고비 — 시트에 없으면(수집 전·웹앱 미갱신) 빈 목록이고, 일·기간 선택은 월 단위로 보여 준다 */
function spendDailyOf(google: RawSpendApiRow[] = [], naver: RawSpendApiRow[] = []): SpendDailyRow[] {
  const toDailyRow = (media: string, r: RawSpendApiRow): SpendDailyRow => {
    const { month: _month, ...rest } = toSpendRow(media, r);
    return { ...rest, date: String(r.date ?? '').trim().slice(0, 10) };
  };
  return [...google.map((r) => toDailyRow('Google', r)), ...naver.map((r) => toDailyRow('Naver', r))].filter((r) =>
    /^\d{4}-\d{2}-\d{2}$/.test(r.date),
  );
}

export function fromApi(j: RawApiPayload): DashboardData {
  const n = (v: unknown) => Number(v) || 0;

  const spend: SpendRow[] = (j.g_adgroup_monthly || []).map((r) => toSpendRow('Google', r));
  const hasGroup = new Set(spend.map((r) => `${r.month}\u0001${r.campaign}`));

  (j.g_campaign_monthly || []).forEach((r) => {
    const c = toSpendRow('Google', r);
    if (!hasGroup.has(`${c.month}\u0001${c.campaign}`)) {
      spend.push({ ...c, adgroup: '(광고그룹 없음)' });
    }
  });

  (j.n_adgroup_monthly || []).forEach((r) => spend.push(toSpendRow('Naver', r)));

  const spendDaily = spendDailyOf(j.g_adgroup_daily || [], j.n_adgroup_daily || []);

  const dailyRecentFrom: Record<string, string> = {};
  spendDaily.forEach((r) => {
    if (!dailyRecentFrom[r.media] || r.date < dailyRecentFrom[r.media]) dailyRecentFrom[r.media] = r.date;
  });

  const manual: ManualRow[] = (j.manual || [])
    .map((r) => ({
      month: String(r.month ?? '').trim().slice(0, 7),
      item: String(r.item ?? '').trim().toUpperCase(),
      amount: n(r.amount),
    }))
    .filter((r) => r.amount > 0);

  manual
    .filter((r) => r.item === 'META')
    .forEach((r) =>
      spend.push({
        month: r.month,
        media: 'Meta',
        type: 'DA',
        campaign: 'Meta',
        adgroup: '',
        cost: r.amount,
        imp: 0,
        clk: 0,
        conv: 0,
      })
    );

  // 네이버 파워링크는 2026-07-29부로 기존 nccQi.qiGrade가 폐지되어 모든 키워드가 고정값 4로 내려온다.
  // 신규 지표(ad_relevance, expected_click)가 없고 네이버 키워드 전체가 4로만 채워진 경우 고정 기본값이므로 0 처리한다.
  const naverRawKws = j.n_keywords || [];
  const isLegacyUniformNaverQi =
    naverRawKws.length > 0 &&
    naverRawKws.every(
      (r) =>
        !n(r.ad_relevance) &&
        !n(r.expected_click) &&
        (n(r.quality) === 4 || n(r.quality) === 0)
    );

  const toKeywordRow = (media: string, r: RawKeywordApiRow): KeywordRow => {
    const adRelevance = n(r.ad_relevance) || undefined;
    const expectedClick = n(r.expected_click) || undefined;
    const rawQ = n(r.quality);
    const quality =
      media === 'Naver'
        ? adRelevance && expectedClick
          ? Math.round((adRelevance + expectedClick) / 2)
          : adRelevance || expectedClick || (isLegacyUniformNaverQi && rawQ === 4 ? 0 : rawQ)
        : rawQ;

    const month = String(r.month ?? '').trim().slice(0, 7) || THIS_M;

    return {
      month,
      media,
      type: String(r.type || 'SA').trim(),
      campaign: String(r.campaign ?? '').trim(),
      adgroup: String(r.ad_group ?? '').trim(),
      keyword: String(r.keyword ?? '').trim(),
      match: r.match,
      bid: n(r.bid),
      quality,
      adRelevance,
      expectedClick,
      cost: n(r.cost),
      imp: n(r.impressions),
      clk: n(r.clicks),
      conv: n(r.conversions),
    };
  };

  // 줄바꿈으로 이은 목록 열(images·titles·descs) → 배열. 대표 값(first)이 있으면 맨 앞에 둔다
  const lines = (v: unknown, first = '') => {
    const list = String(v ?? '')
      .split(/\s*\n\s*/)
      .filter(Boolean);
    return [...new Set(first ? [first, ...list] : list)];
  };

  const toAdRow = (media: string, r: RawAdApiRow): AdRow => {
    const images = lines(r.images, String(r.image || '').trim());
    const title = String(r.title || r.ad_type || '').trim();
    return {
      media,
      type: String(r.type || 'SA').trim(),
      adId: String(r.ad_id ?? '').trim(),
      adType: String(r.ad_type ?? '').trim(),
      campaign: String(r.campaign ?? '').trim(),
      adgroup: String(r.ad_group ?? '').trim(),
      title,
      titles: lines(r.titles, title),
      descs: lines(r.descs),
      url: String(r.url || '').trim(),
      image: images[0] || '',
      images,
    };
  };

  // 캠페인 이름을 바꾸면 시트에 옛 이름의 행이 남아 같은 소재가 두 번 온다 — 앞(최근 수집) 행만 쓴다
  const uniqueAds = (rows: AdRow[]) => {
    const seen = new Set<string>();
    return rows.filter((a) => {
      if (!a.adId) return true;
      const k = adStatKey(a.media, a.adId);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const toAdStatRow = (media: string, r: RawAdStatApiRow): AdStatRow => ({
    month: String(r.month ?? '').trim().slice(0, 7),
    media,
    adId: String(r.ad_id ?? '').trim(),
    cost: n(r.cost),
    imp: n(r.impressions),
    clk: n(r.clicks),
    conv: n(r.conversions),
  });

  const upd = (rows?: RawMetaApiRow[]) =>
    (rows || []).find((r) => r.key === 'updated')?.value || '';

  const candidates = [j.served, upd(j.g_meta), upd(j.n_meta), upd(j.q_meta)]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  const precise = candidates.filter((s) => s.length >= 10);
  const rawUpdated = precise.length ? precise.sort().pop()! : candidates.sort().pop() || '';

  const data: DashboardData = {
    updated: fmtUpdatedTimestamp(rawUpdated),
    sources: { google: upd(j.g_meta), naver: upd(j.n_meta), quote: upd(j.q_meta), godo: upd(j.godo_meta) },
    spend,
    spendDaily,
    dailyRecentFrom,
    dailyHistMonths: j.daily_hist_months || {},
    dailyLoadedMonths: [],
    manual,
    mapping: j.mapping || [],
    quotes: (j.quotes_monthly || []).map((r) => {
      const src = String(r.source ?? '').trim();
      return {
        month: String(r.month ?? '').trim().slice(0, 7),
        category: String(r.category ?? '').trim(),
        source: src === '직접·기타' ? '기타' : src,
        count: n(r.count),
      };
    }),
    quotesRaw: (j.quotes_raw || [])
      .map((r, idx) => toQuoteRawRow(r, r.id ? String(r.id) : ('q_' + (idx + 1))))
      .filter((r) => r.date)
      .sort((a, b) => a.date.localeCompare(b.date)),
    quotesSites: (j.quotes_raw_sites || [])
      .map((r, idx) => ({ ...toQuoteRawRow(r, 'qs_' + (idx + 1)), site: String(r.site || '').trim() }))
      .filter((r) => r.date && r.site)
      .sort((a, b) => a.date.localeCompare(b.date)),
    quotesPhone: (j.quotes_phone || [])
      .map((r, idx) => toQuotePhoneRow(r, 'qp_' + (idx + 1)))
      .filter((r) => r.date)
      .sort((a, b) => a.date.localeCompare(b.date)),
    quotesExtra: (j.quotes_stats_extra || [])
      .map((r, idx) => ({
        id: 'qx_' + (idx + 1),
        site: String(r.origin ?? '').trim(),
        date: String(r.date ?? '').trim(),
        category: String(r.category ?? '').trim() || '기타',
        source: extraSourceOf(r),
        inquiryType: extraInquiryTypeOf(r),
        sourceDetail: '',
        salesRep: String(r.sales_rep ?? '').trim().replace(/\s+/g, ' '),
      }))
      .filter((r) => r.date),
    keywords: [
      ...(j.g_keywords || []).map((r) => toKeywordRow('Google', r)),
      ...naverRawKws.map((r) => toKeywordRow('Naver', r)),
    ],
    ads: uniqueAds([
      ...(j.g_ads || []).map((r) => toAdRow('Google', r)),
      ...(j.n_ads || []).map((r) => toAdRow('Naver', r)),
    ]),
    adStats: [
      ...(j.g_ad_stats || []).map((r) => toAdStatRow('Google', r)),
      ...(j.n_ad_stats || []).map((r) => toAdStatRow('Naver', r)),
    ],
  };
  // 수집 시각 기록이 있으면 그날을 기준일로 쓴다 (없던 때는 응답 시각)
  applyGodoOrders(j.godo_orders_monthly || [], upd(j.godo_meta) || j.served);
  applyGodoGoods(j.godo_goods_monthly || []);
  applyGodoOrderInflow(j.godo_order_inflow_monthly || []);
  applyGodoDaily(j.godo_orders_daily || []);
  applyGodoGoodsInflow(j.godo_goods_inflow_monthly || []);
  applyGodoOrderLines(j.godo_order_lines || []);
  applyGodoOrderCustomers(j.godo_order_customers || []);
  applyAdDevices(j.g_device_monthly || [], j.n_device_daily || []);
  const marks = new Map<string, QuoteManualMark>();
  (j.manual_categories || []).forEach((r) => {
    const sno = String(r.sno ?? '').trim();
    const category = String(r.category ?? '').trim();
    if (!sno || !category) return;
    const by = String(r.updated_by ?? '').trim();
    marks.set(sno, { category, at: String(r.updated_at ?? '').trim(), ...(by ? { by } : {}) });
  });
  const manualCats = new Map([...marks].map(([sno, m]) => [sno, m.category] as const));
  const out = withCurrentQuoteCategories(data, manualCats);
  // 수동 지정 흔적: 저장 기록과, 비교용 자동 분류 결과 (제목이 있을 때만)
  const withTrace = (r: QuoteRawRow): QuoteRawRow => {
    const mark = marks.get(quoteKey(r));
    const siteCategory = r.site ? SITE_DEFAULT_CATEGORY[r.site] : undefined;
    const autoCategory = siteCategory || (r.subject ? quoteCategoryOf(r.subject, r.sourceDetail) : undefined);
    return mark || autoCategory ? { ...r, category: siteCategory && !mark ? siteCategory : r.category, autoCategory, manual: mark } : r;
  };
  // 영업담당 표기는 아이티켓·다른 사이트·전화문의를 함께 보고 맞춘다 (한쪽에만 직급이 적혀 있어도 같은 표기가 되도록)
  const repTitles = latestRepTitles(
    [...out.quotesRaw, ...out.quotesSites, ...out.quotesPhone, ...out.quotesExtra].sort((a, b) => a.date.localeCompare(b.date))
  );
  return {
    ...out,
    quotesRaw: applyRepTitles(out.quotesRaw.map(withTrace), repTitles),
    quotesSites: applyRepTitles(out.quotesSites.map(withTrace), repTitles),
    quotesPhone: applyRepTitles(out.quotesPhone, repTitles),
    quotesExtra: applyRepTitles(out.quotesExtra, repTitles),
  };
}

// 전화문의 시트의 경로(전화·톡플러스·메일 등)는 문의 방법이지 유입 매체가 아니라 유입 통계에서 뺀다 ('미수집'은 유입 통계에서 제외된다)
function extraSourceOf(r: RawQuoteStatsExtraApiRow): string {
  if (String(r.origin ?? '').trim() === 'phone') return '미수집';
  const source = String(r.source ?? '').trim();
  // zbyhp 시트의 경로 칸에 적힌 글자 '미수집'을 수집 스크립트가 '기타'로 분류해 내려온다. 다른 사이트는 유입 매체를 추적하지 않으므로 미수집으로 되돌린다
  return !source || source === '기타' ? '미수집' : source;
}

// 전화문의 시트의 경로 — 수기 입력이라 정해진 값 밖은 '기타'로 묶는다. 다른 사이트 견적은 사이트 접수라 비워 둔다
const PHONE_INQUIRY_TYPES = new Set(['전화', '톡플러스', '메일']);
function extraInquiryTypeOf(r: RawQuoteStatsExtraApiRow): string | undefined {
  if (String(r.origin ?? '').trim() !== 'phone') return undefined;
  const source = String(r.source ?? '').trim();
  return PHONE_INQUIRY_TYPES.has(source) ? source : '기타';
}

/** 전화문의 시트 한 행 — 메모를 제목 자리에, 경로(전화·톡플러스)를 유입경로 자리에 둔다 */
function toQuotePhoneRow(r: RawQuotePhoneApiRow, id: string): QuoteRawRow {
  const text = (v: unknown) => String(v ?? '').trim();
  return {
    id,
    sno: text(r.sno),
    subject: text(r.memo),
    company: text(r.company),
    name: text(r.name),
    phone: text(r.phone),
    date: text(r.received_at),
    category: text(r.category),
    source: text(r.source),
    sourceDetail: '',
    salesRep: text(r.sales_rep).replace(/\s+/g, ' '),
    receiver: text(r.receiver),
  };
}

/** 견적 시트 한 행 (quotes_raw · quotes_raw_sites 공통) */
function toQuoteRawRow(r: RawQuoteRawApiRow, id: string): QuoteRawRow {
  const src = String(r.source || '').trim();
  return {
    id,
    sno: r.sno != null ? String(r.sno).trim() : undefined,
    subject: r.subject != null ? String(r.subject).trim() : undefined,
    company: r.company != null ? String(r.company).trim() : undefined,
    name: r.name != null ? String(r.name).trim() : undefined,
    email: r.email != null ? String(r.email).trim() : undefined,
    date: String(r.date || '').trim(),
    category: String(r.category || '').trim(),
    source: src === '직접·기타' ? '기타' : src,
    // "네이버(광고) - ROSEHA" 처럼 " - " 뒤에 붙은 광고 꼬리표만 따로 둔다
    sourceDetail: String(r.source_raw || '').split(/\s+-\s+/).slice(1).join(' - ').trim(),
    salesRep: String(r.sales_rep || '').trim().replace(/\s+/g, ' '),
  };
}

/** 아이티켓이 아닌 사이트의 데이터에 사이트를 표시한다 (견적 원장에는 사이트 열이 없다) */
function withSite(d: DashboardData, site: SiteId): DashboardData {
  setSalesSite(site);
  if (site === 'itket') return d;
  return { ...d, site, quotesRaw: d.quotesRaw.map((r) => ({ ...r, site })) };
}

// 아이티켓은 견적 원장까지 있어야 쓴다 (원장 없는 옛 캐시 제외). 다른 사이트는 광고·견적 중 하나라도 있으면 쓴다
const isUsableCache = (j: RawApiPayload | null, site: SiteId): j is RawApiPayload =>
  !!j &&
  (site === 'itket'
    ? !!(j.quotes_monthly?.length || j.n_adgroup_monthly?.length) && !!j.quotes_raw?.length
    : !!(j.quotes_monthly?.length || j.n_adgroup_monthly?.length || j.g_campaign_monthly?.length));

/** site: 보고 있는 사이트 — 바뀌면 화면 데이터를 비우고 그 사이트의 웹앱에서 다시 받는다 */
export function useDashboardData(site: SiteId = 'itket') {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [status, setStatus] = useState<SyncStatus>('init');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  // 실데이터가 먼저 도착하면 늦게 읽힌 캐시로 덮어쓰지 않는다
  const liveLoaded = useRef(false);
  // 요청 중에 사이트를 바꾸면 늦게 도착한 이전 사이트 응답은 버린다
  const siteRef = useRef(site);
  siteRef.current = site;
  // 같은 사이트 요청이 겹치면(로그인·로그아웃·15분 갱신) 마지막에 보낸 요청의 응답만 반영한다 — 로그아웃 뒤 늦게 온 관리자 응답이 고객 정보를 다시 띄우지 않게
  const reqId = useRef(0);

  const categoryMap = useMemo(() => buildCategoryMap(data.mapping), [data.mapping]);

  const tryLoadStaticFallback = useCallback(async () => {
    // 배포에 묶인 스냅숏(data/latest.json)은 아이티켓 데이터다
    if (site !== 'itket') return;
    try {
      const localRes = await fetch(`${import.meta.env.BASE_URL}data/latest.json`);
      if (!localRes.ok) return;
      const localJ = (await localRes.json()) as RawApiPayload;
      // 받는 사이에 다른 사이트로 바꿨으면 아이티켓 스냅숏을 그 화면에 넣지 않는다
      if (liveLoaded.current || siteRef.current !== site) return;
      setData((prevData) => {
        if (prevData.spend.length > 0 && prevData.quotesRaw.length > 0) return prevData;
        writeCachedPayload(localJ, site);
        return fromApi(localJ);
      });
      setStatus('live');
    } catch {
      // ignore fallback failure
    }
  }, [site]);

  const load = useCallback(async () => {
    const c = getCfg(site);
    if (!c.url || !c.key) {
      setStatus((prev) => (prev !== 'live' ? 'unlinked' : prev));
      return;
    }
    const id = ++reqId.current;
    const isStale = () => siteRef.current !== site || id !== reqId.current;
    setIsSyncing(true);

    try {
      const fetchUrl = `${c.url}${c.url.includes('?') ? '&' : '?'}key=${encodeURIComponent(c.key)}`;
      // 로그인한 관리자에게만 고객 정보가 내려온다 (Apps Script doGet 이 토큰과 admins 탭을 확인)
      const { data: auth } = await supabase.auth.getSession();
      const token = auth.session?.access_token;
      const res = await fetch(token ? `${fetchUrl}&access_token=${encodeURIComponent(token)}` : fetchUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as RawApiPayload;
      if (j.error) throw new Error(j.error);
      if (isStale()) return;
      liveLoaded.current = true;
      setData(withSite(fromApi(j), site));
      setStatus('live');
      writeCachedPayload(j, site);
    } catch (e) {
      if (isStale()) return;
      console.error('[its-ad-insight] 실데이터 동기화 오류 (화면 데이터 유지):', e);
      setStatus((prev) => (prev === 'live' ? 'live' : 'error'));
      await tryLoadStaticFallback();
    } finally {
      // 뒤에 보낸 요청이 아직 받는 중이면 동기화 표시를 끄지 않는다
      if (id === reqId.current) setIsSyncing(false);
    }
  }, [site, tryLoadStaticFallback]);

  useEffect(() => {
    // 사이트가 바뀌면 이전 사이트 데이터를 지우고 처음부터 받는다
    liveLoaded.current = false;
    setData(emptyData());
    setStatus('init');
    // 실데이터 요청(수 초~수십 초)을 가장 먼저 띄워 두고, 그동안 지난번 받은 데이터(없으면 배포에 묶인 스냅숏)로 먼저 그린다.
    // 예전에는 캐시·스냅숏을 다 받은 뒤에야 요청을 시작해 그만큼 늦게 도착했다
    load();
    readCachedPayload(site).then(async (cached) => {
      if (liveLoaded.current || siteRef.current !== site) return; // 실데이터가 먼저 왔으면 옛 캐시로 덮지 않는다
      if (isUsableCache(cached, site)) {
        setData(withSite(fromApi(cached), site));
        setStatus('live');
      } else {
        await tryLoadStaticFallback();
      }
    });

    const timer = setInterval(load, 15 * 60 * 1000);
    return () => clearInterval(timer);
  }, [site, load, tryLoadStaticFallback]);

  // 로그인·로그아웃하면 그 권한에 맞는 데이터로 다시 받는다 (토큰 갱신처럼 계정이 그대로면 받지 않는다)
  useEffect(() => {
    let userId: string | undefined;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const next = session?.user.id;
      if (event === 'INITIAL_SESSION') {
        userId = next;
        return;
      }
      if (next === userId) return;
      userId = next;
      setTimeout(() => load(), 0); // 이 콜백 안에서 Supabase 를 다시 부르면 멈출 수 있어 밖으로 뺀다
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  useEffect(() => {
    document.body.classList.toggle('live', status === 'live');
  }, [status]);

  const updateQuotesRaw = useCallback((newQuotes: QuoteRawRow[]) => {
    const agg: Record<string, number> = {};
    newQuotes.forEach((r) => {
      const mo = (r.date || '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(mo)) return;
      const key = `${mo}\u0001${r.category || '기타'}\u0001${r.source || '미수집'}`;
      agg[key] = (agg[key] || 0) + 1;
    });
    const recalculated: QuoteRow[] = Object.entries(agg).map(([k, count]) => {
      const [month, category, source] = k.split('\u0001');
      return { month, category, source, count };
    });
    setData((prev) => ({
      ...prev,
      quotesRaw: newQuotes,
      quotes: recalculated.length > 0 ? recalculated : prev.quotes,
    }));
  }, []);

  // 다른 사이트 견적은 통계에 쓰지 않아 월별 집계를 다시 내지 않는다
  const updateQuotesSites = useCallback((quotesSites: QuoteRawRow[]) => {
    setData((prev) => ({ ...prev, quotesSites }));
  }, []);

  return { data, categoryMap, status, isSyncing, load, updateQuotesRaw, updateQuotesSites };
}
