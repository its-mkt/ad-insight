import React, { useState } from 'react';
import type { SeriesItem } from '../../types/dashboard';
import { sumBy } from '../../utils/format';
import { Card } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { LIST_LIMIT, ShowMoreButton } from '../common/MoreButton';
import { MonthHeadCells, MonthRow } from '../common/TableRows';
import { Th } from '../common/Th';

interface TrendTableProps {
  id: string;
  title: React.ReactNode;
  /** 첫 열 이름 */
  nameLabel: string;
  labels: string[];
  series: SeriesItem[];
  emptyMessage?: string;
}

/** 추이 차트(MultiChart)의 표 보기 — 같은 labels·series 를 행·열로 펼친다 */
export const TrendTable: React.FC<TrendTableProps> = ({ id, title, nameLabel, labels, series, emptyMessage = '표시할 데이터가 없습니다' }) => {
  const [showAll, setShowAll] = useState(false);
  const columns = labels.map((_, i) => String(i));
  // 합계 줄은 접힌 행까지 포함한 전체 합계다
  const columnTotal = (key: string) => sumBy(series, (s) => s.v[+key] ?? 0);
  return (
    <Card name={id} id={id} title={title}>
      {series.length && labels.length ? (
        <div className="tw">
          <table className="stk">
            <thead>
              <tr>
                <Th>{nameLabel}</Th>
                <MonthHeadCells columns={columns} label={(key) => labels[+key]} />
                <Th className="n">합계</Th>
              </tr>
            </thead>
            <tbody>
              {series.slice(0, showAll ? undefined : LIST_LIMIT).map((s) => (
                <MonthRow key={s.k} label={s.k} columns={columns} value={(key) => s.v[+key] ?? 0} total={sumBy(s.v, (v) => v)} totalBold />
              ))}
              <MonthRow grp label="합계" columns={columns} value={columnTotal} total={sumBy(columns, columnTotal)} totalBold />
            </tbody>
          </table>
          <ShowMoreButton noun={nameLabel} total={series.length} expanded={showAll} onToggle={() => setShowAll((v) => !v)} />
        </div>
      ) : (
        <EmptyState message={emptyMessage} />
      )}
    </Card>
  );
};
