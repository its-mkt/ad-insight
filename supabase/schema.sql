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

-- 3. 익명 키(anon) 읽기/쓰기/수정 정책 설정
drop policy if exists "Allow public read dashboard_snapshots" on public.dashboard_snapshots;
create policy "Allow public read dashboard_snapshots"
  on public.dashboard_snapshots for select
  to anon, authenticated
  using (true);

drop policy if exists "Allow public insert dashboard_snapshots" on public.dashboard_snapshots;
create policy "Allow public insert dashboard_snapshots"
  on public.dashboard_snapshots for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Allow public update dashboard_snapshots" on public.dashboard_snapshots;
create policy "Allow public update dashboard_snapshots"
  on public.dashboard_snapshots for update
  to anon, authenticated
  using (true)
  with check (true);

-- 4. 확인 쿼리
select * from public.dashboard_snapshots limit 1;
