import React from 'react';
import type { DataAuditReport } from '../../utils/dataAudit';
import { TableFootnote } from '../common/TableFootnote';
import { SkelBar, SkelRows } from '../common/SkeletonView';
import { StatusBadge } from '../common/StatusBadge';
import { Card } from '../common/Card';
import { Th } from '../common/Th';

interface DataAuditTableProps {
  audit: DataAuditReport;
  /** 첫 데이터를 받는 중 — 빈 데이터로 낸 '실패' 결과 대신 자리표시 */
  loading?: boolean;
}

export const DataAuditTable: React.FC<DataAuditTableProps> = ({ audit, loading = false }) => {
  return (
    <Card
      name="audit"
      id="data-audit"
      title="실시간 데이터 매칭 · 통계 무결성 검증"
      subtitle={
        loading ? (
          <SkelBar w="6rem" h="1.25rem" className="skel-inline" />
        ) : (
          <StatusBadge size="sm" level={audit.overallLevel === 'ok' ? 'ok' : 'chk'}>
            {audit.passedCount}/{audit.totalCount} 항목 통과
          </StatusBadge>
        )
      }
    >
      <div className="tw">
        <table className="stk data-tbl" id="tbDataAudit">
          <colgroup>
            <col className="col-d-name" />
            <col />
            <col className="col-d-status" />
          </colgroup>
          <thead>
            <tr>
              <Th>검증 항목</Th>
              <Th>실시간 대조 수치 및 검증 상세</Th>
              <Th className="c">결과</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <SkelRows rows={audit.checks.length || 6} widths={['60%', '80%', '4rem']} />}
            {!loading && audit.checks.map((chk) => (
              <tr key={chk.id}>
                <td>
                  <b>{chk.title}</b>
                </td>
                <td>
                  <div>{chk.summary}</div>
                  <div className="sub-t">{chk.detail}</div>
                </td>
                <td className="c">
                  <StatusBadge size="sm" level={chk.level}>
                    {chk.badgeText}
                  </StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <TableFootnote
          basis="검증 근거: 취합 시트 11개 전수 대조 · 견적·광고비 교차 검증"
          sources={[
            '검증 주기 — 1시간 자동 동기화 때 실행',
            '오차 판정 — 누락 0건 (100% 무결성)',
          ]}
        />
      </div>
    </Card>
  );
};
