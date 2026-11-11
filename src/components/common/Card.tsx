import React from 'react';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** card-{name} 클래스와 data-card 값 */
  name: string;
  /** 카드 제목 (h3) */
  title?: React.ReactNode;
  titleId?: string;
  /** 제목 옆 흐린 보조 글자 — "(10월 기준)" 처럼 괄호까지 넣어 준다 */
  subtitle?: React.ReactNode;
  /** 넓은 표를 가로 스크롤로 감싼다 (tw) */
  tableWrap?: boolean;
  /** 제목 줄 오른쪽 끝에 놓을 도구 (구분 전환 등) — 차트 카드의 .h3-tools 와 같은 자리 */
  tools?: React.ReactNode;
}

/** 화면의 기본 박스. 제목이 있으면 맨 위에 h3 로 둔다 */
export const Card: React.FC<CardProps> = ({ name, title, titleId, subtitle, tableWrap, tools, className, children, ...rest }) => (
  <div
    {...rest}
    className={`card card-${name}${tableWrap ? ' tw' : ''}${className ? ` ${className}` : ''}`}
    data-card={name}
  >
    {title != null && (
      <h3 id={titleId}>
        {title}
        {subtitle != null && <span className="muted">{subtitle}</span>}
        {tools != null && <div className="h3-tools">{tools}</div>}
      </h3>
    )}
    {children}
  </div>
);
