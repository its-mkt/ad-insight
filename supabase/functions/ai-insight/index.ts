// AI 인사이트 — 화면이 이미 계산한 숫자(KPI·규칙 인사이트)를 Claude 에 보내 요약·추천 문장을 받는다.
// 답은 ai_insight_cache 테이블(supabase/ai_insight.sql)에 저장해 모두 같은 답을 본다 — 진행 중인 기간은 하루, 끝난 기간은 계속.
// 배포: supabase functions deploy ai-insight   (비밀값: supabase secrets set ANTHROPIC_API_KEY=...)
// 숫자는 화면이 넘긴 것만 쓰게 하고(새 숫자 금지), 견적 고객 정보는 화면에서 아예 보내지 않는다.
import Anthropic from 'npm:@anthropic-ai/sdk@1.12.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

// AI 요약은 품질이 중요해 가장 뛰어난 모델을 쓴다 (2026-11-24 사용자 허용). 이 모델이 계정 설정 등으로 거부되면 FALLBACK_MODEL 로 다시 묻는다
const MODEL = 'claude-fable-5-2';
const FALLBACK_MODEL = 'claude-opus-5-5';

/** 열람 권한을 판정하는 수집기 웹앱 (화면의 기본값과 같음) — 바꾸려면 WHOAMI_URL 비밀값 */
const WHOAMI_URL =
  Deno.env.get('WHOAMI_URL') ||
  'https://script.google.com/macros/s/AKfycbzQS9yMlp9L_eRaH77QWLsY6GOY7L5hyRk1fkuaAHg8GvJmHHwhPRgr2zWldgbX5-cNcg/exec';

/** 호출을 허용할 화면 주소 */
const ALLOWED_ORIGINS = ['https://its.itket.com', 'http://localhost:2000', 'http://127.0.0.1:2000'];

const VIEW_ROLES = new Set(['admin', 'manager', 'member']);

/** 답을 저장할 사이트 */
const SITES = new Set(['itket', 'oncore']);

/** 오늘 날짜 (YYYY-MM-DD, 한국 시간) — 화면(lib/aiInsight todayKey)과 같은 기준 */
const todayKst = (): string => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

/** 한 번에 받는 자료 크기 상한 (글자 수) — 화면 요약만 보내므로 넉넉하다 */
const MAX_BODY = 20000;

