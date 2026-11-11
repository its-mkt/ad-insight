-- ===============================================================
-- its-ad-insight 이용 현황 (방문·페이지뷰·체류시간) 테이블과 함수
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 [Run] — 여러 번 실행해도 된다
--
-- 방문: 같은 기기(브라우저)는 하루(한국 시간)에 1회만 센다 → (날짜, 기기) 를 키로 둔다
-- 기록은 track_usage 함수로만 넣고, 조회는 로그인한 계정만 usage_stats 함수로 한다
-- (테이블 직접 읽기·쓰기는 RLS 로 모두 막는다)
-- ===============================================================

-- 1. 날짜·기기·화면별 하루 집계 한 줄
create table if not exists public.usage_daily (
  visit_date date not null,                       -- 한국 시간 날짜
  device_id text not null,                        -- 브라우저에 저장한 임의 기기 ID
  view text not null,                             -- 화면 id (overview, ads, search …)
  pageviews int not null default 0,               -- 그 화면을 연 횟수
  active_seconds int not null default 0,          -- 그 화면을 실제로 보고 있던 시간(초)
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  ip text,                                        -- 마지막 접속 IP (참고용, 같은 사무실은 같을 수 있음)
  logged_in boolean not null default false,       -- 그날 로그인한 상태로 쓴 적이 있으면 true
  primary key (visit_date, device_id, view)
);

alter table public.usage_daily enable row level security;
-- 정책을 두지 않아 anon·authenticated 모두 테이블에 직접 접근할 수 없다 (아래 함수만 쓴다)

-- 2. 기록 — 화면을 열 때(p_pageview) / 보고 있던 시간을 모아 보낼 때(p_seconds)
create or replace function public.track_usage(
  p_device text,
  p_view text,
  p_pageview boolean default false,
  p_seconds int default 0
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := (now() at time zone 'Asia/Seoul')::date;
  v_sec int := least(greatest(coalesce(p_seconds, 0), 0), 600);  -- 한 번에 10분까지만
  v_headers json;
  v_ip text;
begin
  if p_device is null or p_device !~ '^[A-Za-z0-9-]{8,64}$' then return; end if;
  if p_view is null or p_view !~ '^[a-z-]{1,32}$' then return; end if;
  if not p_pageview and v_sec = 0 then return; end if;

  begin
    v_headers := current_setting('request.headers', true)::json;
    v_ip := trim(split_part(coalesce(v_headers ->> 'cf-connecting-ip', v_headers ->> 'x-forwarded-for', ''), ',', 1));
  exception when others then
    v_ip := null;
  end;

  insert into public.usage_daily (visit_date, device_id, view, pageviews, active_seconds, ip, logged_in)
  values (v_date, p_device, p_view, case when p_pageview then 1 else 0 end, v_sec, nullif(v_ip, ''), auth.uid() is not null)
  on conflict (visit_date, device_id, view) do update set
    pageviews = public.usage_daily.pageviews + excluded.pageviews,
    active_seconds = public.usage_daily.active_seconds + excluded.active_seconds,
    last_at = now(),
    ip = coalesce(excluded.ip, public.usage_daily.ip),
    logged_in = public.usage_daily.logged_in or excluded.logged_in;
end;
$$;

revoke all on function public.track_usage(text, text, boolean, int) from public;
grant execute on function public.track_usage(text, text, boolean, int) to anon, authenticated;

-- 3. 조회 — 로그인한 계정만. p_exclude_logged_in 이면 한 번이라도 로그인했던 기기(관리자)는 뺀다
create or replace function public.usage_stats(
  p_from date,
  p_to date,
  p_exclude_logged_in boolean default false
) returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  if auth.uid() is null then
    raise exception 'login required' using errcode = '42501';
  end if;

  with base as (
    select *
    from public.usage_daily u
    where u.visit_date between p_from and p_to
      and (not p_exclude_logged_in
           or u.device_id not in (select distinct device_id from public.usage_daily where logged_in))
  )
  select json_build_object(
    'daily', coalesce((
      select json_agg(d order by d.date)
      from (
        select visit_date as date,
               count(distinct device_id) as visits,
               sum(pageviews) as pageviews,
               sum(active_seconds) as seconds
        from base
        group by visit_date
      ) d
    ), '[]'::json),
    'views', coalesce((
      select json_agg(v order by v.pageviews desc)
      from (
        select view,
               count(distinct visit_date::text || '|' || device_id) as visits,
               sum(pageviews) as pageviews,
               sum(active_seconds) as seconds
        from base
        group by view
      ) v
    ), '[]'::json),
    'devices', (select count(distinct device_id) from base),
    'ips', (select count(distinct ip) from base),
    'since', (select min(visit_date) from public.usage_daily)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.usage_stats(date, date, boolean) from public;
grant execute on function public.usage_stats(date, date, boolean) to authenticated;
