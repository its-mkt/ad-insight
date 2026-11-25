import { useState } from 'react';
import type { ChartTableMode } from '../components/common/SegmentedControl';
import { MOBILE_LAYOUT_QUERY } from '../utils/constants';

/** 지금 휴대폰 배치(md 이하·휴대폰 가로)인지 — 창을 열 때 한 번만 본다 */
const isMobileLayout = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.(MOBILE_LAYOUT_QUERY).matches;

/**
 * 그래프/표 전환 카드의 보기 상태 — 처음 보기는 PC 에서 그래프, 휴대폰 배치에서는 표.
 * 좁은 화면의 꺾은선·묶음 막대는 축·범례가 겹쳐 읽기 어려워 표를 먼저 보여 주고, 그래프는 전환 버튼으로 볼 수 있게 남긴다.
 * 처음 보기만 정하므로 화면을 돌리거나 창 크기를 바꿔도 사용자가 고른 보기는 그대로 둔다.
 */
export function useChartTableMode(): [ChartTableMode, (mode: ChartTableMode) => void] {
  return useState<ChartTableMode>(() => (isMobileLayout() ? 'table' : 'chart'));
}