// 페르소나: B2B IT 유통 검색광고를 오래 운영한 시니어 퍼포먼스 마케터 (2026-11-23 사용자 요청 — "베테랑·시니어 마케터처럼 요약을 잘해야 한다")
const SYSTEM = `당신은 B2B IT 장비 유통(서버·스토리지·워크스테이션·노트북·네트워크) 검색광고를 15년 넘게 운영해 온 시니어 퍼포먼스 마케터입니다. 네이버·구글 검색광고 예산을 직접 집행하고, 광고비가 실제 견적과 매출로 이어졌는지로 성과를 판단해 왔습니다. 지금은 아이티켓 마케팅팀이 대시보드 한 화면을 열었을 때, 옆자리 팀장이 화면을 훑어보고 핵심만 짚어 주듯 정리해 주는 역할입니다.

사용자가 보내는 JSON 은 그 화면의 실제 수집값과, 그 숫자로 규칙에 따라 만든 1차 인사이트입니다. 1차 인사이트는 사실을 하나씩 나열한 것이라, 당신의 일은 그것들을 엮어 "그래서 지금 무엇이 중요한가"를 판단해 주는 것입니다.

JSON 에 data 가 있으면 그 화면의 수치 요약(KPI·비교 기간·추이·견적 구성·광고비 상위 캠페인·키워드)입니다. 먼저 data 를 읽어 흐름을 파악한 뒤 1차 인사이트와 맞춰 보고, 1차 인사이트가 놓친 것(예: 추이의 꺾임, 광고비가 한 키워드에 쏠림, 전체 대비 비중의 크기)도 근거로 씁니다. data 의 키 이름이 곧 지표 이름이며, 값이 없는 지표는 수집되지 않은 것이니 언급하지 않습니다.

화면별로 볼 것:
- 검색 결과 화면(page 가 '검색 결과:' 로 시작): 검색어 하나(제품군·브랜드·카테고리·유입 매체)의 성과입니다. 요약의 첫 문장은 이 검색어가 같은 기간 전체에서 어떤 위치인지(광고비·견적 비중, 추정CPA 대 전체평균CPA)로 판정하고, 둘째 문장은 비교 기간 대비 변화나 추이에서 가장 큰 움직임을 댑니다. 추천은 이 검색어 안에서 손댈 곳(광고비 상위 키워드·캠페인 중 전환 없는 곳, 효율 좋은 키워드 확대, 견적이 몰리는 카테고리·유입 매체)으로 좁힙니다. 견적이 몇 건 안 되면 비율 해석을 아끼고 건수 그대로 말합니다. 검색범위가 유입 매체면 광고비·CPA 는 없으니 견적 건수·비중·구성만으로 판단합니다.

요약(summary)을 쓰는 법:
- 한눈에 읽혀야 합니다. 2문장, 합쳐서 공백 포함 130~160자로 씁니다. 160자를 넘으면 다시 줄이고, 130자보다 짧으면 판정의 근거 숫자를 하나 더 붙입니다.
- 첫 문장은 이 기간 성과를 한마디로 판정합니다 (좋다·나쁘다·비용은 늘었는데 견적은 그대로다 등). 숫자 나열로 시작하지 않습니다.
- 둘째 문장에 가장 큰 이유 하나를 핵심 숫자 2~3개로만 댑니다. 광고비·견적·CPA 처럼 연결되는 지표는 인과로 묶고, 원 단위 금액은 만원 단위로 줄여 씁니다 (147,371원 → 약 15만원). 화면 KPI 에 이미 보이는 숫자를 모두 되풀이하지 않습니다.
- 부차적인 사실(유입 경로 세부, 개별 키워드 등)은 요약에 넣지 말고 추천으로 보냅니다.

추천(actions)을 고르는 법:
- 최대 4개(보통 2~4개), 영향이 큰 순서로 고릅니다. 마케터·담당자가 실제로 챙겨 보는 관점(예: 키워드별 성과, 카테고리별 효율, 광고비 집행·매체 배분, 견적 흐름)에서 이번 주에 손댈 수 있는 것만 넣습니다. 한 관점에서 여러 개를 내기보다 서로 다른 관점을 고르게 다루고, 할 말이 없는 관점은 억지로 채우지 않습니다. "모니터링하세요" 같은 일반론은 넣지 않습니다.
- 각 추천에는 왜 그것인지 보여 주는 숫자 하나 이상을 붙입니다.
- 추천마다 손댈 대상(키워드·캠페인·카테고리·매체 이름)과 방향(줄이기·늘리기·옮기기·점검)을 분명히 씁니다. 줄이자는 추천과 늘리자는 추천이 있으면 서로 이어 "어디서 줄여 어디로 옮길지" 가 보이게 합니다.
- 건수가 아주 적은 근거(전환 1~2건, 견적 몇 건)로 확대를 권할 때는 표본이 작다는 점을 짧게 붙입니다.
- 추천 본문(text)은 공백 포함 최대 90자로 압축합니다. 넘으면 다시 줄여 씁니다. "무엇을 할지 + 핵심 근거 숫자 1~2개" 만 남기고 배경 설명·조건 나열·반복·인사말은 뺍니다. 금액은 만원 단위로 반올림합니다 (예: "서버 예산을 스토리지로 옮겨 보세요 — 서버 CPA 12만원, 스토리지 5만원").
- 광고비 비중이 작거나 건수가 적어 우연일 수 있는 변화는 크게 다루지 않습니다.

숫자와 사실에 대해서는 엄격합니다:
- 숫자는 JSON 에 있는 값만 씁니다. 새 숫자·추정치·예측치(예: 다음 달 예상 견적)를 만들지 않습니다. 계산이 필요하면 JSON 의 두 값으로 바로 나오는 비율·차이만 씁니다. 큰 금액을 만원 단위로 반올림해 쓰는 것은 괜찮습니다.
- JSON 에 없는 사실(경쟁사, 시즌, 시장 상황)은 단정하지 않고, 필요하면 확인해 볼 것으로만 적습니다.
- '전환'은 광고 매체가 집계한 전환이고 '견적'은 실제 견적 접수입니다. 둘을 섞지 않습니다. 성과 판정(좋다·나쁘다)은 견적 기준으로 하고, 키워드·캠페인별 추천은 키워드별 견적이 수집되지 않아 매체 전환 기준이므로 그 추천에는 '전환' 이라는 말을 그대로 씁니다.
- 추정CPA 는 광고비 ÷ 그 범위의 전체 견적(직접·전화 등 광고 외 유입 포함)입니다. 광고만으로 얻은 견적의 단가가 아니므로 '광고 효율' 로 단정할 때는 견적 구성의 광고 유입 건수를 함께 봅니다.
- 진행 중인 기간(이번기간_집계 가 있거나 오늘이 그 기간 안)이면 덜 찬 값입니다. 한 달 전체 값(참고_…_한달전체)과 바로 비교해 '줄었다' 고 판정하지 않습니다. 같은기간 값이 있으면 그것과 비교하고, 없으면 증감 판정을 하지 않고 비중·CPA 같은 비율로만 판단합니다.

한국어 존댓말(~합니다/~해 보세요)로, 마케터끼리 쓰는 말투로 짧고 단정하게 씁니다.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '첫 문장은 성과 판정, 둘째 문장은 가장 큰 이유와 핵심 숫자 — 2문장, 공백 포함 130~160자' },
    actions: {
      type: 'array',
      description: '영향이 큰 순서의 추천 행동 최대 4개, 서로 다른 관점(키워드·카테고리·광고비·견적 등) (이번 주에 실행할 수 있는 것만)',
      items: {
        type: 'object',
        properties: {
          tone: { type: 'string', enum: ['good', 'bad', 'info'] },
          title: { type: 'string', description: '10자 안팎의 짧은 머리말 (예: 예산 이동, 키워드 정리)' },
          text: { type: 'string', description: '무엇을 할지 + 근거 숫자, 공백 포함 최대 90자' },
        },
        required: ['tone', 'title', 'text'],
        additionalProperties: false,
      },
    },
    caution: { type: 'string', description: '꼭 알아야 할 주의점만 짧게 1문장(50자 안팎). 없으면 빈 문자열' },
  },
  required: ['summary', 'actions', 'caution'],
  additionalProperties: false,
};

const cors = (origin: string | null): Record<string, string> => ({
  'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
});

const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } });

/** 로그인 토큰이 유효하고, 수집기 웹앱이 승인 회원으로 보는지 */
async function canView(token: string): Promise<boolean> {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return false;
  try {
    const url = `${WHOAMI_URL}${WHOAMI_URL.includes('?') ? '&' : '?'}whoami=1&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const j = (await res.json()) as { role?: string };
    return VIEW_ROLES.has(j.role || '');
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'method' }, 405, origin);

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || !(await canView(token))) return json({ error: 'forbidden' }, 403, origin);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: 'too_large' }, 413, origin);
  // 본문: { site, scope, facts } — 답은 사이트·화면·기간·필터·날짜(끝난 기간은 closed)마다 하나만 저장해 모두 같은 답을 본다
  type Facts = { page?: unknown; basis?: unknown; 기간상태?: unknown };
  let body: { site?: unknown; scope?: unknown; facts?: Facts };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'bad_json' }, 400, origin);
  }
  const facts = body.facts;
  const site = String(body.site || '');
  const scope = String(body.scope || '').slice(0, 300);
  if (!facts || typeof facts.page !== 'string' || typeof facts.basis !== 'string' || !SITES.has(site)) return json({ error: 'bad_request' }, 400, origin);
  // 진행 중인 기간은 그날 처음 만든 답으로 하루 고정, 끝난 기간은 계속 같은 답 — 화면 aiSlotKey 와 같은 규칙
  const day = facts.기간상태 === '마감' ? 'closed' : todayKst();
  const cacheKey = [day, site, facts.page, facts.basis, scope].join('|');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const stored = await db.from('ai_insight_cache').select('result, model').eq('cache_key', cacheKey).maybeSingle();
  if (stored.data) return json({ result: stored.data.result, model: stored.data.model, cached: true }, 200, origin);

  const client = new Anthropic(); // ANTHROPIC_API_KEY 비밀값을 읽는다
  const ask = (model: string) =>
    client.beta.messages.create({
      model,
      max_tokens: 16000,
      // 안전 분류기가 거절하면 서버가 다른 모델로 다시 돌린다 (거절 범주별 기본 경로)
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `대시보드 화면 자료(JSON):\n${JSON.stringify(facts)}` }],
    });
  try {
    let response;
    try {
      response = await ask(MODEL);
    } catch (e) {
      // 상위 모델을 이 계정에서 쓸 수 없으면(데이터 보관 설정·권한 등 400/403/404) 기본 모델로 다시 묻는다
      if (e instanceof Anthropic.APIError && [400, 403, 404].includes(e.status ?? 0)) response = await ask(FALLBACK_MODEL);
      else throw e;
    }
    if (response.stop_reason === 'refusal') return json({ error: 'refusal' }, 422, origin);
    if (response.stop_reason === 'max_tokens') return json({ error: 'truncated' }, 502, origin);
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    const result = JSON.parse(text);
    // 같은 자리에 동시에 물은 사람이 있으면 먼저 저장된 답을 돌려준다 (모두 같은 답)
    await db
      .from('ai_insight_cache')
      .upsert({ cache_key: cacheKey, site, page: facts.page, basis: facts.basis, scope, day, facts, result, model: response.model }, { onConflict: 'cache_key', ignoreDuplicates: true });
    const saved = await db.from('ai_insight_cache').select('result, model').eq('cache_key', cacheKey).maybeSingle();
    return json({ result: saved.data?.result ?? result, model: saved.data?.model ?? response.model }, 200, origin);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'rate_limit' }, 429, origin);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'api_key' }, 500, origin);
    if (e instanceof Anthropic.APIError) return json({ error: 'api', status: e.status }, 502, origin);
    return json({ error: 'server' }, 500, origin);
  }
});
