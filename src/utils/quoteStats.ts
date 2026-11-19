import type { DashboardData, QuoteRow, QuoteRawRow } from '../types/dashboard';
import { LEGACY_ONLY_CATS } from './format';
import { quoteCategoryOf } from './categoryText';

/**
 * 수집 스크립트가 아직 개편 전 7분류(서버·워크스테이션·스토리지…)로 견적을 나눠 보냈으면,
 * 원장(quotes_raw)의 제목·광고 꼬리표로 새 분류표에 맞춰 다시 분류하고 월별 건수도 원장에서 다시 센다.
 * 수집 스크립트(quoteCategory_)가 새 분류로 바뀐 뒤에는 그대로 통과한다.
 */
export function withCurrentQuoteCategories(data: DashboardData, manual: Map<string, string>): DashboardData {
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
export function latestRepTitles(rows: { salesRep?: string }[]): Map<string, string> {
  const latest = new Map<string, string>();
  rows.forEach(({ salesRep: rep }) => {
    if (rep && (rep.includes(' ') || !latest.has(repNameOf(rep)))) latest.set(repNameOf(rep), rep);
  });
  return latest;
}

export function applyRepTitles<T extends { salesRep?: string }>(rows: T[], latest: Map<string, string>): T[] {
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
 * 견적 원본(고객 정보·다른 사이트·전화문의 — 비로그인은 일부를 가린 값)을 아직 받는 중인가 — 화면은 처음에 고객 정보가 빠진 저장본을 먼저 보여 주므로,
 * 실데이터를 받는 동안 빈 상세 칸을 '–' 대신 로딩으로 보여 줄 때 쓴다
 */
export const quoteDetailsPending = (data: Pick<DashboardData, 'quotesSites' | 'quotesPhone'>, isSyncing: boolean): boolean =>
  isSyncing && !(data.quotesSites?.length || data.quotesPhone?.length);
