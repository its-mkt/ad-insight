export type ViewId = 'overview' | 'ads' | 'cat-efficiency' | 'keywords' | 'quotes' | 'purchases' | 'devices' | 'search' | 'data' | 'admin' | 'usage';

/** 사이드바에서 고르는 사이트 — 온코어는 데이터 연결 전이라 안내만 보여 준다 */
export type SiteId = 'itket' | 'oncore';

export type ChartType = 'line' | 'grouped' | 'donut';

export type SyncStatus = 'init' | 'live' | 'error' | 'unlinked';

export interface SpendRow {
  month: string;
  media: string;
  type: string;
  campaign: string;
  adgroup: string;
  cost: number;
  imp: number;
  clk: number;
  conv: number;
}

/** 광고그룹 × 일 광고비 — 일·기간 선택이 쓴다. 최근 수십 일만 수집한다 */
export interface SpendDailyRow {
  /** YYYY-MM-DD */
  date: string;
  media: string;
  type: string;
  campaign: string;
  adgroup: string;
  cost: number;
  imp: number;
  clk: number;
  conv: number;
}

export interface ManualRow {
  month: string;
  item: string;
  amount: number;
}

export interface MappingRow {
  media?: string;
  campaign?: string;
  ad_group?: string;
  category?: string;
  ratio?: number | string;
}

export interface QuoteRow {
  month: string;
  category: string;
  source: string;
  count: number;
}

export interface QuoteRawRow {
  id?: string;
  /** 아이티켓 외 사이트 (zbyhp·cadkorea). 아이티켓 원장은 비어 있다 */
  site?: string;
  sno?: string | number;
  subject?: string;
  name?: string;
  company?: string;
  email?: string;
  date: string;
  category: string;
  source: string;
  /** 시트 원문 유입경로의 꼬리표 (예: "네이버(광고) - ROSEHA" → "ROSEHA"). 없으면 빈 값 */
  sourceDetail: string;
  /** 사내 영업 담당자 "이름 직급" (사람마다 가장 최근 직급으로 통일). 수집 전 데이터는 빈 값 */
  salesRep?: string;
  /** 전화문의 고객 전화번호 */
  phone?: string;
  /** 전화문의를 받은 직원 */
  receiver?: string;
  /** 문의 유형 (전화·톡플러스·메일 등). 비어 있으면 사이트로 접수된 견적문의 */
  inquiryType?: string;
  /** 자동 분류 결과 (제목 → 유입 광고 꼬리표) — 수동 지정과 비교해 흔적을 보여 준다 */
  autoCategory?: string;
  /** 어드민에서 수동 지정해 저장된 기록 (manual_categories 시트) */
  manual?: QuoteManualMark;
}

/** 견적 카테고리 수동 지정 기록 */
export interface QuoteManualMark {
  category: string;
  /** 저장 시각 (yyyy-MM-dd HH:mm:ss) */
  at: string;
  /** 저장한 관리자 (시트에 기록이 있을 때만) */
  by?: string;
}

export interface KeywordRow {
  month: string;
  media: string;
  type: string;
  campaign: string;
  adgroup: string;
  keyword: string;
  match?: string;
  bid: number;
  quality: number;
  adRelevance?: number;
  expectedClick?: number;
  cost: number;
  imp: number;
  clk: number;
  conv: number;
}

export interface KeywordGroup {
  media: string;
  campaign: string;
  adgroup: string;
  cost: number;
  list: KeywordRow[];
  /** 키워드 합계와 다른 그룹 실적을 보여 줄 때 (검색 결과는 광고그룹 전체 실적을 쓴다) */
  totals?: { imp: number; clk: number; conv: number };
}

export interface CampaignKeywordBucket {
  /** 같은 캠페인명이 Google·Naver 양쪽에 있으면 한 탭으로 합치므로 매체가 여럿일 수 있다 */
  medias: string[];
  campaign: string;
  cost: number;
  groups: KeywordGroup[];
}

export interface AdRow {
  media: string;
  type: string;
  /** 매체의 소재 ID — 소재 성과(AdStatRow)와 잇는 키 */
  adId: string;
  /** 매체의 소재 종류 코드 (RSA_AD·TEXT_45 등) */
  adType: string;
  campaign: string;
  adgroup: string;
  /** 대표 제목 (titles[0]) */
  title: string;
  /** 반응형 소재의 제목 전체 (대표 제목 포함) */
  titles: string[];
  /** 설명 전체 */
  descs: string[];
  url: string;
  /** 대표 이미지 (images[0]) */
  image: string;
  /** 소재에 걸린 이미지 전체 — 확장소재·반응형 광고는 여러 장일 수 있다 */
  images: string[];
}

