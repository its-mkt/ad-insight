import { createContext } from 'react';
import { supabase } from './supabase';

/**
 * AI 요약에 필요한 앱 상태 — App 이 넣는다.
 * ready: 화면 데이터가 최신(실데이터 도착·동기화 끝)인지. 받아 둔 데이터로 먼저 그린 동안 물으면 옛 숫자로 답을 만든다
 * site: 지금 사이트 (itket · oncore) — 서버 저장소 키에 쓴다
 */
export const AiInsightContext = createContext<{ ready: boolean; site: string }>({ ready: true, site: '' });

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
  /** 오늘 날짜 — 진행 중인 기간인지 판단하게 한다. 끝난 기간이면 넣지 않고 기간상태 '마감'을 넣는다 */
  today?: string;
  기간상태?: '마감';
  insights: { type: string; head: string; target?: string; text: string }[];
  /** 화면 수치 요약 (KPI·추이·상위 키워드 등, utils/aiFacts) — 있으면 Claude 가 규칙 문장과 함께 읽는다 */
  data?: Record<string, unknown>;
}

const CACHE_PREFIX = 'adi:ai-insight:';

/** 오늘 날짜 키 (YYYY-MM-DD, 한국 시간) — 서버 함수와 같은 기준 */
export const todayKey = (): string => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

/** 끝난 기간의 답 — 날짜가 바뀌어도 지우지 않는다 */
const CLOSED = 'closed';
/** 끝난 기간의 답을 몇 개까지 남길지 — 넘으면 앞쪽부터 지운다 */
const MAX_CLOSED = 40;

/** 답 하나를 가리키는 자리 — 서버 저장소(ai_insight_cache)와 같은 규칙: 사이트·화면·기간·필터·날짜(끝난 기간은 closed) */
export interface AiInsightSlot {
  site: string;
  /** 화면 필터 (카테고리·매체 선택 등) */
  scope: string;
}

/** 진행 중인 기간은 그날 처음 받은 답으로 하루 고정, 끝난 기간은 계속 같은 답 — 숫자가 조금 바뀌어도 다시 묻지 않는다 */
export const aiSlotKey = (facts: AiInsightFacts, slot: AiInsightSlot): string =>
  [facts.기간상태 ? CLOSED : todayKey(), slot.site, facts.page, facts.basis, slot.scope].join('|');

/** 이 브라우저에 받아 둔 답 (서버까지 가지 않고 바로 보여 준다) */
export function cachedAiInsight(key: string): AiInsightResult | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as AiInsightResult) : null;
  } catch {
    return null;
  }
}

/** 오늘이 아닌 캐시는 지운다 — 끝난 기간의 답은 남기되 MAX_CLOSED 개까지만 */
function pruneCache(today: string): void {
  try {
    const closed: string[] = [];
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k?.startsWith(CACHE_PREFIX)) continue;
      if (k.startsWith(`${CACHE_PREFIX}${CLOSED}|`)) closed.push(k);
      else if (!k.startsWith(`${CACHE_PREFIX}${today}|`)) localStorage.removeItem(k);
    }
    closed.slice(0, Math.max(0, closed.length - MAX_CLOSED)).forEach((k) => localStorage.removeItem(k));
  } catch {
    /* 저장소를 못 쓰면 넘어간다 */
  }
}

/** 오류 코드 → 화면 문구 */
export const AI_ERROR_TEXT: Record<string, string> = {
  forbidden: '승인된 계정으로 로그인해야 AI 분석을 쓸 수 있습니다.',
  rate_limit: '요청이 많아 잠시 뒤 다시 시도해 주세요.',
  api_key: 'AI 연결 설정(API 키)이 되어 있지 않습니다. 관리자에게 알려 주세요.',
  refusal: 'AI가 이 자료에 답하지 않았습니다.',
  network: 'AI 분석 서버에 연결하지 못했습니다. (서버 함수가 아직 배포되지 않았을 수 있습니다)',
};

/** 서버 함수에 묻는다 — 서버가 같은 자리의 답을 이미 저장해 두었으면 Claude 를 부르지 않고 그 답을 돌려준다 (모두 같은 답) */
export async function requestAiInsight(facts: AiInsightFacts, slot: AiInsightSlot): Promise<AiInsightResult> {
  const { data, error } = await supabase.functions.invoke<{ result?: AiInsightResult; error?: string }>('ai-insight', { body: { ...slot, facts } });
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
  pruneCache(todayKey());
  try {
    localStorage.setItem(CACHE_PREFIX + aiSlotKey(facts, slot), JSON.stringify(data.result));
  } catch {
    /* 저장 실패는 무시 */
  }
  return data.result;
}
