import React, { useEffect } from 'react';
import { Lock, X } from 'lucide-react';
import { LoginForm } from './LoginForm';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 관리자 로그인 모달 — 지금 보고 있는 화면 위에 띄운다 (승인된 일반 계정이 설정 화면을 열 때).
 * 바탕을 누르거나 Esc 로 닫고, 로그인에 성공하면 닫힌다.
 */
export const LoginModal: React.FC<LoginModalProps> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="login-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card login-modal" role="dialog" aria-modal="true" aria-labelledby="login-modal-title">
        <button type="button" className="login-close" aria-label="닫기" onClick={onClose}>
          <X size="1rem" aria-hidden="true" />
        </button>
        <div className="gate-icon">
          <Lock size="1.25rem" aria-hidden="true" />
        </div>
        <h2 id="login-modal-title">관리자 로그인</h2>
        <p>지정된 관리자 계정으로 접속하면 견적 원본 데이터를 편집·저장할 수 있습니다.</p>
        <LoginForm onDone={onClose} />
      </div>
    </div>
  );
};
