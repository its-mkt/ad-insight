import React from 'react';

interface MutedProps {
  /** small 태그로 그린다(줄 아래 보조 글자) */
  small?: boolean;
  children: React.ReactNode;
}

/** 흐린 보조 글자 */
export const Muted: React.FC<MutedProps> = ({ small, children }) =>
  small ? <small className="muted">{children}</small> : <span className="muted">{children}</span>;

/** 집계 중인 기간 옆의 "(진행 중)" 표시 — 앞 공백까지 포함한다 */
export const PendingTag: React.FC<{ label?: string }> = ({ label = '진행 중' }) => (
  <>
    {' '}
    <Muted small>({label})</Muted>
  </>
);
