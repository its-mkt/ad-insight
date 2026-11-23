// AI 인사이트 — 화면이 이미 계산한 숫자(KPI·규칙 인사이트)를 Claude 에 보내 요약·추천 문장을 받는다.
// 배포: supabase functions deploy ai-insight   (비밀값: supabase secrets set ANTHROPIC_API_KEY=...)
// 숫자는 화면이 넘긴 것만 쓰게 하고(새 숫자 금지), 견적 고객 정보는 화면에서 아예 보내지 않는다.
import Anthropic from 'npm:@anthropic-ai/sdk@1.12.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

const MODEL = 'claude-opus-5-5';

/** 열람 권한을 판정하는 수집기 웹앱 (화면의 기본값과 같음) — 바꾸려면 WHOAMI_URL 비밀값 */
const WHOAMI_URL =
  Deno.env.get('WHOAMI_URL') ||
  'https://script.google.com/macros/s/AKfycbzQS9yMlp9L_eRaH77QWLsY6GOY7L5hyRk1fkuaAHg8GvJmHHwhPRgr2zWldgbX5-cNcg/exec';

/** 호출을 허용할 화면 주소 */
const ALLOWED_ORIGINS = ['https://its.itket.com', 'http://localhost:2000', 'http://127.0.0.1:2000'];

const VIEW_ROLES = new Set(['admin', 'manager', 'member']);

/** 한 번에 받는 자료 크기 상한 (글자 수) — 화면 요약만 보내므로 넉넉하다 */
const MAX_BODY = 20000;

const SYSTEM = `너는 IT 장비 유통사(아이티켓)의 검색광고 성과를 읽는 마케팅 분석가다.
사용자가 보내는 JSON 은 대시보드 한 화면의 실제 수집값과, 그 숫자로 규칙에 따라 만든 1차 인사이트다.

반드시 지킬 것:
- 숫자는 JSON 에 있는 값만 쓴다. 새 숫자·추정치·예측치(예: 다음 달 예상 견적)를 만들지 않는다. 계산이 필요하면 JSON 의 두 값으로 바로 나오는 비율·차이만 쓴다.
- JSON 에 없는 사실(경쟁사, 시즌, 시장 상황)은 단정하지 말고, 필요하면 "확인해 볼 것"으로만 적는다.
- '전환'은 광고 매체가 집계한 전환이고 '견적'은 실제 견적 접수다. 둘을 섞지 않는다.
- 진행 중인 기간(어제까지 집계)이면 그 점을 감안해 단정하지 않는다.
- 한국어로, 담당자가 바로 행동할 수 있게 짧고 구체적으로 쓴다. 존댓말(~합니다/~해 보세요).
- 1차 인사이트를 그대로 반복하지 말고, 우선순위를 정하고 서로 연결해 해석한다.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '이 화면 기간 성과를 2~3문장으로' },
    actions: {
      type: 'array',
      description: '우선순위 순 추천 행동 2~4개',
      items: {
        type: 'object',
        properties: {
          tone: { type: 'string', enum: ['good', 'bad', 'info'] },
          title: { type: 'string', description: '짧은 머리말 (예: 예산 이동, 키워드 정리)' },
          text: { type: 'string', description: '근거 숫자와 함께 무엇을 할지 1~2문장' },
        },
        required: ['tone', 'title', 'text'],
        additionalProperties: false,
      },
    },
    caution: { type: 'string', description: '해석할 때 주의할 점 1문장. 없으면 빈 문자열' },
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
  let facts: unknown;
  try {
    facts = JSON.parse(raw);
  } catch {
    return json({ error: 'bad_json' }, 400, origin);
  }

  const client = new Anthropic(); // ANTHROPIC_API_KEY 비밀값을 읽는다
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // 안전 분류기가 거절하면 서버가 다른 모델로 다시 돌린다 (거절 범주별 기본 경로)
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `대시보드 화면 자료(JSON):\n${JSON.stringify(facts)}` }],
    });
    if (response.stop_reason === 'refusal') return json({ error: 'refusal' }, 422, origin);
    if (response.stop_reason === 'max_tokens') return json({ error: 'truncated' }, 502, origin);
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    return json({ result: JSON.parse(text), model: response.model }, 200, origin);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'rate_limit' }, 429, origin);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'api_key' }, 500, origin);
    if (e instanceof Anthropic.APIError) return json({ error: 'api', status: e.status }, 502, origin);
    return json({ error: 'server' }, 500, origin);
  }
});
