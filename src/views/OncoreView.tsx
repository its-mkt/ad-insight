import React from 'react';
import type { SyncStatus } from '../types/dashboard';
import { Card } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { View } from '../components/common/View';
import { ViewHeader } from '../components/common/ViewHeader';

const TITLE = '온코어';

/**
 * 사이드바에서 온코어를 골랐을 때 아직 연결되지 않은 데이터 안내.
 * 기본은 온코어 전체(수집기 연결 전), 화면 이름을 주면 그 화면만(예: 구매 상세 — 고도몰 주문 미연결)
 */
export const OncoreView: React.FC<{
  status: SyncStatus;
  /** 연결되지 않은 화면 이름 (없으면 온코어 전체) */
  viewTitle?: string;
}> = ({ status, viewTitle }) => (
  <View name="oncore" title={viewTitle || TITLE}>
    <ViewHeader title={viewTitle ? `${TITLE} ${viewTitle}` : TITLE} description="온코어 광고·견적 현황" status={status} />
    <Card name="oncore-pending" title={viewTitle ? `${TITLE} ${viewTitle}` : '온코어 데이터'}>
      {viewTitle ? (
        <EmptyState message={`온코어 ${viewTitle} 데이터는 아직 연결되지 않았습니다.`} subMessage="광고·견적 화면은 온코어 데이터로 볼 수 있습니다." />
      ) : (
        <EmptyState message="온코어 데이터 연결을 준비하고 있습니다." subMessage="연결 전까지는 아이티켓을 선택해 주세요." />
      )}
    </Card>
  </View>
);