/** 같은 광고그룹의 소재 묶음 — 그룹 안 소재마다 제목·설명·링크가 다를 수 있다 */
export interface AdGroupCreatives {
  key: string;
  media: string;
  type: string;
  campaign: string;
  adgroup: string;
  /** 기준월 실적이 큰 소재부터 */
  ads: AdRow[];
}

/** 소재 × 월 성과 */
export interface AdStatRow {
  month: string;
  media: string;
  adId: string;
  cost: number;
  imp: number;
  clk: number;
  conv: number;
}

export interface DashboardData {
  updated: string;
  sources: {
    google: string;
    naver: string;
    quote?: string;
    /** 고도몰 주문 마지막 수집 시각 (godo_meta) */
    godo?: string;
  };
  spend: SpendRow[];
  /** 일별 광고비 (최근 수집 구간만) — 없으면 일·기간 선택은 월 단위로 보여 준다 */
  spendDaily: SpendDailyRow[];
  /** 매체별 최근 일별 구간의 첫 날 (첫 응답에 함께 오는 구간) */
  dailyRecentFrom: Record<string, string>;
  /** 매체별로 일별 과거분이 쌓여 있는 달 */
  dailyHistMonths: Record<string, string[]>;
  /** 일별 과거분을 받아 spendDaily 에 합친 달 */
  dailyLoadedMonths: string[];
  manual: ManualRow[];
  mapping: MappingRow[];
  quotes: QuoteRow[];
  quotesRaw: QuoteRawRow[];
  /** 어드민 리스트 전용 다른 사이트 견적 — 통계에는 쓰지 않는다 */
  quotesSites: QuoteRawRow[];
  /** 어드민 리스트 전용 전화문의 — 통계에는 쓰지 않는다 */
  quotesPhone: QuoteRawRow[];
  /** 건수 통계에만 더하는 다른 사이트·전화문의 (CPA·견적전환율에는 쓰지 않는다) */
  quotesExtra: QuoteRawRow[];
  keywords: KeywordRow[];
  ads: AdRow[];
  adStats: AdStatRow[];
}

export interface CategoryWeight {
  c: string;
  w: number;
}

export type CategoryMap = Map<string, CategoryWeight[]>;

export interface SeriesItem {
  k: string;
  c: string;
  v: number[];
  raw?: number[];
}

export interface CategoryBarItem {
  k: string;
  cur: number;
  prev: number;
  q?: number;
}

export interface SourceShareItem {
  k: string;
  c: string;
  v: number;
  count?: number;
  /** 비교 기간(전월·전년 동기)의 점유율·건수. 비교를 켠 경우에만 채운다 */
  prevV?: number;
  prevCount?: number;
}

export interface RawSpendApiRow {
  month?: unknown;
  /** 일별 시트(g_adgroup_daily·n_adgroup_daily)의 날짜 */
  date?: unknown;
  type?: string;
  campaign?: unknown;
  ad_group?: unknown;
  cost?: unknown;
  impressions?: unknown;
  clicks?: unknown;
  conversions?: unknown;
}

export interface RawManualApiRow {
  month?: unknown;
  item?: unknown;
  amount?: unknown;
}

export interface RawKeywordApiRow {
  month?: unknown;
  type?: unknown;
  campaign?: unknown;
  ad_group?: unknown;
  keyword?: unknown;
  match?: string;
  bid?: unknown;
  quality?: unknown;
  ad_relevance?: unknown;
  expected_click?: unknown;
  cost?: unknown;
  impressions?: unknown;
  clicks?: unknown;
  conversions?: unknown;
}

export interface RawAdApiRow {
  type?: unknown;
  campaign?: unknown;
  ad_group?: unknown;
  title?: unknown;
  ad_type?: unknown;
  url?: unknown;
  image?: unknown;
  /** 이미지 주소를 줄바꿈으로 이은 문자열 (수집 스크립트가 images 열을 쓰기 전 데이터에는 없다) */
  images?: unknown;
  ad_id?: unknown;
  /** 제목·설명을 줄바꿈으로 이은 문자열 (titles·descs 열이 생기기 전 데이터에는 없다) */
  titles?: unknown;
  descs?: unknown;
}

