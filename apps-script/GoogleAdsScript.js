/**
 * its-ad-insight — Google Ads 수집 스크립트 (Google Ads 스크립트)
 *
 * Google Ads → 도구 → 대량 작업 → 스크립트 에 붙여넣고 "1시간마다"로 예약한다 (네이버 syncAll 과 같은 주기).
 * 실행 계정: itketweb (2026-11-06, itsmkt1307 은 OAuth 본인 확인이 막혀 임시 전환). 같은 시트에 쓰는 다른 스크립트는 예약하지 않는다.
 * 개발자 토큰·관리자(MCC) 계정이 필요 없다. 이 광고 계정의 데이터를 같은 구글 계정의 시트에 쓴다.
 *  - g_campaign_monthly : 캠페인 × 월 비용·노출·클릭·전환 (2023년 1월부터, 실적 최대 MAX 버전)
 *  - g_adgroup_monthly  : 광고그룹 × 월 (카테고리 매칭용, P-Max 처럼 그룹이 없는 캠페인은 제외됨)
 *  - g_adgroup_daily    : 광고그룹 × 일 (최근 DAILY_DAYS 일, 대시보드의 일·기간 선택용. 그룹이 없는 캠페인은 '(광고그룹 없음)' 행)
 *  - g_adgroup_daily_hist : 지난달까지의 광고그룹 × 일을 달 단위로 쌓는다 (최근 구간보다 앞선 날짜를 고를 때 쓴다)
 *  - g_keywords         : 사용 중 키워드의 현재 입찰가·품질점수 + 월별 성과 (2023년 1월부터)
 *  - g_ads              : 사용 중 광고 소재 (제목·설명·연결 URL·이미지)
 *  - g_ad_stats         : 소재 × 월 비용·노출·클릭·전환 (2023년 1월부터)
 *  - g_meta             : 마지막 수집 시각
 */
const CFG = {
  SHEET_URL: 'https://docs.google.com/spreadsheets/d/1mxrTeh7bo50RTz_2_UNyQxtQrljoEK4-xgPy9fr8nIg/edit',   // its-ad-insight 데이터 시트 주소
  DAILY_DAYS: 62, // 일별 광고비를 모으는 최근 일수 (오늘 포함). 늘리면 시트·응답 크기가 그만큼 커진다
  DAILY_HIST_MONTHS: 60, // 일별 과거분을 한 번 실행에 채우는 달 수 (g_adgroup_daily_hist, 한 번 받은 달은 다시 받지 않는다)
  FROM_YEAR: 2023, // 시트를 비우고 다시 쓰므로 고정값으로 둔다. 계산식으로 바꾸면 해가 바뀔 때 과거 달이 지워진다
};

