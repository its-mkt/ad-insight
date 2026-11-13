-- ===============================================================
-- its-ad-insight 이용 현황 (방문·페이지뷰·체류시간) 테이블과 함수
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 [Run] — 여러 번 실행해도 된다
--
-- 방문: 같은 기기(PC·휴대폰)는 하루(한국 시간)에 1회만 센다
--   기기는 '접속 IP + 기기 특징(fp: OS·화면 크기·CPU 코어 수)' 으로 판별한다
--   → 같은 기기에서 시크릿 창·다른 브라우저·인앱 브라우저로 열어도 1회
--   (fp 가 없는 옛 기록은 브라우저 저장 ID(device_id) 로 센다)
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
  ip text,                                        -- 그날 처음 접속 IP (같은 사무실은 같을 수 있음)
  logged_in boolean not null default false,       -- 그날 로그인한 상태로 쓴 적이 있으면 true
  primary key (visit_date, device_id, view)
);

alter table public.usage_daily enable row level security;
-- 정책을 두지 않아 anon·authenticated 모두 테이블에 직접 접근할 수 없다 (아래 함수만 쓴다)

alter table public.usage_daily add column if not exists fp text;  -- 기기 특징 (브라우저와 무관, 예: win-1920x1080-8)

-- 1-1. 요청 헤더의 접속 IP (없으면 null)
create or replace function public.usage_client_ip() returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_headers json;
begin
  v_headers := current_setting('request.headers', true)::json;
  return nullif(trim(split_part(coalesce(v_headers ->> 'cf-connecting-ip', v_headers ->> 'x-forwarded-for', ''), ',', 1)), '');
exception when others then
  return null;
end;
$$;

revoke all on function public.usage_client_ip() from public, anon, authenticated;  -- 기록 함수 안에서만 쓴다

-- 1-2. 방문을 세는 기기 키 — IP 와 기기 특징이 모두 있으면 'IP|특징', 아니면 브라우저 저장 ID
create or replace function public.usage_visit_key(p_ip text, p_fp text, p_device text) returns text
language sql
immutable
as $$
  select case when p_ip is not null and p_fp is not null then p_ip || '|' || p_fp else 'd:' || p_device end;
$$;

