import React from 'react';
import { Card } from '../common/Card';
import { Avatar } from '../common/Avatar';
import { StatusBadge } from '../common/StatusBadge';
import { SkelBar } from '../common/SkeletonView';
import { useAuth } from '../../context/AuthContext';
import { useMembers } from '../../hooks/useMembers';

/**
 * 소유자 — 가입 요청·열람 권한 표와 따로, 계정 관리 화면 위쪽에 보여 준다.
 * 소유자는 명단(members 탭)이 아니라 admins 탭에 있어 이 화면에서 승인·해제·등급 변경을 하지 않는다 (넘기기는 운영자 줄의 설정 메뉴).
 * 웹앱이 소유자 이메일(owners)을 보내지 않으면(옛 웹앱) 소유자 본인만 자기 정보를 본다.
 * 시트에는 이메일만 있어 이름·소속·사진은 소유자 본인이 볼 때만 내 계정 정보로 채운다
 */
export const OwnerCard: React.FC = () => {
  const { rows, owners } = useMembers();
  const { isSuperAdmin, user } = useAuth();
  const myEmail = (user?.email || '').toLowerCase();
  const emails = owners.length ? owners : isSuperAdmin && myEmail ? [myEmail] : [];
  // 명단을 받은 뒤에도 보여 줄 소유자가 없으면(운영자 + 옛 웹앱) 카드를 그리지 않는다
  if (rows && !emails.length) return null;

  return (
    <Card name="owners" title="소유자" subtitle="모든 권한 · 이 화면에서 바꿀 수 없습니다">
      <ul className="owner-list">
        {!rows ? (
          <li className="owner-item">
            <SkelBar w="2.25rem" h="2.25rem" />
            <SkelBar w="12rem" />
          </li>
        ) : (
          emails.map((email) => {
            const me = email === myEmail;
            const name = (me && user?.name) || '';
            const org = (me && [user?.company, user?.team].filter(Boolean).join(' · ')) || '';
            return (
              <li key={email} className="owner-item">
                <Avatar src={me ? user?.avatarUrl : undefined} name={name || email} size="lg" />
                <span className="owner-text">
                  <span className="owner-name">
                    {name || email}
                    {me && <span className="owner-me">(나)</span>}
                  </span>
                  <span className="owner-sub">{[name ? email : '', org].filter(Boolean).join(' · ') || '이름·소속은 소유자 본인에게만 보입니다'}</span>
                </span>
                <StatusBadge level="info" size="sm">
                  소유자
                </StatusBadge>
              </li>
            );
          })
        )}
      </ul>
    </Card>
  );
};
