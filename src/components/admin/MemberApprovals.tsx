import React from 'react';
import { Card } from '../common/Card';
import { Th } from '../common/Th';
import { Button } from '../common/Button';
import { StatusBadge, type StatusLevel } from '../common/StatusBadge';
import { EmptyState } from '../common/EmptyState';
import { SkelRows } from '../common/SkeletonView';
import { Notice } from '../common/Notice';
import { decideMember, loadMembers, useMembers, type MemberStatus } from '../../hooks/useMembers';

const STATUS_TEXT: Record<MemberStatus, { label: string; level: StatusLevel }> = {
  pending: { label: '승인 대기', level: 'warn' },
  approved: { label: '승인됨', level: 'ok' },
  rejected: { label: '거절', level: 'err' },
  revoked: { label: '해제', level: 'err' },
};

/**
 * 가입 요청·열람 권한 관리 — 관리자만 보인다 (계정 관리 화면).
 * 명단은 데이터 시트 members 탭이고, 승인·거절·해제는 웹앱이 관리자 토큰을 확인한 뒤 바꾼다.
 * 명단 상태는 사이드바 승인 대기 뱃지와 함께 쓴다 (useMembers)
 */
export const MemberApprovals: React.FC = () => {
  const { rows, error, busy, pending } = useMembers();
  const decide = (email: string, status: Exclude<MemberStatus, 'pending'>) => void decideMember(email, status);

  return (
    <Card
      name="members"
      title="가입 요청·열람 권한"
      subtitle={rows ? `승인 대기 ${pending}건 · 전체 ${rows.length}명` : undefined}
      tools={<Button size="sm" onClick={() => void loadMembers()}>새로 고침</Button>}
      tableWrap
    >
      {error && <Notice tone="warn">{error}</Notice>}
      {pending > 0 && (
        <Notice tone="warn">
          가입할 때 이메일 인증을 하지 않으므로, 승인 전에 요청자에게 팀즈·전화로 본인이 요청했는지 확인해 주세요. 확인되지 않으면 거절합니다.
        </Notice>
      )}
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
