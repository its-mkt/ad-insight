import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './supabase';

/**
 * 이용 현황 기록·조회 (Supabase usage_daily — supabase/usage.sql).
 * 방문은 같은 기기(브라우저)를 하루 1회로 서버에서 센다. 여기서는 화면 열기와 실제로 본 시간만 보낸다.
 */

const DEVICE_KEY = 'adi_device_id';
/** 이 시간 동안 조작이 없으면 화면이 열려 있어도 체류시간에서 뺀다 */
const IDLE_MS = 5 * 60 * 1000;
/** 체류시간을 재는 간격 */
const TICK_MS = 5 * 1000;
/** 모인 체류시간을 보내는 간격 */
const FLUSH_MS = 60 * 1000;

/** 기록하지 않는 환경 — 개발 서버·로컬 미리보기는 직원 이용이 아니다 */
export const USAGE_TRACKING_ON =
  !import.meta.env.DEV && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

let memoryDeviceId = '';

/** 브라우저마다 한 번 만들어 두는 임의 기기 ID (저장소가 막힌 창은 열려 있는 동안만 같은 ID) */
function deviceId(): string {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved) return saved;
  } catch {
    // 저장소가 막힌 창
  }
  if (!memoryDeviceId) {
    memoryDeviceId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
  try {
    localStorage.setItem(DEVICE_KEY, memoryDeviceId);
  } catch {
    // 저장소가 막힌 창
  }
  return memoryDeviceId;
}

/** 로그인 토큰 — 창을 닫을 때도 바로 보낼 수 있게 미리 들고 있는다 */
let accessToken = '';
if (USAGE_TRACKING_ON) {
  supabase.auth.getSession().then(({ data }) => {
    accessToken = data.session?.access_token || '';
  });
  supabase.auth.onAuthStateChange((_e, session) => {
    accessToken = session?.access_token || '';
  });
}

/** track_usage 호출 — 창을 닫는 중에도 끝까지 가도록 keepalive 로 보낸다. 실패해도 화면에는 영향 없다 */
function send(view: string, pageview: boolean, seconds: number): void {
  if (!USAGE_TRACKING_ON) return;
  const headers: Record<string, string> = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  fetch(`${SUPABASE_URL}/rest/v1/rpc/track_usage`, {
    method: 'POST',
    headers,
    keepalive: true,
    body: JSON.stringify({ p_device: deviceId(), p_view: view, p_pageview: pageview, p_seconds: Math.round(seconds) }),
  }).catch(() => {
    // 기록 실패는 무시한다
  });
}

let currentView = '';
let pendingSeconds = 0;
let lastInputAt = Date.now();
let started = false;

/** 모아 둔 체류시간을 지금 화면 몫으로 보낸다 */
function flush(): void {
  if (currentView && pendingSeconds >= 1) send(currentView, false, pendingSeconds);
  pendingSeconds = 0;
}

function start(): void {
  if (started || !USAGE_TRACKING_ON) return;
  started = true;
  const touch = () => {
    lastInputAt = Date.now();
  };
  ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, touch, { passive: true, capture: true })
  );
  // 탭이 보이고, 최근 5분 안에 조작이 있었던 시간만 센다
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastInputAt < IDLE_MS) pendingSeconds += TICK_MS / 1000;
  }, TICK_MS);
  window.setInterval(flush, FLUSH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
    else touch();
  });
  window.addEventListener('pagehide', flush);
}

/** 화면을 열었을 때 부른다 — 페이지뷰 1회 + 앞 화면에서 본 시간을 정리한다 */
export function trackPageview(view: string): void {
  if (!USAGE_TRACKING_ON) return;
  start();
  flush();
  currentView = view;
  lastInputAt = Date.now();
  send(view, true, 0);
}

export interface UsageDay {
  date: string;
  visits: number;
  pageviews: number;
  seconds: number;
}

export interface UsageByView {
  view: string;
  visits: number;
  pageviews: number;
  seconds: number;
}

export interface UsageStats {
  daily: UsageDay[];
  views: UsageByView[];
  /** 기간 안의 서로 다른 기기 수 */
  devices: number;
  /** 기간 안의 서로 다른 IP 수 */
  ips: number;
  /** 수집을 시작한 날 (기록이 없으면 null) */
  since: string | null;
}

/** 기간 이용 현황 (로그인 필요). 테이블·함수가 아직 없으면 setupNeeded */
export async function loadUsageStats(
  from: string,
  to: string,
  excludeLoggedIn: boolean
): Promise<{ ok: true; stats: UsageStats } | { ok: false; setupNeeded: boolean; message: string }> {
  const { data, error } = await supabase.rpc('usage_stats', { p_from: from, p_to: to, p_exclude_logged_in: excludeLoggedIn });
  if (error) {
    const setupNeeded = error.code === 'PGRST202' || /could not find the function|schema cache/i.test(error.message);
    return { ok: false, setupNeeded, message: error.message };
  }
  const raw = (data || {}) as Partial<UsageStats>;
  const num = (v: unknown) => Number(v) || 0;
  return {
    ok: true,
    stats: {
      daily: (raw.daily || []).map((d) => ({ date: String(d.date), visits: num(d.visits), pageviews: num(d.pageviews), seconds: num(d.seconds) })),
      views: (raw.views || []).map((v) => ({ view: String(v.view), visits: num(v.visits), pageviews: num(v.pageviews), seconds: num(v.seconds) })),
      devices: num(raw.devices),
      ips: num(raw.ips),
      since: raw.since ? String(raw.since) : null,
    },
  };
}
