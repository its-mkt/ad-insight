import { useEffect, useSyncExternalStore } from 'react';
import { ACCESS_CHANGED_EVENT, postAuthedAction } from '../lib/access';
import { affiliationText } from '../lib/authErrors';
import { readDevSession } from '../lib/roleCache';
import { supabase } from '../lib/supabase';
import { showToast } from '../components/common/Toast';

export type MemberStatus = 'pending' | 'approved' | 'rejected' | 'revoked';
/** 승인된 계정의 등급 — member(일반) · manager(관리자). 최고 관리자는 명단(members 탭)이 아니라 admins 탭에 있다 */
export type MemberRole = 'member' | 'manager';
export interface MemberRow {
  email: string;
  name: string;
  team: string;
  status: MemberStatus;
  requested_at: string;
  decided_at: string;
  decided_by: string;
  /** 옛 웹앱 응답에는 없다 (일반으로 본다) */
  role?: MemberRole;
}

interface MembersState {
  /** 아직 한 번도 받지 않았으면 null */
  rows: MemberRow[] | null;
  error: string;
  /** 승인·거절·해제·삭제를 보내는 중인 이메일 */
  busy: string;
  /** 소유자 이메일 (데이터 시트 admins 탭 — 웹앱이 명단과 함께 보낸다, 옛 웹앱은 보내지 않는다) */
  owners: string[];
  /** 명단을 다시 받는 중 (새로 고침 버튼이 돈다) */
  refreshing: boolean;
  /** 마지막으로 명단을 받은 시각 (HH:mm, 한국 시간) */
  checkedAt: string;
}

// 승인 대기를 맨 위로, 그다음 최근 요청 순
const ORDER: Record<MemberStatus, number> = { pending: 0, approved: 1, rejected: 2, revoked: 3 };

/**
 * 가입 요청 명단 — 계정 관리 화면과 사이드바 승인 대기 뱃지가 같은 명단을 쓴다.
 * 한 곳에서 승인·거절하면 다른 곳도 바로 바뀌도록 화면 밖(모듈)에 한 벌만 둔다
 */
let state: MembersState = { rows: null, owners: [], error: '', busy: '', refreshing: false, checkedAt: '' };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const setState = (next: Partial<MembersState>) => {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getSnapshot = () => state;

/** 토스트 문구의 대상 — 이름이 있으면 '홍길동 님', 없으면 '메일 계정' (뒤에 '을'·'의'를 붙여 쓴다) */
const whoOf = (email: string): string => {
  const name = state.rows?.find((r) => r.email === email)?.name?.trim();
  return name ? `${name} 님` : `${email} 계정`;
};

/** 개발 서버 테스트 계정(로컬 전용)인지 — 웹앱 토큰이 없어 명단 대신 예시 명단을 보여 주고, 소유자 넘기기는 흐름만 돈다 */
export const isDevSession = (): boolean => readDevSession<object>() !== null;

/** 테스트 계정용 예시 명단 — 실제 사람이 아닌 example.com 주소 */
const DEV_MEMBERS: MemberRow[] = [
  { email: 'pending@example.com', name: '예시 대기', team: '예시회사 · 영업팀', status: 'pending', requested_at: '2026-11-19 09:00', decided_at: '', decided_by: '' },
  { email: 'manager@example.com', name: '예시 운영자', team: '예시회사 · 마케팅팀', status: 'approved', requested_at: '2026-11-10 10:00', decided_at: '2026-11-10 11:00', decided_by: 'admin@itket.com', role: 'manager' },
  { email: 'viewer@example.com', name: '예시 뷰어', team: '예시회사 · 기획팀', status: 'approved', requested_at: '2026-11-12 14:00', decided_at: '2026-11-12 15:00', decided_by: 'admin@itket.com', role: 'member' },
];

/** 명단을 다시 받는다 (받는 중이면 그 요청을 같이 기다린다) */
export function loadMembers(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    setState({ error: '', refreshing: true });
    if (isDevSession()) {
      setState({ owners: ['admin@itket.com'], rows: DEV_MEMBERS, checkedAt: new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }) });
      return;
    }
    const res = await postAuthedAction<{ members?: MemberRow[]; owners?: string[] }>('listMembers');
    if (res.error || !res.members) setState({ error: '가입 요청 목록을 불러오지 못했습니다.', rows: state.rows ?? [] });
    else
      setState({
        owners: res.owners || [],
        rows: [...res.members].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.requested_at.localeCompare(a.requested_at)),
        checkedAt: new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }),
      });
  })().finally(() => {
    loading = null;
    setState({ refreshing: false });
  });
  return loading;
}

/** 승인(approved)·거절(rejected)·해제(revoked) 후 명단을 다시 받는다 */
export async function decideMember(email: string, status: Exclude<MemberStatus, 'pending'>): Promise<void> {
  const who = whoOf(email);
  setState({ busy: email });
  const res = await postAuthedAction('decideMember', { email, status });
  setState({ busy: '' });
  if (res.error) {
    showToast(res.error === 'forbidden' ? '이 계정을 바꿀 권한이 없습니다. 운영자 계정은 소유자만 바꿀 수 있습니다.' : '바꾸지 못했습니다. 잠시 뒤 다시 시도해 주세요.', 'error');
    return;
  }
  const done: Record<typeof status, string> = {
    approved: `${who}을 승인했습니다.`,
    rejected: `${who}의 가입 요청을 거절했습니다.`,
    revoked: `${who}의 열람 권한을 해제했습니다.`,
  };
  showToast(done[status]);
  await loadMembers();
}

