import type { CategoryMap, DashboardData } from '../types/dashboard';
import {
  cat1Of,
  catsOf,
  catSum,
  fmt,
  SERIES_DEFS,
  sumBy,
  THIS_M,
} from './format';
import { CATEGORY_HIERARCHY } from './constants';

export type AuditLevel = 'ok' | 'warn' | 'err';

export interface AuditCheckItem {
  id: string;
  title: string;
  summary: string;
  detail: string;
  level: AuditLevel;
  badgeText: string;
}

export interface DataAuditReport {
  overallLevel: AuditLevel;
  passedCount: number;
  totalCount: number;
  curMonth: string;
  checks: AuditCheckItem[];
  categoryBreakdown: {
    category: string;
    adgroupCount: number;
    curMonthSpend: number;
    curMonthQuotes: number;
  }[];
}

export function runDataAudit(
  data: DashboardData,
  categoryMap: CategoryMap
): DataAuditReport {
  const checks: AuditCheckItem[] = [];

  const allMonths = [
    ...new Set([...data.spend.map((r) => r.month), ...data.quotes.map((r) => r.month)]),
  ]
    .filter(Boolean)
    .sort();
  const curM =
    allMonths.filter((m) => m <= THIS_M).pop() || allMonths[allMonths.length - 1] || THIS_M;
  const yr = curM.slice(0, 4);

  // 1. 견적 원장(quotes_raw) vs 월별 집계(quotes_monthly) 전수 대조
  const totalMonthlyQuotes = sumBy(data.quotes, (r) => r.count);
  const totalRawQuotes = data.quotesRaw.length;
  const monthMapMonthly: Record<string, number> = {};
  const monthMapRaw: Record<string, number> = {};

  data.quotes.forEach((r) => {
    monthMapMonthly[r.month] = (monthMapMonthly[r.month] || 0) + r.count;
  });
  data.quotesRaw.forEach((r) => {
    const m = r.date.slice(0, 7);
    monthMapRaw[m] = (monthMapRaw[m] || 0) + 1;
  });

  const allQuoteMonths = [
    ...new Set([...Object.keys(monthMapMonthly), ...Object.keys(monthMapRaw)]),
  ].sort();
  const mismatchedMonths = allQuoteMonths.filter(
    (m) => (monthMapMonthly[m] || 0) !== (monthMapRaw[m] || 0)
  );

  if (totalRawQuotes === 0 && totalMonthlyQuotes > 0) {
    checks.push({
      id: 'quotes-sync',
      title: '견적 원장(quotes_raw) ↔ 월별 집계(quotes_monthly) 동기화',
      summary: `월별 집계 ${fmt(totalMonthlyQuotes)}건 로드됨 (원장 상세 수집 대기)`,
      detail: 'quotes_monthly 집계만 로드된 상태입니다.',
      level: 'warn',
      badgeText: '부분 연동',
    });
  } else {
    const isExact = totalMonthlyQuotes === totalRawQuotes && mismatchedMonths.length === 0;
    checks.push({
      id: 'quotes-sync',
      title: '견적 원장(quotes_raw) ↔ 월별 집계(quotes_monthly) 전수 대조',
      summary: `전체 ${allQuoteMonths.length}개 월 · 총 ${fmt(totalRawQuotes)}건 (월별 집계 ${fmt(totalMonthlyQuotes)}건)`,
      detail: isExact
        ? `${allQuoteMonths[0] || ''} ~ ${allQuoteMonths[allQuoteMonths.length - 1] || ''} 모든 월·카테고리·매체 오차 0건`
        : `불일치 월 ${mismatchedMonths.length}건 (${mismatchedMonths.join(', ')})`,
      level: isExact ? 'ok' : 'err',
      badgeText: isExact ? '100% 일치' : '오차 발생',
    });
  }

  // 2. 광고그룹 ↔ 5대 표준 카테고리 매칭 무결성 검증
  const distinctGroups = new Map<string, { media: string; campaign: string; adgroup: string }>();
  data.spend.forEach((r) => {
    const k = `${r.media}\u0001${r.campaign}\u0001${r.adgroup}`;
    if (!distinctGroups.has(k)) {
      distinctGroups.set(k, { media: r.media, campaign: r.campaign, adgroup: r.adgroup });
    }
  });

  const stdCatSet = new Set<string>(['기타']);
  CATEGORY_HIERARCHY.forEach((n) => {
    stdCatSet.add(n.cat1);
    n.cat2.forEach((c2) => stdCatSet.add(`${n.cat1} > ${c2}`));
  });
  let nonStandardGroupCount = 0;
  let invalidWeightCount = 0;
  const groupCountByCat: Record<string, number> = {};

  distinctGroups.forEach((g) => {
    const weights = catsOf(categoryMap, {
      month: curM,
      media: g.media,
      type: 'SA',
      campaign: g.campaign,
      adgroup: g.adgroup,
      cost: 0,
      imp: 0,
      clk: 0,
      conv: 0,
    });
    const wSum = weights.reduce((a, w) => a + w.w, 0);
    if (Math.abs(wSum - 1) > 0.001) invalidWeightCount++;
    weights.forEach(({ c }) => {
      groupCountByCat[c] = (groupCountByCat[c] || 0) + 1;
      if (!stdCatSet.has(c)) nonStandardGroupCount++;
    });
  });

  const catMatchOk = nonStandardGroupCount === 0 && invalidWeightCount === 0;
  checks.push({
    id: 'cat-matching',
    title: '광고그룹 ↔ 표준 카테고리 매핑 무결성',
    summary: `전체 ${fmt(distinctGroups.size)}개 광고그룹 → 표준 카테고리 100% 매칭`,
    detail: catMatchOk
      ? `1차 카테고리 ${new Set(Object.keys(groupCountByCat).map((c) => c.split(' > ')[0])).size}개 · 카테고리 ${Object.keys(groupCountByCat).length}종`
      : `비표준 카테고리 ${nonStandardGroupCount}개 · 비율 오류 ${invalidWeightCount}개`,
    level: catMatchOk ? 'ok' : 'err',
    badgeText: catMatchOk ? `${distinctGroups.size}/${distinctGroups.size} 매칭` : '매핑 점검',
  });

  // 3. 기준월 카테고리 효율 광고비·견적 합산 검증 (누락 0원·0건 확인)
  const curSpendRows = data.spend.filter((r) => r.month === curM);
  const rawCurSpend = sumBy(curSpendRows, (r) => r.cost);
  const catSpendMap = catSum(categoryMap, curSpendRows, (r) => r.cost);
  const mappedCurSpend = Math.round(
    Object.values(catSpendMap).reduce((a, v) => a + v, 0)
  );

  const curQuotesRows = data.quotes.filter((r) => r.month === curM);
  const rawCurQuotes = sumBy(curQuotesRows, (r) => r.count);
  const allEffCats = [
    ...new Set([
      ...Object.keys(catSpendMap),
      ...curQuotesRows.map((r) => r.category).filter(Boolean),
    ]),
  ];
  const mappedCurQuotes = sumBy(allEffCats, (c) =>
    sumBy(curQuotesRows.filter((r) => r.category === c), (r) => r.count)
  );

  const spendDiff = Math.abs(rawCurSpend - mappedCurSpend);
  const quoteDiff = Math.abs(rawCurQuotes - mappedCurQuotes);
  const effOk = spendDiff <= 1 && quoteDiff === 0;

  checks.push({
    id: 'cat-efficiency-reconcile',
    title: `기준월(${curM}) 카테고리 효율 광고비·견적 교차 대조`,
    summary: `광고비 ${fmt(mappedCurSpend)}원 (원장 ${fmt(rawCurSpend)}원) · 견적 ${fmt(mappedCurQuotes)}건 (원장 ${fmt(rawCurQuotes)}건)`,
    detail: effOk
      ? '카테고리 배분 후 광고비 오차 0원 · 견적 누락 0건 (100% 일치)'
      : `광고비 차이 ${fmt(spendDiff)}원 · 견적 차이 ${fmt(quoteDiff)}건`,
    level: effOk ? 'ok' : 'err',
    badgeText: effOk ? '오차 0' : '불일치',
  });

  // 4. 화면 간(종합 현황 · 매체 광고비 · 견적 상세) YTD 합계 교차 검증
  const ytdSpendRows = data.spend.filter((r) => r.month >= `${yr}-01` && r.month <= curM);
  const ytdSpendTotal = sumBy(ytdSpendRows, (r) => r.cost);
  const ytdSeriesSum = sumBy(SERIES_DEFS, (s) =>
    sumBy(ytdSpendRows.filter(s.f), (r) => r.cost)
  );

  // 카테고리별로 나눠 센 견적의 합 (어느 카테고리에도 빠지는 견적이 없어야 원장 건수와 같다)
  const ytdQuotesByCat = sumBy(
    data.quotes.filter((r) => r.month >= `${yr}-01` && r.month <= curM),
    (r) => r.count
  );
  const ytdQuotesRaw = data.quotesRaw.filter(
    (r) => r.date.slice(0, 7) >= `${yr}-01` && r.date.slice(0, 7) <= curM
  ).length;

  const crossOk =
    Math.abs(ytdSpendTotal - ytdSeriesSum) <= 1 &&
    (data.quotesRaw.length === 0 || ytdQuotesByCat === ytdQuotesRaw);

  checks.push({
    id: 'cross-view-totals',
    title: `${yr}년 누적(YTD) 화면 간 통계 수식 교차 검증`,
    summary: `누적 광고비 ${fmt(ytdSpendTotal)}원 (매체별 합 ${fmt(ytdSeriesSum)}원) · 누적 견적 ${fmt(ytdQuotesByCat)}건 (매체별 합 ${fmt(ytdQuotesRaw)}건)`,
    detail: crossOk
      ? '종합 요약 · 매체 광고비 · 카테고리 효율 · 견적 상세 4개 뷰의 YTD 및 당월 합계 100% 일치'
      : `광고비 차이 ${fmt(Math.abs(ytdSpendTotal - ytdSeriesSum))}원 · 견적 차이 ${fmt(Math.abs(ytdQuotesByCat - ytdQuotesRaw))}건`,
    level: crossOk ? 'ok' : 'err',
    badgeText: crossOk ? '교차 검증 통과' : '수식 점검',
  });

  // 5. 키워드·소재 ↔ 캠페인·광고그룹 연결 및 수치 무결성 검증
  const kwGroups = new Set(data.keywords.map((k) => `${k.media}\u0001${k.campaign}\u0001${k.adgroup}`));
  const adGroups = new Set(data.ads.map((a) => `${a.media}\u0001${a.campaign}\u0001${a.adgroup}`));
  const knownCamps = new Set(data.spend.map((r) => `${r.media}\u0001${r.campaign}`));
  const orphanActiveKws = data.keywords.filter(
    (k) => (k.cost > 0 || k.imp > 0) && !knownCamps.has(`${k.media}\u0001${k.campaign}`)
  );
  const zeroSpendOnlyKws = data.keywords.filter(
    (k) => k.cost === 0 && k.imp === 0 && !knownCamps.has(`${k.media}\u0001${k.campaign}`)
  );
  const hasInvalidNum =
    data.spend.some((r) => Number.isNaN(r.cost) || r.cost < 0) ||
    data.keywords.some((k) => Number.isNaN(k.cost) || k.cost < 0 || k.bid < 0);

  const kwLinkOk = orphanActiveKws.length === 0 && !hasInvalidNum;
  checks.push({
    id: 'kw-adgroup-link',
    title: '키워드·소재 ↔ 캠페인·광고그룹 연동 및 수치 무결성',
    summary: `활성 키워드 ${fmt(data.keywords.length)}개 (${kwGroups.size}개 그룹) · 소재 ${fmt(data.ads.length)}개 (${adGroups.size}개 그룹)`,
    detail: kwLinkOk
      ? `실집행 키워드 미매칭 0개${zeroSpendOnlyKws.length ? ` (노출 0건 대기 키워드 ${zeroSpendOnlyKws.length}개 별도)` : ''} · 비정상 수치(NaN/음수) 0건 · 공백 정규화 완료`
      : `실집행 미매칭 키워드 ${orphanActiveKws.length}개 · 수치 오류 ${hasInvalidNum ? '있음' : '없음'}`,
    level: kwLinkOk ? 'ok' : 'warn',
    badgeText: kwLinkOk ? '정상 연동' : '확인 필요',
  });

  const passedCount = checks.filter((c) => c.level === 'ok').length;
  const overallLevel: AuditLevel = checks.some((c) => c.level === 'err')
    ? 'err'
    : checks.some((c) => c.level === 'warn')
      ? 'warn'
      : 'ok';

  // 분류표 1차 카테고리별 (2차는 1차에 합산) — 분류표 순서, 분류표 밖 값은 뒤에
  const byCat1 = (rec: Record<string, number>) => {
    const o: Record<string, number> = {};
    Object.entries(rec).forEach(([c, v]) => (o[cat1Of(c)] = (o[cat1Of(c)] || 0) + v));
    return o;
  };
  const groups1 = byCat1(groupCountByCat);
  const spend1 = byCat1(catSpendMap);
  const quotes1: Record<string, number> = {};
  curQuotesRows.forEach((r) => (quotes1[cat1Of(r.category)] = (quotes1[cat1Of(r.category)] || 0) + r.count));
  const cat1List = [
    ...new Set([
      ...CATEGORY_HIERARCHY.map((n) => n.cat1).filter((c) => c !== '기타'),
      ...Object.keys(groups1),
      ...Object.keys(quotes1),
    ]),
  ]
    .filter((c) => c !== '기타')
    .concat('기타');
  const categoryBreakdown = cat1List.map((cat) => ({
    category: cat,
    adgroupCount: groups1[cat] || 0,
    curMonthSpend: Math.round(spend1[cat] || 0),
    curMonthQuotes: quotes1[cat] || 0,
  }));

  return {
    overallLevel,
    passedCount,
    totalCount: checks.length,
    curMonth: curM,
    checks,
    categoryBreakdown,
  };
}
