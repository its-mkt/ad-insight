#!/usr/bin/env node
/**
 * ad-insight — 실시간 데이터 동기화 · 카테고리 매칭 · 통계 수식 무결성 검증 스크립트
 *
 * 실행 방법:
 *   yarn verify         : 실시간 GAS 엔드포인트와 로컬 스냅샷을 대조하고 6대 통계 무결성을 검증
 *   yarn verify:sync    : 실시간 GAS 데이터를 검증한 뒤 data/latest.json 스냅샷까지 최신화
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const LATEST_JSON_PATH = path.join(ROOT_DIR, 'data', 'latest.json');

const DEFAULT_URL =
  'https://script.google.com/macros/s/AKfycbzQS9yMlp9L_eRaH77QWLsY6GOY7L5hyRk1fkuaAHg8GvJmHHwhPRgr2zWldgbX5-cNcg/exec';
const DEFAULT_KEY = '2d3b0cc2b04a4873a835583968ca7a0b';

const QUOTE_CATS = ['서버', '워크스테이션', '스토리지', 'PC·노트북', '기타'];
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR');

export function standardCategoryOf(campaign = '', adgroup = '') {
  const c = String(campaign).trim();
  const g = String(adgroup).trim();
  const s = `${c} ${g}`.toLowerCase();

  if (/스토리지|storage|\bnas\b|\bsan\b|\bdas\b|\bmsa\b|netapp|시놀로지|synology|qnap|백업/.test(s)) {
    return '스토리지';
  }
  if (
    /워크스테이션|workstation|z\s*by\s*hp|zbyhp|zbook|\bz[12468]\b|z\s*central|zgx|data\s*science|\bgpu\b|ai\s*컴퓨터|딥러닝|머신러닝|타워형|미니\s*워크|모바일\s*워크/.test(
      s
    )
  ) {
    return '워크스테이션';
  }
  if (
    /서버|server|hpe|dell|델\b|lenovo|랙|rack|poweredge|proliant|\bdl\d|\bml\d|아이티시스템/.test(s) &&
    !/노트북/.test(s)
  ) {
    return '서버';
  }
  if (
    /노트북|laptop|데스크탑|데스크톱|desktop|\bpc\b|모니터|서피스|surface|엘리트북|엘리트보드|프로북|폴리오|드래곤플라이|파빌리온|옴니북|엘리트데스크|프로데스크|콤팩트|컴팩트|비즈니스|렌탈|올인원/.test(
      s
    )
  ) {
    return 'PC·노트북';
  }
  return '기타';
}

async function main() {
  const shouldWrite = process.argv.includes('--write') || process.argv.includes('--sync');
  console.log('======================================================================');
  console.log(' [ad-insight] 실시간 데이터 연동 · 카테고리 매칭 · 통계 무결성 검증');
  console.log('======================================================================\n');

  const fetchUrl = `${DEFAULT_URL}?key=${DEFAULT_KEY}`;
  const res = await fetch(fetchUrl);
  if (!res.ok) {
    throw new Error(`GAS API 응답 오류: HTTP ${res.status}`);
  }
  const live = await res.json();
  if (live.error) {
    throw new Error(`GAS API 인증/실행 오류: ${live.error}`);
  }

  if (shouldWrite) {
    const normalized = structuredClone(live);
    if (Array.isArray(normalized.mapping)) {
      normalized.mapping = normalized.mapping.map((r) => {
        const campaign = String(r.campaign || '').trim();
        const ad_group = String(r.ad_group || '').trim();
        const category = String(r.category || '').trim() || standardCategoryOf(campaign, ad_group);
        return { ...r, media: String(r.media || '').trim(), campaign, ad_group, category };
      });
    }
    fs.writeFileSync(LATEST_JSON_PATH, JSON.stringify(normalized));
    console.log(`[SYNC] data/latest.json 최신화 완료 (served: ${live.served})\n`);
  }

  const local = fs.existsSync(LATEST_JSON_PATH)
    ? JSON.parse(fs.readFileSync(LATEST_JSON_PATH, 'utf8'))
    : null;

  let errorCount = 0;
  const pass = (msg) => console.log(`  ✅ PASS : ${msg}`);
  const warn = (msg) => console.log(`  ⚠️ WARN : ${msg}`);
  const fail = (msg) => {
    errorCount++;
    console.error(`  ❌ FAIL : ${msg}`);
  };

  // [1/6] 시트별 적재 건수 및 로컬 스냅샷 비교
  console.log('1. [시트 적재 현황 및 로컬 스냅샷(data/latest.json) 동기화 점검]');
  const sheetNames = [
    'n_adgroup_monthly',
    'n_keywords',
    'n_ads',
    'quotes_monthly',
    'quotes_raw',
    'mapping',
    'manual',
    'g_campaign_monthly',
    'g_adgroup_monthly',
    'g_keywords',
    'g_ads',
  ];
  for (const name of sheetNames) {
    const liveLen = (live[name] || []).length;
    const localLen = local ? (local[name] || []).length : -1;
    const diffStr =
      localLen === liveLen ? '로컬 스냅샷 일치' : `로컬 스냅샷 ${localLen}행 (차이 ${liveLen - localLen})`;
    console.log(`   - ${name.padEnd(20)} : 실시간 ${String(liveLen).padStart(5)}행 | ${diffStr}`);
  }
  if ((live.g_adgroup_monthly || []).length === 0 && (live.g_campaign_monthly || []).length === 0) {
    warn('Google Ads(g_*) 시트가 현재 0행입니다 (Google Ads 콘솔에서 GoogleAdsScript.js 실행 대기 중).');
  }

  // [2/6] 견적 원장(quotes_raw) vs 월별 집계(quotes_monthly) 전수 대조
  console.log('\n2. [견적 원장(quotes_raw) ↔ 월별 집계(quotes_monthly) 전수 대조]');
  const qMonthly = live.quotes_monthly || [];
  const qRaw = live.quotes_raw || [];
  const totMonthly = qMonthly.reduce((a, r) => a + (Number(r.count) || 0), 0);
  const totRaw = qRaw.length;

  const byMonthM = {};
  const byMonthR = {};
  qMonthly.forEach((r) => {
    const m = String(r.month || '').trim().slice(0, 7);
    byMonthM[m] = (byMonthM[m] || 0) + (Number(r.count) || 0);
  });
  qRaw.forEach((r) => {
    const m = String(r.date || '').trim().slice(0, 7);
    byMonthR[m] = (byMonthR[m] || 0) + 1;
  });

  const allQMonths = [...new Set([...Object.keys(byMonthM), ...Object.keys(byMonthR)])].sort();
  const diffMonths = allQMonths.filter((m) => (byMonthM[m] || 0) !== (byMonthR[m] || 0));

  if (totMonthly === totRaw && diffMonths.length === 0) {
    pass(
      `전체 ${allQMonths.length}개 월(${allQMonths[0]} ~ ${allQMonths[allQMonths.length - 1]}) 총 ${fmt(totRaw)}건 100% 일치 (오차 0건)`
    );
  } else {
    fail(
      `견적 건수 불일치! quotes_monthly=${fmt(totMonthly)}건 vs quotes_raw=${fmt(totRaw)}건 (불일치 월: ${diffMonths.join(', ')})`
    );
  }

  // [3/6] 광고그룹 ↔ 5대 표준 카테고리 매핑 무결성
  console.log('\n3. [광고그룹 ↔ 5대 표준 카테고리 매칭 무결성 검증]');
  const mapTable = new Map();
  (live.mapping || []).forEach((r) => {
    const c = String(r.category || '').trim();
    if (!c) return;
    const k = [String(r.media || '').trim(), String(r.campaign || '').trim(), String(r.ad_group || '').trim()].join('\u0001');
    if (!mapTable.has(k)) mapTable.set(k, []);
    mapTable.get(k).push({ c, w: (Number(r.ratio) || 100) / 100 });
  });

  const spendRows = [
    ...(live.g_adgroup_monthly || []).map((r) => ({
      month: String(r.month || '').trim().slice(0, 7),
      media: 'Google',
      type: String(r.type || 'SA').trim(),
      campaign: String(r.campaign || '').trim(),
      adgroup: String(r.ad_group || '').trim(),
      cost: Number(r.cost) || 0,
      imp: Number(r.impressions) || 0,
      clk: Number(r.clicks) || 0,
      conv: Number(r.conversions) || 0,
    })),
    ...(live.n_adgroup_monthly || []).map((r) => ({
      month: String(r.month || '').trim().slice(0, 7),
      media: 'Naver',
      type: String(r.type || 'SA').trim(),
      campaign: String(r.campaign || '').trim(),
      adgroup: String(r.ad_group || '').trim(),
      cost: Number(r.cost) || 0,
      imp: Number(r.impressions) || 0,
      clk: Number(r.clicks) || 0,
      conv: Number(r.conversions) || 0,
    })),
  ];

  const catsOf = (r) =>
    mapTable.get([r.media, r.campaign, r.adgroup].join('\u0001')) ||
    mapTable.get([r.media, r.campaign, ''].join('\u0001')) || [
      { c: standardCategoryOf(r.campaign, r.adgroup), w: 1 },
    ];

  const distinctGroups = new Map();
  spendRows.forEach((r) => {
    const k = `${r.media}\u0001${r.campaign}\u0001${r.adgroup}`;
    if (!distinctGroups.has(k)) distinctGroups.set(k, r);
  });

  const catGroupCounts = {};
  let nonStdCount = 0;
  let weightErrCount = 0;
  distinctGroups.forEach((r) => {
    const ws = catsOf(r);
    const wSum = ws.reduce((a, x) => a + x.w, 0);
    if (Math.abs(wSum - 1) > 0.001) weightErrCount++;
    ws.forEach(({ c }) => {
      catGroupCounts[c] = (catGroupCounts[c] || 0) + 1;
      if (!QUOTE_CATS.includes(c)) nonStdCount++;
    });
  });

  if (nonStdCount === 0 && weightErrCount === 0) {
    pass(
      `전체 ${distinctGroups.size}개 광고그룹 → 5대 표준 카테고리 100% 매칭 완료 (${QUOTE_CATS.map((c) => `${c}:${catGroupCounts[c] || 0}`).join(', ')})`
    );
  } else {
    fail(`비표준 카테고리 ${nonStdCount}건, 가중치 합계 오류 ${weightErrCount}건`);
  }

  // [4/6] 기준월 카테고리별 효율 광고비·견적·CPA 교차 대조
  console.log('\n4. [기준월 카테고리별 효율(광고비·견적·CPA) 교차 검증]');
  const allSpendMonths = [...new Set(spendRows.map((r) => r.month))].sort();
  const curM = allSpendMonths[allSpendMonths.length - 1];
  const curSpendRows = spendRows.filter((r) => r.month === curM);
  const rawCurSpend = curSpendRows.reduce((a, r) => a + r.cost, 0);

  const catSpendCur = {};
  curSpendRows.forEach((r) => {
    catsOf(r).forEach(({ c, w }) => {
      catSpendCur[c] = (catSpendCur[c] || 0) + r.cost * w;
    });
  });
  const mappedCurSpend = Math.round(Object.values(catSpendCur).reduce((a, v) => a + v, 0));

  const curQuotesRows = qMonthly.filter((r) => String(r.month || '').trim().slice(0, 7) === curM);
  const catQuotesCur = {};
  curQuotesRows.forEach((r) => {
    const c = String(r.category || '').trim();
    catQuotesCur[c] = (catQuotesCur[c] || 0) + (Number(r.count) || 0);
  });
  // 대시보드와 같이 다른 사이트(zbyhp·cadkorea)·전화문의 견적(quotes_stats_extra)을 더한다 (2026-11-06)
  const curExtraRows = (live.quotes_stats_extra || []).filter((r) => String(r.date || '').trim().slice(0, 7) === curM);
  curExtraRows.forEach((r) => {
    const c = String(r.category || '').trim();
    catQuotesCur[c] = (catQuotesCur[c] || 0) + 1;
  });
  const rawCurQuotes = curQuotesRows.reduce((a, r) => a + (Number(r.count) || 0), 0) + curExtraRows.length;
  const mappedCurQuotes = QUOTE_CATS.reduce((a, c) => a + (catQuotesCur[c] || 0), 0);

  for (const c of QUOTE_CATS) {
    const s = Math.round(catSpendCur[c] || 0);
    const q = catQuotesCur[c] || 0;
    const cpa = q > 0 ? `${fmt(s / q)}원` : '-';
    console.log(
      `   - ${c.padEnd(10)} : 광고비 ${fmt(s).padStart(10)}원 | 견적 ${String(q).padStart(4)}건 | CPA ${cpa.padStart(10)}`
    );
  }
  if (Math.abs(rawCurSpend - mappedCurSpend) <= 1 && rawCurQuotes === mappedCurQuotes) {
    pass(
      `${curM} 광고비 총합 ${fmt(mappedCurSpend)}원 & 견적 총합 ${fmt(mappedCurQuotes)}건 100% 일치 (누락 0건)`
    );
  } else {
    fail(
      `${curM} 카테고리 합산 불일치: 광고비(${rawCurSpend} vs ${mappedCurSpend}), 견적(${rawCurQuotes} vs ${mappedCurQuotes})`
    );
  }

  // [5/6] 화면 간 YTD 누적 수치 교차 검증
  console.log('\n5. [화면 간(종합 요약 · 매체 광고비 · 견적 상세) YTD 합계 교차 검증]');
  const yr = curM.slice(0, 4);
  const ytdSpend = spendRows
    .filter((r) => r.month >= `${yr}-01` && r.month <= curM)
    .reduce((a, r) => a + r.cost, 0);
  const ytdCatSpendSum = Math.round(
    spendRows
      .filter((r) => r.month >= `${yr}-01` && r.month <= curM)
      .reduce((acc, r) => acc + catsOf(r).reduce((s, x) => s + r.cost * x.w, 0), 0)
  );
  const ytdQuotesM = qMonthly
    .filter((r) => {
      const m = String(r.month || '').trim().slice(0, 7);
      return m >= `${yr}-01` && m <= curM;
    })
    .reduce((a, r) => a + (Number(r.count) || 0), 0);
  const ytdQuotesR = qRaw.filter((r) => {
    const m = String(r.date || '').trim().slice(0, 7);
    return m >= `${yr}-01` && m <= curM;
  }).length;

  if (Math.abs(ytdSpend - ytdCatSpendSum) <= 1 && ytdQuotesM === ytdQuotesR) {
    pass(
      `${yr}년 YTD 누적 광고비 ${fmt(ytdSpend)}원 · 누적 견적 ${fmt(ytdQuotesM)}건 전 화면 100% 일치`
    );
  } else {
    fail(
      `${yr}년 YTD 불일치: 광고비(${ytdSpend} vs ${ytdCatSpendSum}), 견적(${ytdQuotesM} vs ${ytdQuotesR})`
    );
  }

  // [6/6] 키워드·소재 연동 및 수치 무결성
  console.log('\n6. [키워드·소재 ↔ 캠페인·광고그룹 연동 및 수치 무결성 검증]');
  const kws = live.n_keywords || [];
  const ads = live.n_ads || [];
  const knownCampNames = new Set(spendRows.map((r) => r.campaign));
  const orphanActiveKws = kws.filter(
    (k) =>
      ((Number(k.cost) || 0) > 0 || (Number(k.impressions) || 0) > 0) &&
      !knownCampNames.has(String(k.campaign || '').trim())
  );
  const zeroSpendKws = kws.filter(
    (k) =>
      (Number(k.cost) || 0) === 0 &&
      (Number(k.impressions) || 0) === 0 &&
      !knownCampNames.has(String(k.campaign || '').trim())
  );
  const kwTotalCost = kws.reduce((a, k) => a + (Number(k.cost) || 0), 0);
  const kwTotalClk = kws.reduce((a, k) => a + (Number(k.clicks) || 0), 0);

  if (orphanActiveKws.length === 0) {
    pass(
      `키워드 ${fmt(kws.length)}행(월별 누적 ${fmt(kwTotalCost)}원 / ${fmt(kwTotalClk)}클릭) · 소재 ${fmt(ads.length)}개 실집행 캠페인 매칭 100% 정상${zeroSpendKws.length ? ` (노출 0건 대기 키워드 ${zeroSpendKws.length}개 별도)` : ''}`
    );
  } else {
    fail(`실집행 캠페인 미매칭 키워드 ${orphanActiveKws.length}개 발견`);
  }

  console.log('\n======================================================================');
  if (errorCount === 0) {
    console.log(' 🎉 검증 결과: 모든 데이터 동기화·카테고리 매칭·통계 수식 100% 정상 (오류 0건)');
    console.log('======================================================================');
    process.exit(0);
  } else {
    console.error(` 🚨 검증 결과: 총 ${errorCount}건의 정합성 오류가 발견되었습니다.`);
    console.log('======================================================================');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('검증 스크립트 실행 실패:', err);
  process.exit(1);
});
