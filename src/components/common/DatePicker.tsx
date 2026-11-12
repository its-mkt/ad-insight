import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { ym } from '../../utils/format';
import {
  WEEKDAY_LABELS,
  dayLabel,
  daysOfMonth,
  fromDayKey,
  orderedRange,
  rangeDays,
  rangeLabel,
  toDayKey,
  type DayRange,
} from '../../utils/dayRange';
import { Dropdown } from './Dropdown';

interface DatePickerProps {
  /** 지금 고른 일·기간 — 없으면 월 단위로 보는 중 */
  value: DayRange | null;
  /** 고를 수 있는 가장 이른 날·늦은 날 (YYYY-MM-DD) */
  min: string;
  max: string;
  /** 일·기간을 고르면 그 범위를, 지우면 null 을 넘긴다 */
  onChange: (range: DayRange | null) => void;
}

/**
 * 일·기간 선택 달력 — [📅] 아이콘 버튼을 누르면 달력이 열린다. 고른 범위가 있을 때만 버튼에 범위 글자가 붙는다.
 * 첫 번째로 누른 날이 시작일, 두 번째로 누른 날이 종료일이다. 같은 날을 두 번 누르거나 하나만 누르면 그날 하루가 된다.
 * 세 번째로 누르면 처음부터 다시 고르고, [확인] 을 눌러야 적용된다. 바깥 클릭·Esc 로 닫으면 적용하지 않는다.
 * 고른 범위가 있으면 버튼에 범위가 보이고 ✕ 로 지운다.
 */
