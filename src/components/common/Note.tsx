import React from 'react';

interface ViewNoteProps {
  className?: string;
  children: React.ReactNode;
}

/** 화면 위쪽의 "※ 기준·집계 방식" 안내 문단 */
export const ViewNote: React.FC<ViewNoteProps> = ({ className, children }) => (
  <p className={`leg-note quote-src-note${className ? ` ${className}` : ''}`}>{children}</p>
);
