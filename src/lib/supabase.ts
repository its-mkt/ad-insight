import { createClient } from '@supabase/supabase-js';
import type { DashboardData } from '../types/dashboard';

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://tqxljgmygvanysqnhiar.supabase.co';
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable__Oq9NpOHnxEqRSZ02qJDaw_n-FIAGC2';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface SnapshotSummary {
  id: string;
  updated_at: string;
  month?: string;
  stats?: {
    spendCount?: number;
    keywordCount?: number;
    adCount?: number;
    quoteCount?: number;
    totalSpend?: number;
  };
}

/** Supabase 연결 상태 테스트 */
export async function testSupabaseConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const { error } = await supabase.from('dashboard_snapshots').select('id').limit(1);
    if (error) {
      if (error.code === 'PGRST205' || error.message.includes('schema cache')) {
        return {
          ok: false,
          message:
            '테이블(dashboard_snapshots)이 아직 생성되지 않았습니다. Supabase SQL Editor에서 스키마를 실행해 주세요.',
        };
      }
      return { ok: false, message: error.message };
    }
    return { ok: true, message: 'Supabase 정상 연결됨' };
  } catch (err: any) {
    return { ok: false, message: err.message || 'Supabase 연결 실패' };
  }
}

/** 대시보드 전체 데이터를 Supabase에 저장 (최신본 + 히스토리) */
export async function saveDashboardSnapshot(
  data: DashboardData,
  currentMonth?: string
): Promise<{ ok: boolean; message: string; timestamp?: string }> {
  try {
    const nowIso = new Date().toISOString();
    // 어드민 리스트 전용 다른 사이트 견적·전화문의(고객 정보 포함)는 스냅숏에 넣지 않는다
    const { quotesSites: _adminOnly, quotesPhone: _adminOnlyPhone, ...snapshot } = data;
    const totalSpend = (data.spend || []).reduce((acc, r) => acc + (r.cost || 0), 0);
    const quoteCount =
      data.quotesRaw?.length || (data.quotes || []).reduce((acc, r) => acc + (r.count || 0), 0);

    const stats = {
      spendCount: data.spend?.length || 0,
      keywordCount: data.keywords?.length || 0,
      adCount: data.ads?.length || 0,
      quoteCount,
      totalSpend,
      dataUpdated: data.updated || '',
    };

    // 1. 최신본('latest') 덮어쓰기/저장
    const { error: upsertError } = await supabase.from('dashboard_snapshots').upsert(
      {
        id: 'latest',
        updated_at: nowIso,
        month: currentMonth || '',
        stats,
        data: snapshot,
      },
      { onConflict: 'id' }
    );

    if (upsertError) {
      throw upsertError;
    }

    // 2. 이력 백업본 (일자별 백업)
    const ymd = nowIso.slice(0, 10).replace(/-/g, '');
    const histId = `snapshot_${ymd}`;
    await supabase.from('dashboard_snapshots').upsert(
      {
        id: histId,
        updated_at: nowIso,
        month: currentMonth || '',
        stats,
        data: snapshot,
      },
      { onConflict: 'id' }
    );

    return {
      ok: true,
      message: `성공적으로 저장되었습니다 (광고 ${stats.spendCount.toLocaleString()}행 · 키워드 ${stats.keywordCount.toLocaleString()}개 · 견적 ${stats.quoteCount.toLocaleString()}건)`,
      timestamp: nowIso,
    };
  } catch (err: any) {
    console.error('Failed to save to Supabase:', err);
    return {
      ok: false,
      message: err.message || 'Supabase 저장 중 오류가 발생했습니다.',
    };
  }
}

/** Supabase에서 최신 대시보드 데이터 불러오기 */
export async function loadLatestDashboardSnapshot(): Promise<{
  ok: boolean;
  data?: DashboardData;
  updatedAt?: string;
  message?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('dashboard_snapshots')
      .select('data, updated_at, stats')
      .eq('id', 'latest')
      .maybeSingle();

    if (error) throw error;
    if (!data || !data.data) {
      return { ok: false, message: '저장된 최신 스냅샷이 없습니다.' };
    }

    return {
      ok: true,
      data: data.data as DashboardData,
      updatedAt: data.updated_at,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err.message || 'Supabase에서 데이터를 불러오지 못했습니다.',
    };
  }
}
