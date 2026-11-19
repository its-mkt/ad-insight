import React from 'react';
import type { QuoteRawRow } from '../../types/dashboard';
import { parseCatParts } from '../../utils/format';
import { CATEGORY_HIERARCHY } from '../../utils/constants';
import { Dropdown, type DropdownOption } from '../common/Dropdown';

/** 1차 목록 항목 옆 '· 2' — 분류표에 있는 2차 개수, 2차가 없으면 표시하지 않는다 */
export const cat2CountHint = (count: number): string | undefined => (count ? `· ${count}` : undefined);

/** '2026-10-23 14:51:00' → '10.23 14:51' */
const shortAt = (at: string) => {
  const m = at.match(/^\d{4}-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/);
  return m ? `${m[1]}.${m[2]} ${m[3]}` : at;
};

interface CategoryTraceProps {
  /** 흔적을 보여 줄 견적 행 */
  quote: QuoteRawRow;
  /** 저장 전 변경의 원래 카테고리 — 있으면 저장 시각 대신 이 값을 보여 준다 */
  original?: string;
}

/**
 * 카테고리 칸 아래 흔적 한 줄 — 저장 전 변경이면 원래 값, 저장된 수동 지정이면 저장 시각.
 * 마우스를 올리면 자동 분류 결과와 저장한 관리자를 보여 준다.
 */
export const CategoryTrace: React.FC<CategoryTraceProps> = ({ quote, original }) => {
  if (original !== undefined) {
    return <span className="qr-cat-trace pending">저장 전 · 이전: {original || '없음'}</span>;
  }
  const m = quote.manual;
  if (!m) return null;
  const tip = [`자동 분류: ${quote.autoCategory || '–'}`, `수동 지정: ${m.category}`, m.by && `저장: ${m.by}`, m.at && `시각: ${m.at}`]
    .filter(Boolean)
    .join('\n');
  return (
    <span className="qr-cat-trace" title={tip}>
      수동 지정{m.at ? ` · ${shortAt(m.at)}` : ''}
    </span>
  );
};

interface CategoryPickerProps {
  /** 지금 카테고리 ("1차" 또는 "1차 > 2차") */
  value: string;
  /** 저장 전 변경이 있는 행인가 — 드롭다운을 강조한다 */
  changed: boolean;
  /** 고른 카테고리 문자열을 넘긴다 */
  onChange: (category: string) => void;
}

/**
 * 표준 카테고리 지정 — 1차·2차를 따로 고른다 (분류표 CATEGORY_HIERARCHY 기준).
 * 저장 값은 예전과 같은 문자열("1차" 또는 "1차 > 2차")이라 시트·집계는 그대로 쓴다.
 * 1차를 바꾸면 2차는 비워지고, 2차가 없는 1차는 2차 칸이 꺼진다. 분류표에 없는 예전 값은 "(기존)"으로 남겨 둔다.
 */
export const CategoryPicker: React.FC<CategoryPickerProps> = ({
  value,
  changed,
  onChange,
}) => {
  const { cat1, cat2 } = parseCatParts(value || '기타');
  const node = CATEGORY_HIERARCHY.find((n) => n.cat1 === cat1);
  const cat2List = node?.cat2 ?? [];
  const cat1Options: DropdownOption<string>[] = [
    ...CATEGORY_HIERARCHY.map((n) => ({ value: n.cat1, label: n.cat1, hint: cat2CountHint(n.cat2.length) })),
    ...(node ? [] : [{ value: cat1, label: `${cat1} (기존)` }]),
  ];
  const cat2Options: DropdownOption<string>[] = [
    { value: '', label: '2차 없음' },
    ...cat2List.map((c) => ({ value: c, label: c })),
    ...(cat2 && !cat2List.includes(cat2) ? [{ value: cat2, label: `${cat2} (기존)` }] : []),
  ];
  const cls = `dd-cat${changed ? ' is-changed' : ''}`;
  return (
    <div className="qr-cat-pair">
      <Dropdown
        className={cls}
        fixedMenu
        ariaLabel="1차 카테고리 선택"
        value={cat1}
        options={cat1Options}
        onChange={(v) => onChange(v)}
      />
      <Dropdown
        className={cls}
        fixedMenu
        ariaLabel="2차 카테고리 선택"
        value={cat2}
        disabled={!node || cat2List.length === 0}
        options={cat2Options}
        onChange={(v) => onChange(v ? `${cat1} > ${v}` : cat1)}
      />
    </div>
  );
};
