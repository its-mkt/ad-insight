import { useEffect, useSyncExternalStore } from 'react';
import { postAuthedAction } from '../lib/access';
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

/** 명단을 다시 받는다 (받는 중이면 그 요청을 같이 기다린다) */
export function loadMembers(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    setState({ error: '', refreshing: true });
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
    showToast(`${who}의 등급을 ${roleText} 바꿨지만, 이용 현황의 계정별 조회 권한은 맞추지 못했습니다. Supabase usage_admins 를 확인해 주세요.`, 'warn');
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
