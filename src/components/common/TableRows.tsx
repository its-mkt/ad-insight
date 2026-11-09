import React from 'react';
import { ChevronRight } from 'lucide-react';
import { fmt } from '../../utils/format';

interface NumTdProps extends Omit<React.TdHTMLAttributes<HTMLTableCellElement>, 'children'> {
  /** 숫자 — 천 단위 쉼표로 표시. null·undefined 면 fallback 을 보여 준다 */
  value?: number | null;
  /** 숫자 뒤에 붙는 단위 (원·건·개 …) */
  unit?: string;
  /** 굵게 */
  bold?: boolean;
  /** 값이 없을 때 글자 */
  fallback?: React.ReactNode;
  /** value 대신 이미 만든 글자(비율·CPA 등)를 줄 때 */
  children?: React.ReactNode;
}

/** 표의 숫자 칸(오른쪽 정렬). value+unit 으로 만들거나 children 으로 직접 준다 */
export const NumTd: React.FC<NumTdProps> = ({ value, unit = '', bold, fallback = '–', className, children, ...rest }) => {
  const content = children !== undefined ? children : value == null ? fallback : `${fmt(value)}${unit}`;
  return (
    <td {...rest} className={`n${className ? ` ${className}` : ''}`}>
      {bold ? <b>{content}</b> : content}
    </td>
  );
};

interface TotalRowProps {
  /** 첫 칸 글자 */
  label?: React.ReactNode;
  children: React.ReactNode;
}

/** 표 맨 아래 합계 줄 (tr.grp) — 나머지 칸은 children 으로 */
export const TotalRow: React.FC<TotalRowProps> = ({ label = '합계', children }) => (
  <tr className="grp">
    <td>{label}</td>
    {children}
  </tr>
);

interface TreeParentRowProps {
  label: React.ReactNode;
  /** 하위 항목 수 — 0 이면 펼침 화살표 없이 일반 줄로 그린다 */
  childCount?: number;
  open?: boolean;
  onToggle?: () => void;
  /** 나머지 칸 */
  children: React.ReactNode;
}

/** 1차 항목 줄 — 하위 항목이 있으면 눌러서 펼친다 */
export const TreeParentRow: React.FC<TreeParentRowProps> = ({ label, childCount = 0, open = false, onToggle, children }) => {
  const expandable = childCount > 0;
  return (
    <tr
      className={expandable ? `kw-cat-parent${open ? ' open' : ''}` : undefined}
      onClick={expandable ? onToggle : undefined}
      style={expandable ? { cursor: 'pointer' } : undefined}
    >
      <td>
        {expandable && <ChevronRight className={`kw-cat-chev${open ? ' open' : ''}`} strokeWidth={2.25} aria-hidden="true" />}
        <b>{label}</b>
        {expandable && <span className="kw-cat-child-count">{childCount}개</span>}
      </td>
      {children}
    </tr>
  );
};

/** 펼쳐진 하위 항목 줄 */
export const TreeChildRow: React.FC<{ label: React.ReactNode; children: React.ReactNode }> = ({ label, children }) => (
  <tr className="kw-cat-child">
    <td className="kw-cat-child-label">{label}</td>
    {children}
  </tr>
);

/** "1차 > 2차" 키에서 2차 이름만 — 2차 없이 1차로만 분류된 항목은 '공통' */
export const childLabelOf = (key: string, parentKey: string): string => key.slice(parentKey.length + 3) || '공통';

/** 월(또는 연도) 열 머리글 한 줄 — 아직 오지 않은 기간은 future 로 흐리게 */
export const MonthHeadCells: React.FC<{
  columns: string[];
  label: (key: string) => React.ReactNode;
  isFuture?: (key: string) => boolean;
}> = ({ columns, label, isFuture }) => (
  <>
    {columns.map((mo) => (
      <th key={mo} className={`n${isFuture?.(mo) ? ' future' : ''}`}>
        {label(mo)}
      </th>
    ))}
  </>
);

type CellValue = number | React.ReactNode;

interface MonthRowProps {
  /** 첫 칸 글자 */
  label: React.ReactNode;
  /** 열 키(월 또는 연도) */
  columns: string[];
  /** 열마다 값 — 숫자면 천 단위 쉼표로 표시 */
  value: (key: string) => CellValue;
  /** 마지막 합계 칸 — 숫자면 쉼표로, 생략하면 합계 칸을 그리지 않는다 */
  total?: CellValue;
  /** 합계 칸을 굵게 */
  totalBold?: boolean;
  isFuture?: (key: string) => boolean;
  /** 보조 줄(전년 동월·전년비 등) — 흐린 글자 */
  sub?: boolean;
  /** 합계 줄(tr.grp) */
  grp?: boolean;
  /** 있으면 줄을 눌러 하위 줄을 펼친다 */
  onToggle?: () => void;
  /** onToggle 줄이 펼쳐진 상태 */
  open?: boolean;
  /** 펼쳐진 하위 줄 — 첫 칸을 들여 쓴다 */
  child?: boolean;
}

const cellOf = (v: CellValue) => (typeof v === 'number' ? fmt(v) : v);

/** 월별 표의 한 줄 — 라벨 + 월별 숫자 칸 + 합계 칸 */
export const MonthRow: React.FC<MonthRowProps> = ({ label, columns, value, total, totalBold, isFuture, sub, grp, onToggle, open = false, child }) => (
  <tr
    className={grp ? 'grp' : onToggle ? `kw-cat-parent${open ? ' open' : ''}` : child ? 'kw-cat-child' : undefined}
    onClick={onToggle}
    style={onToggle ? { cursor: 'pointer' } : undefined}
  >
    <td className={child ? 'sub-t kw-cat-child-label' : sub ? 'sub-t' : undefined}>
      {onToggle && <ChevronRight className={`kw-cat-chev${open ? ' open' : ''}`} strokeWidth={2.25} aria-hidden="true" />}
      {label}
    </td>
    {columns.map((mo) => (
      <td key={mo} className={`n${sub ? ' sub-t' : ''}${isFuture?.(mo) ? ' future' : ''}`}>
        {cellOf(value(mo))}
      </td>
    ))}
    {total !== undefined && (
      <td className={`n${sub ? ' sub-t' : ''}`}>{totalBold ? <b>{cellOf(total)}</b> : cellOf(total)}</td>
    )}
  </tr>
);
