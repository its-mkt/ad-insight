import React, { useState } from 'react';
import type { DataAuditReport } from '../../utils/dataAudit';
import { sumBy } from '../../utils/format';
import { TableFootnote } from '../common/TableFootnote';
import { StatusBadge } from '../common/StatusBadge';
import { Card } from '../common/Card';
import { Chip } from '../common/Chip';
import { NumTd, TotalRow } from '../common/TableRows';
import { LIST_LIMIT, ShowMoreButton } from '../common/MoreButton';
import { SkelBar, SkelRows } from '../common/SkeletonView';

interface CategoryMappingSectionProps {
  audit: DataAuditReport;
  /** 첫 데이터를 받는 중 — 0개·0원 대신 자리표시 */
  loading?: boolean;
}

export const CategoryMappingSection: React.FC<CategoryMappingSectionProps> = ({ audit, loading = false }) => {
  const [showAll, setShowAll] = useState(false);
  const ranked = audit.categoryBreakdown
    .filter((c) => c.category !== '기타' && (c.curMonthSpend > 0 || c.curMonthQuotes > 0))
    .sort((x, y) => y.curMonthSpend - x.curMonthSpend);
  const flowCats = ranked.slice(0, 6).map((c) => c.category);
  const restCount = ranked.length - flowCats.length;
  return (
    <>
      <Card name="flow" id="cat-flow" title="카테고리 매칭" subtitle={`(${audit.curMonth} 기준 실시간 매핑 현황)`}>
      <p className="lead-t">
        매체마다 다른 캠페인·광고그룹 이름과 견적 제목을 직접 잇지 않고, <b>분류표(1차 카테고리)</b>를 가운데 두고
        양쪽을 연결한다. 정확한 매핑표에 없으면 이름·제목으로 찾는다.
      </p>
        <div className="flow">
          <div className="col">
            <div className="col-h">매체 광고그룹 (예)</div>
            <Chip tone="n">N · (⭐)HPE_MDF › 주요키워드</Chip>
            <Chip tone="n">N · 스마트스토어 쇼핑검 › 엘리트북</Chip>
            <Chip tone="g">G · GDN_자사몰_최신 › GDN_GPU</Chip>
            <Chip tone="n">N · 스토리지 › 시놀로지_NAS</Chip>
          </div>
          <div className="mid">N : M</div>
          <div className="col">
            <div className="col-h">분류표 1차 ({audit.curMonth} 광고비 상위)</div>
            {loading
              ? Array.from({ length: 6 }, (_, i) => <SkelBar key={i} h="2rem" />)
              : flowCats.map((c) => (
                  <Chip key={c} tone="s">
                    {c}
                  </Chip>
                ))}
            {!loading && restCount > 0 && <Chip tone="s" muted>외 {restCount}개 · 기타</Chip>}
          </div>
          <div className="mid">N : M</div>
          <div className="col">
            <div className="col-h">견적 (예)</div>
            <Chip tone="it">제목 · HP Z6 G5 견적서 요청</Chip>
            <Chip tone="it">제목 · Synology DS1825+ 견적</Chip>
            <Chip tone="it">제목 · APC Smart-UPS SMT1000IC</Chip>
            <Chip tone="it">제목 없음 · 유입 광고 ROSEHA</Chip>
          </div>
        </div>
      </Card>

      <Card name="mapping" id="cat-mapping" title="표준 카테고리별 매칭 현황" subtitle={`(${audit.curMonth} 기준)`}>
      <div className="tw">
        <table className="stk data-tbl data-tbl-map" id="tbCatMappingStatus">
          <colgroup>
            <col className="col-d-name" />
            <col className="col-d-num" />
            <col className="col-d-num" />
            <col className="col-d-num" />
            <col className="col-d-status" />
          </colgroup>
          <thead>
            <tr>
              <th>표준 카테고리</th>
              <th className="n">매칭된 광고그룹 수</th>
              <th className="n">{audit.curMonth} 광고비</th>
              <th className="n">{audit.curMonth} 접수 견적</th>
              <th className="c">매칭 상태</th>
            </tr>
          </thead>
          <tbody>
            {loading && <SkelRows rows={LIST_LIMIT} widths={['40%', '3rem', '6rem', '3rem', '4.5rem']} />}
            {!loading && audit.categoryBreakdown.slice(0, showAll ? undefined : LIST_LIMIT).map((item) => (
              <tr key={item.category}>
                <td>
                  <b>{item.category}</b>
                </td>
                <NumTd value={item.adgroupCount} unit="개" />
                <NumTd value={item.curMonthSpend} unit="원" />
                <NumTd value={item.curMonthQuotes} unit="건" />
                <td className="c">
                  {item.category === '기타' ? (
                    <StatusBadge size="sm" level="warn">미분류</StatusBadge>
                  ) : (
                    <StatusBadge size="sm" level="ok">정상 매칭</StatusBadge>
                  )}
                </td>
              </tr>
            ))}
            {!loading && (
            <TotalRow>
              <NumTd value={sumBy(audit.categoryBreakdown, (i) => i.adgroupCount)} unit="개" bold />
              <NumTd value={sumBy(audit.categoryBreakdown, (i) => i.curMonthSpend)} unit="원" bold />
              <NumTd value={sumBy(audit.categoryBreakdown, (i) => i.curMonthQuotes)} unit="건" bold />
              <td className="c">
                <StatusBadge size="sm" level="ok">100% 일치</StatusBadge>
              </td>
            </TotalRow>
            )}
          </tbody>
        </table>
        {!loading && <ShowMoreButton total={audit.categoryBreakdown.length} expanded={showAll} onToggle={() => setShowAll((v) => !v)} />}
        <TableFootnote
          basis="산출 근거: 광고그룹·견적을 분류표 1차로 집계 (2차 합산) · 기타 = 분류 불가"
          sources={[
            '광고: 캠페인·광고그룹 매핑표 → 이름 규칙',
            '견적: 제목 → 유입 광고 꼬리표 규칙',
          ]}
        />
      </div>
      </Card>
    </>
  );
};
