import { useEffect, useSyncExternalStore } from 'react';
import { currentAccessToken, postMemberAction } from '../lib/access';

export type MemberStatus = 'pending' | 'approved' | 'rejected' | 'revoked';
export interface MemberRow {
  email: string;
  name: string;
  team: string;
  status: MemberStatus;
  requested_at: string;
  decided_at: string;
  decided_by: string;
}

interface MembersState {
  /** 아직 한 번도 받지 않았으면 null */
  rows: MemberRow[] | null;
  error: string;
  /** 승인·거절·해제·삭제를 보내는 중인 이메일 */
  busy: string;
  /** 삭제 결과 안내 (명단만 지웠을 때 등) */
  notice: string;
}

// 승인 대기를 맨 위로, 그다음 최근 요청 순
const ORDER: Record<MemberStatus, number> = { pending: 0, approved: 1, rejected: 2, revoked: 3 };

/**
 * 가입 요청 명단 — 계정 관리 화면과 사이드바 승인 대기 뱃지가 같은 명단을 쓴다.
 * 한 곳에서 승인·거절하면 다른 곳도 바로 바뀌도록 화면 밖(모듈)에 한 벌만 둔다
 */
let state: MembersState = { rows: null, error: '', busy: '', notice: '' };
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

/** 명단을 다시 받는다 (받는 중이면 그 요청을 같이 기다린다) */
export function loadMembers(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    setState({ error: '' });
    const res = await postMemberAction<{ members?: MemberRow[] }>({ action: 'listMembers', access_token: await currentAccessToken() }).catch(
      () => ({ error: 'network' }) as { error: string; members?: MemberRow[] }
    );
    if (res.error || !res.members) setState({ error: '가입 요청 목록을 불러오지 못했습니다.', rows: state.rows ?? [] });
    else setState({ rows: [...res.members].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.requested_at.localeCompare(a.requested_at)) });
  })().finally(() => {
    loading = null;
  });
  return loading;
}

/** 승인(approved)·거절(rejected)·해제(revoked) 후 명단을 다시 받는다 */
export async function decideMember(email: string, status: Exclude<MemberStatus, 'pending'>): Promise<void> {
  setState({ busy: email });
  const res = await postMemberAction({ action: 'decideMember', access_token: await currentAccessToken(), email, status }).catch(() => ({ error: 'network' }));
  setState({ busy: '' });
  if (res.error) setState({ error: '바꾸지 못했습니다. 잠시 뒤 다시 시도해 주세요.' });
  else await loadMembers();
}

/**
 * 이용자 삭제 (해제와 별도) — 명단에서 지우고, 웹앱에 Supabase 관리자 키가 있으면 로그인 계정도 지운다.
 * 계정까지 지우면 다시 쓰려면 처음부터 회원가입해야 한다
 */
export async function deleteMember(email: string): Promise<void> {
  setState({ busy: email, notice: '' });
  const res = await postMemberAction<{ account?: string }>({ action: 'deleteMember', access_token: await currentAccessToken(), email }).catch(
    () => ({ error: 'network' }) as { error: string; account?: string }
  );
  setState({ busy: '' });
  if (res.error) {
    setState({ error: res.error === 'admin_protected' ? '관리자 계정은 삭제할 수 없습니다.' : '삭제하지 못했습니다. 잠시 뒤 다시 시도해 주세요.' });
    return;
  }
  const notice: Record<string, string> = {
    deleted: `${email} 을(를) 명단과 로그인 계정에서 삭제했습니다.`,
    missing: `${email} 을(를) 명단에서 삭제했습니다. (로그인 계정은 없었습니다)`,
    kept: `${email} 을(를) 명단에서 삭제했습니다. 로그인 계정은 남아 있어, 로그인하면 승인 요청 화면만 보입니다.`,
    failed: `${email} 을(를) 명단에서 삭제했지만 로그인 계정은 지우지 못했습니다.`,
  };
  setState({ notice: notice[res.account || 'kept'] || notice.kept });
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
    if (!enabled && state.rows) setState({ rows: null, error: '', notice: '' });
  }, [enabled]);
  return { ...snap, pending: snap.rows?.filter((r) => r.status === 'pending').length || 0 };
}
