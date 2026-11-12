import React from 'react';

export interface SegmentOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
  title?: string;
  /** 누를 수 없게 비활성화한다 (준비 중인 항목 등) */
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string | number> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  mini?: boolean;
  id?: string;
  dataKey?: string;
  dataChart?: string;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  mini = false,
  id,
  dataKey,
  dataChart,
}: SegmentedControlProps<T>): React.ReactElement {
  return (
    <span
      className={`seg${mini ? ' seg-mini' : ''}`}
      id={id}
      data-k={dataKey}
      data-chart={dataChart}
    >
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          data-v={opt.value}
          data-btn={`seg-${String(opt.value).toLowerCase()}`}
          className={`seg-btn seg-btn-${String(opt.value).toLowerCase()}${value === opt.value ? ' on' : ''}`}
          title={opt.title}
          disabled={opt.disabled}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </span>
  );
}

export type ChartTableMode = 'chart' | 'table';

interface ChartTableToggleProps {
  /** 지금 보기 — 'chart'(그래프) 또는 'table'(표) */
  value: ChartTableMode;
  /** 보기를 바꿀 때 */
  onChange: (value: ChartTableMode) => void;
}

const CHART_TABLE_OPTIONS: SegmentOption<ChartTableMode>[] = [
  { value: 'chart', label: '그래프' },
  { value: 'table', label: '표' },
];

/** 추이 카드 위의 그래프/표 전환 바 (div.mock-bar) */
export const ChartTableToggle: React.FC<ChartTableToggleProps> = ({ value, onChange }) => (
  <div className="mock-bar">
    <SegmentedControl<ChartTableMode> dataKey="mode" options={CHART_TABLE_OPTIONS} value={value} onChange={onChange} />
    <span className="sp" />
  </div>
);
