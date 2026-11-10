import React from 'react';
import { ChevronRight } from 'lucide-react';

interface AccordionChevronProps {
  /** 펼친 상태 — open 클래스로 아래로 돌린다 */
  open: boolean;
  /** group: 광고그룹·소재·검색 견적 줄(grp-acc-chev) · tree: 1차 > 2차 펼침 줄(kw-cat-chev) */
  variant?: 'group' | 'tree';
  /** 펼칠 내용이 없을 때 자리만 차지하게 숨긴다 (줄 글자 시작 위치를 맞춘다) */
  placeholder?: boolean;
}

/** 표 펼침 줄 맨 앞의 오른쪽 화살표(›) — 펼치면 아래로 돈다 */
export const AccordionChevron: React.FC<AccordionChevronProps> = ({ open, variant = 'group', placeholder }) => (
  <ChevronRight
    className={`${variant === 'tree' ? 'kw-cat-chev' : 'grp-acc-chev'}${open ? ' open' : ''}`}
    strokeWidth={2.25}
    style={placeholder ? { visibility: 'hidden' } : undefined}
    aria-hidden="true"
  />
);
