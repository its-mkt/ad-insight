/**
 * ad-insight — 네이버 성과형 DA(GFA) 무인 자동 수집 스크립트 (Playwright 기반)
 * 
 * [동작 방식]
 * - 사람 개입 없이 백그라운드(Headless)로 GFA에 접속하여 최신 성과 지표를 추출합니다.
 * - 수집된 성과 데이터를 Apps Script 웹앱(doPost)으로 전송하여 대시보드 시트에 100% 자동 반영합니다.
 * - Windows 작업 스케줄러 또는 cron에 등록해 두면 사용자가 없어도 매일 새벽 알아서 동기화됩니다.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 1. 설정 로드 (config.json 또는 환경 변수)
const CONFIG_PATH = path.join(__dirname, 'gfa-config.json');
let cfg = {
  webhookUrl: 'https://script.google.com/macros/s/AKfycbzQS9yMlp9L_eRaH77QWLsY6GOY7L5hyRk1fkuaAHg8GvJmHHwhPRgr2zWldgbX5-cNcg/exec',
  apiKey: '2d3b0cc2b04a4873a835583968ca7a0b',
  storageStatePath: path.join(__dirname, 'gfa-auth.json'), // 로그인 세션 보관용
};
if (fs.existsSync(CONFIG_PATH)) {
  cfg = { ...cfg, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
}

async function run() {
  console.log('[GFA Sync] 무인 자동 동기화 시작:', new Date().toLocaleString('ko-KR'));

  const browser = await chromium.launch({ headless: true });
  const contextOptions = fs.existsSync(cfg.storageStatePath)
    ? { storageState: cfg.storageStatePath }
    : {};
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  try {
    // 1. GFA 성과 리포트 페이지 접속
    console.log('[GFA Sync] GFA 리포트 페이지 접속 중...');
    await page.goto('https://gfa.naver.com/', { waitUntil: 'networkidle', timeout: 30000 });

    // 로그인 필요 여부 확인
    if (page.url().includes('nid.naver.com') || page.url().includes('login')) {
      console.warn('[GFA Sync] 로그인 세션이 만료되었습니다. gfa-auth.json 세션 갱신이 필요합니다.');
      await browser.close();
      return;
    }

    // 2. 대시보드/보고서 테이블 데이터 추출
    // 당월 기준 데이터 파싱
    const today = new Date();
    const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    console.log('[GFA Sync] 성과 지표 추출 중...');
    // 페이지 내 테이블 또는 성과 API 인터셉트/DOM 평가
    const rows = await page.evaluate((month) => {
      const results = [];
      const trs = document.querySelectorAll('table tbody tr');
      trs.forEach((tr) => {
        const tds = tr.querySelectorAll('td');
        if (tds.length >= 6) {
          const campaign = tds[0]?.innerText?.trim() || 'GFA_캠페인';
          const ad_group = tds[1]?.innerText?.trim() || 'GFA_광고그룹';
          const imp = parseInt(tds[2]?.innerText?.replace(/[^0-9]/g, ''), 10) || 0;
          const clk = parseInt(tds[3]?.innerText?.replace(/[^0-9]/g, ''), 10) || 0;
          const cost = parseInt(tds[4]?.innerText?.replace(/[^0-9]/g, ''), 10) || 0;
          const conv = parseInt(tds[5]?.innerText?.replace(/[^0-9]/g, ''), 10) || 0;
          if (cost > 0 || imp > 0 || clk > 0) {
            results.push({ month, campaign, ad_group, cost, impressions: imp, clicks: clk, conversions: conv });
          }
        }
      });
      return results;
    }, curMonth);

    console.log(`[GFA Sync] 추출된 행 수: ${rows.length}개`);

    // 3. Apps Script 웹앱으로 즉시 전송
    if (rows.length > 0 && cfg.webhookUrl && !cfg.webhookUrl.includes('여기에')) {
      console.log('[GFA Sync] 대시보드 시트로 데이터 전송 중...');
      const response = await fetch(cfg.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: cfg.apiKey,
          action: 'syncGfa',
          rows: rows,
        }),
      });
      const resJson = await response.json();
      console.log('[GFA Sync] 동기화 성공 결과:', resJson);
    } else {
      console.log('[GFA Sync] 전송할 데이터가 없거나 웹앱 URL이 미설정 상태입니다.');
    }
  } catch (err) {
    console.error('[GFA Sync] 오류 발생:', err.message);
  } finally {
    await browser.close();
    console.log('[GFA Sync] 동기화 작업 종료');
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
