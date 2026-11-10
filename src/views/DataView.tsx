import React, { useMemo } from 'react';
import type { CategoryMap, DashboardData, SyncStatus } from '../types/dashboard';
import { DEFAULT_URL, getCfg } from '../hooks/useDashboardData';
import { fmt, sumBy } from '../utils/format';
import { runDataAudit } from '../utils/dataAudit';
import { EXTERNAL_LINKS } from '../utils/constants';
import { View } from '../components/common/View';
import { ViewHeader } from '../components/common/ViewHeader';
import { DataAuditTable } from '../components/data/DataAuditTable';
import { DataSourceTable } from '../components/data/DataSourceTable';
import { CategoryMappingSection } from '../components/data/CategoryMappingSection';
import { ArrowUpRight } from 'lucide-react';
import { KpiCard, KpiDetailItems, KpiSection } from '../components/charts/KpiCard';
import { Card } from '../components/common/Card';
import { ExtLink } from '../components/common/ExtLink';
import { Muted } from '../components/common/Muted';

interface DataViewProps {
  data: DashboardData;
  categoryMap: CategoryMap;
  status: SyncStatus;
  /** 첫 데이터를 받는 중 — 0행·검증 실패 대신 자리표시를 보여 준다 */
  loading?: boolean;
}

export const DataView: React.FC<DataViewProps> = ({ data, categoryMap, status, loading = false }) => {
  const live = status === 'live';
  const cfg = getCfg();
  const audit = useMemo(() => runDataAudit(data, categoryMap), [data, categoryMap]);

  const googleRows = data.spend.filter((r) => r.media === 'Google');
  const naverSaRows = data.spend.filter((r) => r.media === 'Naver' && r.type === 'SA');
  const naverDaRows = data.spend.filter((r) => r.media === 'Naver' && r.type === 'DA');
  const naverKws = data.keywords.filter((k) => k.media === 'Naver');
  const googleKws = data.keywords.filter((k) => k.media === 'Google');
  const storeSpendRows = data.spend.filter(
    (r) => r.campaign.includes('스마트스토어') || r.campaign.includes('스토어')
  );
  const storeManualRows = data.manual.filter((r) => r.item === 'STORE');
  const mdfSpendRows = data.spend.filter((r) => r.campaign.includes('MDF'));
  const mdfManualRows = data.manual.filter((r) => r.item === 'MDF');
  const metaRows = data.manual.filter((r) => r.item === 'META');
  const totalQuotesCount = data.quotesRaw.length || sumBy(data.quotes, (r) => r.count);

  const sourceRows: {
    media: string;
    variant: 'g' | 'n' | 'm' | 'it' | 'etc';
    titleSuffix: string;
    desc: string;
    method: string;
    liveSummary: string;
    statusLabel: string;
    statusCls: 'ok' | 'chk' | 'man';
  }[] = [
    {
      media: 'Naver',
      variant: 'n',
      titleSuffix: '검색광고 SA',
      desc: '비용·노출·클릭·전환, 키워드 입찰가, 확장소재',
      method: '검색광고 API → 시트 1시간 자동 적재',
      liveSummary: `월별 ${fmt(naverSaRows.length)}행 · 키워드 ${fmt(naverKws.length)}개 · 소재 ${fmt(data.ads.filter((a) => a.media === 'Naver').length)}개`,
      statusLabel: naverSaRows.length > 0 ? '정상 연동' : '수집 대기',
      statusCls: naverSaRows.length > 0 ? 'ok' : 'chk',
    },
    {
      media: '견적',
      variant: 'it',
      titleSuffix: 'ITKET · 캐드코리아 · ZbyHP · 전화상담',
      desc: '견적 일시·카테고리·유입 매체',
      method: '쇼핑몰(고도몰5) 견적 접수 즉시 웹훅·시트 자동 적재',
      liveSummary: `원장 ${fmt(totalQuotesCount)}건 · 월별 요약 ${fmt(data.quotes.length)}행`,
      statusLabel: totalQuotesCount > 0 ? '실시간 자동' : '수집 대기',
      statusCls: totalQuotesCount > 0 ? 'ok' : 'chk',
    },
    {
      media: 'Naver',
      variant: 'n',
      titleSuffix: '스마트스토어',
      desc: '쇼핑검색 캠페인 · 수수료·프로모션비',
      method: '검색광고 쇼핑검색 + 커머스 API 자동 적재',
      liveSummary: `쇼핑검색 ${fmt(storeSpendRows.length)}행 (${fmt(sumBy(storeSpendRows, (r) => r.cost))}원)${storeManualRows.length ? ` · 정산 ${storeManualRows.length}행` : ''}`,
      statusLabel: storeSpendRows.length > 0 || storeManualRows.length > 0 ? 'API 자동 연동' : '수집 대기',
      statusCls: storeSpendRows.length > 0 || storeManualRows.length > 0 ? 'ok' : 'chk',
    },
    {
      media: 'MDF',
      variant: 'etc',
      titleSuffix: '광고비 지원금',
      desc: '제조사(HPE 등) 협약 지원금 캠페인',
      method: '네이버·구글 검색광고 API → MDF 캠페인 자동 집계',
      liveSummary: `MDF 캠페인 ${fmt(mdfSpendRows.length)}행 (${fmt(sumBy(mdfSpendRows, (r) => r.cost))}원)${mdfManualRows.length ? ` · 수동 ${mdfManualRows.length}행` : ''}`,
      statusLabel: mdfSpendRows.length > 0 || mdfManualRows.length > 0 ? 'API 자동 연동' : '수집 대기',
      statusCls: mdfSpendRows.length > 0 || mdfManualRows.length > 0 ? 'ok' : 'chk',
    },
    {
      media: 'Google',
      variant: 'g',
      titleSuffix: 'SA·DA',
      desc: '비용·노출·클릭·전환, 키워드 입찰가, 소재',
      method: 'Google Ads Script → 시트 1시간 자동 적재',
      liveSummary:
        googleRows.length > 0
          ? `월별 ${fmt(googleRows.length)}행 · 키워드 ${fmt(googleKws.length)}개`
          : '시트 g_* 탭 0행 (Google Ads 콘솔에서 스크립트 최초 실행 필요)',
      statusLabel: googleRows.length > 0 ? '정상 연동' : '스크립트 대기',
      statusCls: googleRows.length > 0 ? 'ok' : 'chk',
    },
    {
      media: 'Naver',
      variant: 'n',
      titleSuffix: '디스플레이 DA (GFA)',
      desc: '성과형 디스플레이 배너 비용·노출·클릭·전환',
      method: 'GFA 리포트 이메일/스케줄러 → 시트 자동 동기화',
      liveSummary:
        naverDaRows.length > 0
          ? `월별 ${fmt(naverDaRows.length)}행 (${fmt(sumBy(naverDaRows, (r) => r.cost))}원)`
          : '해당 기간 GFA 집행 내역 없음 (0행)',
      statusLabel: naverDaRows.length > 0 ? '무인 수집' : '집행 없음',
      statusCls: naverDaRows.length > 0 ? 'ok' : 'man',
    },
    {
      media: 'Meta',
      variant: 'm',
      titleSuffix: '광고비',
      desc: 'Facebook · Instagram 스폰서드 광고',
      method: '시트 manual 탭 한 줄 입력 (연 1회 내외)',
      liveSummary:
        metaRows.length > 0
          ? `${fmt(metaRows.length)}건 (${fmt(sumBy(metaRows, (r) => r.amount))}원)`
          : '집행 내역 없음 (0원)',
      statusLabel: '수동',
      statusCls: 'man',
    },
  ];

  // 자동 수집(수동 입력이 아닌) 소스 중 정상인 수 — 연결 상태 카드용
  const autoRows = sourceRows.filter((r) => r.statusLabel !== '수동');
  const autoSources = autoRows.length;
  const okSources = autoRows.filter((r) => r.statusCls !== 'chk').length; // 수집 대기·스크립트 대기만 점검 필요 (집행 없음은 정상)

  return (
    <View name="data" title="데이터 연결">
      <ViewHeader
        title="데이터 연결 및 동기화"
        description="매체 API 및 견적 웹훅 수집 현황과 실시간 통계 무결성 검증"
        status={status}
      />

      {/* 한눈에 보는 연결 상태 — 연동 · 소스 · 검증 · 적재량 */}
      <KpiSection id="kpiData">
        <KpiCard
          label="연동 상태"
          value={live ? '정상 연동' : status === 'error' ? '동기화 지연' : '연결 중'}
          sub={
            data.updated
              ? `마지막 수집 ${data.updated}`
              : loading
                ? '데이터를 받는 중'
                : '데이터 동기화 대기 중'
          }
          detail="1시간 주기 자동 동기화"
        />
        <KpiCard
          label="수집 소스"
          value={loading ? '–' : `${okSources} / ${autoSources}개 정상`}
          sub="API·웹훅 자동 수집 소스 기준"
          detail={
            loading ? null : (
              <KpiDetailItems items={[['자동', autoSources], ['수동', sourceRows.length - autoSources], ['점검 필요', autoSources - okSources]]} />
            )
          }
        />
        <KpiCard
          label="무결성 검증"
          value={loading ? '–' : `${audit.passedCount} / ${audit.totalCount}항목 통과`}
          sub={loading ? undefined : audit.passedCount === audit.totalCount ? '모든 항목 통과' : '확인이 필요한 항목이 있습니다'}
          detail="실시간 데이터 대조"
        />
        <KpiCard
          label="적재 데이터"
          value={loading ? '–' : `견적 ${fmt(totalQuotesCount)}건`}
          sub={loading ? undefined : `광고비 ${fmt(data.spend.length)}행 · 키워드 ${fmt(data.keywords.length)}개 · 소재 ${fmt(data.ads.length)}개`}
          detail={loading ? null : `월별 견적 요약 ${fmt(data.quotes.length)}행`}
        />
      </KpiSection>

      {/* 데이터 소스별 실시간 수집 현황 */}
      <DataSourceTable sourceRows={sourceRows} loading={loading} />

      {/* 실시간 데이터 매칭 · 통계 무결성 자동 검증 섹션 */}
      <DataAuditTable audit={audit} loading={loading} />

      {/* 카테고리 매칭 실시간 현황 */}
      <CategoryMappingSection audit={audit} loading={loading} />

      <Card name="connection" id="data-connection" title="연결 정보">
          <table className="kv">
            <tbody>
              <tr>
                <th>취합 스프레드시트</th>
                <td>
                  <ExtLink href={EXTERNAL_LINKS.masterSheet} className="link-acc">
                    광고비·전환·견적 취합 시트 (1mxrTeh7bo...)
                    <ArrowUpRight size="0.75rem" aria-hidden="true" />
                  </ExtLink>
                </td>
              </tr>
              <tr>
                <th>Apps Script 웹앱</th>
                <td>
                  <code id="dataViewUrl" className="url-code">
                    {cfg.url || DEFAULT_URL}
                  </code>
                </td>
              </tr>
              </tbody>
          </table>
      </Card>

      <div className="grid">
          <Card name="refresh" id="refresh-policy" title="갱신 주기">
            <table className="kv">
              <tbody>
                <tr>
                  <th>매일 08:00</th>
                  <td>
                    전일 확정 수치 수집 <Muted>(기본)</Muted>
                  </td>
                </tr>
                <tr>
                  <th>1시간마다</th>
                  <td>
                    당일 비용·클릭 <Muted>— 잠정치로 표시</Muted>
                  </td>
                </tr>
                <tr>
                  <th>매월 초</th>
                  <td>
                    전월 재수집 <Muted>— 매체 사후 보정 반영</Muted>
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>
          <Card name="security" className="warn" id="security-policy" title="보안 정책">
            <ul>
              <li>광고비·입찰가·견적 수는 사내 영업 정보 (외부 비공개)</li>
              <li>API 키는 저장소에 커밋하지 않고 브라우저 로컬 저장소 및 환경변수로 분리</li>
              <li>사내망 또는 인증 사용자만 열람 가능하도록 보안 유지</li>
            </ul>
          </Card>
        </div>
    </View>
  );
};