function main() {
  const ss = SpreadsheetApp.openByUrl(CFG.SHEET_URL);
  const tz = AdsApp.currentAccount().getTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const range = `segments.date BETWEEN '${CFG.FROM_YEAR}-01-01' AND '${today}'`;
  const M = 'metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions';

  const camp = [['month', 'type', 'campaign', 'campaign_id', 'cost', 'impressions', 'clicks', 'conversions']];
  each_(`SELECT segments.month, campaign.id, campaign.name, campaign.advertising_channel_type, ${M}
         FROM campaign WHERE ${range} AND metrics.cost_micros > 0`, (r) => {
    camp.push([r.segments.month.slice(0, 7), type_(r.campaign.advertisingChannelType), String(r.campaign.name || '').trim(), String(r.campaign.id), ...met_(r)]);
  });
  put_(ss, 'g_campaign_monthly', camp);

  // 일별 — 최근 DAILY_DAYS 일, 광고그룹 × 일. 광고그룹이 없는 캠페인(P-Max 등)은 캠페인 행을 '(광고그룹 없음)' 으로 더해 월 합계와 맞춘다
  const dFrom = Utilities.formatDate(new Date(Date.now() - (CFG.DAILY_DAYS - 1) * 864e5), tz, 'yyyy-MM-dd');
  const dRange = `segments.date BETWEEN '${dFrom}' AND '${today}'`;
  put_(ss, 'g_adgroup_daily', [DAILY_HEAD].concat(dailyRows_(dRange, M)));

  const grp = [['month', 'type', 'campaign', 'campaign_id', 'ad_group', 'ad_group_id', 'cost', 'impressions', 'clicks', 'conversions']];
  each_(`SELECT segments.month, campaign.id, campaign.name, campaign.advertising_channel_type, ad_group.id, ad_group.name, ${M}
         FROM ad_group WHERE ${range} AND metrics.cost_micros > 0`, (r) => {
    grp.push([r.segments.month.slice(0, 7), type_(r.campaign.advertisingChannelType), String(r.campaign.name || '').trim(), String(r.campaign.id), String(r.adGroup.name || '').trim(), String(r.adGroup.id), ...met_(r)]);
  });
  put_(ss, 'g_adgroup_monthly', grp);

  // 키워드는 월별 성과 — 지금은 꺼진 키워드도 그 달에 노출됐으면 그 달 행으로 남는다
  const kw = [['month', 'type', 'campaign', 'ad_group', 'keyword', 'match', 'bid', 'quality', 'cost', 'impressions', 'clicks', 'conversions']];
  each_(`SELECT segments.month, campaign.name, campaign.advertising_channel_type, ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
                ad_group_criterion.effective_cpc_bid_micros, ad_group_criterion.quality_info.quality_score, ${M}
         FROM keyword_view
         WHERE ${range} AND metrics.impressions > 0`, (r) => {
    const c = r.adGroupCriterion;
    kw.push([r.segments.month.slice(0, 7), type_(r.campaign.advertisingChannelType), String(r.campaign.name || '').trim(), String(r.adGroup.name || '').trim(), String(c.keyword.text || '').trim(), c.keyword.matchType,
      Math.round(Number(c.effectiveCpcBidMicros || 0) / 1e6), (c.qualityInfo && c.qualityInfo.qualityScore) || '', ...met_(r)]);
  });
  put_(ss, 'g_keywords', kw);

  // 이미지 소재 주소: 자산 이름 → 이미지 URL
  const img = {};
  each_(`SELECT asset.resource_name, asset.image_asset.full_size.url FROM asset WHERE asset.type = 'IMAGE'`, (r) => {
    const f = r.asset.imageAsset && r.asset.imageAsset.fullSize;
    if (f && f.url) img[r.asset.resourceName] = f.url;
  });

  // 검색광고(SA) 이미지 확장소재 매핑: 광고그룹·캠페인 단위 AD_IMAGE 에셋
  // 한 광고그룹·캠페인에 이미지가 여러 장 걸릴 수 있어 목록으로 모은다
  const grpImg = {}, campImg = {};
  const addImg = (map, id, res) => {
    if (img[res]) (map[id] = map[id] || []).push(img[res]);
  };
  try {
    each_(`SELECT ad_group.id, asset.resource_name FROM ad_group_asset WHERE asset_field_type = 'AD_IMAGE' AND status = 'ENABLED'`, (r) => {
      addImg(grpImg, String(r.adGroup.id), r.asset.resourceName);
    });
  } catch (_) {}
  try {
    each_(`SELECT campaign.id, asset.resource_name FROM campaign_asset WHERE asset_field_type = 'AD_IMAGE' AND status = 'ENABLED'`, (r) => {
      addImg(campImg, String(r.campaign.id), r.asset.resourceName);
    });
  } catch (_) {}

  // image: 대표 이미지 1장 (이전 화면 호환) · images: 모든 이미지를 줄바꿈으로 이은 목록 (최대 10장)
  // title: 대표 제목 (이전 화면 호환) · titles·descs: 반응형 광고의 제목·설명 전체를 줄바꿈으로 이은 목록
  const ads = [['type', 'campaign', 'ad_group', 'ad_id', 'ad_type', 'title', 'url', 'image', 'images', 'titles', 'descs']];
  const texts = (list) => [...new Set((list || []).map((t) => String((t && t.text) || '').trim()).filter(Boolean))];
  each_(`SELECT campaign.id, campaign.name, campaign.advertising_channel_type, ad_group.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.ad.name,
                ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions,
                ad_group_ad.ad.responsive_display_ad.headlines, ad_group_ad.ad.responsive_display_ad.long_headline, ad_group_ad.ad.responsive_display_ad.descriptions,
                ad_group_ad.ad.responsive_display_ad.marketing_images, ad_group_ad.ad.image_ad.image_url
         FROM ad_group_ad WHERE ad_group_ad.status = 'ENABLED' AND campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED'`, (r) => {
    const a = r.adGroupAd.ad, rsa = a.responsiveSearchAd || {}, rda = a.responsiveDisplayAd || {};
    const titles = texts([].concat(rsa.headlines || [], rda.headlines || [], rda.longHeadline ? [rda.longHeadline] : [])).slice(0, 15);
    const descs = texts([].concat(rsa.descriptions || [], rda.descriptions || [])).slice(0, 5);
    const mi = rda.marketingImages || [];
    const own = (a.imageAd && a.imageAd.imageUrl ? [a.imageAd.imageUrl] : []).concat(mi.map((m) => img[m.asset]).filter(Boolean));
    const list = [...new Set([own, grpImg[String(r.adGroup.id)], campImg[String(r.campaign.id)]].find((l) => l && l.length) || [])].slice(0, 10);
    ads.push([type_(r.campaign.advertisingChannelType), String(r.campaign.name || '').trim(), String(r.adGroup.name || '').trim(), String(a.id), a.type,
      String(titles[0] || a.name || '').trim(), (a.finalUrls || [])[0] || '', list[0] || '', list.join('\n'), titles.join('\n'), descs.join('\n')]);
  });
  put_(ss, 'g_ads', ads);

  // 소재 × 월 성과 (2023년 1월부터, 노출이 있던 달만)
  const adStat = {};
  each_(`SELECT segments.month, ad_group_ad.ad.id, ${M} FROM ad_group_ad WHERE ${range} AND metrics.impressions > 0`, (r) => {
    const k = r.segments.month.slice(0, 7) + '\u0001' + String(r.adGroupAd.ad.id);
    const cur = adStat[k] || (adStat[k] = [r.segments.month.slice(0, 7), String(r.adGroupAd.ad.id), 0, 0, 0, 0]);
    met_(r).forEach((v, i) => (cur[i + 2] += v));
  });
  put_(ss, 'g_ad_stats', [['month', 'ad_id', 'cost', 'impressions', 'clicks', 'conversions']]
    .concat(Object.values(adStat).sort((a, b) => String(a[0]).localeCompare(String(b[0])))));

  put_(ss, 'g_meta', [['key', 'value'], ['updated', Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm')],
    ['account', AdsApp.currentAccount().getName()], ['customer_id', AdsApp.currentAccount().getCustomerId()]]);

  try { collectDailyHist_(ss, tz, M, camp); } catch (e) { console.log(`일별 과거분 수집 실패: ${e && e.message}`); }
}

const DAILY_HEAD = ['date', 'type', 'campaign', 'campaign_id', 'ad_group', 'ad_group_id', 'cost', 'impressions', 'clicks', 'conversions'];
/** 광고그룹 × 일 행. 광고그룹이 없는 캠페인(P-Max 등)은 캠페인 행을 '(광고그룹 없음)' 으로 더해 월 합계와 맞춘다 */
function dailyRows_(dRange, M) {
  const rows = [], hasDaily = {};
  each_(`SELECT segments.date, campaign.id, campaign.name, campaign.advertising_channel_type, ad_group.id, ad_group.name, ${M}
         FROM ad_group WHERE ${dRange} AND metrics.impressions > 0`, (r) => {
    hasDaily[r.segments.date + '|' + r.campaign.id] = true;
    rows.push([r.segments.date, type_(r.campaign.advertisingChannelType), String(r.campaign.name || '').trim(), String(r.campaign.id), String(r.adGroup.name || '').trim(), String(r.adGroup.id), ...met_(r)]);
  });
  each_(`SELECT segments.date, campaign.id, campaign.name, campaign.advertising_channel_type, ${M}
         FROM campaign WHERE ${dRange} AND metrics.impressions > 0`, (r) => {
    if (hasDaily[r.segments.date + '|' + r.campaign.id]) return;
    rows.push([r.segments.date, type_(r.campaign.advertisingChannelType), String(r.campaign.name || '').trim(), String(r.campaign.id), '(광고그룹 없음)', '', ...met_(r)]);
  });
  return rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}
/** 지난달까지의 일별 광고비를 달 단위로 g_adgroup_daily_hist 에 쌓는다. 최신 달부터 실행당 CFG.DAILY_HIST_MONTHS 달, 시트에 있는 달은 건너뛴다 */
function collectDailyHist_(ss, tz, M, camp) {
  const name = 'g_adgroup_daily_hist';
  const sh = retry_(() => ss.getSheetByName(name) || ss.insertSheet(name));
  if (sh.getLastRow() < 1) retry_(() => sh.getRange(1, 1, 1, DAILY_HEAD.length).setValues([DAILY_HEAD]));
  const last = sh.getLastRow();
  const have = new Set(last > 1 ? sh.getRange(2, 1, last - 1, 1).getDisplayValues().map((r) => String(r[0]).slice(0, 7)) : []);
  const thisMonth = Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  [...new Set(camp.slice(1).map((r) => r[0]))].filter((m) => m < thisMonth && !have.has(m)).sort().reverse().slice(0, CFG.DAILY_HIST_MONTHS).forEach((m) => {
    const end = String(new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate()).padStart(2, '0');
    const rows = dailyRows_(`segments.date BETWEEN '${m}-01' AND '${m}-${end}'`, M);
    if (!rows.length) return;
    const at = sh.getLastRow() + 1; // 재시도해도 같은 자리에 쓰도록 먼저 정한다
    retry_(() => {
      sh.getRange(at, 1, rows.length, 1).setNumberFormat('@');
      sh.getRange(at, 1, rows.length, DAILY_HEAD.length).setValues(rows);
      SpreadsheetApp.flush();
    });
  });
}

/** 검색 캠페인은 SA, 나머지(디스플레이·P-Max·디맨드젠·동영상)는 DA 로 본다. */
function type_(t) { return t === 'SEARCH' ? 'SA' : 'DA'; }
function met_(r) {
  const m = r.metrics;
  return [Math.round(Number(m.costMicros || 0) / 1e6), Number(m.impressions || 0), Number(m.clicks || 0), Math.round(Number(m.conversions || 0) * 100) / 100];
}
function each_(q, fn) { const it = AdsApp.search(q); while (it.hasNext()) fn(it.next()); }
/**
 * 시트를 새 값으로 바꾼다. 1열(월 등)과 *_meta 의 2열(타임스탬프)은 날짜로 바뀌지 않게 글자 형식으로 둔다.
 * 먼저 비우고 쓰면 그 사이 시트 타임아웃이 났을 때 시트가 빈 채로 남으므로(2026-11-06 실제 발생),
 * 새 값을 덮어쓴 뒤 남는 옛 행·열만 지운다. 실패해도 이전 값이 그대로 남고, 타임아웃이면 잠시 뒤 다시 시도한다.
 */
function put_(ss, name, rows) {
  const sh = retry_(() => ss.getSheetByName(name) || ss.insertSheet(name));
  const nR = rows.length, nC = rows[0].length;
  const textCols = /_meta$/.test(name) && nC >= 2 ? 2 : 1;
  retry_(() => {
    sh.getRange(1, 1, nR, textCols).setNumberFormat('@');
    sh.getRange(1, 1, nR, nC).setValues(rows);
    const lastR = sh.getLastRow(), lastC = sh.getLastColumn();
    if (lastR > nR) sh.getRange(nR + 1, 1, lastR - nR, Math.max(lastC, nC)).clearContent();
    if (lastC > nC) sh.getRange(1, nC + 1, nR, lastC - nC).clearContent();
    SpreadsheetApp.flush();
  });
}
/** 시트 서비스 타임아웃·일시 오류일 때만 10·20·30초 쉬고 최대 3번 더 시도한다. 그 밖의 오류는 바로 멈춘다. */
function retry_(fn) {
  for (let i = 0; ; i++) {
    try { return fn(); } catch (e) {
      if (i >= 3 || !/timed out|temporar|try again|잠시 후|시간 초과/i.test(String(e && e.message || e))) throw e;
      console.log(`시트 쓰기 재시도 ${i + 1}/3: ${e && e.message}`);
      Utilities.sleep(10000 * (i + 1));
    }
  }
}
