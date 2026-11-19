import type {
  AdRow,
  AdStatRow,
  DashboardData,
  KeywordRow,
  ManualRow,
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
  SiteId,
} from '../types/dashboard';
import { quoteKey, THIS_M } from '../utils/format';
import { SITE_DEFAULT_CATEGORY } from '../utils/constants';
import { setSalesSite, applyGodoDaily, applyGodoGoods, applyGodoGoodsInflow, applyGodoOrderCustomers, applyGodoOrderInflow, applyGodoOrderLines, applyGodoOrders } from './godomallOrders';
import { applyAdDevices } from './deviceStats';
import { quoteCategoryOf } from '../utils/categoryText';
import { adStatKey } from '../utils/creativeImage';
import { applyRepTitles, latestRepTitles, withCurrentQuoteCategories } from '../utils/quoteStats';

export function emptyData(): DashboardData {
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
export function spendDailyOf(google: RawSpendApiRow[] = [], naver: RawSpendApiRow[] = []): SpendDailyRow[] {
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
        sno: String(r.sno ?? '').trim() || undefined,
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
  if (site === 'itket') return d;
  return { ...d, site, quotesRaw: d.quotesRaw.map((r) => ({ ...r, site })) };
}

/** 그 사이트의 응답을 화면 데이터로 — 판매·기기 등 전역 저장소가 사이트에 맞게 채워지도록 사이트를 먼저 맞춘다 */
export function fromSiteApi(j: RawApiPayload, site: SiteId): DashboardData {
  setSalesSite(site);
  return withSite(fromApi(j), site);
}

// 아이티켓은 견적 원장까지 있어야 쓴다 (원장 없는 옛 캐시 제외). 다른 사이트는 광고·견적 중 하나라도 있으면 쓴다
export const isUsableCache = (j: RawApiPayload | null, site: SiteId): j is RawApiPayload =>
  !!j &&
  (site === 'itket'
    ? !!(j.quotes_monthly?.length || j.n_adgroup_monthly?.length) && !!j.quotes_raw?.length
    : !!(j.quotes_monthly?.length || j.n_adgroup_monthly?.length || j.g_campaign_monthly?.length));