export const DatePicker: React.FC<DatePickerProps> = ({ value, min, max, onChange }) => {
  const [open, setOpen] = useState(false);
  // 확인 전에 고른 범위 — 첫 번째 선택이면 하루, 두 번째 선택까지 하면 기간
  const [draft, setDraft] = useState<DayRange | null>(value);
  // 시작일만 누르고 종료일을 기다리는 중
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState<string>((value?.to || max).slice(0, 7));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      // 연·월 목록이 열려 있으면 목록만 닫는다 — 목록이 Esc 를 먼저 처리해 이미 닫혔으면 defaultPrevented 로 안다
      if (e.key !== 'Escape' || e.defaultPrevented || rootRef.current?.querySelector('.dd.open')) return;
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openPanel = () => {
    setAnchor(null);
    setHover(null);
    setView((value?.to || max).slice(0, 7));
    setDraft(value);
    setOpen(true);
  };

  const close = () => setOpen(false);
  const minMonth = min.slice(0, 7);
  const maxMonth = max.slice(0, 7);
  const viewY = +view.slice(0, 4);
  const viewM = +view.slice(5, 7);
  const prevView = viewM === 1 ? ym(viewY - 1, 12) : ym(viewY, viewM - 1);
  const nextView = viewM === 12 ? ym(viewY + 1, 1) : ym(viewY, viewM + 1);

  const firstYear = +minMonth.slice(0, 4);
  const lastYear = +maxMonth.slice(0, 4);
  const yearOptions = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => lastYear - i).map((y) => ({ value: y, label: `${y}년` }));
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1).map((m) => ({
    value: m,
    label: `${m}월`,
    disabled: ym(viewY, m) < minMonth || ym(viewY, m) > maxMonth,
  }));
  // 연도를 바꿔 고를 수 없는 달이 되면 가장 가까운 달로 맞춘다
  const selectYear = (y: number) => {
    const next = ym(y, viewM);
    setView(next < minMonth ? minMonth : next > maxMonth ? maxMonth : next);
  };

  const cells = useMemo(() => {
    const lead = fromDayKey(`${view}-01`).getDay();
    const out: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= daysOfMonth(view); d++) out.push(`${view}-${String(d).padStart(2, '0')}`);
    while (out.length % 7) out.push(null);
    return out;
  }, [view]);

  const pick = (day: string) => {
    if (!anchor) {
      setAnchor(day);
      setDraft({ from: day, to: day });
      return;
    }
    setDraft(orderedRange(anchor, day));
    setAnchor(null);
  };

  const confirm = () => {
    if (!draft) return;
    onChange(draft);
    close();
  };

  // 달력에 칠할 범위 — 기간을 고르는 중이면 시작일~마우스 위치, 아니면 고른 범위
  const shown: DayRange | null = anchor ? orderedRange(anchor, hover || anchor) : draft;
  const today = toDayKey(new Date());
  const todayOut = today < min || today > max;
  const summary = anchor
    ? '종료일을 누르세요 (같은 날을 다시 누르면 하루)'
    : draft
      ? `${rangeLabel(draft)}${draft.from === draft.to ? '' : ` · ${rangeDays(draft)}일`}`
      : '시작일을 누르세요';

  return (
    <div className={`date-picker${open ? ' open' : ''}${value ? ' on' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="dp-trigger btn-date-picker"
        data-btn="date-picker"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={value ? `일·기간 ${rangeLabel(value)} 선택됨` : '일·기간 선택'}
        title={value ? `${rangeLabel(value)} 조회 중` : '일 또는 기간으로 조회'}
        onClick={() => (open ? close() : openPanel())}
        ref={triggerRef}
      >
        <CalendarDays aria-hidden="true" />
        {value && <span className="dp-text">{rangeLabel(value)}</span>}
      </button>
      {value && (
        <button
          type="button"
          className="dp-clear btn-date-clear"
          data-btn="date-clear"
          aria-label="일·기간 선택 해제 (월 단위로 돌아가기)"
          title="월 단위로 돌아가기"
          onClick={() => {
            onChange(null);
            close();
          }}
        >
          <X aria-hidden="true" />
        </button>
      )}

      {open && (
        <div className="dp-panel" role="dialog" aria-label="일·기간 선택">
          <div className="dp-head">
            <button type="button" className="dp-nav" aria-label="이전 달" disabled={prevView < minMonth} onClick={() => setView(prevView)}>
              <ChevronLeft strokeWidth={2.25} aria-hidden="true" />
            </button>
            <div className="dp-title">
              <Dropdown ariaLabel="연도 선택" value={viewY} options={yearOptions} onChange={selectYear} />
              <Dropdown ariaLabel="월 선택" value={viewM} options={monthOptions} onChange={(m) => setView(ym(viewY, m))} />
            </div>
            <button type="button" className="dp-nav" aria-label="다음 달" disabled={nextView > maxMonth} onClick={() => setView(nextView)}>
              <ChevronRight strokeWidth={2.25} aria-hidden="true" />
            </button>
          </div>
          <div className="dp-grid" role="grid" onMouseLeave={() => setHover(null)}>
            {WEEKDAY_LABELS.map((w, i) => (
              <span key={w} className={`dp-wd${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`} role="columnheader">
                {w}
              </span>
            ))}
            {cells.map((day, i) => {
              if (!day) return <span key={`e${i}`} className="dp-empty" />;
              const out = day < min || day > max;
              const inRange = !!shown && day >= shown.from && day <= shown.to;
              const cls = [
                'dp-day',
                i % 7 === 0 ? 'sun' : i % 7 === 6 ? 'sat' : '',
                day === today ? 'today' : '',
                inRange ? 'in' : '',
                shown && day === shown.from ? 'start' : '',
                shown && day === shown.to ? 'end' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <button
                  key={day}
                  type="button"
                  className={cls}
                  role="gridcell"
                  disabled={out}
                  aria-selected={inRange}
                  aria-label={dayLabel(day)}
                  title={out ? `${dayLabel(day)} (데이터 없음)` : undefined}
                  onMouseEnter={() => anchor && setHover(day)}
                  onClick={() => pick(day)}
                >
                  {+day.slice(8)}
                </button>
              );
            })}
          </div>
          <div className="dp-foot">
            <span className="dp-sum">{summary}</span>
          </div>
          <div className="dp-actions">
            <button
              type="button"
              className="dp-today-btn"
              disabled={todayOut}
              title={todayOut ? '오늘은 데이터가 없는 날입니다' : undefined}
              onClick={() => {
                setView(today.slice(0, 7));
                setAnchor(today);
                setDraft({ from: today, to: today });
              }}
            >
              오늘
            </button>
            <button type="button" className="dp-confirm" disabled={!draft} onClick={confirm}>
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
