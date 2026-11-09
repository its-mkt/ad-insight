import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { MonthPicker } from './MonthPicker';
import { DatePicker } from './DatePicker';
import { FilterReset } from './FilterReset';
import { lastDayOf, toDayKey, type DayRange } from '../../utils/dayRange';

const SLOT_ID = 'periodNavSlot';

/** 슬롯에 그린 조회 조건의 초기화 정보 — 조건은 각 화면이 들고 있어, 바의 초기화 버튼이 여기를 보고 기간과 함께 되돌린다 */
interface SlotReset {
  active: boolean;
  reset: () => void;
}
let slotReset: SlotReset | null = null;
const slotListeners = new Set<() => void>();
const publishSlotReset = (value: SlotReset | null) => {
  slotReset = value;
  slotListeners.forEach((listener) => listener());
};
const subscribeSlotReset = (listener: () => void) => {
  slotListeners.add(listener);
  return () => {
    slotListeners.delete(listener);
  };
};

/**
 * 화면별 조회 조건(카테고리 필터 등)을 기준월 바(#periodNav) 안에 그린다.
 * 선택 상태는 각 화면이 그대로 들고, 그리는 자리만 바로 옮긴다 (바가 먼저 그려진 뒤 자리를 찾는다).
 */
export const PeriodNavSlot: React.FC<{
  children: React.ReactNode;
  /** 조회 조건이 기본값에서 바뀌었는가 */
  active: boolean;
  onReset: () => void;
}> = ({ children, active, onReset }) => {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.getElementById(SLOT_ID)), []);
  // onReset 은 상태 설정 함수만 부르므로 처음 값을 계속 써도 된다
  useEffect(() => {
    publishSlotReset({ active, reset: onReset });
    return () => publishSlotReset(null);
  }, [active]);
  return el ? createPortal(children, el) : null;
};

interface PeriodNavProps {
  years: string[];
  selectedYear: string;
  selectedMonth: string;
  /** 데이터가 있는 가장 이른 달 (없으면 가장 이른 연도의 1월) */
  minAvailableMonth?: string;
  maxAvailableMonth: string;
  onSelectYear: (year: string) => void;
  onSelectMonth: (month: string) => void;
  /** 전체 기간을 보는 중 */
  allPeriod?: boolean;
  /** 있으면 연도 목록에 '전체' 를 넣는다 (지원하는 화면에서만) */
  onSelectAll?: () => void;
  /** 선택 연도 합계를 보는 중 */
  yearTotal?: boolean;
  /** 있으면 월 목록에 '전체' 를 넣는다 (지원하는 화면에서만) */
  onSelectYearTotal?: (month: string) => void;
  /** 지금 고른 일·기간 (없으면 월 단위) */
  dayRange?: DayRange | null;
  /** 있으면 월 선택 옆에 일·기간 선택 달력을 둔다 (일 단위 데이터가 있는 화면에서만). 지우면 null */
  onSelectDayRange?: (range: DayRange | null) => void;
  /** 일·기간을 골랐을 때 달력 옆에 붙이는 한 줄 안내 (기준·한계) */
  dayNote?: string;
  /** 기간이 처음 상태에서 바뀌었는가 */
  periodChanged?: boolean;
  /** 기간을 처음 상태로 되돌린다 */
  onResetPeriod?: () => void;
}

export const PeriodNav: React.FC<PeriodNavProps> = ({
  years,
  selectedYear,
  selectedMonth,
  minAvailableMonth,
  maxAvailableMonth,
  onSelectYear,
  onSelectMonth,
  allPeriod,
  onSelectAll,
  yearTotal,
  onSelectYearTotal,
  dayRange,
  onSelectDayRange,
  dayNote,
  periodChanged = false,
  onResetPeriod,
}) => {
  const slot = useSyncExternalStore(subscribeSlotReset, () => slotReset);
  const minYear = [...years].sort()[0] || maxAvailableMonth.slice(0, 4);

  // 달력에서 고를 수 있는 마지막 날 — 데이터가 있는 최신 달의 끝, 아직 안 지난 날은 뺀다
  const today = toDayKey(new Date());
  const lastDay = lastDayOf(maxAvailableMonth);
  const maxDay = today < lastDay ? today : lastDay;
  const minDay = `${minAvailableMonth || `${minYear}-01`}-01`;

  const selectMonth = (m: string) => {
    const y = m.slice(0, 4);
    if (y !== selectedYear) onSelectYear(y);
    onSelectMonth(m);
  };

  return (
    <div className={`period-nav-bar${dayRange ? ' day-mode' : ''}`} id="periodNav">
      <div className="period-nav-left">
        {/* [‹] [2026년 ⌄] [10월 ⌄] [›] [📅] — 연·월 글자가 기준월임을 드러내므로 따로 아이콘을 두지 않는다 */}
        <MonthPicker
          value={selectedMonth}
          min={minAvailableMonth || `${minYear}-01`}
          max={maxAvailableMonth}
          onChange={selectMonth}
          allPeriod={allPeriod}
          onSelectAll={onSelectAll}
          yearTotal={yearTotal}
          onSelectYearTotal={
            onSelectYearTotal &&
            ((m) => {
              onSelectYear(m.slice(0, 4));
              onSelectYearTotal(m);
            })
          }
          trailing={onSelectDayRange && <DatePicker value={dayRange ?? null} min={minDay} max={maxDay} onChange={onSelectDayRange} />}
        />
        {(periodChanged || slot?.active) && (
          <FilterReset
            onClick={() => {
              onResetPeriod?.();
              slot?.reset();
            }}
          />
        )}
        {dayRange && dayNote && <span className="period-nav-note">{dayNote}</span>}
        <div className="period-nav-filters" id={SLOT_ID} />
      </div>
    </div>
  );
};
