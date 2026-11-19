import React from 'react';
import { Lock } from 'lucide-react';
import { Modal } from '../common/Modal';
import { LoginForm } from './LoginForm';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 관리자 로그인 모달 — 지금 보고 있는 화면 위에 띄운다 (승인된 일반 계정이 설정 화면을 열 때).
 * 바탕을 누르거나 Esc 로 닫고, 로그인에 성공하면 닫힌다.
 */
export const LoginModal: React.FC<LoginModalProps> = ({ open, onClose }) => (
  <Modal open={open} onClose={onClose} labelledBy="login-modal-title">
    <div className="gate-icon">
      <Lock size="1.25rem" aria-hidden="true" />
    </div>
    <h2 id="login-modal-title">관리자 로그인</h2>
    <p>지정된 관리자 계정으로 접속하면 견적 원본 데이터를 편집·저장할 수 있습니다.</p>
    <LoginForm onDone={onClose} />
  </Modal>
);
