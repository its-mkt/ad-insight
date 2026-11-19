import React from 'react';
import { fmt } from '../../utils/format';

export interface TabButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active: boolean;
  label: React.ReactNode;
  /** 주면 오른쪽에 건수 배지(tab-cnt)를 붙인다 — 0 건도 0 으로 보여 준다. 건수가 없는 탭은 넘기지 않는다 */
  count?: number;
}

/** 밑줄 탭 바(.kw-tabs) 안의 탭 하나. 아이콘 등 덧붙일 내용은 children 으로 */
export const TabButton: React.FC<TabButtonProps> = ({ active, label, count, className, children, ...rest }) => (
  <button
    type="button"
    {...rest}
    className={`${className ?? ''}${active ? ' on' : ''}`.trim() || undefined}
    aria-pressed={active}
  >
    <span>{label}</span>
    {count != null && <span className="tab-cnt">{fmt(count)}</span>}
    {children}
  </button>
);

export interface TabBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 탭 바에 덧붙일 클래스 (kw-tabs 뒤에 붙는다) */
  className?: string;
}

/** 밑줄 탭 바 틀(.kw-tabs) — 안에 TabButton 을 넣는다. 가로 스크롤 위치 계산 등에 쓰도록 ref 를 넘길 수 있다 */
export const TabBar = React.forwardRef<HTMLDivElement, TabBarProps>(({ className, children, ...rest }, ref) => (
  <div {...rest} ref={ref} className={className ? `kw-tabs ${className}` : 'kw-tabs'}>
    {children}
  </div>
));
TabBar.displayName = 'TabBar';