/** 등급 변경 (최고 관리자만) — 이용 현황의 계정별 조회 권한도 웹앱이 함께 맞춘다 */
export async function setMemberRole(email: string, role: MemberRole): Promise<void> {
  const who = whoOf(email);
  setState({ busy: email });
  const res = await postAuthedAction<{ usage?: string }>('setMemberRole', { email, role });
  setState({ busy: '' });
  if (res.error) {
    showToast(res.error === 'not_approved' ? '승인된 계정만 등급을 바꿀 수 있습니다.' : '등급을 바꾸지 못했습니다. 잠시 뒤 다시 시도해 주세요.', 'error');
    return;
  }
  const roleText = role === 'manager' ? '운영자로' : '뷰어로';
  // 이용 현황 권한을 못 맞췄으면 직접 확인해야 하므로 닫을 때까지 남는 주의 알림으로
  if (res.usage === 'failed' || res.usage === 'kept')
    showToast(`${who}의 등급을 ${roleText} 바꿨지만, 이용 현황의 계정별 조회 권한은 맞추지 못했습니다. Supabase usage_admins를 확인해 주세요.`, 'warn');
  else showToast(`${who}의 등급을 ${roleText} 바꿨습니다.`);
  await loadMembers();
}

/** 비밀번호 재설정 안내 메일을 보낸다 — 비밀번호는 보거나 바꾸지 않고, 본인이 '비밀번호 찾기'에서 새로 정한다 */
export async function sendPasswordGuide(email: string): Promise<void> {
  const who = whoOf(email);
  setState({ busy: email });
  const res = await postAuthedAction('sendPasswordGuide', { email });
  setState({ busy: '' });
  if (!res.error) {
    showToast(`${who}에게 비밀번호 재설정 안내 메일을 보냈습니다.`);
    return;
  }
  const text: Record<string, string> = {
    too_many: '같은 계정에는 한 시간에 3번까지 보낼 수 있습니다. 잠시 뒤 다시 시도해 주세요.',
    not_approved: '승인된 계정에만 보낼 수 있습니다.',
    forbidden: '이 계정에 보낼 권한이 없습니다. 운영자 계정은 소유자만 보낼 수 있습니다.',
  };
  showToast(text[res.error] || '안내 메일을 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.', 'error');
}

/**
 * 다른 계정의 담당자·회사·팀 고치기 (이메일은 바꾸지 않는다) — 권한은 승인·해제와 같다.
 * 웹앱이 명단을 고치고, Supabase 관리자 키가 있으면 그 사람 로그인 계정의 이름·소속도 맞춘다.
 * 실패면 창에 남길 문구를 돌려주고, 성공·부분 성공은 토스트로 알린다
 */
export async function editMember(email: string, info: { name: string; company: string; team: string }): Promise<{ error?: string }> {
  const next = { name: info.name.trim(), company: info.company.trim(), team: info.team.trim() };
  // 테스트 계정 — 웹앱 없이 예시 명단만 고친다
  if (isDevSession()) {
    setState({ rows: (state.rows || []).map((r) => (r.email === email ? { ...r, name: next.name, team: affiliationText(next.company, next.team) } : r)) });
    showToast(`${whoOf(email)}의 정보를 고쳤습니다. (테스트 계정이라 예시 명단만 바뀝니다)`);
    return {};
  }
  setState({ busy: email });
  const res = await postAuthedAction<{ account?: string }>('editMember', { email, ...next });
  setState({ busy: '' });
  if (res.error) {
    const text: Record<string, string> = {
      forbidden: '이 계정을 고칠 권한이 없습니다. 운영자 계정·내 계정은 소유자만 고칠 수 있습니다.',
      not_found: '명단에 없는 계정입니다. 새로고침한 뒤 다시 시도해 주세요.',
      bad_request: '담당자·회사·팀을 모두 입력해 주세요.',
    };
    return { error: text[res.error] || '저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.' };
  }
  const who = whoOf(email);
  await loadMembers();
  // 명단은 고쳤지만 로그인 계정 정보가 그대로면, 본인 내 계정 설정에는 옛 이름이 남는다
  if (res.account === 'failed' || res.account === 'kept')
    showToast(`${who}의 정보를 명단에 저장했지만, 로그인 계정(내 계정 설정)의 이름·소속은 맞추지 못했습니다.`, 'warn');
  else showToast(`${who}의 정보를 고쳤습니다.`);
  return {};
}

/**
 * 이용자 삭제 (해제와 별도) — 명단에서 지우고, 웹앱에 Supabase 관리자 키가 있으면 로그인 계정도 지운다.
 * 계정까지 지우면 다시 쓰려면 처음부터 회원가입해야 한다
 */
