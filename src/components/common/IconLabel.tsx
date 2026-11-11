import React from 'react';

interface IconLabelProps {
  /** 이름 앞 아이콘 (매체 로고 등) */
  icon?: React.ReactNode;
  /** 이름 (넘치면 말줄임) */
  title: React.ReactNode;
  /** 이름 뒤 흐린 보조 글자 — "(쇼핑검색 제외)" 처럼 괄호까지 넣어 준다 */
  sub?: React.ReactNode;
  /** 아이콘 앞에 놓을 것 (펼침 화살표 등) */
  lead?: React.ReactNode;
  /** grp-acc-main 뒤에 덧붙일 클래스 */
  className?: string;
}

/** 아이콘 + 이름 + 흐린 보조 글자를 가운데 맞춰 한 줄로 — 키워드 표 광고그룹 줄·매체 비교 표 이름 칸 */
export const IconLabel: React.FC<IconLabelProps> = ({ icon, title, sub, lead, className }) => (
  <span className={`grp-acc-main${className ? ` ${className}` : ''}`}>
    {lead}
    {icon}
    <span className="grp-acc-title">{title}</span>
    {sub != null && <small className="grp-acc-cnt">{sub}</small>}
  </span>
);
