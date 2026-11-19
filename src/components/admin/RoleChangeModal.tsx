import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { setMemberRole, type MemberRole } from '../../hooks/useMembers';

/** 등급 이름 — 계정 관리 표와 같은 이름 */
export const ROLE_LABEL: Record<MemberRole, string> = { member: '뷰어', manager: '운영자' };

/** 바꾼 뒤 달라지는 것 — 창에서 한 줄로 알려 준다 */
const ROLE_EFFECT: Record<MemberRole, string> = {
  manager: '대시보드에 더해 원문 데이터·계정 관리(뷰어 승인·거절·해제)·이용 현황·데이터 연결을 볼 수 있게 됩니다.',
  member: '대시보드만 볼 수 있게 되고, 원문 데이터·계정 관리·이용 현황·데이터 연결은 닫힙니다.',
};

export interface RoleChange {
  email: string;
  name: string;
  from: MemberRole;
  to: MemberRole;
}

interface RoleChangeModalProps {
  /** 바꾸려는 등급 — null 이면 창을 닫는다 */
  change: RoleChange | null;
  /** 닫기 (취소·완료 모두) */
  onClose: () => void;
}

/**
 * 등급 변경 확인 창 — 등급 선택칸에서 고르면 바로 바꾸지 않고 이 창에서 한 번 더 확인한다.
 * 결과는 setMemberRole 이 토스트로 알린다
 */
export const RoleChangeModal: React.FC<RoleChangeModalProps> = ({ change, onClose }) => {
  const [busy, setBusy] = useState(false);
  if (!change) return null;
  const who = change.name ? `${change.name} 님(${change.email})` : change.email;

  const confirm = async () => {
    setBusy(true);
    await setMemberRole(change.email, change.to);
    setBusy(false);
    onClose();
  };

  return (
    <Modal open onClose={() => !busy && onClose()} labelledBy="role-change-title" className="role-change-modal" dismissible={!busy}>
      <h2 id="role-change-title">등급 바꾸기</h2>
      <p>{who}의 등급을 바꿉니다.</p>
      <div className="role-change-flow" aria-label={`${ROLE_LABEL[change.from]}에서 ${ROLE_LABEL[change.to]}로`}>
        <span className="role-change-from">{ROLE_LABEL[change.from]}</span>
        <ArrowRight size="1rem" aria-hidden="true" />
        <span className="role-change-to">{ROLE_LABEL[change.to]}</span>
      </div>
      <p className="role-change-effect">{ROLE_EFFECT[change.to]}</p>
      <div className="role-change-actions">
        <Button onClick={onClose} disabled={busy} data-btn="role-change-cancel">
          취소
        </Button>
        <Button variant="primary" onClick={() => void confirm()} disabled={busy} data-btn="role-change-confirm" autoFocus>
          {busy ? '바꾸는 중' : `${ROLE_LABEL[change.to]}로 바꾸기`}
        </Button>
      </div>
    </Modal>
  );
};
