import React from 'react';
import { prevM, ym } from '../../utils/format';
import { Dropdown } from './Dropdown';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MonthPickerProps {
  /** 선택된 달 (YYYY-MM) */
  value: string;
  /** 고를 수 있는 가장 이른 달·늦은 달 (YYYY-MM) */
  min: string;
  max: string;
  onChange: (month: string) => void;
  /** 전체 기간을 보는 중 — 월 선택과 이전·다음 화살표를 잠근다 */
  allPeriod?: boolean;
  /** 있으면 연도 목록 맨 위에 '전체' 를 넣는다 */
  onSelectAll?: () => void;
  /** 선택 연도 합계를 보는 중 — 화살표가 한 해씩 옮긴다 */
  yearTotal?: boolean;
  /** 있으면 월 목록 맨 위에 '전체' 를 넣는다. 고른 연도 안의 달(YYYY-MM)을 넘긴다 */
  onSelectYearTotal?: (month: string) => void;
  /** 다음 달 화살표 뒤에 이어 붙일 조작 (일·기간 선택 달력 등) — 같은 조작부 안에서 한 덩어리로 보인다 */
  trailing?: React.ReactNode;
}

const ALL_YEARS = 'ALL';
const ALL_MONTHS = 0;

/**
 * [‹] [2026년 ⌄ │ 10월 ⌄] [›]  [trailing] — 화살표로 한 달씩 옮기고, 가운데 드롭다운으로 연·월을 바로 고른다.
 * 연도를 바꾸면 같은 달을 유지하되 범위를 벗어나면 끝 달로 맞춘다.
 */
export const MonthPicker: React.FC<MonthPickerProps> = ({
  value,
  min,
  max,
  onChange,
  allPeriod = false,
  onSelectAll,
  yearTotal = false,
  onSelectYearTotal,
  trailing,
}) => {
  const year = value.slice(0, 4);
  const month = Number(value.slice(5, 7));
  const minYear = Number(min.slice(0, 4));
  const maxYear = Number(max.slice(0, 4));
  const clamp = (m: string) => (m < min ? min : m > max ? max : m);
  const prev = prevM(value);
  const next = month === 12 ? ym(Number(year) + 1, 1) : ym(year, month + 1);
  const unit = yearTotal ? '연도' : '달';
  const noPrev = allPeriod || (yearTotal ? Number(year) <= minYear : prev < min);
  const noNext = allPeriod || (yearTotal ? Number(year) >= maxYear : next > max);
  const stepTitle = (dir: string, blocked: boolean) =>
    allPeriod ? '전체 기간 조회 중' : blocked ? `${dir} ${unit} 데이터 없음` : `${dir} ${unit}`;
  const moveYear = (y: number) => onSelectYearTotal?.(clamp(ym(y, month)));

  const yearOptions = [
    ...(onSelectAll ? [{ value: ALL_YEARS, label: '전체' }] : []),
    ...Array.from({ length: maxYear - minYear + 1 }, (_, i) => {
      const y = String(maxYear - i);
      return { value: y, label: `${y}년` };
    }),
  ];

  const totalOption = { value: ALL_MONTHS, label: '전체', disabled: false, title: undefined as string | undefined };
  const monthOptions = allPeriod ? [totalOption] : [
    ...(onSelectYearTotal ? [{ ...totalOption, title: `${year}년 합계` }] : []),
    ...Array.from({ length: 12 }, (_, i) => {
      const key = ym(year, i + 1);
      const out = key < min || key > max;
      return {
        value: i + 1,
        label: `${i + 1}월`,
        disabled: out,
        title: out ? `${year}년 ${i + 1}월 (데이터 없음)` : undefined,
      };
    }),
  ];

  return (
    <div className="month-picker" role="group" aria-label="기준월">
      <button
        type="button"
        className="mp-step btn-prev"
        id="mp-prev"
        data-btn="prev"
        aria-label={`이전 ${unit}`}
        title={stepTitle('이전', noPrev)}
        disabled={noPrev}
        onClick={() => (yearTotal ? moveYear(Number(year) - 1) : onChange(prev))}
      >
        <ChevronLeft strokeWidth={2.25} aria-hidden="true" />
      </button>
      <div className="mp-box">
        <Dropdown
          className="mp-year"
          ariaLabel="기준 연도"
          value={allPeriod ? ALL_YEARS : year}
          options={yearOptions}
          onChange={(y) => {
            if (y === ALL_YEARS) onSelectAll?.();
            else if (yearTotal) moveYear(Number(y));
            else onChange(clamp(ym(y, month)));
          }}
        />
        <Dropdown
          className="mp-month"
          ariaLabel="기준 월"
          value={allPeriod || yearTotal ? ALL_MONTHS : month}
          options={monthOptions}
          disabled={allPeriod}
          onChange={(m) => (m === ALL_MONTHS ? onSelectYearTotal?.(value) : onChange(ym(year, m)))}
        />
      </div>
      <button
        type="button"
        className="mp-step btn-next"
        id="mp-next"
        data-btn="next"
        aria-label={`다음 ${unit}`}
        title={stepTitle('다음', noNext)}
        disabled={noNext}
        onClick={() => (yearTotal ? moveYear(Number(year) + 1) : onChange(next))}
      >
        <ChevronRight strokeWidth={2.25} aria-hidden="true" />
      </button>
      {trailing}
    </div>
  );
};
