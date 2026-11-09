import React from 'react';

interface ViewProps {
  /** data-view 값(화면 id) */
  name: string;
  /** data-title 값(화면 제목) */
  title: string;
  className?: string;
  children: React.ReactNode;
}

/** 화면 하나의 바깥 틀 */
export const View: React.FC<ViewProps> = ({ name, title, className, children }) => (
  <div className={`view on${className ? ` ${className}` : ''}`} data-view={name} data-title={title}>
    {children}
  </div>
);
