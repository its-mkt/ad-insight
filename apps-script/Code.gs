/**
 * its-ad-insight — 네이버 검색광고 수집 + 대시보드용 웹앱 (Google Apps Script, 데이터 시트에 연결)
 *
 * script.google.com 에서 새 프로젝트(데이터 시트와 같은 구글 계정)에 붙여넣는다. 시트는 SHEET_ID 로 연다.
 *  - setup        : 처음 한 번. 관리용 시트(mapping·manual)와 웹앱 비밀키를 만들고, 1시간마다 syncAll 을 예약한다.
 *  - syncAll      : 1시간마다. 네이버는 구조+키워드 성과(collectNaver) 하루 1번 + 광고그룹 광고비(collectNaverStats) 매 실행으로 나눠 UrlFetch 한도를 지킨다.
 *  - collectNaver : 네이버 캠페인·광고그룹·키워드·소재 목록 → n_idx_groups · n_idx_keywords · n_ads, 이어서 성과까지
 *  - collectNaverStats : 색인의 ID 로 /stats 만 → n_adgroup_daily(최근 DAILY_DAYS 일, 오늘·어제는 매번) · n_adgroup_monthly (당월·전월은 매번, 과거 월은 비어 있는 달만). n_keywords 는 비어 있는 과거 달만 채운다. 소재 × 월 성과(n_ad_stats)는 하루 1번
 *  - doGet        : ?key=비밀키 로 부르면 시트 전체를 JSON 으로 내려준다 (대시보드가 읽음). 키가 틀리면 아무것도 주지 않는다.
 * 네이버 키는 코드에 쓰지 않는다 — 프로젝트 설정 → 스크립트 속성에 NAVER_API_KEY · NAVER_SECRET · NAVER_CUSTOMER_ID 로 넣는다.
 * Google Ads 데이터(g_*)는 Google Ads 스크립트(GoogleAdsScript.js)가 같은 시트에 쓴다.
 */
const CFG = {
  SHEET_ID: '1mxrTeh7bo50RTz_2_UNyQxtQrljoEK4-xgPy9fr8nIg', // its-ad-insight 데이터 시트 (주소의 /d/ 와 /edit 사이)
  FROM_YEAR: new Date().getFullYear() - 1,   // 전년 1월부터
  BASE: 'https://api.searchad.naver.com',
  CHUNK: 50,                                 // /stats 한 번에 묻는 ID 수
  AD_CHUNK: 30,                              // 소재 /stats 는 ID 가 길어 주소 길이 한도(약 2KB) 안에 들게 줄인다
  BUDGET_MS: 4.5 * 60 * 1000,                // 한 번 실행에 쓸 최대 시간(6분 제한 대비)
  KW_STATS_RESERVE_MS: 70 * 1000,            // 광고그룹 순회를 일찍 끝내 키워드 성과(/stats) 조회 시간을 남긴다
  DAILY_DAYS: 62,                            // 일별 광고비를 모으는 최근 일수 (오늘 포함, 대시보드의 일·기간 선택용)
  DAILY_BACKFILL_DAYS: 31,                // 일별 수집 한 번에 새로 채우는 지난 날 수 (오늘·어제는 매번 다시 받는다)
  DAILY_HIST: { google: 'g_adgroup_daily_hist', naver: 'n_adgroup_daily_hist' }, // 최근 구간보다 오래된 일별 광고비 (달 단위로 쌓는다, 고른 달만 내려준다)
  NAVER_HIST_API_RESERVE: 2000,              // 일별 과거분 수집이 남겨 둘 네이버 API 호출 수 (이날 남은 매시간 수집 몫)
  NAVER_HIST_FILL_DAILY_MS: 30 * 60 * 1000,  // 전용 채우기가 하루에 쓸 최대 실행 시간 (트리거 하루 90분 한도를 syncAll 과 나눠 쓴다)
  NAVER_HIST_BUDGET_MS: 90 * 1000,           // 일별 과거분 수집에 한 번 실행당 쓸 최대 시간 (다른 수집 시간을 남긴다)
  BACKFILL_MONTHS: 5,                        // 성과 수집 한 번에 채우는 지난 달 수 (한 번에 몰려 한도를 넘지 않게)
  // UrlFetch 하루 2만 회는 이 구글 계정의 모든 스크립트(견적문의·상담접수 연동 등)가 함께 쓴다.
  // 네이버 API 는 하루 이 횟수까지만 부르고 멈춰, 고장으로 폭주해도 나머지 스크립트 몫을 남긴다. 스크립트 속성 NAVER_DAILY_CAP 로 바꿀 수 있다.
  NAVER_DAILY_CAP: 6000,
  RUN_LIMIT_MS: 5 * 60 * 1000,               // syncAll 전체가 이 시간을 넘기면 남은 수집은 다음 실행으로 (6분 강제 종료 방지)
  SHEETS: ['g_campaign_monthly', 'g_adgroup_monthly', 'g_adgroup_daily', 'g_keywords', 'g_ads', 'g_ad_stats', 'g_meta',
    'n_adgroup_monthly', 'n_adgroup_daily', 'n_keywords', 'n_ads', 'n_ad_stats', 'n_meta', 'quotes_monthly', 'quotes_raw', 'quotes_raw_sites', 'quotes_phone', 'quotes_stats_extra', 'godo_orders_monthly', 'godo_goods_monthly', 'godo_order_inflow_monthly', 'godo_orders_daily', 'godo_meta', 'godo_goods_inflow_monthly', 'godo_order_lines', 'godo_order_customers', 'g_device_monthly', 'n_device_monthly', 'q_meta', 'mapping', 'manual', 'manual_categories'],
  // 대시보드 주소와 키는 공개 번들에 들어 있다. 고객 정보는 관리자 로그인이 확인될 때만 내려준다 (doGet)
  SUPABASE_URL: 'https://tqxljgmygvanysqnhiar.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable__Oq9NpOHnxEqRSZ02qJDaw_n-FIAGC2',
  GA4_MEASUREMENT_ID: 'G-EJ5SHHZPND', // 아이티켓 GA4 웹 스트림 (서버 purchase 전송용)
  ADMIN_ONLY_SHEETS: ['quotes_raw_sites', 'quotes_phone', 'godo_order_customers'],
  // 다른 사이트 견적 시트. 원본은 어드민 리스트에만 보여 주고, 건수 통계는 고객 정보를 뺀 quotes_stats_extra 로 내보낸다.
  // quotes_raw·quotes_monthly 는 CPA·견적전환율 기준이라 아이티켓만 둔다
  QUOTE_SITES: [
    { id: 'zbyhp', sheetId: '1vWHN_dT6biPcSM1mGETt6aieSTiUe3o2-ysPSRRpov8', category: 'HPE 서버' }, // category: 제목과 상관없이 쓰는 기본 분류 (어드민 수동 지정이 우선)
    { id: 'cadkorea', sheetId: '1mmA4mAb3hRKLlMrAoU18ZyVbEgB2kgGZ3Xz0SJln-pg', category: 'GstarCAD' },
  ],
};
const PROPS = PropertiesService.getScriptProperties();
const STAT_FIELDS = '["impCnt","clkCnt","salesAmt","ccnt"]';

/* ── 처음 한 번 ── */
function setup() {
  const ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  if (!ss.getSheetByName('mapping')) put_(ss, 'mapping', [['media', 'campaign', 'ad_group', 'category', 'ratio']]);
  if (!ss.getSheetByName('manual')) put_(ss, 'manual', [['month', 'item', 'amount', 'memo'], ['2026-01', 'MDF', 0, '예시 — MDF / META / STORE 중 하나']]);
  if (!ss.getSheetByName('quotes_raw')) put_(ss, 'quotes_raw', [['date', 'site', 'subject', 'category', 'source', 'created_at']]);
  if (!ss.getSheetByName('manual_categories')) put_(ss, 'manual_categories', [['sno', 'category', 'updated_at']]);
  if (!PROPS.getProperty('API_TOKEN')) PROPS.setProperty('API_TOKEN', Utilities.getUuid().replace(/-/g, ''));
  const allFuncs = ['collectNaver', 'collectGfaEmail', 'collectGoogleAdsEmail', 'collectCommerce', 'collectQuotes', 'syncAll'];
  ScriptApp.getProjectTriggers().filter((t) => allFuncs.includes(t.getHandlerFunction())).forEach((t) => ScriptApp.deleteTrigger(t));
  // 트리거 실행 시간 한도(계정당 하루 90분)를 지키려고 1시간 주기로 실행한다 (15분 주기는 하루 약 3시간 사용, 2026-11-03 추정)
  ScriptApp.newTrigger('syncAll').timeBased().everyHours(1).create();
  console.log('웹앱 비밀키(대시보드 js/config.js 의 key): ' + PROPS.getProperty('API_TOKEN'));
}

/* ── 전 매체 통합 동기화 (네이버·구글·견적·GFA·커머스 동일 시각 수집) ── */
function syncAll() {
  const t0 = Date.now();
  console.log('=== [its-ad-insight] 전체 매체 통합 동기화 시작 ===');
  try { syncAllBody_(t0); } finally { saveApiCount_(); warmApiCache_(); }
}
function syncAllBody_(t0) {
  // 네이버는 하루 UrlFetch 한도(2만 회)를 지키려고 둘로 나눈다.
  //  - 구조(캠페인·광고그룹·키워드·소재 목록): 하루 1번, 06시 이후 첫 실행 (약 500~700회)
  //    키워드 성과는 어제까지 집계라 하루 중에는 바뀌지 않으므로 구조 수집 때 함께 받는다 (약 100회)
  //  - 광고그룹 광고비(/stats 만, 오늘 포함): syncAll 실행마다, 단 NAVER_EVERY_MIN(기본 15분)보다 자주 부르지 않는다 (약 10회)
  const now = Date.now(), kst = (f) => Utilities.formatDate(new Date(), 'Asia/Seoul', f);
  const structDue = PROPS.getProperty('NAVER_STRUCT_DAY') !== kst('yyyy-MM-dd') && Number(kst('H')) >= 6
    && now - (Number(PROPS.getProperty('NAVER_STRUCT_TRY')) || 0) >= 2 * 3600 * 1000; // 실패하면 2시간 뒤 다시
  const statsEvery = Number(PROPS.getProperty('NAVER_EVERY_MIN')) || 15;
  const statsLast = Number(PROPS.getProperty('NAVER_LAST_RUN')) || 0;
  if (apiLeft_() <= 0) {
    console.warn('- 네이버 검색광고: 오늘 호출 상한(' + apiCap_() + '회)에 도달해 내일까지 쉽니다');
    notifyOnce_('cap', '네이버 API 하루 상한 ' + apiCap_() + '회에 도달해 오늘 네이버 수집을 멈췄습니다. 평소 하루 약 1,300회이므로 수집 코드가 폭주하고 있을 수 있습니다.');
  } else if (structDue) {
    PROPS.setProperty('NAVER_STRUCT_TRY', String(now));
    PROPS.setProperty('NAVER_LAST_RUN', String(now));
    try { collectNaver(); console.log('✓ 네이버 구조+성과 동기화 완료 (API ' + apiCalls_ + '회)'); } catch (e) { fail_('collectNaver', e); }
  } else if (now - statsLast >= statsEvery * 60 * 1000 - 60 * 1000) {
    PROPS.setProperty('NAVER_LAST_RUN', String(now)); // 실패해도 다음 주기까지 재시도하지 않아 한도를 지킨다
    try { collectNaverStats(); console.log('✓ 네이버 광고비 동기화 완료 (API ' + apiCalls_ + '회)'); } catch (e) { fail_('collectNaverStats', e); }
  } else {
    console.log('- 네이버 검색광고: ' + statsEvery + '분 주기 대기 중 (마지막 ' + Utilities.formatDate(new Date(statsLast), 'Asia/Seoul', 'HH:mm') + ')');
  }
  const rest = [
    ['견적 데이터', () => { if (PROPS.getProperty('QUOTE_SHEET_ID')) withQuoteLock_(collectQuotes); }, 'collectQuotes'],
    ['다른 사이트 견적 데이터', () => withQuoteLock_(collectQuoteSites), 'collectQuoteSites'],
    ['전화문의 데이터', () => { if (PROPS.getProperty('QUOTE_SHEET_ID')) collectQuotePhone(); }, 'collectQuotePhone'],
    ['통계용 추가 견적', () => withQuoteLock_(collectQuoteStatsExtra), 'collectQuoteStatsExtra'],
    ['고도몰 주문', collectGodoOrders, 'collectGodoOrders'],
    // 구글은 2026-11-06 부터 Google Ads 스크립트(GoogleAdsScript.js, 매시간)가 g_* 시트를 통째로 쓴다.
    // 메일 CSV 수집은 캠페인·광고그룹 ID 없이 이름으로 합치고 g_meta 도 덮어써 그 데이터와 섞이므로 돌리지 않는다.
    // ['구글 광고 이메일 리포트', collectGoogleAdsEmail, 'collectGoogleAdsEmail'],
    ['네이버 GFA 리포트', collectGfaEmail, 'collectGfaEmail'],
    ['네이버 커머스', collectCommerce, 'collectCommerce'],
  ];
  for (const [label, fn, name] of rest) {
    if (Date.now() - t0 > CFG.RUN_LIMIT_MS) { console.warn('- ' + label + ': 실행 시간 ' + Math.round(CFG.RUN_LIMIT_MS / 60000) + '분을 넘겨 다음 실행으로 미룸'); continue; }
    try { fn(); console.log('✓ ' + label + ' 동기화 완료'); } catch (e) { fail_(name, e); }
  }
  // 일별 과거분은 시트를 많이 건드리므로 견적 등 다른 수집이 모두 끝난 뒤에 받는다
  // 전용 채우기(fillNaverDailyHist)가 도는 중이면 겹치지 않게 건너뛴다
  if (pendingNaverHist_ && Date.now() - Number(PROPS.getProperty('NAVER_HIST_FILLING') || 0) > 15 * 60 * 1000) collectNaverDailyHist_(SpreadsheetApp.openById(CFG.SHEET_ID), t0, pendingNaverHist_.groups, pendingNaverHist_.gById);
  console.log('=== [its-ad-insight] 전체 매체 통합 동기화 완료 (' + Math.round((Date.now() - t0) / 1000) + '초 소요) ===');
}

/* ── 네이버 검색광고: 구조 수집 (하루 1번) ──
 * 캠페인·광고그룹·키워드·소재 목록과 입찰가·품질지수를 읽어 n_idx_groups · n_idx_keywords · n_ads 에 쓰고, 이어서 성과도 받는다.
 * n_idx_* 는 성과 수집(collectNaverStats)이 API 를 다시 부르지 않고 ID 를 꺼내 쓰는 색인이다 (대시보드로는 내보내지 않는다). */