-- 2. 기록 — 화면을 열 때(p_pageview) / 보고 있던 시간을 모아 보낼 때(p_seconds)
--    인자 목록이 바뀌었으므로 옛 함수를 지운다 (남겨 두면 같은 이름 함수가 둘이라 호출이 모호해진다)
drop function if exists public.track_usage(text, text, boolean, int);
create or replace function public.track_usage(
  p_device text,
  p_view text,
  p_pageview boolean default false,
  p_seconds int default 0,
  p_fp text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := (now() at time zone 'Asia/Seoul')::date;
  v_sec int := least(greatest(coalesce(p_seconds, 0), 0), 600);  -- 한 번에 10분까지만
  v_fp text := case when p_fp ~ '^[a-z0-9x.-]{1,64}$' then p_fp end;
begin
  if p_device is null or p_device !~ '^[A-Za-z0-9-]{8,64}$' then return; end if;
  if p_view is null or p_view !~ '^[a-z-]{1,32}$' then return; end if;
  if not p_pageview and v_sec = 0 then return; end if;

  insert into public.usage_daily (visit_date, device_id, view, pageviews, active_seconds, ip, fp, logged_in)
  values (v_date, p_device, p_view, case when p_pageview then 1 else 0 end, v_sec, public.usage_client_ip(), v_fp, auth.uid() is not null)
  on conflict (visit_date, device_id, view) do update set
    pageviews = public.usage_daily.pageviews + excluded.pageviews,
    active_seconds = public.usage_daily.active_seconds + excluded.active_seconds,
    last_at = now(),
    ip = coalesce(public.usage_daily.ip, excluded.ip),  -- 그날 처음 IP 를 유지 (방문 키가 하루 중 바뀌지 않게)
    fp = coalesce(public.usage_daily.fp, excluded.fp),
    logged_in = public.usage_daily.logged_in or excluded.logged_in;
end;
$$;

revoke all on function public.track_usage(text, text, boolean, int, text) from public;
grant execute on function public.track_usage(text, text, boolean, int, text) to anon, authenticated;

-- 2-1. 카테고리 이용 — 카테고리 필터에서 고른 카테고리(선택·그 상태로 본 시간)와 표에서 펼친 카테고리 줄(선택만)
--      카테고리 키는 '1차' 또는 '1차 > 2차' (화면 데이터의 카테고리 키와 같은 모양)
create table if not exists public.usage_category_daily (
  visit_date date not null,                       -- 한국 시간 날짜
  device_id text not null,                        -- usage_daily 와 같은 기기 ID
  view text not null,                             -- 고른 화면 id (cat-efficiency, keywords …)
  category text not null,                         -- '1차' 또는 '1차 > 2차'
  picks int not null default 0,                   -- 필터로 고르거나 줄을 펼친 횟수
  active_seconds int not null default 0,          -- 필터를 그 카테고리로 둔 채 실제로 본 시간(초)
  logged_in boolean not null default false,
  last_at timestamptz not null default now(),
  primary key (visit_date, device_id, view, category)
);

alter table public.usage_category_daily enable row level security;

alter table public.usage_category_daily add column if not exists ip text;  -- 그날 처음 접속 IP
alter table public.usage_category_daily add column if not exists fp text;  -- 기기 특징 (usage_daily.fp 와 같음)

drop function if exists public.track_category(text, text, text, boolean, int);
create or replace function public.track_category(
  p_device text,
  p_view text,
  p_category text,
  p_pick boolean default false,
  p_seconds int default 0,
  p_fp text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := (now() at time zone 'Asia/Seoul')::date;
  v_sec int := least(greatest(coalesce(p_seconds, 0), 0), 600);  -- 한 번에 10분까지만
  v_fp text := case when p_fp ~ '^[a-z0-9x.-]{1,64}$' then p_fp end;
begin
  if p_device is null or p_device !~ '^[A-Za-z0-9-]{8,64}$' then return; end if;
  if p_view is null or p_view !~ '^[a-z-]{1,32}$' then return; end if;
  if p_category is null or char_length(p_category) not between 1 and 80 or p_category ~ '[[:cntrl:]]' then return; end if;
  if not p_pick and v_sec = 0 then return; end if;

  insert into public.usage_category_daily (visit_date, device_id, view, category, picks, active_seconds, ip, fp, logged_in)
  values (v_date, p_device, p_view, p_category, case when p_pick then 1 else 0 end, v_sec, public.usage_client_ip(), v_fp, auth.uid() is not null)
  on conflict (visit_date, device_id, view, category) do update set
    picks = public.usage_category_daily.picks + excluded.picks,
    active_seconds = public.usage_category_daily.active_seconds + excluded.active_seconds,
    last_at = now(),
    ip = coalesce(public.usage_category_daily.ip, excluded.ip),
    fp = coalesce(public.usage_category_daily.fp, excluded.fp),
    logged_in = public.usage_category_daily.logged_in or excluded.logged_in;
end;
$$;

revoke all on function public.track_category(text, text, text, boolean, int, text) from public;
grant execute on function public.track_category(text, text, text, boolean, int, text) to anon, authenticated;

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

  -- 같은 날 같은 브라우저(device_id)는 기기 키를 하나로 고정한다
  -- (하루 중 IP 가 바뀌거나 창을 다른 모니터로 옮겨 화면 크기가 달라져도 1회)
  with dkey as (
    select visit_date, device_id, min(public.usage_visit_key(ip, fp, device_id)) as vkey
    from public.usage_daily
    where visit_date between p_from and p_to
    group by visit_date, device_id
  ),
  base as (
    select u.*, k.vkey
    from public.usage_daily u
    join dkey k using (visit_date, device_id)
    where u.visit_date between p_from and p_to
      and (not p_exclude_logged_in
           or u.device_id not in (select distinct device_id from public.usage_daily where logged_in))
  ),
  cbase as (
    select c.*, coalesce(k.vkey, public.usage_visit_key(c.ip, c.fp, c.device_id)) as vkey
    from public.usage_category_daily c
    left join dkey k using (visit_date, device_id)
    where c.visit_date between p_from and p_to
      and (not p_exclude_logged_in
           or c.device_id not in (select distinct device_id from public.usage_daily where logged_in))
  )
  select json_build_object(
    'daily', coalesce((
      select json_agg(d order by d.date)
      from (
        select visit_date as date,
               count(distinct vkey) as visits,
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
               count(distinct visit_date::text || '|' || vkey) as visits,
               sum(pageviews) as pageviews,
               sum(active_seconds) as seconds
        from base
        group by view
      ) v
    ), '[]'::json),
    'devices', (select count(distinct vkey) from base),
    'ips', (select count(distinct ip) from base),  -- 화면에서는 안 쓰지만 옛 화면 호환으로 남긴다
    -- 기기 종류별 대수 — 기기 키의 fp 앞부분(OS)으로 나눈다. fp 가 없는 옛 기록은 unknown
    'device_kinds', (
      select json_build_object(
        'pc', count(distinct vkey) filter (where kind in ('win', 'mac', 'lnx')),
        'mobile', count(distinct vkey) filter (where kind in ('ios', 'and')),
        'other', count(distinct vkey) filter (where kind = 'etc'),
        'unknown', count(distinct vkey) filter (where kind is null)
      )
      from (
        select vkey, case when vkey like 'd:%' then null else split_part(split_part(vkey, '|', 2), '-', 1) end as kind
        from base
      ) k
    ),
    'since', (select min(visit_date) from public.usage_daily),
    -- 카테고리 키별 ('1차' / '1차 > 2차')
    'categories', coalesce((
      select json_agg(c order by c.picks desc)
      from (
        select category,
               count(distinct visit_date::text || '|' || vkey) as visits,
               sum(picks) as picks,
               sum(active_seconds) as seconds,
               array_agg(distinct view) as views
        from cbase
        group by category
      ) c
    ), '[]'::json),
    -- 1차 카테고리로 묶은 값 (방문은 겹치는 기기를 한 번만 센다)
    'category_groups', coalesce((
      select json_agg(g order by g.picks desc)
      from (
        select split_part(category, ' > ', 1) as category,
               count(distinct visit_date::text || '|' || vkey) as visits,
               sum(picks) as picks,
               sum(active_seconds) as seconds,
               array_agg(distinct view) as views
        from cbase
        group by split_part(category, ' > ', 1)
      ) g
    ), '[]'::json),
    'category_since', (select min(visit_date) from public.usage_category_daily)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.usage_stats(date, date, boolean) from public;
grant execute on function public.usage_stats(date, date, boolean) to authenticated;
