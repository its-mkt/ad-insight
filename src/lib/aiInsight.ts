import { supabase } from './supabase';

/** 서버 함수(supabase/functions/ai-insight)가 돌려주는 Claude 분석 */
export interface AiInsightResult {
  summary: string;
  actions: { tone: 'good' | 'bad' | 'info'; title: string; text: string }[];
  caution: string;
}

/** Claude 에 보내는 화면 자료 — 규칙 인사이트 문장과 기준만 (견적 고객 정보는 넣지 않는다) */
export interface AiInsightFacts {
  page: string;
  basis: string;
  /** 오늘 날짜 — 진행 중인 기간인지 판단하게 한다 */
  today: string;
  insights: { type: string; head: string; target?: string; text: string }[];
  /** 화면 수치 요약 (KPI·추이·상위 키워드 등, utils/aiFacts) — 있으면 Claude 가 규칙 문장과 함께 읽는다 */
  data?: Record<string, unknown>;
}

const CACHE_PREFIX = 'adi:ai-insight:';

/** 같은 날 같은 자료면 다시 묻지 않는다 (비용 절약). 저장소를 못 쓰면 그냥 매번 묻는다 */
const cacheKey = (facts: AiInsightFacts): string => `${CACHE_PREFIX}${facts.today}:${JSON.stringify(facts)}`;

export function cachedAiInsight(facts: AiInsightFacts): AiInsightResult | null {
  try {
    const raw = localStorage.getItem(cacheKey(facts));
    return raw ? (JSON.parse(raw) as AiInsightResult) : null;
  } catch {
    return null;
  }
}

/** 오늘이 아닌 캐시는 지운다 */
function pruneCache(today: string): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(CACHE_PREFIX) && !k.startsWith(`${CACHE_PREFIX}${today}:`)) localStorage.removeItem(k);
    }
  } catch {
    /* 저장소를 못 쓰면 넘어간다 */
  }
}

/** 오류 코드 → 화면 문구 */
export const AI_ERROR_TEXT: Record<string, string> = {
  forbidden: '승인된 계정으로 로그인해야 AI 분석을 쓸 수 있습니다.',
  rate_limit: '요청이 많아 잠시 뒤 다시 시도해 주세요.',
  api_key: 'AI 연결 설정(API 키)이 되어 있지 않습니다. 관리자에게 알려 주세요.',
  refusal: 'AI 가 이 자료에 답하지 않았습니다.',
  network: 'AI 분석 서버에 연결하지 못했습니다. (서버 함수가 아직 배포되지 않았을 수 있습니다)',
};

export async function requestAiInsight(facts: AiInsightFacts): Promise<AiInsightResult> {
  const { data, error } = await supabase.functions.invoke<{ result?: AiInsightResult; error?: string }>('ai-insight', { body: facts });
  if (error || !data?.result) {
    // 함수가 오류 본문을 돌려주면 그 코드를 쓴다
    let code = data?.error || 'network';
    const ctx = (error as { context?: Response } | null)?.context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        code = ((await ctx.json()) as { error?: string }).error || code;
      } catch {
        /* 본문이 JSON 이 아니면 network 로 둔다 */
      }
    }
    throw new Error(code);
  }
  pruneCache(facts.today);
  try {
    localStorage.setItem(cacheKey(facts), JSON.stringify(data.result));
  } catch {
    /* 저장 실패는 무시 */
  }
  return data.result;
}