export async function deleteMember(email: string): Promise<void> {
  const who = whoOf(email);
  setState({ busy: email });
  const res = await postAuthedAction<{ account?: string }>('deleteMember', { email });
  setState({ busy: '' });
  if (res.error) {
    showToast(res.error === 'admin_protected' ? '소유자 계정은 삭제할 수 없습니다.' : '삭제하지 못했습니다. 잠시 뒤 다시 시도해 주세요.', 'error');
    return;
  }
  // 로그인 계정이 남았거나 못 지웠으면 닫을 때까지 남는 주의 알림으로
  const result: Record<string, [string, 'ok' | 'warn']> = {
    deleted: [`${who}을 명단과 로그인 계정에서 삭제했습니다.`, 'ok'],
    missing: [`${who}을 명단에서 삭제했습니다. (로그인 계정은 없었습니다)`, 'ok'],
    kept: [`${who}을 명단에서 삭제했습니다. 로그인 계정은 남아 있어, 로그인하면 승인 요청 화면만 보입니다.`, 'warn'],
    failed: [`${who}을 명단에서 삭제했지만, 로그인 계정은 지우지 못했습니다.`, 'warn'],
  };
  const [text, tone] = result[res.account || 'kept'] || result.kept;
  showToast(text, tone);
  await loadMembers();
}

/**
 * 가입 요청 명단 상태. enabled 일 때 아직 받지 않았으면 한 번 받는다 (관리자에게만 켠다)
 */
export function useMembers(enabled = true): MembersState & { pending: number } {
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    if (enabled && !state.rows && !loading) void loadMembers();
    // 로그아웃하면 받아 둔 명단을 지운다
    if (!enabled && state.rows) setState({ rows: null, owners: [], error: '', checkedAt: '' });
  }, [enabled]);
  return { ...snap, pending: snap.rows?.filter((r) => r.status === 'pending').length || 0 };
}

/** 소유자 넘기기 결과 — 실패면 문구와 다시 보여 줄 단계 */
export interface OwnerTransferResult {
  error?: string;
  /** 실패했을 때 돌아갈 창 단계 (받는 사람 확인·비밀번호) */
  step?: 'confirm' | 'password';
}

/**
 * 소유자 권한 넘기기 (소유자만) — 내 비밀번호로 다시 로그인해 새 토큰을 받은 뒤 웹앱에 보낸다.
 * 웹앱은 10분 안에 비밀번호로 로그인한 토큰만 받는다. 넘기면 나는 운영자가 되므로 권한을 다시 확인한다
 */
export async function transferOwner(
  email: string,
  confirm: string,
  password: string,
  me: { email?: string; name?: string; company?: string; team?: string; isDevAdmin?: boolean } | null
): Promise<OwnerTransferResult> {
  if (!me?.email) return { error: '로그인이 필요합니다.' };
  // 테스트 계정 — 비밀번호 확인·웹앱 요청 없이 흐름만 돌고 실제로는 넘기지 않는다
  if (me.isDevAdmin) {
    if (confirm.trim().toLowerCase() !== email.toLowerCase()) return { error: '받는 사람 이메일이 맞지 않습니다.', step: 'confirm' };
    await new Promise((r) => setTimeout(r, 600));
    showToast(`테스트 계정이라 실제로 넘기지 않았습니다. 실제 소유자 계정이면 ${whoOf(email)}에게 소유자 권한이 넘어갑니다.`, 'warn');
    return {};
  }
  const check = await supabase.auth.signInWithPassword({ email: me.email, password });
  if (check.error) return { error: '비밀번호가 맞지 않습니다.', step: 'password' };
  const who = whoOf(email);
  setState({ busy: email });
  const res = await postAuthedAction<{ usage?: string }>('transferOwner', {
    email,
    confirm,
    name: me.name || '',
    team: affiliationText(me.company || '', me.team || ''),
  });
  setState({ busy: '' });
  if (res.error) {
    const text: Record<string, OwnerTransferResult> = {
      reauth_required: { error: '본인 확인이 끝나지 않았습니다. 비밀번호를 다시 입력해 주세요.', step: 'password' },
      confirm_mismatch: { error: '받는 사람 이메일이 맞지 않습니다.', step: 'confirm' },
      not_manager: { error: '승인된 운영자에게만 넘길 수 있습니다. 먼저 등급을 운영자로 바꿔 주세요.' },
      not_found: { error: '명단에 없는 계정입니다. 새로고침한 뒤 다시 시도해 주세요.' },
      forbidden: { error: '소유자만 넘길 수 있습니다.' },
      busy: { error: '다른 변경을 처리하는 중입니다. 잠시 뒤 다시 시도해 주세요.' },
    };
    return text[res.error] || { error: '넘기지 못했습니다. 잠시 뒤 다시 시도해 주세요.' };
  }
  showToast(`${who}에게 소유자 권한을 넘겼습니다. 이제 운영자 권한으로 보입니다.`);
  // 내 등급이 운영자로 바뀌었으니 화면 권한을 다시 확인하고, 명단도 다시 받는다
  window.dispatchEvent(new Event(ACCESS_CHANGED_EVENT));
  await loadMembers();
  return {};
}
