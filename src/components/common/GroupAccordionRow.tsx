import React from 'react';
import { AccordionChevron } from './AccordionChevron';
import { IconLabel } from './IconLabel';

interface GroupAccordionRowProps {
  /** 줄 이름 (굵은 제목) */
  title: React.ReactNode;
  /** 제목 앞 아이콘 (매체 로고 등) */
  icon?: React.ReactNode;
  /** 제목 뒤 흐린 보조 글자 — "(13개 키워드 · 네이버)" 처럼 괄호까지 넣어 준다 */
  count?: React.ReactNode;
  /** 펼친 상태 */
  open: boolean;
  /** 펼칠 하위 줄이 있는지 — false 면 화살표 자리만 남기고 눌러도 펼치지 않는다 */
  canOpen?: boolean;
  onToggle?: () => void;
  /** 마우스를 올릴 때 "클릭하여 ○○ 펼치기/접기" 의 ○○ */
  toggleLabel?: string;
  /** 줄 색 클래스 (grp-naver · grp-google 등). 없으면 기본 강조색 */
  tone?: string;
  /** 강조색 배경 없이 일반 줄 색으로 그린다 (화살표·펼침 모양만 같게) */
  plain?: boolean;
  /** 나머지 칸 */
  children: React.ReactNode;
}

/** 키워드 표의 광고그룹 줄 모양 — 눌러서 하위 줄(GroupChildRow)을 펼치는 강조 줄 */
export const GroupAccordionRow: React.FC<GroupAccordionRowProps> = ({
  title,
  icon,
  count,
  open,
  canOpen = true,
  onToggle,
  toggleLabel = '목록',
  tone,
  plain,
  children,
}) => (
  <tr
    className={`${plain ? '' : 'grp '}grp-accordion${tone ? ` ${tone}` : ''}${open ? ' open' : ''}`}
    onClick={canOpen ? onToggle : undefined}
    style={canOpen ? undefined : { cursor: 'default' }}
    title={!canOpen ? undefined : open ? `클릭하여 ${toggleLabel} 접기` : `클릭하여 ${toggleLabel} 펼치기`}
  >
    <td>
      <div className="grp-acc-cell">
        <IconLabel lead={<AccordionChevron open={open} placeholder={!canOpen} />} icon={icon} title={title} sub={count} />
      </div>
    </td>
    {children}
  </tr>
);

/** GroupAccordionRow 아래에 펼쳐진 하위 줄 — 첫 칸을 들여 쓴다 */
export const GroupChildRow: React.FC<{ label: React.ReactNode; children: React.ReactNode }> = ({ label, children }) => (
  <tr className="kw-child">
    <td className="ind">{label}</td>
    {children}
  </tr>
);
