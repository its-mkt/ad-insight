import React from 'react';
import { MediaPill } from '../common/MediaPill';
import { TableFootnote } from '../common/TableFootnote';
import { SkelBar } from '../common/SkeletonView';
import { StatusBadge, type StatusLevel } from '../common/StatusBadge';
import { Card } from '../common/Card';
import { Th } from '../common/Th';

export interface DataSourceRowItem {
  media: string;
  variant: 'g' | 'n' | 'it' | 'm' | 'etc';
  titleSuffix: string;
  desc: string;
  method: string;
  liveSummary: string;
  statusLabel: string;
  statusCls: string;
}

interface DataSourceTableProps {
  sourceRows: DataSourceRowItem[];
  /** 첫 데이터를 받는 중 — 적재량·상태 칸은 자리표시 */
  loading?: boolean;
}

export const DataSourceTable: React.FC<DataSourceTableProps> = ({ sourceRows, loading = false }) => {
  return (
    <Card name="sources" id="data-sources" title="데이터 소스별 실시간 수집 현황">
      <div className="hier">
        <span>매체</span>›
        <span>
          캠페인 <small>≒ 카테고리</small>
        </span>
        ›<span>광고그룹</span>›
        <span>
          키워드 <small>SA</small> / 배너 <small>DA</small>
        </span>
      </div>
      <div className="tw">
        <table className="stk data-tbl">
          <colgroup>
            <col className="col-d-name" />
            <col />
            <col className="col-d-status" />
          </colgroup>
          <thead>
            <tr>
              <Th>소스</Th>
              <Th>수집 방식 · 현재 적재량</Th>
              <Th className="c">상태</Th>
            </tr>
          </thead>
          <tbody>
            {sourceRows.map((row, idx) => (
              <tr key={idx}>
                <td>
                  <MediaPill media={row.media} variant={row.variant} /> {row.titleSuffix}
                  <div className="sub-t">{row.desc}</div>
                </td>
                <td>
                  <div>{row.method}</div>
                  <div className="sub-t">{loading ? <SkelBar w="14rem" h="0.75rem" /> : row.liveSummary}</div>
                </td>
                <td className="c">
                  {loading ? (
                    <SkelBar w="4.5rem" h="1.25rem" />
                  ) : (
                    <StatusBadge size="sm" level={row.statusCls as StatusLevel}>{row.statusLabel}</StatusBadge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <TableFootnote
          basis="데이터 기준: Google·Naver·스토어는 API 실시간 수집, 그 외는 시트 배치 수집"
          sources={[
            '과거 수치는 월간보고서·키워드TFT 엑셀을 1회 이관해 전년·전분기 비교에 사용',
          ]}
        />
      </div>
    </Card>
  );
};
