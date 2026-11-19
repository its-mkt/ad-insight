-- ===============================================================
-- ad-insight 대시보드 Supabase 연동 테이블 스키마
-- Supabase 대시보드 > SQL Editor 에서 아래 쿼리를 붙여넣고 [Run] 을 누르세요.
-- ===============================================================

-- 1. 대시보드 통합 스냅샷 테이블 생성
create table if not exists public.dashboard_snapshots (
  id text primary key,                                 -- 'latest' 또는 'snapshot_YYYYMMDD_HHMISS'
  updated_at timestamptz default now() not null,       -- 갱신 시각
  month text,                                          -- 기준 월 (예: '2026-10')
  stats jsonb default '{}'::jsonb,                     -- 데이터 요약 (행 수, 총액 등)
  data jsonb not null                                  -- 대시보드 전체 데이터 JSON
);

-- 2. Row Level Security (RLS) 활성화
alter table public.dashboard_snapshots enable row level security;

-- 3. 공개(anon) 정책은 두지 않는다 — 2026-11-19 보안 점검에서 삭제
--    예전에는 누구나 읽기·추가·수정할 수 있었다. 공개 키가 화면 코드에 있어 승인 없이 데이터를 받을 수 있었으므로 지웠다.
--    지금 화면·수집기는 이 테이블을 쓰지 않는다 (데이터는 Apps Script 웹앱이 로그인 토큰을 확인한 뒤 준다).
--    RLS 만 켜 두면 anon·authenticated 는 아무것도 못 하고, 대시보드·service_role 로만 볼 수 있다.
drop policy if exists "Allow public read dashboard_snapshots" on public.dashboard_snapshots;
drop policy if exists "Allow public insert dashboard_snapshots" on public.dashboard_snapshots;
drop policy if exists "Allow public update dashboard_snapshots" on public.dashboard_snapshots;
