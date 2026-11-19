import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  DashboardData,
  QuoteRow,
  RawApiPayload,
  RawSpendApiRow,
  SpendDailyRow,
  QuoteRawRow,
  SyncStatus,
  SiteId,
} from '../types/dashboard';
import { buildCategoryMap } from '../utils/format';
import { emptyData, fromApi, fromSiteApi, isUsableCache, spendDailyOf } from '../data/parseApi';
import { readCachedPayload, writeCachedPayload } from '../utils/payloadCache';
import { supabase } from '../lib/supabase';
import { ACCESS_CHANGED_EVENT, currentAccessToken, withAccessToken } from '../lib/access';
import { takePrefetched } from '../lib/prefetch';
import { getCfg, webAppUrl } from '../lib/webApp';
import { usePreviewMode } from '../context/PreviewModeContext';
import { useAuth } from '../context/AuthContext';
import { isPreviewDeviceShares, previewPayload, setPreviewRealDevices } from '../data/previewPayload';

// 웹앱 설정(getCfg·siteConnected 등)은 lib/webApp.ts — App 등 기존 import 를 위해 siteConnected 만 다시 내보낸다
export { siteConnected } from '../lib/webApp';

/** 고른 달의 일별 광고비 과거분을 받는다 (최근 구간보다 앞선 날짜를 고를 때) */
export async function fetchDailyHist(months: string[], site: SiteId = 'itket'): Promise<SpendDailyRow[]> {
  const c = getCfg(site);
  const res = await fetch(withAccessToken(webAppUrl(c, { daily: months.join(',') }), await currentAccessToken()));
  const j = (await res.json()) as { error?: string; g_adgroup_daily_hist?: RawSpendApiRow[]; n_adgroup_daily_hist?: RawSpendApiRow[] };
  if (j.error) throw new Error(j.error);
  // fromApi 를 거치면 판매·기기 등 전역 저장소가 빈 값으로 덮이므로 일별 행만 따로 만든다
  return spendDailyOf(j.g_adgroup_daily_hist, j.n_adgroup_daily_hist);
}

/** site: 보고 있는 사이트 — 바뀌면 화면 데이터를 비우고 그 사이트의 웹앱에서 다시 받는다 */
export function useDashboardData(site: SiteId = 'itket') {
  // 로그인 전 미리보기는 웹앱에 묻지 않고 예시 데이터로 그린다 (캐시에도 남기지 않는다)
  const preview = usePreviewMode();
  // 저장해 둔 응답은 계정마다 따로 — 같은 계정이 다시 로그인하면 그 응답으로 먼저 그린다
  const uid = useAuth().user?.id || '';
  const [data, setData] = useState<DashboardData>(() => (preview ? fromSiteApi(previewPayload(), site) : emptyData()));
  const [status, setStatus] = useState<SyncStatus>(preview ? 'live' : 'init');
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
        writeCachedPayload(localJ, site, uid);
        return fromSiteApi(localJ, site);
      });
      setStatus('live');
    } catch {
      // ignore fallback failure
    }
  }, [site, uid]);

  const load = useCallback(async () => {
    if (preview) return;
    const c = getCfg(site);
    if (!c.url) {
      setStatus((prev) => (prev !== 'live' ? 'unlinked' : prev));
      return;
    }
    const id = ++reqId.current;
    const isStale = () => siteRef.current !== site || id !== reqId.current;
    setIsSyncing(true);

    try {
      const fetchUrl = webAppUrl(c);
      // 승인된 계정에만 데이터가, 관리자에게만 고객 정보가 내려온다 (Apps Script doGet 이 토큰과 admins·members 명단을 확인)
      const url = withAccessToken(fetchUrl, await currentAccessToken());
      const fetchJson = async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as RawApiPayload;
      };
      // 처음 접속이면 권한 확인과 함께 미리 보낸 요청(AuthContext)의 응답을 쓴다 — 실패했으면 다시 받는다
      const pre = takePrefetched<RawApiPayload>(url);
      const j = (pre && (await pre.catch(() => null))) || (await fetchJson());
      // 쓰는 도중 승인이 해제되거나 로그인이 만료되면 권한을 다시 확인해 로그인 화면으로 돌린다
      if (j.error === 'login_required') window.dispatchEvent(new Event(ACCESS_CHANGED_EVENT));
      if (j.error) throw new Error(j.error);
      if (isStale()) return;
      liveLoaded.current = true;
      setData(fromSiteApi(j, site));
      setStatus('live');
      writeCachedPayload(j, site, uid);
    } catch (e) {
      if (isStale()) return;
      console.error('[ad-insight] 실데이터 동기화 오류 (화면 데이터 유지):', e);
      setStatus((prev) => (prev === 'live' ? 'live' : 'error'));
      await tryLoadStaticFallback();
    } finally {
      // 뒤에 보낸 요청이 아직 받는 중이면 동기화 표시를 끄지 않는다
      if (id === reqId.current) setIsSyncing(false);
    }
  }, [site, uid, preview, tryLoadStaticFallback]);

  useEffect(() => {
    if (preview) {
      setData(fromSiteApi(previewPayload(), site));
      setStatus('live');
      // 기기별 비중만은 실제 값 — 웹앱이 로그인 없이도 비중(절대값 없음)을 준다. 못 받으면 예시 비중 그대로 흐리게 둔다
      let alive = true;
      const c = getCfg(site);
      if (c.url) {
        fetch(webAppUrl(c, { preview: 'devices' }))
          .then((res) => (res.ok ? res.json() : null))
          .then((j: unknown) => {
            if (!alive || !isPreviewDeviceShares(j)) return;
            setData(fromSiteApi(previewPayload(j), site));
            setPreviewRealDevices(true);
          })
          .catch(() => undefined);
      }
      // 미리보기를 닫을 때(로그인) 판매·기기 저장소에 남은 예시 값을 비운다 — 실제 데이터가 오기 전에 섞여 보이지 않게
      return () => {
        alive = false;
        setPreviewRealDevices(false);
        fromApi({});
      };
    }
    // 사이트가 바뀌면 이전 사이트 데이터를 지우고 처음부터 받는다
    liveLoaded.current = false;
    setData(emptyData());
    setStatus('init');
    // 실데이터 요청(수 초~수십 초)을 가장 먼저 띄워 두고, 그동안 지난번 받은 데이터(없으면 배포에 묶인 스냅숏)로 먼저 그린다.
    // 예전에는 캐시·스냅숏을 다 받은 뒤에야 요청을 시작해 그만큼 늦게 도착했다
    load();
    readCachedPayload(site, uid).then(async (cached) => {
      if (liveLoaded.current || siteRef.current !== site) return; // 실데이터가 먼저 왔으면 옛 캐시로 덮지 않는다
      if (isUsableCache(cached, site)) {
        setData(fromSiteApi(cached, site));
        setStatus('live');
      } else {
        await tryLoadStaticFallback();
      }
    });

    const timer = setInterval(load, 15 * 60 * 1000);
    return () => clearInterval(timer);
  }, [site, uid, preview, load, tryLoadStaticFallback]);

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
