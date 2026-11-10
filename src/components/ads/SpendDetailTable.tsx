import React, { useMemo, useState } from 'react';
import type { SpendRow } from '../../types/dashboard';
import { mLabel, sumBy } from '../../utils/format';
import { EXTERNAL_LINKS } from '../../utils/constants';
import { DeltaSpan } from '../charts/KpiCard';
import { TableFootnote } from '../common/TableFootnote';
import { useSort } from '../../hooks/useSort';
import { SortableTh } from '../common/SortableTh';
import { Card } from '../common/Card';
import { MonthHeadCells, MonthRow } from '../common/TableRows';
import { ExtLink } from '../common/ExtLink';

export interface SpendSeriesRow {
  k: string;
  f: (r: SpendRow) => boolean;
  raw?: number[];
  v?: number[];
}

interface SpendDetailTableProps {
  series: SpendSeriesRow[];
  allMonths12: string[];
  months: string[];
  isFuture: (mo: string) => boolean;
  at: (mo: string) => SpendRow[];
  tot: (mo: string) => number;
  mdfCost: (mo: string) => number;
  storeCost: (mo: string) => number;
  lastY: (mo: string) => number;
  /** 기간 선택이 '전체' — 열이 연도이고 전년 비교 행이 없다 */
  allPeriod?: boolean;
  colLabel?: (key: string) => string;
}

type SortKey = 'name' | 'total';

export const SpendDetailTable: React.FC<SpendDetailTableProps> = ({
  series,
  allMonths12,
  months,
  isFuture,
  at,
  tot,
  mdfCost,
  storeCost,
  lastY,
  allPeriod = false,
  colLabel = mLabel,
}) => {
  const { sortKey, sortOrder, toggleSort } = useSort<SortKey>('total');
  const [mdfOpen, setMdfOpen] = useState(false);

  // MDF 를 매체별로 — 캠페인 이름에 MDF 가 들어간 광고비 (집행이 없는 매체는 줄을 만들지 않는다)
  const mdfOfMedia = (media: string) => (mo: string) =>
    sumBy(at(mo).filter((r) => r.media === media && r.campaign.includes('MDF')), (r) => r.cost);
  const mdfChildren = ['Google', 'Naver']
    .map((media) => ({ media, value: mdfOfMedia(media), total: sumBy(months, mdfOfMedia(media)) }))
    .filter((c) => c.total > 0);

  const getTotal = (s: SpendSeriesRow) => sumBy(s.raw || [], (v) => v);

  const sortedSeries = useMemo(() => {
    return [...series].sort((a, b) => {
      const diff = sortKey === 'name'
        ? a.k.localeCompare(b.k)
        : getTotal(a) - getTotal(b);
      return sortOrder === 'desc' ? -diff : diff;
    });
  }, [series, sortKey, sortOrder]);

  return (
    <Card name="spend-monthly" tableWrap id="spend-monthly" title={allPeriod ? '연도별 집행 상세 내역' : '월별 집행 상세 내역'}>
      <div>
        {/* 연도 열만 있을 때는 월별 표의 min-width(72rem)가 불필요한 가로 스크롤을 만든다 */}
        <table className="stk" id="tbSpendDetail" style={allPeriod ? { minWidth: 'auto' } : undefined}>
          <colgroup>
            <col className="col-mo-label" />
            {allMonths12.map((mo) => (
              <col key={mo} className="col-mo-val" />
            ))}
            <col className="col-mo-total" />
          </colgroup>
          <thead>
            <tr>
              <SortableTh sortKey="name" activeKey={sortKey} order={sortOrder} onSort={toggleSort}>구분</SortableTh>
              <MonthHeadCells columns={allMonths12} label={colLabel} isFuture={isFuture} />
              <SortableTh sortKey="total" activeKey={sortKey} order={sortOrder} onSort={toggleSort} className="n">합계</SortableTh>
            </tr>
          </thead>
          <tbody>
            {sortedSeries.map((s) => (
              <MonthRow
                key={s.k}
                label={s.k}
                columns={allMonths12}
                isFuture={isFuture}
                value={(mo) => sumBy(at(mo).filter(s.f), (r) => r.cost)}
                total={getTotal(s)}
                totalBold
              />
            ))}
            <MonthRow grp label="합계" columns={allMonths12} isFuture={isFuture} value={tot} total={sumBy(months, tot)} totalBold />
            <MonthRow
              sub
              label="MDF"
              columns={allMonths12}
              isFuture={isFuture}
              value={mdfCost}
              total={sumBy(months, mdfCost)}
              onToggle={mdfChildren.length ? () => setMdfOpen((v) => !v) : undefined}
              open={mdfOpen}
            />
            {mdfOpen &&
              mdfChildren.map((c) => (
                <MonthRow key={c.media} sub child label={c.media} columns={allMonths12} isFuture={isFuture} value={c.value} total={c.total} />
              ))}
            <MonthRow sub label="스토어" columns={allMonths12} isFuture={isFuture} value={storeCost} total={sumBy(months, storeCost)} />
            {!allPeriod && (
              <>
            <MonthRow sub label="전년 동월" columns={allMonths12} isFuture={isFuture} value={lastY} total={sumBy(months, lastY)} />
            <MonthRow
              sub
              label="전년비"
              columns={allMonths12}
              isFuture={isFuture}
              value={(mo) => <DeltaSpan a={tot(mo)} b={lastY(mo)} />}
              total={<DeltaSpan a={sumBy(months, tot)} b={sumBy(months, lastY)} />}
            />
              </>
            )}
          </tbody>
        </table>
        <TableFootnote
          unit="원"
          basis="산출 근거: VAT 포함 실소진액 (당월은 수집 시점까지)"
          sources={[
            <span key="api">
              API:{' '}
              <ExtLink href={EXTERNAL_LINKS.googleAds} title="Google SA·DA 자동 수집">Google Ads</ExtLink>{' '}
              ·{' '}
              <ExtLink href={EXTERNAL_LINKS.naverSearchAd} title="Naver SA 자동 수집">네이버 검색광고</ExtLink>{' '}
              ·{' '}
              <ExtLink href={EXTERNAL_LINKS.naverSmartStore} title="네이버 커머스 API 자동 수집">스마트스토어</ExtLink>
            </span>,
            <span key="sheet">
              시트: <span title="네이버 DA 리포트 시트">네이버 DA</span> ·{' '}
              <ExtLink href={EXTERNAL_LINKS.metaAds} title="Meta Ads 관리자 수치를 시트에 수동 입력">Meta</ExtLink>{' '}
              · <span title="MDF 업로드 시트 + HPE_MDF 캠페인">MDF</span>
            </span>,
          ]}
        />
      </div>
    </Card>
  );
};
