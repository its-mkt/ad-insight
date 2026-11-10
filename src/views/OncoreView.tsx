import React from 'react';
import type { SyncStatus } from '../types/dashboard';
import { Card } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { View } from '../components/common/View';
import { ViewHeader } from '../components/common/ViewHeader';

const TITLE = '온코어';

/** 사이드바에서 온코어를 골랐을 때 — 온코어 데이터를 연결하기 전까지 보여 주는 안내 */
export const OncoreView: React.FC<{ status: SyncStatus }> = ({ status }) => (
  <View name="oncore" title={TITLE}>
    <ViewHeader title={TITLE} description="온코어 광고·견적 현황" status={status} />
    <Card name="oncore-pending" title="온코어 데이터">
      <EmptyState message="온코어 데이터 연결을 준비하고 있습니다." subMessage="연결 전까지는 아이티켓을 선택해 주세요." />
    </Card>
  </View>
);
