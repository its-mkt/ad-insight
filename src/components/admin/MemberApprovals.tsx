import React, { useState } from 'react';
import { Crown, KeyRound, RefreshCw, Trash2 } from 'lucide-react';
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
import { OwnerTransferModal } from './OwnerTransferModal';
import { decideMember, deleteMember, loadMembers, sendPasswordGuide, setMemberRole, useMembers, type MemberRole, type MemberStatus } from '../../hooks/useMembers';

const STATUS_TEXT: Record<MemberStatus, { label: string; level: StatusLevel }> = {
  pending: { label: '승인 대기', level: 'warn' },
  approved: { label: '승인됨', level: 'ok' },
  rejected: { label: '거절', level: 'err' },
  revoked: { label: '해제', level: 'err' },
};

/** 지금 상태에서 바꿀 수 있는 상태 — 결정한 요청을 '승인 대기'로 되돌리지는 않는다 */
const NEXT_STATUS: Record<MemberStatus, Exclude<MemberStatus, 'pending'>[]> = {
  pending: ['approved', 'rejected'],
  approved: ['revoked'],
  rejected: ['approved'],
  revoked: ['approved'],
};
const STATUS_TITLE: Record<MemberStatus, string> = {
  pending: '아직 승인하지 않은 요청',
  approved: '데이터를 볼 수 있다',
  rejected: '가입 요청을 거절한다 (다시 승인할 수 있다)',
  revoked: '열람 권한을 해제한다 (다시 승인할 수 있다)',
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
 * 승인·거절·해제는 상태 뱃지를 눌러 고르고(지금 상태에서 갈 수 있는 상태만), 비밀번호 안내·소유자 넘기기·삭제는 줄 끝 설정 버튼 메뉴에 둔다 — 삭제는 메뉴에서 한 번 더 눌러 확인한 뒤 명단(과 로그인 계정)에서 지운다
 * 등급(일반·관리자) 변경과 삭제는 최고 관리자만, 관리자는 일반 계정의 승인·거절·해제만 한다 (웹앱도 같은 규칙으로 막는다)
 */
export const MemberApprovals: React.FC = () => {
  const { rows, error, busy, pending, refreshing, checkedAt } = useMembers();
  const { isSuperAdmin, user } = useAuth();
  const myEmail = (user?.email || '').toLowerCase();
  const decide = (email: string, status: Exclude<MemberStatus, 'pending'>) => void decideMember(email, status);
  // 소유자 권한을 넘길 운영자 (창이 열려 있을 때만)
  const [transferTo, setTransferTo] = useState<{ email: string; name: string } | null>(null);

  return (
    <Card
      name="members"
      title="가입 요청·열람 권한"
      subtitle={rows ? `승인 대기 ${pending}건 · 전체 ${rows.length}명${checkedAt ? ` · ${checkedAt} 기준` : ''}` : undefined}
      tools={
        // 받는 동안 아이콘이 돌고 다시 누를 수 없다 — 끝나면 제목 줄의 '○○:○○ 기준'이 바뀐다
        <Button size="sm" icon={RefreshCw} className={refreshing ? 'is-spinning' : undefined} disabled={refreshing} aria-busy={refreshing} data-btn="members-refresh" onClick={() => void loadMembers()}>
          새로 고침
        </Button>
      }
      tableWrap
    >
      {error && <Notice tone="warn">{error}</Notice>}
      {pending > 0 && (
        <Notice tone="warn">
          이메일 인증번호로 이메일 주인은 확인됐습니다. 승인 전에 요청자가 열람해도 되는 사람인지 팀즈·전화로 확인해 주세요. 확인되지 않으면 거절합니다.
        </Notice>
      )}
      <table className="stk member-table">
        <thead>
          <tr>
            <Th className="col-mem-name">이름</Th>
            <Th>소속</Th>
            <Th>이메일</Th>
            <Th className="col-mem-status">상태</Th>
            <Th className="col-mem-role" tip="등급|뷰어: 대시보드만 · 운영자: 대시보드와 원문 데이터·계정 관리·이용 현황·데이터 연결 (소유자만 바꾼다)">등급</Th>
            <Th className="col-mem-date">요청</Th>
            <Th className="col-mem-date">처리</Th>
            <Th className="col-mem-actions">관리</Th>
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
                  {(() => {
                    const badge = (
                      <StatusBadge level={STATUS_TEXT[r.status]?.level || 'warn'} size="sm">
                        {STATUS_TEXT[r.status]?.label || r.status}
                      </StatusBadge>
                    );
                    const next = NEXT_STATUS[r.status];
                    // 바꿀 권한이 없거나 갈 상태가 없으면 뱃지만
                    if (!canDecide || !next?.length) return badge;
                    const options: DropdownOption<MemberStatus>[] = [r.status, ...next].map((s) => ({ value: s, label: STATUS_TEXT[s].label, title: STATUS_TITLE[s] }));
                    return (
                      <Dropdown<MemberStatus>
                        className="dd-badge"
                        options={options}
                        value={r.status}
                        valueLabel={badge}
                        onChange={(s) => s !== 'pending' && s !== r.status && decide(r.email, s)}
                        ariaLabel={`${r.name || r.email} 열람 상태 바꾸기`}
                        disabled={busy === r.email}
                        fixedMenu
                      />
                    );
                  })()}
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
                    if (canDecide && r.status === 'approved') items.push({ key: 'password', label: '비밀번호 재설정 안내 보내기', icon: KeyRound, onSelect: () => void sendPasswordGuide(r.email) });
                    // 소유자 넘기기는 승인된 운영자에게만 (뷰어는 먼저 운영자로 바꾼다)
                    if (isSuperAdmin && r.status === 'approved' && role === 'manager')
                      items.push({ key: 'owner', label: '소유자 권한 넘기기', icon: Crown, onSelect: () => setTransferTo({ email: r.email, name: r.name }) });
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
      <OwnerTransferModal target={transferTo} onClose={() => setTransferTo(null)} />
    </Card>
  );
};
