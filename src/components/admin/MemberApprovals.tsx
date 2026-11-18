import React, { useCallback, useEffect, useState } from 'react';
import { Card } from '../common/Card';
import { Th } from '../common/Th';
import { Button } from '../common/Button';
import { StatusBadge, type StatusLevel } from '../common/StatusBadge';
import { EmptyState } from '../common/EmptyState';
import { SkelRows } from '../common/SkeletonView';
import { Notice } from '../common/Notice';
import { currentAccessToken, postMemberAction } from '../../lib/access';

type MemberStatus = 'pending' | 'approved' | 'rejected' | 'revoked';
interface MemberRow {
  email: string;
  name: string;
  team: string;
  status: MemberStatus;
  requested_at: string;
  decided_at: string;
  decided_by: string;
}

const STATUS_TEXT: Record<MemberStatus, { label: string; level: StatusLevel }> = {
  pending: { label: '승인 대기', level: 'warn' },
  approved: { label: '승인됨', level: 'ok' },
  rejected: { label: '거절', level: 'err' },
  revoked: { label: '해제', level: 'err' },
};
// 승인 대기를 맨 위로, 그다음 최근 요청 순
const ORDER: Record<MemberStatus, number> = { pending: 0, approved: 1, rejected: 2, revoked: 3 };

/**
 * 가입 요청·열람 권한 관리 — 관리자만 보인다 (어드민 화면).
 * 명단은 데이터 시트 members 탭이고, 승인·거절·해제는 웹앱이 관리자 토큰을 확인한 뒤 바꾼다.
 */
export const MemberApprovals: React.FC = () => {
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setError('');
    const res = await postMemberAction<{ members?: MemberRow[] }>({ action: 'listMembers', access_token: await currentAccessToken() }).catch(() => ({ error: 'network' }) as { error: string; members?: MemberRow[] });
    if (res.error || !res.members) {
      setError('가입 요청 목록을 불러오지 못했습니다.');
      setRows([]);
      return;
    }
    setRows([...res.members].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.requested_at.localeCompare(a.requested_at)));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (email: string, status: Exclude<MemberStatus, 'pending'>) => {
    setBusy(email);
    const res = await postMemberAction({ action: 'decideMember', access_token: await currentAccessToken(), email, status }).catch(() => ({ error: 'network' }));
    setBusy('');
    if (res.error) setError('바꾸지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
    else await load();
  };

  const pending = rows?.filter((r) => r.status === 'pending').length || 0;

  return (
    <Card
      name="members"
      title="가입 요청·열람 권한"
      subtitle={rows ? `승인 대기 ${pending}건 · 전체 ${rows.length}명` : undefined}
      tools={<Button size="sm" onClick={() => void load()}>새로 고침</Button>}
      tableWrap
    >
      {error && <Notice tone="warn">{error}</Notice>}
      <table className="stk">
        <thead>
          <tr>
            <Th>이름</Th>
            <Th>소속</Th>
            <Th>이메일</Th>
            <Th>상태</Th>
            <Th>요청</Th>
            <Th>처리</Th>
            <Th>관리</Th>
          </tr>
        </thead>
        <tbody>
          {!rows ? (
            <SkelRows rows={3} widths={['4rem', '6rem', '10rem', '4rem', '6rem', '6rem', '8rem']} />
          ) : (
            rows.map((r) => (
              <tr key={r.email}>
                <td>{r.name}</td>
                <td>{r.team}</td>
                <td>{r.email}</td>
                <td>
                  <StatusBadge level={STATUS_TEXT[r.status]?.level || 'warn'} size="sm">
                    {STATUS_TEXT[r.status]?.label || r.status}
                  </StatusBadge>
                </td>
                <td>{r.requested_at}</td>
                <td>{r.decided_at ? `${r.decided_at}` : '–'}</td>
                <td className="member-actions">
                  {r.status !== 'approved' && (
                    <Button size="sm" variant="primary" disabled={busy === r.email} onClick={() => void decide(r.email, 'approved')}>
                      승인
                    </Button>
                  )}
                  {r.status === 'pending' && (
                    <Button size="sm" disabled={busy === r.email} onClick={() => void decide(r.email, 'rejected')}>
                      거절
                    </Button>
                  )}
                  {r.status === 'approved' && (
                    <Button size="sm" disabled={busy === r.email} onClick={() => void decide(r.email, 'revoked')}>
                      해제
                    </Button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {rows && rows.length === 0 && !error && <EmptyState message="가입 요청이 없습니다." />}
    </Card>
  );
};
