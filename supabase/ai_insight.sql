-- ===============================================================
-- ad-insight AI 요약(Claude) 공용 저장소 — 모든 사람이 같은 답을 보게 한다
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 [Run] — 여러 번 실행해도 된다
--
-- 한 줄 = 사이트 · 화면 · 기간 · 필터 · 날짜 하나의 답
--   끝난 기간(지난달·지난해): 날짜 칸이 'closed' — 한 번 받은 답을 계속 쓴다
--   진행 중인 기간(이번 달 등): 날짜 칸이 그날(한국 시간) — 그날 처음 받은 답으로 하루 고정, 다음 날 새로 받는다
-- 읽기·쓰기는 서버 함수(supabase/functions/ai-insight)만 서비스 키로 한다 (RLS 로 직접 접근은 모두 막는다)
-- ===============================================================

create table if not exists public.ai_insight_cache (
  cache_key text primary key,              -- site|page|basis|scope|day 를 이은 키
  site text not null,                      -- itket · oncore
  page text not null,                      -- 화면 제목 (예: 종합 요약, 검색 결과: HPE)
  basis text not null,                     -- 기간 (예: 11월, 2026년 10월)
  scope text not null default '',          -- 화면 필터 (예: 카테고리·매체 선택)
  day text not null,                       -- 'closed' 또는 YYYY-MM-DD (한국 시간)
  facts jsonb not null,                    -- Claude 에 보낸 자료 (확인용)
  result jsonb not null,                   -- Claude 답 {summary, actions, caution}
  model text,
  created_at timestamptz not null default now()
);

create index if not exists ai_insight_cache_day_idx on public.ai_insight_cache (day);

alter table public.ai_insight_cache enable row level security;
-- 정책을 두지 않아 anon·authenticated 모두 직접 접근할 수 없다 (서버 함수의 서비스 키만 쓴다)