export interface RawAdStatApiRow {
  month?: unknown;
  ad_id?: unknown;
  cost?: unknown;
  impressions?: unknown;
  clicks?: unknown;
  conversions?: unknown;
}

export interface RawMetaApiRow {
  key?: string;
  value?: string;
}

export interface RawQuoteMonthlyApiRow {
  month?: unknown;
  category?: unknown;
  source?: unknown;
  count?: unknown;
}

export interface RawQuoteRawApiRow {
  id?: unknown;
  sno?: unknown;
  subject?: unknown;
  name?: unknown;
  company?: unknown;
  email?: unknown;
  date?: unknown;
  category?: unknown;
  source?: unknown;
  /** 시트 원문 유입경로 */
  source_raw?: unknown;
  /** 견적 시트 영업담당 원문 (예: "이병태 차장") */
  sales_rep?: unknown;
  /** quotes_raw_sites 의 사이트 구분 */
  site?: unknown;
}

/** 건수 통계용 추가 견적 한 행 (quotes_stats_extra) — 다른 사이트·전화문의, 고객 정보 없음 */
export interface RawQuoteStatsExtraApiRow {
  date?: unknown;
  origin?: unknown;
  category?: unknown;
  source?: unknown;
  sales_rep?: unknown;
}

/** 전화문의 시트 한 행 (quotes_phone) */
export interface RawQuotePhoneApiRow {
  sno?: unknown;
  source?: unknown;
  company?: unknown;
  name?: unknown;
  phone?: unknown;
  category?: unknown;
  sales_rep?: unknown;
  receiver?: unknown;
  received_at?: unknown;
  memo?: unknown;
}

/** 어드민에서 수동 지정한 견적 카테고리 (manual_categories 시트) */
export interface RawManualCategoryApiRow {
  sno?: unknown;
  category?: unknown;
  updated_at?: unknown;
  updated_by?: unknown;
}

export interface RawApiPayload {
  error?: string;
  served?: string;
  g_meta?: RawMetaApiRow[];
  n_meta?: RawMetaApiRow[];
  q_meta?: RawMetaApiRow[];
  godo_meta?: RawMetaApiRow[];
  g_adgroup_monthly?: RawSpendApiRow[];
  g_campaign_monthly?: RawSpendApiRow[];
  n_adgroup_monthly?: RawSpendApiRow[];
  g_adgroup_daily?: RawSpendApiRow[];
  daily_hist_months?: Record<string, string[]>;
  n_adgroup_daily?: RawSpendApiRow[];
  manual?: RawManualApiRow[];
  mapping?: MappingRow[];
  quotes_monthly?: RawQuoteMonthlyApiRow[];
  quotes_raw?: RawQuoteRawApiRow[];
  quotes_raw_sites?: RawQuoteRawApiRow[];
  quotes_phone?: RawQuotePhoneApiRow[];
  quotes_stats_extra?: RawQuoteStatsExtraApiRow[];
  godo_orders_monthly?: { month?: unknown; count?: unknown }[];
  godo_goods_monthly?: { month?: unknown; goods_no?: unknown; goods_name?: unknown; orders?: unknown; qty?: unknown; amount?: unknown }[];
  godo_order_inflow_monthly?: { month?: unknown; source?: unknown; count?: unknown }[];
  godo_orders_daily?: { date?: unknown; paid?: unknown; reached?: unknown; not_web?: unknown }[];
  godo_goods_inflow_monthly?: { month?: unknown; goods_no?: unknown; source?: unknown; orders?: unknown }[];
  godo_order_lines?: Record<string, unknown>[];
  /** 캠페인 × 기기 × 월 광고 실적 (Google Ads 스크립트 · 네이버 /stats pcMblTp) */
  g_device_monthly?: Record<string, unknown>[];
  n_device_monthly?: Record<string, unknown>[];
  /** 관리자 로그인 응답에만 있다 */
  godo_order_customers?: Record<string, unknown>[];
  manual_categories?: RawManualCategoryApiRow[];
  g_keywords?: RawKeywordApiRow[];
  n_keywords?: RawKeywordApiRow[];
  g_ads?: RawAdApiRow[];
  n_ads?: RawAdApiRow[];
  g_ad_stats?: RawAdStatApiRow[];
  n_ad_stats?: RawAdStatApiRow[];
}

declare global {
  interface Window {
    ADI?: {
      url?: string;
      key?: string;
    };
  }
}
