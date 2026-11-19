-- ===============================================================
-- 회원가입 전 가입 여부 확인 (2026-11-19)
-- 회원가입 1단계에서 인증번호를 보내기 전에 이미 가입된 이메일인지 묻는다.
-- 가입됨 = 메일 인증을 마친 계정이 있다. 인증만 하고 정보 입력 전에 나간 사람도 가입됨으로 보고,
-- 비밀번호 찾기로 비밀번호를 정한 뒤 로그인하면 접속 화면이 승인 요청 폼을 띄운다.
-- Supabase 대시보드 > SQL Editor 에서 실행한다.
-- ===============================================================

create or replace function public.email_registered(p_email text) returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users
    where lower(email) = lower(trim(p_email))
      and email_confirmed_at is not null
  );
$$;

revoke all on function public.email_registered(text) from public;
grant execute on function public.email_registered(text) to anon, authenticated;
