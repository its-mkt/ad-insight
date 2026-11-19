import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  /** 열려 있는지 — false 면 아무것도 그리지 않는다 */
  open: boolean;
  /** 바탕·닫기 버튼·Esc 로 닫을 때 */
  onClose: () => void;
  /** 창 제목 요소의 id (aria-labelledby) */
  labelledBy: string;
  /** 카드에 덧붙일 클래스 (기본 card login-modal 뒤에 붙는다) */
  className?: string;
  children: React.ReactNode;
}

/**
 * 화면 위에 띄우는 창 — 흐린 바탕 + 가운데 카드 + 오른쪽 위 닫기 버튼.
 * 바탕을 누르거나 Esc 를 누르면 닫힌다 (로그인 창·내 계정 설정).
 */
export const Modal: React.FC<ModalProps> = ({ open, onClose, labelledBy, className, children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="login-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`card login-modal${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <button type="button" className="login-close" aria-label="닫기" onClick={onClose}>
          <X size="1rem" aria-hidden="true" />
        </button>
        {children}
      </div>
    </div>
  );
};
