import React from 'react';
import { Trash2, UserCheck, UserMinus, UserX } from 'lucide-react';
import { Card } from '../common/Card';
import { Th } from '../common/Th';
import { Button } from '../common/Button';
import { ActionMenu, type ActionMenuItem } from '../common/ActionMenu';
import { StatusBadge, type StatusLevel } from '../common/StatusBadge';
import { EmptyState } from '../common/EmptyState';
import { SkelRows } from '../common/SkeletonView';
import { Notice } from '../common/Notice';
import { Dropdown, type DropdownOption } from '../common/Dropdown';
import { useAuth } from '../../context/AuthContext';
import { decideMember, deleteMember, loadMembers, setMemberRole, useMembers, type MemberRole, type MemberStatus } from '../../hooks/useMembers';

const STATUS_TEXT: Record<MemberStatus, { label: string; level: StatusLevel }> = {
  pending: { label: '승인 대기', level: 'warn' },
  approved: { label: '승인됨', level: 'ok' },
  rejected: { label: '거절', level: 'err' },
  revoked: { label: '해제', level: 'err' },
};

const ROLE_TEXT: Record<MemberRole, string> = { member: '뷰어', manager: '운영자' };
const ROLE_OPTIONS: DropdownOption<MemberRole>[] = [
  { value: 'member', label: ROLE_TEXT.member, title: '대시보드만' },
  { value: 'manager', label: ROLE_TEXT.manager, title: '대시보드 + 원문 데이터·계정 관리·이용 현황·데이터 연결' },
];

/**
 * 가입 요청·열람 권한 관리 — 관리자만 보인다 (계정 관리 화면).
 * 명단은 데이터 시트 members 탭이고, 승인·거절·해제는 웹앱이 관리자 토큰을 확인한 뒤 바꾼다.
 * 명단 상태는 사이드바 승인 대기 뱃지와 함께 쓴다 (useMembers).
 * 승인·거절·해제·삭제는 줄 끝 설정 버튼의 메뉴에 모은다 — 삭제는 메뉴에서 한 번 더 눌러 확인한 뒤 명단(과 로그인 계정)에서 지운다
 * 등급(일반·관리자) 변경과 삭제는 최고 관리자만, 관리자는 일반 계정의 승인·거절·해제만 한다 (웹앱도 같은 규칙으로 막는다)
 */
export const MemberApprovals: React.FC = () => {
  const { rows, error, busy, pending } = useMembers();
  const { isSuperAdmin, user } = useAuth();
  const myEmail = (user?.email || '').toLowerCase();
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
          이메일 인증번호로 이메일 주인은 확인됐습니다. 승인 전에 요청자가 열람해도 되는 사람인지 팀즈·전화로 확인해 주세요. 확인되지 않으면 거절합니다.
        </Notice>
      )}
      <table className="stk">
        <thead>
          <tr>
            <Th>이름</Th>
            <Th>소속</Th>
            <Th>이메일</Th>
            <Th>상태</Th>
            <Th tip="등급|뷰어: 대시보드만 · 운영자: 대시보드와 원문 데이터·계정 관리·이용 현황·데이터 연결 (소유자만 바꾼다)">등급</Th>
            <Th>요청</Th>
            <Th>처리</Th>
            <Th>관리</Th>
          </tr>
        </thead>
        <tbody>
          {!rows ? (
            <SkelRows rows={3} widths={['4rem', '6rem', '10rem', '4rem', '4rem', '6rem', '6rem', '8rem']} />
          ) : (
            rows.map((r) => {
              const role: MemberRole = r.role === 'manager' ? 'manager' : 'member';
              // 관리자는 다른 관리자·자기 자신을 바꾸지 못한다
              const canDecide = isSuperAdmin || (role !== 'manager' && r.email.toLowerCase() !== myEmail);
              return (
              <tr key={r.email}>
                <td>{r.name}</td>
                <td>{r.team}</td>
                <td>{r.email}</td>
                <td>
                  <StatusBadge level={STATUS_TEXT[r.status]?.level || 'warn'} size="sm">
                    {STATUS_TEXT[r.status]?.label || r.status}
                  </StatusBadge>
                </td>
                <td>
                  {r.status !== 'approved' ? (
                    '–'
                  ) : isSuperAdmin ? (
                    <Dropdown<MemberRole>
                      options={ROLE_OPTIONS}
                      value={role}
                      onChange={(next) => next !== role && void setMemberRole(r.email, next)}
                      ariaLabel={`${r.name || r.email} 등급`}
                      disabled={busy === r.email}
                      fixedMenu
                    />
                  ) : (
                    ROLE_TEXT[role]
                  )}
                </td>
                <td>{r.requested_at}</td>
                <td>{r.decided_at ? `${r.decided_at}` : '–'}</td>
                <td className="member-actions">
                  {(() => {
                    const items: ActionMenuItem[] = [];
                    if (canDecide && r.status !== 'approved') items.push({ key: 'approve', label: '승인', icon: UserCheck, onSelect: () => decide(r.email, 'approved') });
                    if (canDecide && r.status === 'pending') items.push({ key: 'reject', label: '거절', icon: UserX, onSelect: () => decide(r.email, 'rejected') });
                    if (canDecide && r.status === 'approved') items.push({ key: 'revoke', label: '열람 권한 해제', icon: UserMinus, onSelect: () => decide(r.email, 'revoked') });
                    if (isSuperAdmin)
                      items.push({ key: 'delete', label: '삭제', icon: Trash2, danger: true, confirmLabel: '한 번 더 누르면 삭제', onSelect: () => void deleteMember(r.email) });
                    return items.length ? (
                      <ActionMenu items={items} ariaLabel={`${r.name || r.email} 관리`} disabled={busy === r.email} align="start" />
                    ) : (
                      '–'
                    );
                  })()}
                </td>
              </tr>
              );
            })
          )}
        </tbody>
      </table>
      {rows && rows.length === 0 && !error && <EmptyState message="가입 요청이 없습니다." />}
    </Card>
  );
};