function collectNaver() {
  checkNaverKeys_();
  const t0 = Date.now(), ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  const camps = api_('GET', '/ncc/campaigns');
  // 확장소재 이미지는 이미지 없는 소재가 나올 때만 조회한다 (광고그룹 단위 우선, 없으면 캠페인 단위 상속).
  // 이미지형 서브링크처럼 한 확장소재에 이미지가 여러 장이면 모두 모은다.
  const extImgCache = {};
  const extImgs_ = (ownerId) => {
    if (!(ownerId in extImgCache)) {
      try {
        const found = [];
        for (const ex of (api_('GET', '/ncc/ad-extensions', { ownerId }) || [])) {
          if (ex.userLock) continue;
          found.push(...extractExtImages_(ex));
        }
        extImgCache[ownerId] = found;
      } catch (_) {
        extImgCache[ownerId] = null; // 조회 실패 — 소재에서 지난 값으로 대신한다
      }
    }
    return extImgCache[ownerId];
  };

  const groups = [];
  camps.forEach((c) => api_('GET', '/ncc/adgroups', { nccCampaignId: c.nccCampaignId })
    .forEach((g) => groups.push({ id: g.nccAdgroupId, name: String(g.name || '').trim(), bid: g.bidAmt, campaign: String(c.name || '').trim(), ctype: c.campaignTp, campaignId: c.nccCampaignId, on: !c.userLock && !g.userLock })));
  put_(ss, 'n_idx_groups', [['id', 'name', 'bid', 'campaign', 'ctype', 'campaign_id', 'on']]
    .concat(groups.map((g) => [g.id, g.name, g.bid || 0, g.campaign, g.ctype, g.campaignId, g.on ? 1 : 0])));

  // 당월·전월 광고비가 큰 광고그룹부터 → 운영 중 그룹 → 꺼진 그룹 순으로 읽어, 시간이 모자라도 주요 캠페인은 빠지지 않게 한다.
  const thisM = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM'), fresh = [thisM, addMonth_(thisM, -1)];
  const recent = {};
  read_(ss, 'n_adgroup_monthly').filter((r) => fresh.includes(r.month)).forEach((r) => { recent[r.ad_group_id] = (recent[r.ad_group_id] || 0) + (Number(r.cost) || 0) + (Number(r.impressions) || 0) / 1e6; });
  const rank = (g) => (recent[g.id] ? 2e9 + recent[g.id] : g.on ? 1 : 0);
  const ordered = groups.slice().sort((a, b) => rank(b) - rank(a));
  const kHead = ['id', 'ad_group_id', 'campaign', 'ad_group', 'keyword', 'bid', 'quality', 'ad_relevance', 'expected_click'];
  // image: 대표 이미지 1장 (이전 화면 호환) · images: 모든 이미지를 줄바꿈으로 이은 목록
  // title: 대표 제목 (이전 화면 호환) · titles·descs: 반응형 소재의 제목·설명 전체를 줄바꿈으로 이은 목록
  const kIdx = [], ads = [['type', 'campaign', 'ad_group', 'ad_id', 'ad_type', 'title', 'url', 'image', 'images', 'titles', 'descs']];
  const adsOld = read_(ss, 'n_ads');
  // 지난 실행에서 찾은 확장소재 이미지 — 조회에 실패했을 때만 쓴다 (먼저 쓰면 네이버에서 바꾼 이미지가 반영되지 않는다). images 열이 생기기 전 값(1장)은 쓰지 않는다
  const oldImgs = Object.fromEntries(adsOld.filter((r) => r.images).map((r) => [String(r.ad_id), String(r.images).split('\n').filter(Boolean)]));
  const visited = new Set();
  for (const g of ordered) {
    if (Date.now() - t0 > CFG.BUDGET_MS - CFG.KW_STATS_RESERVE_MS) break; // 못 읽은 그룹은 아래에서 지난 값을 남긴다
    visited.add(g.campaign + '\u0001' + g.name);
    api_('GET', '/ncc/keywords', { nccAdgroupId: g.id }).filter((k) => !k.userLock)
      .forEach((k) => {
        const rel = Number(k.adRelevanceScore) || 0;
        const exp = Number(k.expectedClickScore) || 0;
        const rawQi = k.nccQi && k.nccQi.qiGrade;
        // 파워링크(WEB_SITE) 기존 nccQi.qiGrade는 2026-07-29부로 고정 기본값(4)만 반환하므로 신규 최적화 지표 우선 사용
        const qi = rel && exp ? Math.round((rel + exp) / 2) : (rel || exp || (g.ctype !== 'WEB_SITE' && rawQi ? rawQi : ''));
        kIdx.push([k.nccKeywordId, g.id, g.campaign, g.name, String(k.keyword || '').trim(), (k.useGroupBidAmt ? g.bid : k.bidAmt) || 0, qi, rel || '', exp || '']);
      });
    api_('GET', '/ncc/ads', { nccAdgroupId: g.id }).filter((a) => !a.userLock).forEach((a) => {
      const ad = parseJson_(a.ad) || {};
      const own = extractAdImages_(ad);
      const groupExt = own.length ? [] : extImgs_(g.id);
      const campExt = own.length || (groupExt && groupExt.length) ? [] : extImgs_(g.campaignId);
      const imgs = [own, groupExt, campExt, groupExt === null || campExt === null ? oldImgs[a.nccAdId] : null].find((l) => l && l.length) || [];
      const list = [...new Set(imgs)].slice(0, MAX_AD_IMAGES);
      const { titles, descs } = adTexts_(a, ad);
      const title = titles[0] || a.name || '';
      ads.push(['SA', g.campaign, g.name, a.nccAdId, a.type, title, (ad.pc && ad.pc.final) || (ad.mobile && ad.mobile.final) || '', list[0] || '', list.join('\n'),
        titles.join('\n'), descs.join('\n')]);
    });
  }
  // 이번에 못 읽은 광고그룹은 지난 실행 값을 그대로 둔다 (통째로 지우면 대시보드에서 캠페인이 사라진다)
  const unseen = (r) => !visited.has(String(r.campaign) + '\u0001' + String(r.ad_group));
  const kKeep = read_(ss, 'n_idx_keywords').filter(unseen).map((r) => kHead.map((h) => r[h]));
  put_(ss, 'n_idx_keywords', [kHead].concat(kIdx, kKeep));
  // 캠페인·그룹 이름이 바뀌면 옛 이름 행이 unseen 으로 남으므로, 이번에 읽은 소재 ID 는 남기지 않는다
  const adIds = new Set(ads.slice(1).map((r) => String(r[3])));
  put_(ss, 'n_ads', ads.concat(adsOld.filter((r) => unseen(r) && !adIds.has(String(r.ad_id))).map((r) => ads[0].map((h) => (r[h] == null ? '' : r[h])))));
  const skipped = groups.length - visited.size;
  if (skipped) console.warn('collectNaver: 시간 예산 초과로 광고그룹 ' + skipped + '개는 지난 값을 유지');
  PROPS.setProperty('NAVER_STRUCT_DAY', Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'));
  PROPS.setProperty('NAVER_STRUCT_AT', Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm') + ' (' + visited.size + '/' + groups.length + ')');
  collectNaverStats_(ss, t0, true);
}

/* ── 네이버 검색광고: 성과 수집 (1시간마다) ──
 * 색인(n_idx_*)의 ID 로 /stats 만 불러 n_adgroup_monthly · n_keywords(월별)를 갱신한다.
 * 당월·전월은 매번 다시, 그 이전은 비어 있는 달을 한 번에 CFG.BACKFILL_MONTHS 개씩만 채운다.
 * withKeywords 가 아니면(정기 실행) 키워드는 당월·전월을 건너뛰고 비어 있는 과거 달만 채운다 — 다 채워지면 키워드 호출은 0회. */
function collectNaverStats() {
  checkNaverKeys_();
  collectNaverStats_(SpreadsheetApp.openById(CFG.SHEET_ID), Date.now(), false);
}
function collectNaverStats_(ss, t0, withKeywords) {
  const groups = read_(ss, 'n_idx_groups');
  if (!groups.length) throw new Error('n_idx_groups 가 비어 있습니다 — collectNaver 를 먼저 한 번 실행하세요');
  const gById = Object.fromEntries(groups.map((g) => [String(g.id), g]));
  const thisM = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM'), fresh = [thisM, addMonth_(thisM, -1)];
  const yday = Utilities.formatDate(new Date(Date.now() - 864e5), 'Asia/Seoul', 'yyyy-MM-dd');
  const back = (ms) => ms.sort().reverse().slice(0, CFG.BACKFILL_MONTHS);

  // 광고그룹 × 월
  const head = ['month', 'type', 'campaign', 'campaign_tp', 'ad_group', 'ad_group_id', 'cost', 'impressions', 'clicks', 'conversions'];
  const old = read_(ss, 'n_adgroup_monthly');
  const have = new Set(old.map((r) => r.month));
  const missing = [];
  for (let m = CFG.FROM_YEAR + '-01'; m < fresh[1]; m = addMonth_(m, 1)) if (!have.has(m)) missing.push(m);
  const rows = [], done = [];
  for (const m of fresh.concat(back(missing))) {
    if (Date.now() - t0 > CFG.BUDGET_MS) break; // 남은 달은 다음 실행에서
    stats_(groups.map((g) => String(g.id)), m + '-01', lastDay_(m)).forEach((s) => {
      const g = gById[s.id];
      if (g && (s.salesAmt || s.impCnt)) rows.push([m, 'SA', g.campaign, g.ctype, g.name, String(g.id), s.salesAmt || 0, s.impCnt || 0, s.clkCnt || 0, s.ccnt || 0]);
    });
    done.push(m);
  }
  // GFA(DA) 행은 다른 수집기가 쓰므로 그대로 둔다
  const keep = old.filter((r) => r.type !== 'SA' || !done.includes(r.month)).map((r) => head.map((h) => r[h]));
  put_(ss, 'n_adgroup_monthly', [head].concat(keep.concat(rows).sort((a, b) => String(a[0]).localeCompare(String(b[0])))));

  collectNaverDaily_(ss, t0, groups, gById);
  try { collectNaverDevice_(ss, t0, groups, gById, fresh, back, keep.concat(rows)); } catch (e) { fail_('collectNaverDevice_', e); } // 기기별 실패가 광고비 수집을 막지 않게 한다

  // 키워드 × 월 (당월은 1일~어제). 월 열이 없는 예전 행은 버린다.
  const kws = read_(ss, 'n_idx_keywords');
  const kHead = ['month', 'type', 'campaign', 'ad_group', 'keyword', 'match', 'bid', 'quality', 'cost', 'impressions', 'clicks', 'conversions', 'ad_relevance', 'expected_click'];
  const kOld = read_(ss, 'n_keywords').filter((r) => /^\d{4}-\d{2}$/.test(String(r.month || '')));
  const kHave = new Set(kOld.map((r) => r.month));
  const spentMs = new Set(keep.concat(rows).filter((r) => r[1] === 'SA').map((r) => r[0]));
  const kRows = [], kDone = [];
  // 조회했는데 현재 키워드의 실적이 하나도 없던 지난 달은 기억해 두고 다시 묻지 않는다 (매시간 약 250회 낭비 방지).
  // 다시 확인하려면 스크립트 속성 NAVER_KW_EMPTY 를 지운다.
  const kEmpty = new Set(JSON.parse(PROPS.getProperty('NAVER_KW_EMPTY') || '[]'));
  const kBack = back([...spentMs].filter((m) => m < fresh[1] && !kHave.has(m) && !kEmpty.has(m)));
  for (const m of (withKeywords ? fresh : []).concat(kBack)) {
    if (Date.now() - t0 > CFG.BUDGET_MS) break;
    const since = m + '-01', until = lastDay_(m) < yday ? lastDay_(m) : yday;
    if (since > until) { kDone.push(m); continue; } // 매월 1일에는 당월 성과가 아직 없다
    const ks = Object.fromEntries(stats_(kws.map((k) => String(k.id)), since, until).map((s) => [s.id, s]));
    const before = kRows.length;
    kws.forEach((k) => {
      const s = ks[String(k.id)] || {};
      // 당월은 노출 0건 대기 키워드도 남기고, 지난달은 실적이 있는 키워드만 쌓는다
      if (m === thisM || s.salesAmt || s.impCnt) kRows.push([m, 'SA', k.campaign, k.ad_group, k.keyword, '', Number(k.bid) || 0, k.quality, s.salesAmt || 0, s.impCnt || 0, s.clkCnt || 0, s.ccnt || 0, k.ad_relevance, k.expected_click]);
    });
    if (m < fresh[1] && kRows.length === before) {
      kEmpty.add(m);
      console.warn('collectNaverStats: ' + m + ' 현재 키워드 실적 없음 — 다시 묻지 않음 (NAVER_KW_EMPTY)');
    }
    kDone.push(m);
  }
  PROPS.setProperty('NAVER_KW_EMPTY', JSON.stringify([...kEmpty].sort()));
  const kKeep = kOld.filter((r) => !kDone.includes(r.month)).map((r) => kHead.map((h) => r[h]));
  if (kDone.length) put_(ss, 'n_keywords', [kHead].concat(kKeep.concat(kRows).sort((a, b) => String(a[0]).localeCompare(String(b[0])))));
  // 소재 성과는 하루 1번만 — 매번 돌리면 소재 수/50 회씩 늘어난다. 구조 수집(collectNaver)은 시간을 거의 다 쓰므로
  // 그날 처음으로 시간이 1분 넘게 남은 실행(보통 정기 실행의 collectNaverStats)이 맡는다.
  const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  if (PROPS.getProperty('NAVER_AD_STATS_DAY') !== today && Date.now() - t0 < CFG.BUDGET_MS - 60 * 1000) {
    if (collectNaverAdStats_(ss, t0, fresh, back)) PROPS.setProperty('NAVER_AD_STATS_DAY', today);
  }
  put_(ss, 'n_meta', [['key', 'value'], ['updated', Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm')], ['customer_id', PROPS.getProperty('NAVER_CUSTOMER_ID')],
    ['structure', PROPS.getProperty('NAVER_STRUCT_AT') || ''], ['api_calls', apiCalls_]]);
  syncMapping_(ss);
  pendingNaverHist_ = { groups, gById };
}
/**
 * 캠페인 × 기기(PC·모바일) × 월 → n_device_monthly. /stats 의 breakdown=pcMblTp 로 받는다 (네이버는 태블릿을 모바일에 넣는다).
 * 당월·전월은 매번, 그 이전은 비어 있는 달을 CFG.BACKFILL_MONTHS 개씩 채운다.
 * 기기 합계가 같은 달 광고그룹 합계(n_adgroup_monthly)와 1% 넘게 다르면 그 달은 쓰지 않는다 — 응답을 잘못 읽은 값을 내보내지 않으려고.
 */
function collectNaverDevice_(ss, t0, groups, gById, fresh, back, monthlyRows) {
  const head = ['month', 'type', 'campaign', 'device', 'cost', 'impressions', 'clicks', 'conversions'];
  const old = read_(ss, 'n_device_monthly');
  const have = new Set(old.map((r) => String(r.month).slice(0, 7)));
  const spent = {};
  monthlyRows.filter((r) => r[1] === 'SA').forEach((r) => { spent[r[0]] = (spent[r[0]] || 0) + (Number(r[6]) || 0); });
  const missing = Object.keys(spent).filter((m) => m < fresh[1] && !have.has(m));
  const deviceOf = (tp) => (/^p/i.test(String(tp)) ? 'desktop' : /^m/i.test(String(tp)) ? 'mobile' : '');
  const rows = [], done = [];
  for (const m of fresh.concat(back(missing))) {
    if (Date.now() - t0 > CFG.BUDGET_MS) break;
    const ids = groups.map((g) => String(g.id)), acc = {};
    let total = 0, unknown = 0;
    for (let i = 0; i < ids.length; i += CFG.CHUNK) {
      const r = api_('GET', '/stats', { ids: ids.slice(i, i + CFG.CHUNK), fields: STAT_FIELDS, timeRange: JSON.stringify({ since: m + '-01', until: lastDay_(m) }), breakdown: 'pcMblTp' });
      (r.data || []).forEach((s) => {
        const g = gById[s.id];
        if (!g) return;
        // 응답이 기기별 줄을 breakdowns 배열로 주거나, 줄마다 pcMblTp 를 달아 준다 — 둘 다 받는다
        const parts = Array.isArray(s.breakdowns) ? s.breakdowns : [s];
        parts.forEach((p) => {
          const dev = deviceOf(p.pcMblTp || p.name || p.key);
          const cost = Number(p.salesAmt) || 0;
          total += cost;
          if (!dev) { unknown += cost; return; }
          const k = g.campaign + '\u0001' + dev;
          const row = acc[k] = acc[k] || [m, 'SA', g.campaign, dev, 0, 0, 0, 0];
          row[4] += cost; row[5] += Number(p.impCnt) || 0; row[6] += Number(p.clkCnt) || 0; row[7] += Number(p.ccnt) || 0;
        });
      });
    }
    const expect = spent[m] || 0;
    if (unknown > 0 || (expect > 0 && Math.abs(total - expect) > expect * 0.01)) {
      console.warn('collectNaverDevice_: ' + m + ' 기기 합계 ' + total + '원(구분 못 한 금액 ' + unknown + '원)이 광고그룹 합계 ' + expect + '원과 달라 저장하지 않음');
      continue;
    }
    Object.keys(acc).forEach((k) => { if (acc[k][4] || acc[k][5]) rows.push(acc[k]); });
    done.push(m);
  }
  if (!done.length) return;
  const keep = old.filter((r) => !done.includes(String(r.month).slice(0, 7))).map((r) => head.map((h) => (h === 'month' ? String(r.month).slice(0, 7) : r[h])));
  put_(ss, 'n_device_monthly', [head].concat(keep.concat(rows).sort((a, b) => String(a[0]).localeCompare(String(b[0])))));
}
/**
 * 광고그룹 × 일 (최근 CFG.DAILY_DAYS 일) → n_adgroup_daily. 일·기간 선택이 쓴다.
 * 오늘·어제는 매 실행마다 다시 받고(집계가 늦게 바뀐다), 그 이전은 받은 적 없는 날을 한 번에 CFG.DAILY_BACKFILL_DAYS 일씩만 채운다.
 * 광고비가 없던 날은 행이 없으므로, 받은 날은 스크립트 속성 NAVER_DAILY_HAVE 에 적어 다시 묻지 않는다.
 * 호출 수: (광고그룹 수 ÷ CFG.CHUNK) × 받는 날 수 — 평소 2일 치, 처음 채울 때는 실행마다 9일 치.
 */
function collectNaverDaily_(ss, t0, groups, gById) {
  const kst = (ms) => Utilities.formatDate(new Date(ms), 'Asia/Seoul', 'yyyy-MM-dd');
  const now = Date.now();
  const days = Array.from({ length: CFG.DAILY_DAYS }, (_, i) => kst(now - i * 864e5)); // 최신 → 과거
  const oldest = days[days.length - 1];
  const head = ['date', 'type', 'campaign', 'campaign_tp', 'ad_group', 'ad_group_id', 'cost', 'impressions', 'clicks', 'conversions'];
  const old = read_(ss, 'n_adgroup_daily');
  const have = new Set(JSON.parse(PROPS.getProperty('NAVER_DAILY_HAVE') || '[]'));
  old.forEach((r) => have.add(r.date));
  const fresh = days.slice(0, 2);
  const todo = fresh.concat(days.filter((d) => !have.has(d) && !fresh.includes(d)).slice(0, CFG.DAILY_BACKFILL_DAYS));
  const rows = [], done = [];
  for (const d of todo) {
    if (Date.now() - t0 > CFG.BUDGET_MS) break; // 남은 날은 다음 실행에서
    stats_(groups.map((g) => String(g.id)), d, d).forEach((s) => {
      const g = gById[s.id];
      if (g && (s.salesAmt || s.impCnt)) rows.push([d, 'SA', g.campaign, g.ctype, g.name, String(g.id), s.salesAmt || 0, s.impCnt || 0, s.clkCnt || 0, s.ccnt || 0]);
    });
    done.push(d);
  }
  const keep = old.filter((r) => r.date >= oldest && !done.includes(r.date)).map((r) => head.map((h) => r[h]));
  put_(ss, 'n_adgroup_daily', [head].concat(keep.concat(rows).sort((a, b) => String(a[0]).localeCompare(String(b[0])))));
  done.forEach((d) => have.add(d));
  PROPS.setProperty('NAVER_DAILY_HAVE', JSON.stringify([...have].filter((d) => d >= oldest).sort()));
}
let pendingNaverHist_ = null; // 이번 실행의 네이버 수집에서 읽은 광고그룹 목록 — syncAll 끝에서 과거분 수집에 쓴다
/**
 * 지난달까지의 광고그룹 × 일을 달 단위로 n_adgroup_daily_hist 에 쌓는다 (한 번 받은 달은 다시 받지 않는다).
 * 최신 달부터, 한 번 실행에 CFG.NAVER_HIST_BUDGET_MS 안에서만 받아 다른 수집 시간을 남긴다. 실패해도 나머지 수집은 계속한다.
 */
function collectNaverDailyHist_(ss, t0, groups, gById, budgetMs = CFG.NAVER_HIST_BUDGET_MS) {
  try {
    const h0 = Date.now();
    const head = ['date', 'type', 'campaign', 'campaign_tp', 'ad_group', 'ad_group_id', 'cost', 'impressions', 'clicks', 'conversions'];
    const sh = ss.getSheetByName(CFG.DAILY_HIST.naver) || ss.insertSheet(CFG.DAILY_HIST.naver);
    if (sh.getLastRow() < 1) sh.getRange(1, 1, 1, head.length).setValues([head]);
    const done = new Set(JSON.parse(PROPS.getProperty('NAVER_HIST_DONE') || '[]'));
    const thisMonth = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM');
    const months = [...new Set(read_(ss, 'n_adgroup_monthly').filter((r) => r.type === 'SA').map((r) => String(r.month).slice(0, 7)))]
      .filter((m) => m < thisMonth && !done.has(m)).sort().reverse();
    const ids = groups.map((g) => String(g.id));
    for (const m of months) {
      if (Date.now() - h0 > budgetMs / 2 || Date.now() - t0 > CFG.BUDGET_MS) break; // 한 달을 끝낼 시간이 남았을 때만 시작한다
      const last = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
      if (apiLeft_() < last * Math.ceil(ids.length / CFG.CHUNK) + CFG.NAVER_HIST_API_RESERVE) { console.warn('일별 과거분: 오늘 네이버 API 여유가 적어 멈춥니다 (남은 호출 ' + apiLeft_() + '회)'); return -2; }
      const rows = [];
      for (let d = 1; d <= last; d++) {
        if (Date.now() - t0 > CFG.RUN_LIMIT_MS) return months.filter((x) => !done.has(x)).length; // 6분 강제 종료 전에 멈춘다 (이 달은 다음에 처음부터 받는다)
        const day = m + '-' + String(d).padStart(2, '0');
        stats_(ids, day, day).forEach((s) => {
          const g = gById[s.id];
          if (g && (s.salesAmt || s.impCnt)) rows.push([day, 'SA', g.campaign, g.ctype, g.name, String(g.id), s.salesAmt || 0, s.impCnt || 0, s.clkCnt || 0, s.ccnt || 0]);
        });
      }
      if (rows.length) {
        // 저장이 타임아웃되어도 실제로는 써졌을 수 있으니, 같은 달이 있으면 그 자리에 다시 쓴다
        const lastRow = sh.getLastRow();
        const first = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, 1).getDisplayValues().findIndex((r) => String(r[0]).startsWith(m)) : -1;
        const at = first >= 0 ? first + 2 : lastRow + 1;
        sh.getRange(at, 1, rows.length, 1).setNumberFormat('@');
        sh.getRange(at, 1, rows.length, head.length).setValues(rows);
      }
      done.add(m);
      PROPS.setProperty('NAVER_HIST_DONE', JSON.stringify([...done]));
    }
    return months.filter((m) => !done.has(m)).length;
  } catch (err) { console.warn('일별 과거분 수집 실패: ' + err.message); return -1; }
}
/**
 * 편집기에서 한 번만 실행: 네이버 일별 과거분을 끝까지 채운다. 6분 제한 안에서 나눠 받고, 남으면 1분 뒤 스스로 다시 시작한다.
 * 매시간 수집과 겹치는 시간(매시 9~24분)은 쉬었다가 이어 가고, 연속 5번 실패하거나 하루 실행 시간·API 여유를 넘기면 멈춘다 (남은 달은 매시간 수집이 이어 받는다).
 */
function fillNaverDailyHist() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'fillNaverDailyHist').forEach((t) => ScriptApp.deleteTrigger(t));
  const again = (ms) => ScriptApp.newTrigger('fillNaverDailyHist').timeBased().after(ms).create();
  const minute = Number(Utilities.formatDate(new Date(), 'Asia/Seoul', 'm'));
  if (minute >= 9 && minute < 24) { again(15 * 60 * 1000); return; }
  const dayKey = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  const spent = JSON.parse(PROPS.getProperty('NAVER_HIST_FILL_SPENT') || '{}'), usedMs = spent.day === dayKey ? spent.ms : 0;
  if (usedMs >= CFG.NAVER_HIST_FILL_DAILY_MS) {
    console.warn('일별 과거분: 오늘 쓸 실행 시간을 다 써서 멈춥니다 (남은 달은 매시간 수집이 이어 받습니다)');
    PROPS.deleteProperty('NAVER_HIST_FILLING');
    return;
  }
  const t0 = Date.now(), ss = SpreadsheetApp.openById(CFG.SHEET_ID), groups = read_(ss, 'n_idx_groups');
  if (!groups.length) throw new Error('n_idx_groups 가 비어 있습니다');
  PROPS.setProperty('NAVER_HIST_FILLING', String(t0));
  let left = -1;
  try { left = collectNaverDailyHist_(ss, t0, groups, Object.fromEntries(groups.map((g) => [String(g.id), g])), 8 * 60 * 1000); } finally { saveApiCount_(); }
  PROPS.setProperty('NAVER_HIST_FILL_SPENT', JSON.stringify({ day: dayKey, ms: usedMs + Date.now() - t0 }));
  const fails = left === -1 ? Number(PROPS.getProperty('NAVER_HIST_FILL_FAILS') || 0) + 1 : 0;
  PROPS.setProperty('NAVER_HIST_FILL_FAILS', String(fails));
  console.log('일별 과거분 남은 달: ' + left + ' (연속 실패 ' + fails + '회)');
  if (left === 0 || left === -2 || fails >= 5) PROPS.deleteProperty('NAVER_HIST_FILLING');
  else again(60 * 1000);
}
/** 일별 과거분 시트에 있는 달 목록 — 행 수가 바뀔 때만 다시 읽는다 */
function dailyHistMonths_(ss, name) {
  const sh = ss.getSheetByName(name), last = sh ? sh.getLastRow() : 0;
  if (last < 2) return [];
  const cache = CacheService.getScriptCache(), key = 'hist-months:' + name + ':' + last;
  try { const c = cache.get(key); if (c) return JSON.parse(c); } catch (_) {}
  const months = [...new Set(sh.getRange(2, 1, last - 1, 1).getDisplayValues().map((r) => String(r[0]).slice(0, 7)))].filter(Boolean).sort();
  try { cache.put(key, JSON.stringify(months), 21600); } catch (_) {}
  return months;
}
/** 일별 과거분을 달별로 압축 캐시해 고른 달만 돌려준다. 행 수가 바뀌면 키가 바뀌어 저절로 새로 읽는다 */
function histRows_(ss, name, months) {
  const sh = ss.getSheetByName(name), last = sh ? sh.getLastRow() : 0;
  if (last < 2) return [];
  const cache = CacheService.getScriptCache(), base = 'hist:' + name + ':' + last + ':';
  const cached = (m) => {
    try {
      const n = Number(cache.get(base + m + ':n'));
      if (!n) return null;
      const keys = Array.from({ length: n }, (_, i) => base + m + ':' + i), got = cache.getAll(keys);
      if (keys.some((k) => got[k] == null)) return null;
      const b64 = keys.map((k) => got[k]).join('');
      return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip')).getDataAsString());
    } catch (_) { return null; }
  };
  const hit = months.map(cached);
  if (hit.every(Boolean)) return [].concat(...hit);
  const byMonth = {};
  read_(ss, name).forEach((r) => { const m = String(r.date).slice(0, 7); (byMonth[m] = byMonth[m] || []).push(r); });
  Object.keys(byMonth).forEach((m) => {
    try {
      const b64 = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(byMonth[m]), 'application/json')).getBytes());
      const CHUNK = 90000, n = Math.max(1, Math.ceil(b64.length / CHUNK)), put = {};
      for (let i = 0; i < n; i++) put[base + m + ':' + i] = b64.slice(i * CHUNK, (i + 1) * CHUNK);
      put[base + m + ':n'] = String(n);
      cache.putAll(put, 21600);
    } catch (_) {}
  });
  return [].concat(...months.map((m) => byMonth[m] || []));
}
/** ?daily=YYYY-MM,YYYY-MM — 고른 달의 일별 과거분만 내려준다 (광고비 집계라 고객 정보는 없다) */
function dailyHistResponse_(ss, param, out) {
  const months = String(param).split(',').filter((m) => /^[0-9]{4}-[0-9]{2}$/.test(m)).slice(0, 48);
  out.months = months;
  Object.values(CFG.DAILY_HIST).forEach((name) => { out[name] = histRows_(ss, name, months); });
  return out;
}
/** 편집기에서 직접 실행: 소재 성과(n_ad_stats)를 지금 바로 채운다 (하루 1번 제한과 무관) */
function collectNaverAdStats() {
  checkNaverKeys_();
  const thisM = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM');
  const ok = collectNaverAdStats_(SpreadsheetApp.openById(CFG.SHEET_ID), Date.now(), [thisM, addMonth_(thisM, -1)], (ms) => ms.sort().reverse().slice(0, CFG.BACKFILL_MONTHS));
  if (ok) PROPS.setProperty('NAVER_AD_STATS_DAY', Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'));
  saveApiCount_();
  console.log('소재 성과 수집 ' + (ok ? '완료' : '일부만 (시간 부족)') + ' — API ' + apiCalls_ + '회');
}

/* 소재 × 월 성과 → n_ad_stats (소재 ID 는 n_ads 에서). 당월·전월은 매번, 지난 달은 비어 있는 달만 BACKFILL_MONTHS 개씩.
 * 조회했는데 실적이 하나도 없던 지난 달은 NAVER_AD_EMPTY 에 기억해 다시 묻지 않는다. API: 소재 수/50 회 × 달 수.
 * 당월·전월을 모두 받았으면 true. */
function collectNaverAdStats_(ss, t0, fresh, back) {
  const ids = [...new Set(read_(ss, 'n_ads').map((r) => String(r.ad_id)).filter((id) => /^nad-/.test(id)))];
  if (!ids.length) return true;
  const head = ['month', 'ad_id', 'cost', 'impressions', 'clicks', 'conversions'];
  const old = read_(ss, 'n_ad_stats');
  const have = new Set(old.map((r) => r.month));
  const empty = new Set(JSON.parse(PROPS.getProperty('NAVER_AD_EMPTY') || '[]'));
  const missing = [];
  for (let m = CFG.FROM_YEAR + '-01'; m < fresh[1]; m = addMonth_(m, 1)) if (!have.has(m) && !empty.has(m)) missing.push(m);
  const rows = [], done = [];
  for (const m of fresh.concat(back(missing))) {
    if (Date.now() - t0 > CFG.BUDGET_MS) break; // 남은 달은 다음 날 실행에서
    const before = rows.length;
    stats_(ids, m + '-01', lastDay_(m), CFG.AD_CHUNK).forEach((s) => {
      if (s.salesAmt || s.impCnt) rows.push([m, s.id, s.salesAmt || 0, s.impCnt || 0, s.clkCnt || 0, s.ccnt || 0]);
    });
    if (m < fresh[1] && rows.length === before) empty.add(m);
    done.push(m);
  }
  PROPS.setProperty('NAVER_AD_EMPTY', JSON.stringify([...empty].sort()));
  if (!done.length) return false;
  const keep = old.filter((r) => !done.includes(r.month)).map((r) => head.map((h) => r[h]));
  put_(ss, 'n_ad_stats', [head].concat(keep.concat(rows).sort((a, b) => String(a[0]).localeCompare(String(b[0])))));
  return fresh.every((m) => done.includes(m));
}

/** 진단용 (편집기에서 직접 실행): 월마다 광고그룹 성과와 키워드 성과를 비교하고, 현재 키워드의 등록 시점을 로그로 남긴다.
 * 과거 달 키워드 성과가 비는 원인(키워드 재등록 / 조회 기간 제한)을 가린다. API 약 50회. */
function debugKeywordHistory() {
  checkNaverKeys_();
  const ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  const groups = read_(ss, 'n_idx_groups'), kws = read_(ss, 'n_idx_keywords');
  // 광고비가 가장 큰 광고그룹 5개와 그 키워드만 표본으로 쓴다
  const thisM = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM');
  const spend = {};
  read_(ss, 'n_adgroup_monthly').filter((r) => r.type === 'SA').forEach((r) => { spend[r.ad_group_id] = (spend[r.ad_group_id] || 0) + (Number(r.cost) || 0); });
  const topG = groups.map((g) => String(g.id)).sort((a, b) => (spend[b] || 0) - (spend[a] || 0)).slice(0, 5);
  const sampleK = kws.filter((k) => topG.includes(String(k.ad_group_id))).slice(0, 50).map((k) => String(k.id));
  console.log('표본: 광고그룹 ' + topG.length + '개, 키워드 ' + sampleK.length + '개');
  // 키워드 등록 시점 (표본 광고그룹의 현재 키워드)
  topG.forEach((gid) => {
    const list = api_('GET', '/ncc/keywords', { nccAdgroupId: gid }).filter((k) => !k.userLock);
    const reg = list.map((k) => String(k.regTm || '').slice(0, 10)).filter(Boolean).sort();
    console.log('광고그룹 ' + gid + ': 키워드 ' + list.length + '개, 등록일 ' + (reg[0] || '?') + ' ~ ' + (reg[reg.length - 1] || '?'));
  });
  // 월별 광고그룹 성과 vs 키워드 성과
  for (let m = addMonth_(thisM, -10); m <= thisM; m = addMonth_(m, 1)) {
    const until = lastDay_(m);
    const sum = (arr) => arr.reduce((a, s) => [a[0] + (s.impCnt || 0), a[1] + (s.salesAmt || 0)], [0, 0]);
    const g = sum(stats_(topG, m + '-01', until)), k = sum(stats_(sampleK, m + '-01', until));
    console.log(m + ' 광고그룹 노출 ' + g[0] + ' / 광고비 ' + g[1] + '  |  키워드 노출 ' + k[0] + ' / 광고비 ' + k[1]);
  }
}

function checkNaverKeys_() {
  ['NAVER_API_KEY', 'NAVER_SECRET', 'NAVER_CUSTOMER_ID'].forEach((k) => { if (!PROPS.getProperty(k)) throw new Error('스크립트 속성에 ' + k + ' 가 없습니다'); });
}

/* 캠페인·광고그룹 → 카테고리 분류표 (마케팅 담당자 "카테고리 분류_최종(ads)" 기준).
 * 웹앱 src/utils/format.ts 의 CAT_LOOKUP 과 같은 표 — 한쪽을 고치면 다른 쪽도 고친다.
 * 광고그룹이 '' 이면 그 캠페인 전체에 적용되고, 광고그룹 지정 항목이 먼저 맞는다. */
const CAT_LOOKUP_ = [
  // 광고그룹으로 2차 분기
  ['LG전자',        '사이니지',         'LG전자 > 사이니지'],
  ['LG전자',        '전자칠판',         'LG전자 > 전자칠판'],
  ['SAN 스토리지',  '화웨이',           'SAN 스토리지 > 화웨이'],
  ['SAN 스토리지',  'NetAPP',           'SAN 스토리지 > NetAPP'],
  ['SAN 스토리지',  'MSA',              'SAN 스토리지 > MSA'],
  ['네트워크/방화벽','화웨이',           '네트워크/방화벽 > 화웨이'],
  ['네트워크/방화벽','FortiGate',        '네트워크/방화벽 > FortiGate'],
  ['네트워크/방화벽','PaloAlto',         '네트워크/방화벽 > PaloAlto'],
  ['소프트웨어',    '보안 소프트웨어',   '소프트웨어 > 보안 소프트웨어'],
  ['소프트웨어',    '기타 소프트웨어',   '소프트웨어 > 기타 소프트웨어'],
  // 캠페인명 자체가 노트북 2차
  ['HP 노트북',     '',                 '노트북 > HP 노트북'],
  ['Lenovo 노트북', '',                 '노트북 > Lenovo 노트북'],
  // 캠페인명 = 1차 카테고리
  ['3Dconnexion',           '', '3Dconnexion'],
  ['Dell 서버',             '', 'Dell 서버'],
  ['HPE 서버',              '', 'HPE 서버'],
  ['Lenovo 서버',           '', 'Lenovo 서버'],
  ['서버공통(주변장비)',     '', '서버공통(주변장비)'],
  ['GPU/AI 서버',           '', 'GPU/AI 서버'],
  ['LG전자',                '', 'LG전자'],
  ['MS서피스',              '', 'MS서피스'],
  ['데스크탑',              '', '데스크탑'],
  ['모니터',                '', '모니터'],
  ['데스크탑 워크스테이션', '', '데스크탑 워크스테이션'],
  ['AI Station',            '', 'AI Station'],
  ['모바일 워크스테이션',   '', '모바일 워크스테이션'],
  ['UPS',                   '', 'UPS'],
  ['NAS 스토리지',          '', 'NAS 스토리지'],
  ['SAN 스토리지',          '', 'SAN 스토리지'],
  ['네트워크/방화벽',       '', '네트워크/방화벽'],
  ['이중화 솔루션',         '', '이중화 솔루션'],
  ['백업 솔루션',           '', '백업 솔루션'],
  ['가상화 솔루션',         '', '가상화 솔루션'],
  ['화상회의솔루션',        '', '화상회의솔루션'],
  ['소프트웨어',            '', '소프트웨어'],
  ['GstarCAD',              '', 'GstarCAD'],
  ['유지보수/기술문의',     '', '유지보수/기술문의'],
  ['리스/렌탈/데모',        '', '리스/렌탈/데모'],
  // 이름만으로 카테고리를 알 수 없는 예외 캠페인 (엑셀 37~59행). 광고그룹 지정 항목을 먼저 둔다.
  // 구글·네이버 공통 적용 — 자사 광고·중소기업패키지·GDN_자사몰_최신 은 카테고리 없음('기타')이라 적지 않는다
  ['GDN_방화벽',            '(2606) GDN_방화벽_화웨이',    '네트워크/방화벽 > 화웨이'],
  ['GDN_방화벽',            '(2606) GDN_방화벽_FortiGate', '네트워크/방화벽 > FortiGate'],
  ['GDN_방화벽',            '(2606) GDN_방화벽_PaloAlto',  '네트워크/방화벽 > PaloAlto'],
  ['GDN_SAN스토리지',       'GDN_화웨이 스토리지',         'SAN 스토리지 > 화웨이'],
  ['★HPE_MDF',             '', 'HPE 서버'],
  ['★HPE_MDF_0706~',       '', 'HPE 서버'],
  ['HP 데모',               '', '리스/렌탈/데모'],
  ['GDN_이중화솔루션',      '', '이중화 솔루션'],
  ['GDN_HP노트북',          '', '노트북 > HP 노트북'],
  ['GDN_유지보수',          '', '유지보수/기술문의'],
  ['GDN_HP모니터',          '', '모니터'],
  ['GDN_GPU',               '', 'GPU/AI 서버'],
  ['GDN_방화벽',            '', '네트워크/방화벽'],
  ['GDN_HPE 서버',          '', 'HPE 서버'],
  ['GDN_Dell 서버',         '', 'Dell 서버'],
  ['GDN_화웨이MDF',         '', 'SAN 스토리지 > 화웨이'],
  ['GDN_SAN스토리지',       '', 'SAN 스토리지'],
  ['GDN_GstarCAD',          '', 'GstarCAD'],
  ['GDN_HP데스크탑',        '', '데스크탑'],
  ['GDN_ZBook',             '', '모바일 워크스테이션'],
  ['GDN_3Dconnexion',       '', '3Dconnexion'],
  ['GDN_데스크탑 워크스테이션', '', '데스크탑 워크스테이션'],
];

/* 이름·문구 → 분류표 카테고리. 견적 제목과, CAT_LOOKUP_ 에 없는 캠페인·광고그룹 이름에 쓴다.
 * 웹앱 src/utils/categoryText.ts 의 CATEGORY_TEXT_RULES 와 같은 표 — 한쪽을 고치면 다른 쪽도 고친다.
 * 위에서부터 먼저 맞는 규칙을 쓴다 (제품 종류·솔루션을 브랜드 서버보다 먼저). */
const CATEGORY_TEXT_RULES_ = [
  // 단일 브랜드·제품군
  [/3\s?d\s?connexion|spacemouse|cadmouse/, '3Dconnexion'],
  [/ai\s?station|zgx|dgx\s?spark/, 'AI Station'],
  [/gstar|g\s?캐드|지스타/, 'GstarCAD'],
  // 네트워크/방화벽 — 화웨이는 스토리지에도 있어 함께 쓰인 말로 가른다
  [/fortigate|포티게이트|\bfg-?\d/, '네트워크/방화벽 > FortiGate'],
  [/palo\s?alto|팔로\s?알토/, '네트워크/방화벽 > PaloAlto'],
  [/(방화벽|네트워크|스위치|\bap\d*\b).*(화웨이|huawei)|(화웨이|huawei).*(방화벽|네트워크|스위치|\bap\d*\b)/, '네트워크/방화벽 > 화웨이'],
  [/방화벽|firewall|\butm\b|스위치|switch|네트워크|network|라우터|router|\bsfp\b|\bap\d*\b/, '네트워크/방화벽'],
  // 스토리지
  [/시놀로지|synology/, 'NAS 스토리지 > 시놀로지'],
  [/\bnas\b|나스|qnap|큐냅/, 'NAS 스토리지'],
  [/netapp|넷앱/, 'SAN 스토리지 > NetAPP'],
  [/\bmsa\b/, 'SAN 스토리지 > MSA'],
  [/oceanstor|dorado|(화웨이|huawei).*(스토리지|storage|san)|(스토리지|storage|san).*(화웨이|huawei)/, 'SAN 스토리지 > 화웨이'],
  [/스토리지|storage|\bsan\b|\bdas\b|unity|powervault|powerstore/, 'SAN 스토리지'],
  // 솔루션
  [/백업|backup|veeam|arcserve|acronis/, '백업 솔루션'],
  [/rose\s?ha|mccs|이중화|클러스터/, '이중화 솔루션'],
  [/vmware|가상화|hyper-?v|proxmox|nutanix|\bvdi\b/, '가상화 솔루션'],
  [/\bpoly\b|폴리/, '화상회의솔루션 > Poly'],
  [/화상\s?회의|화상\s?장비|웹캠|스피커폰/, '화상회의솔루션'],
  [/\bv3\b|안랩|보안\s?소프트웨어|백신/, '소프트웨어 > 보안 소프트웨어'],
  [/소프트웨어|software|라이선스|license|windows|오피스|office|autocad|오토캐드|한컴/, '소프트웨어 > 기타 소프트웨어'],
  [/\bups|무정전|\bapc\b/, 'UPS'],
  // 디스플레이 — 사이니지·전자칠판을 모니터보다 먼저
  [/사이니지|signage/, 'LG전자 > 사이니지'],
  [/전자\s?칠판|createboard|원퀵|터치\s?디스플레이/, 'LG전자 > 전자칠판'],
  [/모니터|monitor|디스플레이|display/, '모니터'],
  // 워크스테이션 — 모바일을 먼저
  [/zbook|\bmws\b|모바일\s?워크스테이션|mobile\s?workstation/, '모바일 워크스테이션'],
  [/워크스테이션|workstation|z\s?by\s?hp|zbyhp|\bz[1-9]\b|\bz[1-9]\s?g\d|z\s?central|precision|thinkstation/, '데스크탑 워크스테이션'],
  // GPU/AI 서버 (옛 캠페인명 "Data Science" 포함)
  [/gpu|딥러닝|머신러닝|data\s?science|데이터\s?사이언스|\brtx|h100|h200|a100|l40s?|b200|instinct|\bmi\d{3}|\besc\d{4}|epyc|tyan|mitac|supermicro|슈퍼마이크로/, 'GPU/AI 서버'],
  // 노트북·서피스
  [/서피스|surface/, 'MS서피스'],
  [/thinkpad|씽크패드|ideapad|아이디어패드|레노버\s?노트북|lenovo\s?노트북/, '노트북 > Lenovo 노트북'],
  [/elitebook|엘리트북|probook|프로북|파빌리온|pavilion|omen|오멘|omnibook|victus|hp\s?노트북|hp노트북|hp\s?\d{3}r?\s?g\d/, '노트북 > HP 노트북'],
  [/노트북|laptop|expertbook|vivobook|zenbook|그램|macbook|맥북/, '노트북'],
  // 브랜드 서버 → 브랜드 없는 서버(서버공통)
  [/hpe|proliant|\bdl\d{2,3}|\bml\d{2,3}/, 'HPE 서버'],
  [/poweredge|dell|델\s?서버|델서버/, 'Dell 서버'],
  [/thinksystem|lenovo|레노버/, 'Lenovo 서버'],
  [/서버|server|랙|rack/, '서버공통(주변장비)'],
  // 데스크탑
  [/엘리트\s?보드|eliteboard|elite\s?desk|엘리트\s?데스크|pro\s?desk|프로\s?데스크|프로\s?미니|pro\s?mini|엘리트\s?타워|elite\s?tower|프로\s?슬림|pro\s?slim|\bnuc\b|mac\s?studio|데스크탑|데스크톱|desktop|\bpc\b|올인원|본체|컴퓨터/, '데스크탑'],
  // 서비스
  [/유지\s?보수|기술\s?문의|a\/s|수리/, '유지보수/기술문의'],
  [/리스|렌탈|대여|데모|demo/, '리스/렌탈/데모'],
];

/** 이름·문구 → 카테고리. 맞는 규칙이 없으면 '기타'. 밑줄(GDN_MWS)은 띄어쓰기로 본다 */
function categoryFromText_(text) {
  const t = String(text || '').toLowerCase().replace(/_/g, ' ');
  if (!t.trim()) return '기타';
  for (let i = 0; i < CATEGORY_TEXT_RULES_.length; i++) if (CATEGORY_TEXT_RULES_[i][0].test(t)) return CATEGORY_TEXT_RULES_[i][1];
  return '기타';
}

/** 캠페인·광고그룹 이름 → 카테고리. 광고그룹 이름만으로 먼저 보고, 모자라면 캠페인 이름과 함께 본다 */
function categoryFromAdNames_(campaign, adgroup) {
  const byGroup = categoryFromText_(adgroup);
  return byGroup !== '기타' ? byGroup : categoryFromText_(campaign + ' ' + adgroup);
}

/** 카테고리 개편 전 옛 7분류. mapping 시트에 이 값이 있으면 새 체계로 다시 계산한다 */
const LEGACY_CATS_ = ['서버', '워크스테이션', '스토리지', '노트북', 'PC', 'PC·노트북', '모니터', '기타'];

/** 캠페인·광고그룹명 → 카테고리(1차 또는 "1차 > 2차"). 표에 없으면 이름으로 찾는다 (옛 캠페인명, 쇼핑검색·자사몰 캠페인) */
function standardCategoryOf_(campaign, adgroup) {
  const c = String(campaign || '').trim();
  const g = String(adgroup || '').trim();
  if (c.indexOf(' > ') >= 0) return c; // 캠페인명 자체가 카테고리 경로인 경우
  for (let i = 0; i < CAT_LOOKUP_.length; i++) {
    const row = CAT_LOOKUP_[i];
    if (c === row[0] && (row[1] === '' || g === row[1])) return row[2];
  }
  return categoryFromAdNames_(c, g);
}

/** 새로 생긴 캠페인·광고그룹을 mapping 시트에 표준 카테고리로 추가하고, 기존 빈 카테고리도 자동으로 채운다. */
function syncMapping_(ss) {
  const sh = ss.getSheetByName('mapping');
  if (!sh) return;
  const key = (r) => [String(r.media || '').trim(), String(r.campaign || '').trim(), String(r.ad_group || '').trim()].join('\u0001');
  const existing = read_(ss, 'mapping');
  const byKey = new Map();
  existing.forEach((r) => {
    const camp = String(r.campaign || '').trim();
    const grp = String(r.ad_group || '').trim();
    const cur = String(r.category || '').trim();
    const cat = (cur && LEGACY_CATS_.indexOf(cur) < 0) ? cur : standardCategoryOf_(camp, grp);
    byKey.set(key(r), [String(r.media || '').trim(), camp, grp, cat, Number(r.ratio) || 100]);
  });
  [
    ['Google', 'g_adgroup_monthly'],
    ['Google', 'g_keywords'],
    ['Naver', 'n_adgroup_monthly'],
    ['Naver', 'n_keywords'],
  ].forEach(([media, name]) => read_(ss, name).forEach((r) => {
    const camp = String(r.campaign || '').trim();
    const grp = String(r.ad_group || '').trim();
    if (!camp) return;
    const k = key({ media, campaign: camp, ad_group: grp });
    if (!byKey.has(k)) {
      byKey.set(k, [media, camp, grp, standardCategoryOf_(camp, grp), 100]);
    }
  }));
  const rows = [['media', 'campaign', 'ad_group', 'category', 'ratio']].concat(Array.from(byKey.values()));
  put_(ss, 'mapping', rows);
}

/* ── 네이버 성과형 DA(GFA) 이메일 보고서 자동 수집 ──
 * 네이버 GFA 관리자에서 매일 새벽 발송되는 맞춤 보고서 CSV 이메일을 읽어 n_adgroup_monthly 에 type='DA' 로 적재한다.
 * 사용자가 엑셀을 내려받거나 업로드할 필요가 없다.
 * 스크립트 속성: GFA_EMAIL_QUERY (옵션, 기본값: 'subject:(성과형 OR GFA OR "디스플레이 광고") has:attachment filename:csv') */
function collectGfaEmail() {
  const ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  const q = PROPS.getProperty('GFA_EMAIL_QUERY') || 'subject:(성과형 OR GFA OR "디스플레이 광고") has:attachment filename:csv';
  const threads = GmailApp.search(q, 0, 10);
  if (!threads.length) {
    console.log('새로운 GFA 리포트 이메일이 없습니다 (검색 쿼리: ' + q + ')');
    return;
  }
  let label = GmailApp.getUserLabelByName('GFA_PROCESSED');
  if (!label) label = GmailApp.createLabel('GFA_PROCESSED');

  const rowsDA = [];
  threads.forEach((th) => {
    const labels = th.getLabels().map((l) => l.getName());
    if (labels.includes('GFA_PROCESSED')) return;

    th.getMessages().forEach((msg) => {
      msg.getAttachments().forEach((att) => {
        if (!att.getName().toLowerCase().endsWith('.csv')) return;
        let csvStr = '';
        try { csvStr = att.getDataAsString('UTF-8'); } catch (e) { csvStr = att.getDataAsString('EUC-KR'); }
        if (!csvStr) return;
        const parsed = Utilities.parseCsv(csvStr);
        if (parsed.length < 2) return;

        const h = parsed.shift().map((x) => String(x).trim().replace(/\s+/g, ''));
        const iDate = h.findIndex((c) => /일자|날짜|date|일시/i.test(c));
        const iCamp = h.findIndex((c) => /캠페인|campaign/i.test(c));
        const iGrp = h.findIndex((c) => /광고그룹|adgroup|그룹/i.test(c));
        const iCost = h.findIndex((c) => /비용|소진|cost|spend|금액/i.test(c));
        const iImp = h.findIndex((c) => /노출|imp/i.test(c));
        const iClk = h.findIndex((c) => /클릭|clk|click/i.test(c));
        const iConv = h.findIndex((c) => /전환|conv/i.test(c));

        parsed.forEach((r) => {
          const rawDate = iDate >= 0 ? r[iDate] : '';
          const m = quoteMonth_(rawDate) || Utilities.formatDate(msg.getDate(), 'Asia/Seoul', 'yyyy-MM');
          const camp = iCamp >= 0 && r[iCamp] ? String(r[iCamp]).trim() : 'GFA_캠페인';
          const grp = iGrp >= 0 && r[iGrp] ? String(r[iGrp]).trim() : 'GFA_그룹';
          const cost = iCost >= 0 ? Number(String(r[iCost]).replace(/[^0-9.-]/g, '')) || 0 : 0;
          const imp = iImp >= 0 ? Number(String(r[iImp]).replace(/[^0-9.-]/g, '')) || 0 : 0;
          const clk = iClk >= 0 ? Number(String(r[iClk]).replace(/[^0-9.-]/g, '')) || 0 : 0;
          const conv = iConv >= 0 ? Number(String(r[iConv]).replace(/[^0-9.-]/g, '')) || 0 : 0;

          if (cost > 0 || imp > 0 || clk > 0) {
            rowsDA.push({ month: m, type: 'DA', campaign: camp, campaign_tp: 'GFA', ad_group: grp, ad_group_id: '', cost, impressions: imp, clicks: clk, conversions: conv });
          }
        });
      });
    });
    th.addLabel(label);
  });

  if (!rowsDA.length) return;

  const head = ['month', 'type', 'campaign', 'campaign_tp', 'ad_group', 'ad_group_id', 'cost', 'impressions', 'clicks', 'conversions'];
  const old = read_(ss, 'n_adgroup_monthly');
  const newKeys = new Set(rowsDA.map((r) => [r.month, r.campaign, r.ad_group].join('\u0001')));
  const keep = old.filter((r) => r.type === 'SA' || !newKeys.has([r.month, r.campaign, r.ad_group].join('\u0001'))).map((r) => head.map((h) => r[h]));
  const toAdd = rowsDA.map((r) => head.map((h) => r[h]));

  put_(ss, 'n_adgroup_monthly', [head].concat(keep.concat(toAdd).sort((a, b) => String(a[0]).localeCompare(String(b[0])))));
  syncMapping_(ss);
  console.log('GFA 리포트 이메일 자동 파싱 완료: ' + rowsDA.length + '행 반영');
}

/* ── 구글 광고(Google Ads) 이메일 보고서 자동 수집 ──
 * Google Ads 보고서 에디터에서 매일 아침 발송되는 CSV 이메일을 읽어 g_adgroup_monthly · g_campaign_monthly · g_keywords 에 적재한다.
 * 패스키·OAuth 스크립트 승인 팝업 없이 100% 무인 작동한다.
 * 스크립트 속성: GADS_EMAIL_QUERY (옵션, 기본값: 'subject:("its-ad-insight" OR "통합 로우 데이터 추출") has:attachment filename:csv') */
function collectGoogleAdsEmail() {
  const ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  const q = PROPS.getProperty('GADS_EMAIL_QUERY') || 'subject:("its-ad-insight" OR "통합 로우 데이터 추출" OR "월별실적") has:attachment filename:csv';
  const threads = GmailApp.search(q, 0, 10);
  if (!threads.length) {
    console.log('새로운 Google Ads 리포트 이메일이 없습니다 (검색 쿼리: ' + q + ')');
    return;
  }
  let label = GmailApp.getUserLabelByName('GADS_PROCESSED');
  if (!label) label = GmailApp.createLabel('GADS_PROCESSED');

  threads.forEach((th) => {
    const labels = th.getLabels().map((l) => l.getName());
    if (labels.includes('GADS_PROCESSED')) return;

    th.getMessages().forEach((msg) => {
      msg.getAttachments().forEach((att) => {
        const name = att.getName().toLowerCase();
        if (!name.endsWith('.csv')) return;
        let csvStr = '';
        try { csvStr = att.getDataAsString('UTF-8'); } catch (e) { csvStr = att.getDataAsString('EUC-KR'); }
        if (!csvStr) return;

        // [1] 월별 실적 보고서 파싱 (its-ad-insight_월별실적)
        if (name.includes('월별') || name.includes('monthly') || csvStr.includes('캠페인 유형,통화 코드,비용')) {
          const parsed = Utilities.parseCsv(csvStr);
          while (parsed.length && !String(parsed[0][0] || '').startsWith('월')) parsed.shift();
          if (parsed.length >= 2) {
            parsed.shift(); // remove header
            const rows = [];
            parsed.forEach((r) => {
              if (!r[0] || String(r[0]).startsWith('합계') || String(r[0]).startsWith('총계')) return;
              const mMatch = String(r[0]).match(/(\d{4})년\s*(\d{1,2})월/);
              const m = mMatch ? mMatch[1] + '-' + ('0' + mMatch[2]).slice(-2) : quoteMonth_(r[0]);
              if (!m) return;
              const camp = String(r[1] || '').trim();
              const grp = String(r[2] || '').trim();
              const rawType = String(r[3] || '');
              const type = rawType.includes('검색') ? 'SA' : 'DA';
              const cost = Number(String(r[5] || '').replace(/[^0-9.-]/g, '')) || 0;
              const imp = Number(String(r[6] || '').replace(/[^0-9.-]/g, '')) || 0;
              const clk = Number(String(r[7] || '').replace(/[^0-9.-]/g, '')) || 0;
              const conv = Number(String(r[8] || '').replace(/[^0-9.-]/g, '')) || 0;
              if (cost > 0 || imp > 0 || clk > 0) {
                rows.push({ month: m, type, campaign: camp, ad_group: grp, cost, impressions: imp, clicks: clk, conversions: conv });
              }
            });
            if (rows.length) saveGoogleMonthlyRows_(ss, rows);
          }
        }

        // [2] 키워드 실적 보고서 파싱 (통합 로우 데이터 추출)
        if (name.includes('통합') || name.includes('키워드') || csvStr.includes('검색 키워드,광고 최종 도착 URL')) {
          const parsed = Utilities.parseCsv(csvStr);
          // 머리말의 보고 기간("2026년 10월 1일 - 2026년 10월 19일")에서 마지막 날짜의 월을 쓴다. 없으면 메일 수신월.
          let kwMonth = Utilities.formatDate(msg.getDate(), 'Asia/Seoul', 'yyyy-MM');
          while (parsed.length && !String(parsed[0][0] || '').startsWith('캠페인')) {
            const ds = parsed.shift().join(' ').match(/(\d{4})\s*[년.\-/]\s*(\d{1,2})/g);
            if (ds) kwMonth = quoteMonth_(ds[ds.length - 1].replace(/\s*[년.\-/]\s*/, '-')) || kwMonth;
          }
          if (parsed.length >= 2) {
            parsed.shift(); // remove header
            const rows = [];
            parsed.forEach((r) => {
              if (!r[0] || String(r[0]).startsWith('합계') || String(r[0]).startsWith('총계')) return;
              const camp = String(r[0] || '').trim();
              const grp = String(r[1] || '').trim();
              const kw = String(r[2] || '').trim();
              const qs = String(r[4] || '').trim();
              const clk = Number(String(r[5] || '').replace(/[^0-9.-]/g, '')) || 0;
              const imp = Number(String(r[6] || '').replace(/[^0-9.-]/g, '')) || 0;
              const cost = Number(String(r[8] || '').replace(/[^0-9.-]/g, '')) || 0;
              const conv = Number(String(r[14] || '').replace(/[^0-9.-]/g, '')) || 0;
              if (kw) {
                rows.push({
                  month: kwMonth,
                  type: 'SA',
                  campaign: camp,
                  ad_group: grp,
                  keyword: kw,
                  match: '',
                  bid: 0,
                  quality: qs === '--' ? '' : qs,
                  cost,
                  impressions: imp,
                  clicks: clk,
                  conversions: conv,
                });
              }
            });
            if (rows.length) saveGoogleKeywordRows_(ss, rows);
          }
        }
      });
    });
    th.addLabel(label);
  });
}

function saveGoogleMonthlyRows_(ss, rows) {
  const head = ['month', 'type', 'campaign', 'campaign_id', 'ad_group', 'ad_group_id', 'cost', 'impressions', 'clicks', 'conversions'];
  const old = read_(ss, 'g_adgroup_monthly');
  const newKeys = new Set(rows.map((r) => [r.month, r.campaign, r.ad_group].join('\u0001')));
  const keep = old.filter((r) => !newKeys.has([r.month, r.campaign, r.ad_group].join('\u0001'))).map((r) => head.map((h) => r[h]));
  const toAdd = rows.map((r) => [r.month, r.type || 'SA', r.campaign, '', r.ad_group, '', Number(r.cost) || 0, Number(r.impressions) || 0, Number(r.clicks) || 0, Number(r.conversions) || 0]);
  put_(ss, 'g_adgroup_monthly', [head].concat(keep.concat(toAdd).sort((a, b) => String(a[0]).localeCompare(String(b[0])))));

  // 캠페인 레벨 집계 (g_campaign_monthly)
  const campMap = new Map();
  keep.concat(toAdd).forEach((r) => {
    const k = [r[0], r[1], r[2]].join('\u0001');
    const cur = campMap.get(k) || [r[0], r[1], r[2], '', 0, 0, 0, 0];
    cur[4] += Number(r[6]) || 0;
    cur[5] += Number(r[7]) || 0;
    cur[6] += Number(r[8]) || 0;
    cur[7] += Number(r[9]) || 0;
    campMap.set(k, cur);
  });
  const campHead = ['month', 'type', 'campaign', 'campaign_id', 'cost', 'impressions', 'clicks', 'conversions'];
  const campRows = [campHead].concat(Array.from(campMap.values()).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  put_(ss, 'g_campaign_monthly', campRows);

  put_(ss, 'g_meta', [['key', 'value'], ['updated', Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm')], ['account', 'HPI_아이티스정보통신'], ['sync_mode', 'scheduled_email']]);
  syncMapping_(ss);
}

/** 월별로 갈아 끼운다: 새로 받은 달의 행만 바꾸고 다른 달은 그대로 둔다. month 가 없으면 당월로 본다. */
function saveGoogleKeywordRows_(ss, rows) {
  const head = ['month', 'type', 'campaign', 'ad_group', 'keyword', 'match', 'bid', 'quality', 'cost', 'impressions', 'clicks', 'conversions'];
  const thisM = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM');
  const toAdd = rows.map((r) => [quoteMonth_(r.month) || thisM, r.type || 'SA', r.campaign, r.ad_group, r.keyword, r.match || '', Number(r.bid) || 0, r.quality || '', Number(r.cost) || 0, Number(r.impressions) || 0, Number(r.clicks) || 0, Number(r.conversions) || 0]);
  const newMs = new Set(toAdd.map((r) => r[0]));
  const keep = read_(ss, 'g_keywords').filter((r) => /^\d{4}-\d{2}$/.test(String(r.month || '')) && !newMs.has(r.month)).map((r) => head.map((h) => r[h]));
  put_(ss, 'g_keywords', [head].concat(keep.concat(toAdd).sort((a, b) => String(a[0]).localeCompare(String(b[0])))));
  syncMapping_(ss);
}

/* ── 견적 집계 ──
 * 아이티켓 쇼핑몰이 견적 접수 때마다 구글 시트(견적요청 리스트)에 한 줄씩 쌓는다.
 * 월·카테고리·유입경로별 건수를 quotes_monthly 에 집계하고,
 * 번호·제목·작성자·회사명·연락처·이메일·접수날짜·주문상태·유입경로·표준카테고리·영업담당을 quotes_raw 에 1:1 보존한다.
 * 스크립트 속성: QUOTE_SHEET_ID(견적 시트 ID, 필수), QUOTE_SHEET_TAB(탭 이름, 기본 '견적문의'). */
function collectQuotes() {
  const id = PROPS.getProperty('QUOTE_SHEET_ID');
  if (!id) throw new Error('스크립트 속성에 QUOTE_SHEET_ID 가 없습니다');
  const { v, c } = readQuoteSheet_(id, PROPS.getProperty('QUOTE_SHEET_TAB') || '견적문의');

  // 어드민에서 수동 지정한 카테고리 오버라이드 로드 (sno → category)
  const ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  const overrideMap = loadManualCategories_(ss);

  const agg = {};
  v.forEach((r) => {
    const m = quoteMonth_(r[c.date]);
    if (!m) return;
    const cat = currentCategory_(overrideMap[quoteSno_(r, c)]) || quoteCategory_(r[c.sub], c.src < 0 ? '' : r[c.src]);
    const k = [m, cat, c.src < 0 ? '미수집' : quoteSource_(r[c.src])].join('\u0001');
    agg[k] = (agg[k] || 0) + 1;
  });
  const rows = [['month', 'category', 'source', 'count']];
  Object.keys(agg).sort().forEach((k) => rows.push(k.split('\u0001').concat(agg[k])));
  put_(ss, 'quotes_monthly', rows);
  put_(ss, 'q_meta', [['key', 'value'], ['updated', Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm')], ['rows', v.length]]);

  // quotes_raw: 원본 시트 보존 (관리자 전용 대시보드 연동)
  const rawRows = [QUOTE_RAW_HEAD];
  v.forEach((r) => {
    const sno = quoteSno_(r, c);
    const row = quoteRawRow_(r, c, sno, overrideMap[sno]);
    if (row) rawRows.push(row);
  });
  put_(ss, 'quotes_raw', rawRows);
}

/** 정기 수집과 수동 지정 저장이 겹쳐도 견적 시트를 번갈아 쓰게 한다 (put_ 은 시트를 비우고 다시 쓴다) */
function withQuoteLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60 * 1000)) throw new Error('견적 수집이 이미 실행 중입니다');
  try { fn(); } finally { lock.releaseLock(); }
}
/** 수동 지정 저장 직후 바뀐 쪽만 다시 수집한다. 키가 "사이트:sno" 면 다른 사이트 건이다 */
function recollectManual_(overrides) {
  const isSite = (o) => String(o.sno).includes(':');
  withQuoteLock_(() => {
    if (overrides.some((o) => !isSite(o))) collectQuotes();
    if (overrides.some(isSite)) { collectQuoteSites(); collectQuoteStatsExtra(); }
  });
}

/* ── 다른 사이트 견적 (어드민 리스트 전용) ──
 * CFG.QUOTE_SITES 의 시트를 아이티켓과 같은 양식으로 읽어 quotes_raw_sites 에 쓴다. 통계에는 쓰지 않는다.
 * sno 는 사이트마다 따로 매겨지므로 수동 지정은 "사이트:sno" (예: zbyhp:12) 로 구분한다.
 * 한 시트를 못 읽어도 다른 시트는 갱신하고, 못 읽은 시트는 지난번 값을 유지한다. */
function collectQuoteSites() {
  const ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  const overrideMap = loadManualCategories_(ss);
  const prev = read_(ss, 'quotes_raw_sites');
  const head = ['site'].concat(QUOTE_RAW_HEAD);
  const rows = [head], failed = [];
  CFG.QUOTE_SITES.forEach((site) => {
    try {
      const { v, c } = readQuoteSheet_(site.sheetId, '견적문의');
      const siteRows = [];
      v.forEach((r) => {
        const sno = quoteSno_(r, c);
        const row = quoteRawRow_(r, c, sno, overrideMap[site.id + ':' + sno], site.category);
        if (row) siteRows.push([site.id].concat(row));
      });
      siteRows.forEach((row) => rows.push(row));
    } catch (e) {
      failed.push(site.id + ': ' + e.message);
      prev.filter((p) => p.site === site.id).forEach((p) => rows.push(head.map((k) => p[k])));
    }
  });
  put_(ss, 'quotes_raw_sites', rows);
  if (failed.length) throw new Error(failed.join(' / '));
}

/* ── 전화문의 (어드민 리스트 전용) ──
 * 아이티켓 견적요청 DB 의 '전화문의' 탭을 quotes_phone 에 옮긴다. 통계에는 쓰지 않는다.
 * 열 머리글을 못 찾거나 탭이 없으면 오류를 내고, quotes_phone 은 지난번 값을 유지한다.
 * 날짜 열 이름을 date 로 두면 read_ 가 시각을 잘라 내므로 received_at 으로 둔다. */
const QUOTE_PHONE_HEAD = ['sno', 'source', 'company', 'name', 'phone', 'category', 'sales_rep', 'receiver', 'received_at', 'memo'];
function collectQuotePhone() {
  const sh = SpreadsheetApp.openById(PROPS.getProperty('QUOTE_SHEET_ID')).getSheetByName('전화문의');
  if (!sh) throw new Error("견적 시트에 '전화문의' 탭이 없습니다");
  const v = sh.getDataRange().getValues();
  const h = v.shift().map((x) => String(x).replace(/\s+/g, ''));
  const col = (name) => { const i = h.indexOf(name); if (i < 0) throw new Error('전화문의 탭에 ' + name + ' 열이 없습니다'); return i; };
  const c = { sno: col('번호'), source: col('경로'), company: col('고객사'), name: col('고객사담당'), phone: col('고객전화번호'),
    category: col('카테고리'), rep: col('연결영업대표'), receiver: col('전화수신자'), at: col('접수일시'), memo: col('메모') };
  // 시트는 값이 없으면 '-' 로 적는다
  const text = (x) => { const s = String(x == null ? '' : x).trim(); return s === '-' ? '' : s; };
  const rows = [QUOTE_PHONE_HEAD];
  v.forEach((r) => {
    const at = r[c.at] instanceof Date ? Utilities.formatDate(r[c.at], 'Asia/Seoul', 'yyyy-MM-dd HH:mm') : text(r[c.at]);
    if (!text(r[c.sno]) || !quoteMonth_(at)) return;
    rows.push([text(r[c.sno]), text(r[c.source]), text(r[c.company]), text(r[c.name]), phoneText_(r[c.phone]),
      text(r[c.category]), text(r[c.rep]), text(r[c.receiver]), at,
      text(r[c.memo])]);
  });
  put_(SpreadsheetApp.openById(CFG.SHEET_ID), 'quotes_phone', rows);
}
/* ── 건수 통계용 추가 견적 ──
 * 다른 사이트 견적과 전화문의를 건수 통계에 함께 세도록 quotes_stats_extra 에 쓴다. 공개 응답에 나가므로 고객 정보는 넣지 않는다.
 * CPA·견적전환율은 quotes_monthly(아이티켓) 기준이라 여기 값이 들어가지 않는다. */
const QUOTE_STATS_EXTRA_HEAD = ['date', 'origin', 'category', 'source', 'sales_rep'];
function collectQuoteStatsExtra() {
  const ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  const day = (x) => (x instanceof Date ? Utilities.formatDate(x, 'Asia/Seoul', 'yyyy-MM-dd') : String(x == null ? '' : x).trim().slice(0, 10));
  const rows = [QUOTE_STATS_EXTRA_HEAD];
  read_(ss, 'quotes_raw_sites').forEach((r) => {
    if (quoteMonth_(day(r.date))) rows.push([day(r.date), String(r.site), String(r.category || '기타'), String(r.source || '미수집'), String(r.sales_rep || '')]);
  });
  read_(ss, 'quotes_phone').forEach((r) => {
    if (quoteMonth_(day(r.received_at))) rows.push([day(r.received_at), 'phone', phoneCategory_(r.category, r.memo), String(r.source || '미수집'), String(r.sales_rep || '')]);
  });
  put_(ss, 'quotes_stats_extra', rows);
}
/** 전화문의 카테고리는 자유 입력이라 분류표로 맞춘다. 기타로 적힌 건은 그대로 두고, 비었거나 못 찾으면 메모로 한 번 더 찾는다 */
function phoneCategory_(category, memo) {
  const raw = String(category == null ? '' : category).trim();
  if (raw === '기타') return '기타';
  if (/^3dconn/i.test(raw)) return '3Dconnexion';
  if (/\bpc\b/i.test(raw)) return '데스크탑'; // "DELL PC" 가 브랜드 규칙에 먼저 걸려 서버로 가지 않게 한다
  const c = categoryFromText_(raw);
  return c !== '기타' ? c : categoryFromText_(memo);
}
/**
 * 숫자만 적힌 전화번호에 하이픈을 넣는다. "01027577817" 그대로 시트에 쓰면 숫자로 바뀌어 앞의 0 이 사라진다.
 * 숫자 칸은 이미 앞의 0 이 빠져 있어 되살린다. 그 밖의 표기는 원문 그대로 둔다.
 */
function phoneText_(x) {
  const s = typeof x === 'number' ? '0' + x : String(x == null ? '' : x).trim();
  if (s === '-') return '';
  if (!/^\d+$/.test(s)) return s;
  return /^02/.test(s) ? s.replace(/^(02)(\d{3,4})(\d{4})$/, '$1-$2-$3') : s.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
}

// source 는 집계용으로 정리한 값, source_raw 는 시트 원문 (예: "네이버(광고) - ROSEHA" — 어느 광고로 들어왔는지)
const QUOTE_RAW_HEAD = ['sno', 'subject', 'name', 'company', 'email', 'date', 'source', 'category', 'source_raw', 'sales_rep'];

/** 견적 시트 한 장을 읽어 데이터 행(v)과 열 위치(c)를 돌려준다 */
function readQuoteSheet_(id, tabName) {
  const src = SpreadsheetApp.openById(id);
  const sh = src.getSheetByName(tabName) || src.getSheets()[0];
  const v = sh.getDataRange().getValues();
  const h = v.shift().map((x) => String(x).replace(/\s+/g, ''));

  // 여러 컬럼명 후보 중 처음 존재하는 열 인덱스를 반환한다
  const findCol_ = (...names) => { for (const n of names) { const i = h.indexOf(n); if (i >= 0) return i; } return -1; };

  const c = {
    sub: findCol_('제목', '문의제목', '내용'),
    date: findCol_('접수날짜', '접수일', '작성일', '신청일', '주문일'),
    src: findCol_('유입경로', '유입채널', '방문경로', '채널'),
    sno: findCol_('번호', 'No', 'NO', '순번', '주문번호', 'sno'),
    name: findCol_('작성자', '이름', '신청자', '신청자명', '고객명', '주문자명', '주문자', '담당자'),
    company: findCol_('회사명', '업체명', '회사', '기업명', '기관명'),
    email: findCol_('이메일', 'email', 'Email', 'EMAIL'),
    rep: findCol_('영업담당', '영업담당자'), // 사내 담당자. 시트의 '담당자' 열은 고객 쪽 담당자라 별개
  };
  if (c.sub < 0 || c.date < 0) throw new Error('견적 시트에 제목·접수날짜 열이 없습니다');
  return { v, c };
}
function quoteSno_(r, c) {
  return c.sno >= 0 ? String(r[c.sno] || r[0] || '') : String(r[0] || '');
}
/** manual_categories 시트 → { 키: category } (키: 아이티켓은 sno, 다른 사이트는 "사이트:sno") */
function loadManualCategories_(ss) {
  const overrideMap = {};
  const shOv = ss.getSheetByName('manual_categories');
  if (shOv && shOv.getLastRow() >= 2) {
    const ov = shOv.getDataRange().getValues();
    const oh = ov.shift();
    const oiSno = oh.indexOf('sno'), oiCat = oh.indexOf('category');
    if (oiSno >= 0 && oiCat >= 0) {
      ov.forEach((r) => { if (r[oiSno] && r[oiCat]) overrideMap[String(r[oiSno])] = String(r[oiCat]); });
    }
  }
  return overrideMap;
}
/** 시트 한 행 → QUOTE_RAW_HEAD 순서의 배열. 접수날짜가 없으면 null */
function quoteRawRow_(r, c, sno, manualCategory, siteCategory) {
  const d = r[c.date];
  // 글자로 들어간 날짜 중 "2026. 11. 10 오전 9:28:55" 처럼 시트 표시 형식인 것은 "2026-11-10" 으로 맞춘다
  const raw = String(d || '').trim();
  const dateStr = d instanceof Date ? Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd') : /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw : quoteDayText_(raw) || raw;
  if (!dateStr || !quoteMonth_(r[c.date])) return null;
  return [
    sno,
    c.sub < 0 ? '' : String(r[c.sub] || ''),
    c.name < 0 ? '' : String(r[c.name] || ''),
    c.company < 0 ? '' : String(r[c.company] || ''),
    c.email < 0 ? '' : String(r[c.email] || ''),
    dateStr,
    c.src < 0 ? '미수집' : quoteSource_(r[c.src]),
    currentCategory_(manualCategory) || siteCategory || quoteCategory_(r[c.sub], c.src < 0 ? '' : r[c.src]),
    c.src < 0 ? '' : String(r[c.src] || '').trim(),
    c.rep < 0 ? '' : String(r[c.rep] || '').trim(),
  ];
}
/** 접수날짜(날짜 또는 "2026-10-12 9:30:00"·"2026. 11. 10 오전 9:28:55" 글자) → "2026-10" */
function quoteMonth_(d) {
  if (d instanceof Date) return Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM');
  // 시트가 날짜로 바꾸지 못한 글자는 점·하이픈 뒤에 띄어쓰기가 있을 수 있다
  const m = String(d || '').match(/^(\d{4})\s*[-./]\s*(\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) : '';
}
/** 글자 날짜("2026. 11. 10 오전 9:28:55"·"2026.11.10" 등) → "2026-11-10". 읽지 못하면 '' */
function quoteDayText_(s) {
  const m = String(s || '').match(/^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
}
/**
 * 견적 제목 → 분류표 카테고리. 제목이 "견적 요청"처럼 제품 정보가 없으면
 * 유입경로 원문의 광고 이름(예: "네이버(광고) - ROSEHA")으로 한 번 더 찾는다. 그래도 없으면 '기타'.
 */
function quoteCategory_(subject, sourceRaw) {
  const bySubject = categoryFromText_(subject);
  if (bySubject !== '기타') return bySubject;
  const m = String(sourceRaw || '').match(/\s-\s(.+)$/);
  return m ? categoryFromText_(m[1]) : '기타';
}

/** 수동 지정·쇼핑몰이 보낸 카테고리가 옛 7분류면 쓰지 않고 다시 분류한다 */
function currentCategory_(cat) {
  const c = String(cat || '').trim();
  return c && LEGACY_CATS_.indexOf(c) < 0 ? c : '';
}

/** (개편 전 규칙 — 참고용으로만 남김, 쓰지 않음) */
function legacyQuoteCategory_(subject) {
  const t = String(subject || '').toLowerCase();
  const has = (re) => re.test(t);
  if (has(/스토리지|storage|\bnas\b|\bsan\b|백업|netapp|synology|qnap/)) return '스토리지';
  if (has(/서버|server|poweredge|proliant|\bdl\d|\bml\d|랙|rack/) && !has(/zbook/)) return '서버';
  if (has(/워크스테이션|workstation|z by hp|zbyhp|zbook|\bz[2-9]\b|딥러닝|머신러닝|gpu/)) return '워크스테이션';
  if (has(/모니터|monitor|사이니지|전자칠판/)) return '모니터';
  if (has(/노트북|laptop|엘리트북|프로북|파빌리온|서피스|surface/)) return '노트북';
  if (has(/데스크탑|데스크톱|desktop|\bpc\b|올인원|엘리트데스크|프로데스크|본체/)) return 'PC';
  return '기타';
}
/** 유입 경로 열 → 세분화 매체. 비어 있으면(수집 전) '미수집'. */
function quoteSource_(raw) {
  const t = String(raw == null ? '' : raw).trim();
  const tl = t.toLowerCase();
  if (!tl || t === '미수집') return '미수집'; // zbyhp 시트는 경로 칸에 '미수집'을 글자로 적어 둔다

  // ── Naver ──
  if (/naver|네이버/.test(tl)) {
    if (/blog|블로그/.test(tl))                          return '네이버(블로그)';
    if (/cafe|카페/.test(tl))                            return '네이버(카페)';
    if (/shop|쇼핑/.test(tl))                            return '네이버(쇼핑)';
    if (/cpc|파워링크|검색광고|\bsa\b|paid|\(광고\)/.test(tl)) return '네이버(광고)';
    return '네이버(검색)'; // 일반 '네이버' 또는 키워드 유입 → 자연검색 기본값
  }

  // ── Google ──
  if (/google|구글|gclid/.test(tl)) {
    if (/display|da\b|gdn|배너/.test(tl))                return '구글(디스플레이)';
    if (/youtube|유튜브/.test(tl))                        return '구글(유튜브)';
    if (/cpc|광고|paid|ads|gclid/.test(tl))              return '구글(광고)';
    return '구글(검색)'; // 구분 불가 → 검색(자연) 기본값
  }

  // ── Meta ──
  if (/meta|facebook|instagram|페이스북|인스타/.test(tl)) return 'Meta';

  // ── 기타 ──
  if (/kakao|카카오/.test(tl))  return '카카오';
  if (/youtube|유튜브/.test(tl)) return '유튜브';
  if (/blog|블로그/.test(tl))   return '블로그·커뮤니티';
  if (/direct|직접/.test(tl))   return '직접';

  return '기타';
}

/* ── 대시보드용 웹앱 ── */
function doGet(e) {
  const token = PROPS.getProperty('API_TOKEN');
  if (!token || !e || !e.parameter || e.parameter.key !== token) return json_({ error: 'unauthorized' });
  const ss = SpreadsheetApp.openById(CFG.SHEET_ID), out = { served: Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm') };
  if (e.parameter.daily) return json_(dailyHistResponse_(ss, e.parameter.daily, out));
  const isAdmin = isAdminToken_(ss, e.parameter.access_token);
  out.daily_hist_months = { Google: dailyHistMonths_(ss, CFG.DAILY_HIST.google), Naver: dailyHistMonths_(ss, CFG.DAILY_HIST.naver) };
  CFG.SHEETS.forEach((n) => { if (isAdmin || !CFG.ADMIN_ONLY_SHEETS.includes(n)) out[n] = sheetRowsCached_(ss, n); });
  if (!isAdmin) {
    // 공개 화면은 고객 이름·회사·이메일과 저장한 관리자 계정을 쓰지 않는다
    out.quotes_raw = (out.quotes_raw || []).map(({ name, company, email, ...rest }) => rest);
    out.manual_categories = (out.manual_categories || []).map(({ updated_by, ...rest }) => rest);
  }
  return json_(out);
}

/**
 * Supabase 로그인 토큰이 유효하고 그 계정이 데이터 시트 admins 탭(A열 이메일)에 있으면 true.
 * 회원가입이 열려 있어도 탭에 없는 계정은 관리자가 아니다. 탭이 없거나 확인에 실패하면 false 다.
 */
function isAdminToken_(ss, accessToken) {
  if (!accessToken) return false;
  const shAdmins = ss.getSheetByName('admins');
  if (!shAdmins) return false;
  const admins = shAdmins.getDataRange().getValues().map((r) => String(r[0]).trim().toLowerCase()).filter(Boolean);
  try {
    const res = UrlFetchApp.fetch(CFG.SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + accessToken },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) return false;
    return admins.includes(String(JSON.parse(res.getContentText()).email || '').trim().toLowerCase());
  } catch (err) {
    console.error('관리자 확인 실패: ' + err.message);
    return false;
  }
}

/* ── 견적 실시간 웹훅 수신 ──
 * 캐드코리아·ZbyHP·온코어 등 쇼핑몰에서 고객이 견적 제출 시 호출하여 구글 시트에 실시간 적재.
 * 엑셀 수동 다운로드/업로드가 필요 없다.
 * POST body (JSON): { key: "API_TOKEN", site: "cadkorea", date: "2026-10-15 14:00", subject: "...", source: "Naver" } */
/**
 * 주문번호별 유입 경로 → order_inflow. 공개 화면에서 오므로 형식만 검사하고, 집계할 때 실제 주문과 맞춰 본다.
 * 수집 잠금을 기다리다 주문을 놓치지 않게 잠금 없이 appendRow 로 쓴다 (겹쳐 들어온 줄은 집계할 때 하나로 친다).
 */
function saveOrderInflow_(data) {
  const no = String(data.orderNo || '').trim();
  if (!/^\d{10,20}$/.test(no)) return { error: 'bad_order_no' };
  const inflow = String(data.inflow || '').replace(/[\r\n\t]/g, ' ').slice(0, 100) || '직접 방문';
  const ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  let sh = ss.getSheetByName('order_inflow');
  if (!sh) {
    sh = ss.insertSheet('order_inflow');
    sh.getRange('A:E').setNumberFormat('@'); // 긴 주문번호가 숫자로 뭉개지지 않게, 수식으로도 해석되지 않게 글자로 둔다
    sh.appendRow(['order_no', 'inflow', 'recorded_at', 'client_id', 'session_id']);
  } else if (sh.getLastColumn() < 5) {
    sh.getRange('D:E').setNumberFormat('@');
    sh.getRange(1, 4, 1, 2).setValues([['client_id', 'session_id']]);
  }
  const last = sh.getLastRow();
  if (last >= 20000) return { error: 'full' };
  if (last > 1 && sh.getRange(2, 1, last - 1, 1).createTextFinder(no).matchEntireCell(true).findNext()) return { success: true, duplicate: true };
  // GA4 식별값은 형식이 맞을 때만 저장한다 (공개 화면에서 온 값)
  const clientId = /^\d{1,20}\.\d{1,20}$/.test(String(data.clientId || '')) ? String(data.clientId) : '';
  const sessionId = /^\d{1,20}$/.test(String(data.sessionId || '')) ? String(data.sessionId) : '';
  sh.appendRow([no, inflow, new Date().toISOString(), clientId, sessionId]);
  return { success: true };
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw) return json_({ error: 'empty_body' });
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // 쇼핑몰 주문 완료 화면이 보내는 유입 경로 — 공개 화면이라 키가 없다. 주문번호·경로만 받는다
    if (data.action === 'orderInflow') return json_(saveOrderInflow_(data));
    const token = PROPS.getProperty('API_TOKEN');
    if (!token || data.key !== token) return json_({ error: 'unauthorized' });

    const ss = SpreadsheetApp.openById(CFG.SHEET_ID);

    // [A] GFA 백그라운드 무인 스케줄러(Playwright) 데이터 수신
    if (data.action === 'syncGfa' && Array.isArray(data.rows)) {
      const head = ['month', 'type', 'campaign', 'campaign_tp', 'ad_group', 'ad_group_id', 'cost', 'impressions', 'clicks', 'conversions'];
      const old = read_(ss, 'n_adgroup_monthly');
      const newKeys = new Set(data.rows.map((r) => [r.month, r.campaign, r.ad_group].join('\u0001')));
      const keep = old.filter((r) => r.type === 'SA' || !newKeys.has([r.month, r.campaign, r.ad_group].join('\u0001'))).map((r) => head.map((h) => r[h]));
      const toAdd = data.rows.map((r) => [r.month, 'DA', r.campaign, 'GFA', r.ad_group, '', Number(r.cost) || 0, Number(r.impressions) || 0, Number(r.clicks) || 0, Number(r.conversions) || 0]);
      put_(ss, 'n_adgroup_monthly', [head].concat(keep.concat(toAdd).sort((a, b) => String(a[0]).localeCompare(String(b[0])))));
      syncMapping_(ss);
      return json_({ success: true, type: 'GFA', added: toAdd.length });
    }

    // [A-2] 구글 광고 월별 실적 수신
    if (data.action === 'syncGoogleMonthly' && Array.isArray(data.rows)) {
      saveGoogleMonthlyRows_(ss, data.rows);
      return json_({ success: true, type: 'GoogleMonthly', added: data.rows.length });
    }

    // [A-3] 구글 광고 키워드 실적 수신
    if (data.action === 'syncGoogleKeywords' && Array.isArray(data.rows)) {
      saveGoogleKeywordRows_(ss, data.rows);
      return json_({ success: true, type: 'GoogleKeywords', added: data.rows.length });
    }

    // [C] MDF / 수동 데이터 시트 업로드 수신
    if (data.action === 'uploadManual' && Array.isArray(data.rows)) {
      const head = ['month', 'item', 'amount', 'memo'];
      const old = read_(ss, 'manual');
      const targetItem = String(data.item || 'MDF').toUpperCase();
      const newMonths = new Set(data.rows.map((r) => String(r.month).slice(0, 7)));
      const keep = old.filter((r) => String(r.item).toUpperCase() !== targetItem || !newMonths.has(String(r.month).slice(0, 7))).map((r) => head.map((h) => r[h]));
      const toAdd = data.rows.map((r) => [String(r.month).slice(0, 7), targetItem, Number(r.amount) || 0, String(r.memo || '')]);
      put_(ss, 'manual', [head].concat(keep.concat(toAdd).sort((a, b) => String(a[0]).localeCompare(String(b[0])))));
      return json_({ success: true, item: targetItem, updated: toAdd.length });
    }

    // [D] 네이버 커머스(스마트스토어) API 즉시 동기화 호출
    if (data.action === 'syncCommerce') {
      const res = collectCommerce();
      return json_({ success: true, result: res });
    }

    // [E] 전체 매체(네이버·구글·견적·GFA·커머스) 즉시 동기화 호출
    if (data.action === 'syncAll') {
      syncAll();
      return json_({ success: true, message: 'All channels synced simultaneously' });
    }

    // [F] 어드민 카테고리 수동 지정 저장 (sno 기준 upsert)
    // body: { key, action: 'saveManualCategories', overrides: [{sno, category}, ...], by: '저장한 관리자' }
    if (data.action === 'saveManualCategories' && Array.isArray(data.overrides)) {
      const ss2 = SpreadsheetApp.openById(CFG.SHEET_ID);
      let shOv = ss2.getSheetByName('manual_categories');
      if (!shOv) {
        shOv = ss2.insertSheet('manual_categories');
        shOv.appendRow(['sno', 'category', 'updated_at', 'updated_by']);
      }
      // 예전 시트에는 저장한 사람 열이 없다 — 맨 뒤에 붙인다 (어드민 화면의 '수동 지정' 흔적에 쓴다)
      if (shOv.getRange(1, 1, 1, shOv.getLastColumn()).getValues()[0].indexOf('updated_by') < 0) {
        shOv.getRange(1, shOv.getLastColumn() + 1).setValue('updated_by');
      }
      const by = String(data.by || '').slice(0, 100);
      const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
      const ov = shOv.getDataRange().getValues();
      const oh = ov[0];
      const oiSno = oh.indexOf('sno'), oiCat = oh.indexOf('category'), oiAt = oh.indexOf('updated_at'), oiBy = oh.indexOf('updated_by');
      // sno → 1-indexed sheet row
      const rowIndex = {};
      for (let i = 1; i < ov.length; i++) rowIndex[String(ov[i][oiSno])] = i + 1;
      data.overrides.forEach(({ sno, category }) => {
        const s = String(sno);
        if (rowIndex[s]) {
          shOv.getRange(rowIndex[s], oiCat + 1).setValue(category);
          shOv.getRange(rowIndex[s], oiAt + 1).setValue(now);
          shOv.getRange(rowIndex[s], oiBy + 1).setValue(by);
        } else {
          const row = [];
          row[oiSno] = s; row[oiCat] = category; row[oiAt] = now; row[oiBy] = by;
          shOv.appendRow(Array.from(row, (v) => (v == null ? '' : v)));
        }
      });
      // 저장은 이미 끝났으므로 다시 수집이 실패해도 성공으로 답하고, 다음 정기 수집에 맡긴다
      let recalculated = true;
      try {
        recollectManual_(data.overrides);
      } catch (err) {
        recalculated = false;
        console.error('수동 지정 저장 후 다시 수집 실패: ' + err.message);
      }
      return json_({ success: true, saved: data.overrides.length, recalculated });
    }

    // [B] 쇼핑몰 실시간 견적 접수 수신
    const dateStr = data.date || Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    const mo = quoteMonth_(dateStr);
    const site = String(data.site || '기타');
    const subj = String(data.subject || data.title || '');
    const siteConf = CFG.QUOTE_SITES.find((s) => s.id === site);
    const cat = (siteConf && siteConf.category) || currentCategory_(data.category) || quoteCategory_(subj, data.source || data.referrer || '');
    const src = quoteSource_(data.source || data.referrer || '');

    // 1. quotes_raw (원장) 시트에 1행 누적
    let shRaw = ss.getSheetByName('quotes_raw');
    if (!shRaw) {
      shRaw = ss.insertSheet('quotes_raw');
      shRaw.appendRow(['date', 'site', 'subject', 'category', 'source', 'created_at']);
    }
    shRaw.appendRow([dateStr, site, subj, cat, src, Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss')]);

    // 2. quotes_monthly 집계 시트 실시간 반영
    let shMo = ss.getSheetByName('quotes_monthly');
    if (shMo && shMo.getLastRow() >= 2) {
      const v = shMo.getDataRange().getValues();
      const h = v.shift();
      const iMo = h.indexOf('month'), iCat = h.indexOf('category'), iSrc = h.indexOf('source'), iCnt = h.indexOf('count');
      let found = false;
      for (let i = 0; i < v.length; i++) {
        if (v[i][iMo] === mo && v[i][iCat] === cat && v[i][iSrc] === src) {
          v[i][iCnt] = (Number(v[i][iCnt]) || 0) + 1;
          found = true;
          break;
        }
      }
      if (!found) v.push([mo, cat, src, 1]);
      put_(ss, 'quotes_monthly', [h].concat(v.sort((a, b) => String(a[0]).localeCompare(String(b[0])))));
    } else {
      put_(ss, 'quotes_monthly', [['month', 'category', 'source', 'count'], [mo, cat, src, 1]]);
    }

    return json_({ success: true, month: mo, category: cat, source: src });
  } catch (err) {
    return json_({ error: err.message });
  }
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ── 네이버 커머스(스마트스토어) API 수집 ── */
function collectCommerce() {
  const clientId = PROPS.getProperty('COMMERCE_CLIENT_ID');
  const clientSecret = PROPS.getProperty('COMMERCE_CLIENT_SECRET');
  const tokenProp = PROPS.getProperty('COMMERCE_API_TOKEN');
  if (!tokenProp && (!clientId || !clientSecret)) {
    console.log('네이버 커머스 API 설정 누락 (COMMERCE_CLIENT_ID 또는 COMMERCE_API_TOKEN 필요)');
    return { skipped: true, reason: 'missing_credentials' };
  }

  const ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  let token = tokenProp;
  if (!token && clientId && clientSecret) {
    token = getCommerceToken_(clientId, clientSecret);
  }
  if (!token) return { error: 'failed_to_get_token' };

  const thisM = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM');
  const prevM = addMonth_(thisM, -1);
  const months = [prevM, thisM];
  const results = [];

  for (const m of months) {
    const startDate = `${m}-01`;
    const endDate = lastDay_(m);
    try {
      // 스마트스토어 정산/프로모션/수수료 내역 조회
      const res = UrlFetchApp.fetch(`https://api.commerce.naver.com/external/v1/settlement/daily?startDate=${startDate}&endDate=${endDate}`, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token },
        muteHttpExceptions: true
      });
      let totalStoreCost = 0;
      if (res.getResponseCode() === 200) {
        const json = JSON.parse(res.getContentText());
        (json.data || []).forEach((row) => {
          totalStoreCost += Math.abs(Number(row.promotionAmount) || 0) + Math.abs(Number(row.commissionAmount) || 0);
        });
      }
      results.push({ month: m, amount: totalStoreCost });
    } catch (e) {
      console.warn(`[스마트스토어 API] ${m} 수집 오류:`, e);
    }
  }

  if (results.length) {
    const head = ['month', 'item', 'amount', 'memo'];
    const old = read_(ss, 'manual');
    const updatedMonths = new Set(results.map((r) => r.month));
    const keep = old.filter((r) => String(r.item).toUpperCase() !== 'STORE' || !updatedMonths.has(r.month)).map((r) => head.map((h) => r[h]));
    const toAdd = results.map((r) => [r.month, 'STORE', r.amount, '네이버 커머스 API 자동 수집']);
    put_(ss, 'manual', [head].concat(keep.concat(toAdd).sort((a, b) => String(a[0]).localeCompare(String(b[0])))));
  }
  return { success: true, count: results.length };
}

/** 네이버 커머스 API 토큰 발급 도우미 */
function getCommerceToken_(clientId, clientSecret) {
  const ts = Date.now();
  const sign = Utilities.base64Encode(Utilities.computeHmacSha256Signature(clientId + '_' + ts, clientSecret));
  const res = UrlFetchApp.fetch('https://api.commerce.naver.com/external/v1/oauth2/token', {
    method: 'POST',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      client_id: clientId,
      timestamp: ts,
      client_secret_sign: sign,
      grant_type: 'client_credentials',
      type: 'SELF'
    },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) {
    console.error('커머스 토큰 발급 실패:', res.getContentText());
    return '';
  }
  const data = JSON.parse(res.getContentText());
  return data.access_token || '';
}

/* ── 네이버 API ── */
let apiCalls_ = 0; // 이번 실행의 네이버 API 호출 수 (한도 점검용)
let apiDay_ = null, apiBase_ = 0, apiSaved_ = 0; // 오늘(KST) 앞선 실행들이 쓴 호출 수 — 스크립트 속성 NAVER_CALLS_DAY · NAVER_CALLS
function apiCap_() { return Number(PROPS.getProperty('NAVER_DAILY_CAP')) || CFG.NAVER_DAILY_CAP; }
function apiLeft_() {
  if (apiDay_ === null) {
    apiDay_ = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    apiBase_ = PROPS.getProperty('NAVER_CALLS_DAY') === apiDay_ ? Number(PROPS.getProperty('NAVER_CALLS')) || 0 : 0;
  }
  return apiCap_() - apiBase_ - apiCalls_;
}
function saveApiCount_() {
  if (apiDay_ === null || apiCalls_ === apiSaved_) return;
  PROPS.setProperties({ NAVER_CALLS_DAY: apiDay_, NAVER_CALLS: String(apiBase_ + apiCalls_) });
  apiSaved_ = apiCalls_;
}
/** 수집 실패를 기록하고, 계정 UrlFetch 한도 소진이면 하루 한 번 메일로 알린다. */
function fail_(name, e) {
  console.error(name + ': ' + e.message + ' (API ' + apiCalls_ + '회)');
  if (/urlfetch|너무 많이 호출|too many times/i.test(e.message)) {
    notifyOnce_('quota', '구글 계정의 UrlFetch 하루 한도(2만 회)가 소진됐습니다. 같은 계정의 견적문의(팀즈)·상담접수 시트 연동도 멈춰 있을 수 있습니다.\n'
      + 'Apps Script → 내 실행 에서 오래 걸린 실행을 찾아 원인을 확인하세요. 한도는 하루 안에 다시 채워집니다.\n\n' + name + ': ' + e.message);
  }
}
/** 같은 종류(kind)의 알림은 하루(KST) 한 번만 보낸다. Gmail 수집 때문에 이미 있는 Gmail 권한으로 보낸다(새 권한 승인 불필요). */
function notifyOnce_(kind, msg) {
  const day = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'), key = 'NOTIFY_' + kind.toUpperCase();
  if (PROPS.getProperty(key) === day) return;
  try {
    GmailApp.sendEmail(Session.getEffectiveUser().getEmail(), '[its-ad-insight 수집기] ' + (kind === 'cap' ? '네이버 API 하루 상한 도달' : 'UrlFetch 하루 한도 소진'), msg);
    PROPS.setProperty(key, day);
  } catch (err) { console.error('알림 메일 실패: ' + err.message); }
}
function api_(method, path, query) {
  if (apiLeft_() <= 0) throw new Error('네이버 API 하루 상한(' + apiCap_() + '회)에 도달해 멈춤');
  apiCalls_++;
  if (apiCalls_ % 50 === 0) saveApiCount_(); // 6분 강제 종료돼도 센 수가 크게 사라지지 않게
  const ts = String(Date.now());
  const sig = Utilities.base64Encode(Utilities.computeHmacSha256Signature(ts + '.' + method + '.' + path, PROPS.getProperty('NAVER_SECRET')));
  // 배열은 ids=a&ids=b 처럼 같은 이름을 반복해 보낸다 (네이버 공식 예제 방식)
  const qs = query ? '?' + Object.keys(query).flatMap((k) => [].concat(query[k]).map((v) => k + '=' + encodeURIComponent(v))).join('&') : '';
  const res = UrlFetchApp.fetch(CFG.BASE + path + qs, {
    method, muteHttpExceptions: true,
    headers: { 'X-Timestamp': ts, 'X-API-KEY': PROPS.getProperty('NAVER_API_KEY'), 'X-Customer': PROPS.getProperty('NAVER_CUSTOMER_ID'), 'X-Signature': sig },
  });
  if (res.getResponseCode() >= 300) throw new Error('네이버 API ' + path + ' ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  Utilities.sleep(80);
  return JSON.parse(res.getContentText());
}
/** chunk: 한 번에 묻는 ID 수 — ID 가 긴 소재(nad-…)는 50개면 요청 주소가 UrlFetch 길이 한도를 넘어 줄여 묻는다 */
function stats_(ids, since, until, chunk) {
  const out = [], n = chunk || CFG.CHUNK;
  for (let i = 0; i < ids.length; i += n) {
    const r = api_('GET', '/stats', { ids: ids.slice(i, i + n), fields: STAT_FIELDS, timeRange: JSON.stringify({ since, until }) });
    (r.data || []).forEach((d) => out.push(d));
  }
  return out;
}

/* ── 시트·날짜 도우미 ── */
function formatCellDate_(d, colKey) {
  if (!(d instanceof Date)) return d;
  if (colKey === 'month') return Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM');
  if (colKey === 'date') return Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd');
  const full = Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
  return full.endsWith(' 00:00') ? full.slice(0, 10) : full;
}
/* ── 대시보드 응답 캐시 ──
 * doGet 은 시트 20여 개(키워드만 4만 행)를 요청마다 통째로 읽어 22~29초가 걸렸다.
 * 시트별로 gzip+base64 해서 CacheService 에 담아 두고(조각당 90KB 이하), 시트를 put_ 으로 다시 쓰면 버전을 올려 무효화한다.
 * syncAll 이 끝날 때마다 데워 두므로 방문자는 대부분 캐시를 맞는다. 캐시 오류는 모두 삼키고 시트를 직접 읽는다. */
const API_CACHE_TTL_SEC = 20 * 60;
function sheetRowsCached_(ss, name) {
  const cache = CacheService.getScriptCache();
  const base = 'api:' + (PROPS.getProperty('API_CACHE_V') || '0') + ':' + name;
  try {
    const n = Number(cache.get(base + ':n'));
    if (n) {
      const got = cache.getAll(Array.from({ length: n }, (_, i) => base + ':' + i));
      let b64 = '';
      for (let i = 0; i < n; i++) { const part = got[base + ':' + i]; if (part == null) { b64 = ''; break; } b64 += part; }
      if (b64) return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip')).getDataAsString());
    }
  } catch (err) { console.warn('캐시 읽기 실패(' + name + '): ' + err.message); }
  const rows = read_(ss, name);
  try {
    const b64 = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(rows), 'application/json')).getBytes());
    const CHUNK = 90000, n = Math.max(1, Math.ceil(b64.length / CHUNK)), put = {};
    for (let i = 0; i < n; i++) put[base + ':' + i] = b64.slice(i * CHUNK, (i + 1) * CHUNK);
    put[base + ':n'] = String(n);
    cache.putAll(put, API_CACHE_TTL_SEC);
  } catch (err) { console.warn('캐시 저장 실패(' + name + '): ' + err.message); }
  return rows;
}
/** 시트를 새로 썼을 때 호출 — 이전 캐시 키는 쓰이지 않고 TTL 로 사라진다 */
function bumpApiCache_() { PROPS.setProperty('API_CACHE_V', String(Date.now())); }
/** 수집이 끝난 직후 호출 — 첫 방문자가 느린 시트 읽기를 맞지 않게 미리 채운다 */
function warmApiCache_() {
  try { const ss = SpreadsheetApp.openById(CFG.SHEET_ID); CFG.SHEETS.forEach((n) => sheetRowsCached_(ss, n)); } catch (err) { console.warn('캐시 예열 실패: ' + err.message); }
}
function read_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getDataRange().getValues(), h = v.shift();
  return v.filter((r) => r[0] !== '').map((r) => Object.fromEntries(h.map((k, i) => [k, formatCellDate_(r[i], k)])));
}
/** 시트를 통째로 다시 쓴다. 1열(월 등)과 *_meta 의 2열(타임스탬프)은 날짜로 바뀌지 않게 글자 형식으로 둔다. */
function put_(ss, name, rows) {
  bumpApiCache_();
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  const textCols = /_meta$/.test(name) && rows[0] && rows[0].length >= 2 ? 2 : 1;
  sh.getRange(1, 1, Math.max(rows.length, 1), textCols).setNumberFormat('@');
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}
function addMonth_(m, n) { const [y, mo] = m.split('-').map(Number); return Utilities.formatDate(new Date(Date.UTC(y, mo - 1 + n, 1)), 'UTC', 'yyyy-MM'); }
function lastDay_(m) { const [y, mo] = m.split('-').map(Number); return Utilities.formatDate(new Date(Date.UTC(y, mo, 0)), 'UTC', 'yyyy-MM-dd'); }

// 네이버 검색광고 이미지는 imagePath 로 경로만 내려올 수 있어 이 주소를 앞에 붙인다
const NAVER_IMG_HOST = 'https://searchad-phinf.pstatic.net';
// 소재 이미지로 쓸 확장소재 종류 — 파워링크 이미지·이미지형 서브링크만 (블로그 리뷰·플레이스 사진 등은 소재 이미지가 아니다)
const EXT_IMAGE_TYPES = ['POWER_LINK_IMAGE', 'IMAGE_SUB_LINKS'];

/** API 명세상 ad·adExtension 은 JSON 문자열일 수 있다 — 문자열이면 풀어서 돌려준다 */
function parseJson_(v) {
  if (typeof v !== 'string' || !/^\s*[{[]/.test(v)) return v;
  try { return JSON.parse(v); } catch (_) { return v; }
}

// 소재 하나에 저장할 이미지 최대 장수 (시트 칸 길이·화면 펼침 크기 제한)
const MAX_AD_IMAGES = 10;

/**
 * 소재의 제목·설명을 모두 모은다.
 * 일반 텍스트 소재는 ad.headline·ad.description 한 쌍, 반응형(RSA_AD)은 assets 에 제목(최대 15)·설명(최대 4)이 여러 개 들어 있다.
 * 자산 종류는 linkType(HEADLINE·DESCRIPTION 등)으로 가르고, 종류가 없으면 길이로 가른다 (제목 15자 이하).
 */
function adTexts_(a, ad) {
  const titles = [], descs = [];
  const add = (list, t) => {
    t = String(t || '').trim();
    if (t && !list.includes(t)) list.push(t);
  };
  add(titles, ad.headline);
  add(descs, ad.description);
  (a.assets || []).forEach((as) => {
    const d = parseJson_(as.assetData) || {};
    const text = d.text || as.text;
    const kind = String(as.linkType || as.assetType || as.type || '').toUpperCase();
    if (/DESC/.test(kind)) add(descs, text);
    else if (/HEAD|TITLE/.test(kind)) add(titles, text);
    else if (text) add(String(text).trim().length > 15 ? descs : titles, text);
  });
  return { titles: titles.slice(0, 15), descs: descs.slice(0, 4) };
}

/** 네이버 확장소재(ad-extension) 중 이미지형에서만 이미지 URL 추출 (첫 장) */
function extractExtImage_(ext) {
  return extractExtImages_(ext)[0] || '';
}

/** 네이버 확장소재(ad-extension) 중 이미지형에서 이미지 URL 모두 추출 — 이미지형 서브링크는 여러 장이다 */
function extractExtImages_(ext) {
  if (!ext || !EXT_IMAGE_TYPES.includes(ext.type) || ext.status === 'DELETED' || ext.inspectStatus === 'DENIED') return [];
  return findAllUrlsInObj_(parseJson_(ext.adExtension));
}

/** 소재 객체 내 이미지 URL 모두 추출 */
function extractAdImages_(ad) {
  ad = parseJson_(ad);
  if (!ad || typeof ad !== 'object') return [];
  const one = imageUrlOf_(ad.imagePath);
  return [...new Set(findAllUrlsInObj_(ad.image).concat(findAllUrlsInObj_(ad.images), one ? [one] : []))];
}

/**
 * findUrlInObj_ 와 같은 규칙으로 이미지 URL 을 모두 모은다.
 * 이미지 주소 문자열 키를 가진 객체는 이미지 1장으로 본다 (같은 이미지의 원본·썸네일 주소가 둘 다 잡히지 않게).
 */
function findAllUrlsInObj_(o, out) {
  out = out || [];
  const add = (u) => { if (u && !out.includes(u)) out.push(u); };
  if (!o) return out;
  if (typeof o === 'string') {
    add(imageUrlOf_(o, false));
    return out;
  }
  if (Array.isArray(o)) {
    o.forEach((item) => findAllUrlsInObj_(item, out));
    return out;
  }
  if (typeof o === 'object') {
    const one = ['imagePath', 'imgPath', 'thumbnailPath'].map((k) => imageUrlOf_(o[k])).find(Boolean)
      || ['imageUrl', 'imgUrl', 'image', 'fullSizeUrl', 'thumbnailUrl', 'mediaUrl', 'url'].map((k) => imageUrlOf_(o[k], false)).find(Boolean);
    if (one) {
      add(one);
      return out;
    }
    Object.keys(o).forEach((k) => {
      if (typeof o[k] === 'object') findAllUrlsInObj_(o[k], out);
    });
  }
  return out;
}

/** 이미지 주소 문자열만 인정한다: http(s) 이미지 주소, 또는 네이버 이미지 경로(/...)는 NAVER_IMG_HOST 를 붙인다 */
function imageUrlOf_(v, isPath) {
  if (typeof v !== 'string' || !v.trim()) return '';
  const s = v.trim();
  if (/^https?:\/\//i.test(s)) return /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(s) || /(^|\.)pstatic\.net\//i.test(s.replace(/^https?:\/\//i, '')) ? s : '';
  if (isPath !== false && /^\/[^\s/][^\s]*$/.test(s)) return NAVER_IMG_HOST + s;
  return '';
}

/** 객체나 배열 내에서 이미지 URL을 재귀 탐색 (imagePath 등 경로 키는 네이버 이미지 서버 주소로 바꾼다) */
function findUrlInObj_(o) {
  if (!o) return '';
  if (typeof o === 'string') return imageUrlOf_(o, false);
  if (Array.isArray(o)) {
    for (const item of o) {
      const u = findUrlInObj_(item);
      if (u) return u;
    }
    return '';
  }
  if (typeof o === 'object') {
    for (const k of ['imagePath', 'imgPath', 'thumbnailPath']) {
      const u = imageUrlOf_(o[k]);
      if (u) return u;
    }
    for (const k of ['imageUrl', 'imgUrl', 'image', 'fullSizeUrl', 'thumbnailUrl', 'mediaUrl', 'url']) {
      const u = typeof o[k] === 'string' ? imageUrlOf_(o[k], false) : findUrlInObj_(o[k]);
      if (u) return u;
    }
    for (const k of Object.keys(o)) {
      if (typeof o[k] === 'object') {
        const u = findUrlInObj_(o[k]);
        if (u) return u;
      }
    }
  }
  return '';
}

/**
 * 점검용 (편집기에서 직접 실행): 광고그룹·캠페인에 걸린 확장소재의 종류와 원본 adExtension 을 로그로 찍고,
 * 이미지 추출 결과를 함께 보여 준다. API 호출은 캠페인 수 + 광고그룹 최대 20개 정도.
 */
function debugNaverAdExtensions() {
  checkNaverKeys_();
  const owners = api_('GET', '/ncc/campaigns').map((c) => ({ id: c.nccCampaignId, name: '캠페인 ' + c.name }));
  read_(SpreadsheetApp.openById(CFG.SHEET_ID), 'n_idx_groups').slice(0, 20).forEach((g) => owners.push({ id: String(g.id), name: '그룹 ' + g.campaign + ' › ' + g.name }));
  const byType = {};
  owners.forEach((o) => {
    (api_('GET', '/ncc/ad-extensions', { ownerId: o.id }) || []).forEach((ex) => {
      byType[ex.type] = (byType[ex.type] || 0) + 1;
      if (EXT_IMAGE_TYPES.includes(ex.type) || /IMAGE/.test(ex.type)) {
        console.log(o.name + ' | ' + ex.type + ' | 상태 ' + ex.status + '/' + ex.inspectStatus + ' | adExtension 형식 ' + typeof ex.adExtension
          + '\n  원본: ' + String(typeof ex.adExtension === 'string' ? ex.adExtension : JSON.stringify(ex.adExtension)).slice(0, 600)
          + '\n  추출: ' + (extractExtImage_(ex) || '(없음)'));
      }
    });
  });
  console.log('확장소재 종류별 개수: ' + JSON.stringify(byType));
  saveApiCount_();
}

/* ── 고도몰 주문 (구매 상세) ──
 * 주문번호·입금일자·상태만 읽고 고객 정보는 쓰지 않는다. 키는 스크립트 속성 GODO_PARTNER_KEY · GODO_USER_KEY. */
function godoOrders_(start, end) {
  const clean = (name) => String(PROPS.getProperty(name) || '').replace(/\s/g, ''); // 복사할 때 끼어든 공백은 키에 포함되지 않는다
  const partner = clean('GODO_PARTNER_KEY'), key = clean('GODO_USER_KEY');
  if (!partner || !key) throw new Error('고도몰 API 키가 스크립트 속성에 없습니다');
  const out = [];
  let last = '';
  for (let page = 0; page < 200; page++) {
    const payload = { partner_key: partner, key, dateType: 'order', startDate: start, endDate: end, size: '100' };
    if (last) payload.lastOrder = last;
    const res = UrlFetchApp.fetch('https://openhub.godo.co.kr/godomall5/order/Order_Search.php', { method: 'post', payload, muteHttpExceptions: true });
    if (res.getResponseCode() >= 300) throw new Error('고도몰 API HTTP ' + res.getResponseCode());
    const root = XmlService.parse(res.getContentText()).getRootElement();
    const header = root.getChild('header');
    const code = header ? header.getChildText('code') : '';
    if (code !== '000') throw new Error('고도몰 API 오류 ' + code + ': ' + (header ? header.getChildText('msg') : root.getName()));
    const ret = root.getChild('return');
    const list = ret ? ret.getChildren('order_data') : [];
    list.forEach((o) => out.push({ no: o.getChildText('orderNo'), paid: o.getChildText('paymentDt') || '', status: o.getChildText('orderStatus') || '', placed: o.getChildText('orderDate') || '', device: o.getChildText('orderTypeFl') || '', channel: o.getChildText('orderChannelFl') || '', settle: o.getChildText('settleKind') || '', memNo: Number(o.getChildText('memNo')) || 0, memGroup: o.getChildText('memGroupNm') || '', info: godoOrderInfo_(o), goods: godoGoodsLines_(o) }));
    if (!list.length || !header.getChildText('lastOrder') && !(ret && ret.getChildText('lastOrder'))) break;
    const more = header.getChildText('lastOrder') || ret.getChildText('lastOrder');
    if (String(more) !== 'true') break;
    last = out[out.length - 1].no;
  }
  return out;
}
/** 고객별 일회성 결제 상품은 제품명에 고객·업체 이름이 들어가고 번호도 거래마다 재사용되므로, 이름을 내보내지 않고 한 줄로 묶는다 (공개 응답) */
function godoSafeGoods_(no, name) {
  const oneOff = ['9311', '9312', '9808'].includes(String(no)) || /님|결제\s*건|고객|주식회사|\(주\)|㈜|귀하|상담|견적|개별|별도|추가\s*결제|계약/.test(name);
  return oneOff ? { no: 'one-off', name: '개별 결제 상품' } : { no: String(no), name };
}
/** 주문의 제품 줄. 금액 = (판매가+옵션가+텍스트옵션가)×수량 − 상품·회원·쿠폰 할인, 배송비 제외 */
function godoGoodsLines_(order) {
  const n = (g, k) => Number(g.getChildText(k)) || 0;
  return order.getChildren('orderGoodsData').map((g) => {
    const cnt = n(g, 'goodsCnt');
    const amount = (n(g, 'goodsPrice') + n(g, 'optionPrice') + n(g, 'optionTextPrice')) * cnt
      - n(g, 'goodsDcPrice') - n(g, 'memberDcPrice') - n(g, 'memberOverlapDcPrice') - n(g, 'couponGoodsDcPrice') - n(g, 'divisionCouponOrderDcPrice');
    return Object.assign(godoSafeGoods_(g.getChildText('goodsNo') || '', String(g.getChildText('goodsNm') || '').trim().replace(/^[=+\-@]+/, '')), { cnt, amount });
  });
}
/** 결제완료 주문의 제품을 달·제품별로 합친다. 한 주문에 같은 제품 줄이 여러 개여도 판매 건수는 1건이다 */
function godoGoodsRows_(orders, fromMonth) {
  const rows = {};
  orders.forEach((o) => {
    const m = o.paid.slice(0, 7);
    if (!/^20\d\d-\d\d$/.test(m) || m < fromMonth) return;
    const counted = {};
    o.goods.forEach((g) => {
      const key = m + '|' + g.no;
      const row = rows[key] = rows[key] || [m, g.no, g.name, 0, 0, 0];
      if (!counted[key]) { row[3]++; counted[key] = true; }
      row[4] += g.cnt;
      row[5] += g.amount;
    });
  });
  return Object.keys(rows).sort().map((k) => rows[k]);
}
/** 주문 조회는 한 번에 30일까지라 구간을 나누고, 겹치는 주문은 한 번만 센다 */
function godoOrdersBetween_(start, end) {
  const day = (d) => Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd');
  const seen = {};
  for (let from = new Date(start + 'T00:00:00+09:00'); day(from) <= end; from = new Date(from.getTime() + 30 * 864e5)) {
    const to = day(new Date(from.getTime() + 29 * 864e5));
    godoOrders_(day(from), to > end ? end : to).forEach((r) => { seen[r.no] = r; });
  }
  return Object.values(seen);
}
/**
 * 결제완료 월별 구매건수 → godo_orders_monthly. 고도몰 주문통계의 구매건수와 같은 기준이다 (입금일이 있는 주문, 이후 취소·환불되어도 센다).
 * 처음에는 전체 기간, 이후에는 최근 석 달만 다시 센다.
 */
function collectGodoOrders() {
  const ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  const old = read_(ss, 'godo_orders_monthly');
  const thisM = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM');
  const keepFrom = addMonth_(thisM, -2);
  // 주문일과 결제일의 달이 달라도 잡히도록 한 달 앞부터 조회한다
  const oldGoods = read_(ss, 'godo_goods_monthly');
  const oldDaily = read_(ss, 'godo_orders_daily');
  const oldLines = read_(ss, 'godo_order_lines');
  const start = old.length && oldGoods.length && oldDaily.length && oldLines.length ? addMonth_(keepFrom, -1) + '-01' : '2022-01-01';
  const counts = {};
  const orders = godoOrdersBetween_(start, Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'));
  orders.forEach((r) => {
    const m = r.paid.slice(0, 7);
    if (/^20\d\d-\d\d$/.test(m)) counts[m] = (counts[m] || 0) + 1;
  });
  const merged = {};
  old.forEach((r) => { merged[String(r.month).slice(0, 7)] = Number(r.count) || 0; });
  if (old.length) { for (let m = keepFrom; m <= thisM; m = addMonth_(m, 1)) merged[m] = counts[m] || 0; } else Object.assign(merged, counts);
  put_(ss, 'godo_orders_monthly', [['month', 'count']].concat(Object.keys(merged).sort().map((m) => [m, merged[m]])));

  // 제품별 시트는 처음에 전체 기간을 채우고, 이후에는 건수와 같이 최근 석 달만 다시 쓴다
  // 일별 시트는 GA4 와 같은 기준으로 비교하는 데 쓴다. 처음에는 전체 기간, 이후에는 최근 석 달만 다시 쓴다
  const dailyFrom = oldDaily.length ? keepFrom + '-01' : '2022-01-01';
  const keptDaily = oldDaily.filter((r) => String(r.date).slice(0, 10) < dailyFrom).map((r) => [String(r.date).slice(0, 10), Number(r.paid) || 0, Number(r.reached) || 0, Number(r.not_web) || 0]);
  put_(ss, 'godo_orders_daily', [['date', 'paid', 'reached', 'not_web']].concat(keptDaily, godoDailyRows_(orders, dailyFrom)));

  const goodsFrom = oldGoods.length ? keepFrom : '2022-01';
  // 예전에 따로 저장된 고객별 결제 상품 번호도 '개별 결제 상품' 한 줄로 합쳐 같은 달·제품 줄이 겹치지 않게 한다
  const keptByKey = {};
  oldGoods.filter((r) => String(r.month).slice(0, 7) < goodsFrom).forEach((r) => {
    const m = String(r.month).slice(0, 7), g = godoSafeGoods_(r.goods_no, String(r.goods_name));
    const row = keptByKey[m + '|' + g.no] = keptByKey[m + '|' + g.no] || [m, g.no, g.name, 0, 0, 0];
    row[3] += Number(r.orders) || 0; row[4] += Number(r.qty) || 0; row[5] += Number(r.amount) || 0;
  });
  const keptGoods = Object.keys(keptByKey).sort().map((k) => keptByKey[k]);
  put_(ss, 'godo_goods_monthly', [['month', 'goods_no', 'goods_name', 'orders', 'qty', 'amount']].concat(keptGoods, godoGoodsRows_(orders, goodsFrom)));
  // 대시보드 수집 배지 툴팁에 보여 줄 마지막 수집 시각 (다른 수집의 g_meta·n_meta·q_meta 와 같은 형식)
  put_(ss, 'godo_meta', [['key', 'value'], ['updated', Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm')], ['orders', orders.length]]);

  const inflowRows = read_(ss, 'order_inflow');
  if (inflowRows.length) {
    const kept = read_(ss, 'godo_order_inflow_monthly').filter((r) => String(r.month).slice(0, 7) < keepFrom).map((r) => [String(r.month).slice(0, 7), r.source, Number(r.count) || 0]);
    put_(ss, 'godo_order_inflow_monthly', [['month', 'source', 'count']].concat(kept, godoInflowCounts_(orders, inflowRows, keepFrom)));
    const keptGoodsInflow = read_(ss, 'godo_goods_inflow_monthly').filter((r) => String(r.month).slice(0, 7) < keepFrom).map((r) => [String(r.month).slice(0, 7), String(r.goods_no), r.source, Number(r.orders) || 0]);
    put_(ss, 'godo_goods_inflow_monthly', [['month', 'goods_no', 'source', 'orders']].concat(keptGoodsInflow, godoGoodsInflowRows_(orders, inflowRows, keepFrom)));
  }
  // 구매 제품 펼침용 주문 줄 (공개) 과 회원 등급·이메일 도메인 (관리자 전용). 처음에는 전체 기간, 이후에는 최근 석 달만 다시 쓴다
  const linesFrom = oldLines.length ? keepFrom : '2022-01';
  const orderRows = godoOrderLineRows_(orders, inflowRows, linesFrom);
  const keptLines = oldLines.filter((r) => String(r.month).slice(0, 7) < linesFrom).map((r) => [String(r.month).slice(0, 7), String(r.key), String(r.goods_no), String(r.placed), String(r.paid), r.status, r.settle, r.member, Number(r.qty) || 0, Number(r.amount) || 0, r.source, r.basis, r.detail, r.device || '']);
  put_(ss, 'godo_order_lines', [['month', 'key', 'goods_no', 'placed', 'paid', 'status', 'settle', 'member', 'qty', 'amount', 'source', 'basis', 'detail', 'device']].concat(keptLines, orderRows.lines));
  const keptCustomers = read_(ss, 'godo_order_customers').filter((r) => String(r.month).slice(0, 7) < linesFrom).map((r) => [String(r.month).slice(0, 7), String(r.key), r.member_group, r.email_domain || '']);
  put_(ss, 'godo_order_customers', [['month', 'key', 'member_group', 'email_domain']].concat(keptCustomers, orderRows.customers));
  try {
    const n = sendGa4Purchases_(ss, orders, inflowRows);
    if (n) console.log('GA4 purchase 전송: ' + n + '건');
  } catch (err) { console.error('GA4 purchase 전송 실패: ' + err.message); } // 전송 실패가 주문 수집을 막지 않게 한다
}
/**
 * 날짜별 주문 건수 → godo_orders_daily.
 * paid: 그날 결제된 주문(판매 건수와 같은 기준) · reached: 그날 쇼핑몰 화면에서 접수된 주문(입금 대기 포함, 결제 실패 제외, GA4 가 완료 화면으로 세는 대상) · not_web: 그날 결제됐지만 쇼핑몰 화면 밖에서 접수된 주문(네이버페이 등)
 */
function godoDailyRows_(orders, fromDate) {
  const days = {};
  const add = (d, i) => { if (/^20\d\d-\d\d-\d\d$/.test(d) && d >= fromDate) (days[d] = days[d] || [d, 0, 0, 0])[i]++; };
  orders.forEach((o) => {
    const paid = o.paid.slice(0, 10);
    add(paid, 1);
    if (o.channel && o.channel !== 'shop') add(paid, 3);
    else if (/^20/.test(paid) || !/^f/.test(o.status)) add(o.placed.slice(0, 10), 2); // 결제 실패(f*)는 대부분 완료 화면에 닿지 않아 뺀다 (2년간 296건, GA4 초과는 12개월 12건)
  });
  return Object.keys(days).sort().map((d) => days[d]);
}
/**
 * 결제된 주문을 GA4 purchase 이벤트로 주문당 한 번 보낸다 (GA4 구매 수 = 고도몰 판매 건수가 되게 한다).
 * 스크립트 속성 GA4_MP_SECRET 과 GA4_MP_START(YYYY-MM-DD, 이 날 이후 결제분만) 가 모두 있을 때만 동작한다. 보낸 주문은 ga4_purchase_sent 에 남겨 다시 보내지 않는다.
 * 완료 화면을 거치지 않아 client_id 가 없는 주문은 주문번호로 만든 값으로 보낸다. GA4 는 72시간보다 오래된 시각을 받지 않으므로 그보다 늦게 보내면 71시간 전으로 기록한다.
 */
function sendGa4Purchases_(ss, orders, inflowRows) {
  const secret = String(PROPS.getProperty('GA4_MP_SECRET') || '').trim(), start = String(PROPS.getProperty('GA4_MP_START') || '').trim();
  if (!secret || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return 0;
  let sh = ss.getSheetByName('ga4_purchase_sent');
  if (!sh) {
    sh = ss.insertSheet('ga4_purchase_sent');
    sh.getRange('A:A').setNumberFormat('@');
    sh.appendRow(['order_no', 'sent_at', 'client_id_from']);
  }
  const sent = new Set(read_(ss, 'ga4_purchase_sent').map((r) => String(r.order_no).trim()));
  const inflow = {};
  inflowRows.forEach((r) => { const no = String(r.order_no).trim(); if (!(no in inflow)) inflow[no] = r; });
  const url = 'https://www.google-analytics.com/mp/collect?measurement_id=' + CFG.GA4_MEASUREMENT_ID + '&api_secret=' + encodeURIComponent(secret);
  const now = Date.now(), hour = 3600 * 1000;
  let count = 0;
  orders.forEach((o) => {
    const no = String(o.no).trim();
    if (!/^20\d\d-\d\d-\d\d/.test(o.paid) || o.paid.slice(0, 10) < start || sent.has(no)) return;
    const seen = inflow[no] || {};
    const paidAt = new Date(o.paid.slice(0, 19).replace(' ', 'T') + '+09:00').getTime();
    const at = Math.max(Math.min(isNaN(paidAt) ? now : paidAt, now), now - 71 * hour);
    const params = { transaction_id: no, currency: 'KRW', value: o.goods.reduce((a, g) => a + g.amount, 0), engagement_time_msec: 1 };
    if (seen.session_id && now - paidAt < 23 * hour) params.session_id = Number(seen.session_id); // 세션 기여는 시작 후 24시간 안에만 인정된다
    const res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ client_id: seen.client_id ? String(seen.client_id) : 'order.' + no, timestamp_micros: at * 1000, events: [{ name: 'purchase', params }] }) });
    if (res.getResponseCode() >= 300) { console.warn('GA4 전송 실패 ' + no + ': HTTP ' + res.getResponseCode()); return; } // 표시하지 않았으니 다음 실행에서 다시 보낸다
    sh.appendRow([no, new Date().toISOString(), seen.client_id ? 'gtag' : 'order']);
    count++;
  });
  return count;
}
/** 주문의 유입 경로 → 화면 이름. GA4 유입 이름과 맞추려고 ChatGPT·다음 검색을 따로 둔다. 견적 분류(quoteSource_)는 바꾸지 않는다 */
function orderSource_(raw) {
  const head = String(raw == null ? '' : raw).split(' - ')[0].trim(); // 뒤쪽 상세(키워드·첫 페이지)는 분류에 쓰지 않는다
  if (/chatgpt|openai/i.test(head)) return 'ChatGPT';
  if (head === '다음') return '다음(검색)';
  return quoteSource_(raw);
}
/**
 * 결제된 주문을 주문번호로 유입 경로와 맞춰 달·매체별로 센다 (godo_order_inflow_monthly). order_inflow 원본은 웹앱 응답에 넣지 않는다.
 * 첫 기록이 있는 달부터만 만들고, 기록이 없는 주문은 '미수집'으로 남겨 합계가 판매 건수와 같게 한다. 실제 주문과 맞지 않는 번호는 세지 않는다.
 */
function godoInflowCounts_(orders, inflowRows, keepFrom) {
  const inflow = {};
  const firstMonth = inflowRows.reduce((min, r) => {
    const no = String(r.order_no).trim();
    if (!(no in inflow)) inflow[no] = r.inflow; // 겹쳐 들어온 줄은 먼저 온 값 하나로 친다
    const at = new Date(r.recorded_at);
    const m = isNaN(at) ? min : Utilities.formatDate(at, 'Asia/Seoul', 'yyyy-MM');
    return m < min ? m : min;
  }, '9999-99');
  const counts = {};
  orders.forEach((o) => {
    const m = o.paid.slice(0, 7);
    if (!/^20\d\d-\d\d$/.test(m) || m < keepFrom || m < firstMonth) return;
    const key = m + '|' + (o.no in inflow ? orderSource_(inflow[o.no]) : '미수집');
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.keys(counts).sort().map((k) => k.split('|').concat(counts[k]));
}
/** 주문자 정보 중 마케팅에 쓰는 것만 — 이메일 도메인 (회사 메일이면 어느 회사인지 알 수 있다). 이름·연락처·주소는 읽지 않는다 */
function godoOrderInfo_(order) {
  const info = order.getChild('orderInfoData');
  const email = String((info && info.getChildText('orderEmail')) || order.getChildText('orderEmail') || '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  return { emailDomain: at > 0 ? email.slice(at + 1).replace(/[^a-z0-9.\-]/g, '') : '' };
}
/**
 * 주문번호 → { source, basis, detail }. 주문 완료 화면이 주문번호와 함께 남긴 실제 유입 기록만 쓴다 (basis '기록'). 날짜로 맞춘 추정 경로는 만들지 않는다.
 * firstMonth 는 유입 기록을 시작한 달.
 */
function godoOrderSources_(orders, inflowRows) {
  const inflow = {};
  let firstMonth = '9999-99';
  inflowRows.forEach((r) => {
    const no = String(r.order_no).trim();
    if (!(no in inflow)) inflow[no] = String(r.inflow || ''); // 겹쳐 들어온 줄은 먼저 온 값 하나로 친다
    const at = new Date(r.recorded_at);
    if (!isNaN(at)) { const m = Utilities.formatDate(at, 'Asia/Seoul', 'yyyy-MM'); if (m < firstMonth) firstMonth = m; }
  });
  const map = {};
  Object.keys(inflow).forEach((no) => {
    const raw = inflow[no], cut = raw.indexOf(' - ');
    map[no] = { source: orderSource_(raw), basis: '기록', detail: cut < 0 ? '' : raw.slice(cut + 3) };
  });
  return { map, firstMonth };
}
/**
 * 결제된 주문의 제품을 유입 경로별로 센다 → godo_goods_inflow_monthly (달·제품·매체·건수).
 * 경로를 알 수 없는 주문은 기록을 시작한 달부터만 '미수집'으로 센다. 한 주문에 같은 제품 줄이 여러 개여도 1건이다.
 */
function godoGoodsInflowRows_(orders, inflowRows, fromMonth) {
  const { map, firstMonth } = godoOrderSources_(orders, inflowRows);
  const rows = {};
  orders.forEach((o) => {
    const m = o.paid.slice(0, 7);
    if (!/^20\d\d-\d\d$/.test(m) || m < fromMonth) return;
    const source = map[o.no] ? map[o.no].source : m >= firstMonth ? '미수집' : '';
    if (!source) return;
    const counted = {};
    o.goods.forEach((g) => {
      const key = m + '|' + g.no + '|' + source;
      if (counted[key]) return;
      counted[key] = true;
      (rows[key] = rows[key] || [m, g.no, source, 0])[3]++;
    });
  });
  return Object.keys(rows).sort().map((k) => rows[k]);
}
/**
 * 구매 제품 표의 펼침용 주문 줄. lines(공개) = 달·주문 키·제품·접수일·결제일·상태·결제 수단·회원 여부·수량·금액·유입 경로·근거·유입 상세,
 * customers(관리자 전용) = 달·주문 키·회원 등급·이메일 도메인 (이름·연락처·주소·주문번호는 저장하지 않는다). 주문 키는 주문번호를 바로 드러내지 않는 짧은 해시다.
 */
function godoOrderLineRows_(orders, inflowRows, fromMonth) {
  const { map } = godoOrderSources_(orders, inflowRows);
  const keyOf = (no) => Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(no)).slice(0, 5).map((b) => ('0' + (b & 255).toString(16)).slice(-2)).join('');
  const lines = [], customers = [];
  orders.forEach((o) => {
    const m = o.paid.slice(0, 7);
    if (!/^20\d\d-\d\d$/.test(m) || m < fromMonth) return;
    const key = keyOf(o.no), src = map[o.no] || { source: '미수집', basis: '', detail: '' };
    const byGoods = {};
    o.goods.forEach((g) => { const r = byGoods[g.no] = byGoods[g.no] || { qty: 0, amount: 0 }; r.qty += g.cnt; r.amount += g.amount; });
    Object.keys(byGoods).forEach((no) => lines.push([m, key, no, o.placed.slice(0, 16), o.paid.slice(0, 16), o.status, o.settle, o.memNo > 0 ? '회원' : '비회원', byGoods[no].qty, byGoods[no].amount, src.source, src.basis, src.detail, o.device]));
    customers.push([m, key, o.memGroup, (o.info || {}).emailDomain || '']);
  });
  return { lines, customers };
}
/** 구매 제품 펼침용 주문 줄·주문자 시트를 2022-01 부터 다시 만든다 (시트를 새로 만들었거나 기준을 바꿨을 때 한 번 실행). 평소에는 collectGodoOrders 가 최근 석 달만 고친다 */
function rebuildOrderLines() {
  const ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  const orders = godoOrdersBetween_('2022-01-01', Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'));
  const rows = godoOrderLineRows_(orders, read_(ss, 'order_inflow'), '2022-01');
  put_(ss, 'godo_order_lines', [['month', 'key', 'goods_no', 'placed', 'paid', 'status', 'settle', 'member', 'qty', 'amount', 'source', 'basis', 'detail', 'device']].concat(rows.lines));
  put_(ss, 'godo_order_customers', [['month', 'key', 'member_group', 'email_domain']].concat(rows.customers));
}
/** 구매 제품별 유입 경로 시트를 2025-01 부터 다시 만든다 (추정값을 바꿨을 때 한 번 실행). 평소에는 collectGodoOrders 가 최근 석 달만 고친다 */
function rebuildGoodsInflow() {
  const ss = SpreadsheetApp.openById(CFG.SHEET_ID);
  const orders = godoOrdersBetween_('2025-01-01', Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'));
  put_(ss, 'godo_goods_inflow_monthly', [['month', 'goods_no', 'source', 'orders']].concat(godoGoodsInflowRows_(orders, read_(ss, 'order_inflow'), '2025-01')));
}
