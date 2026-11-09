import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from './Button';

/** 필터 줄의 마지막 조건 바로 옆에 두는 초기화 버튼. 조건이 기본값에서 바뀌었을 때만 그린다 */
export const FilterReset: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <Button
    type="button"
    size="sm"
    icon={RotateCcw}
    iconOnly
    className="filter-reset"
    data-btn="filter-reset"
    aria-label="필터 초기화"
    title="필터 초기화"
    onClick={onClick}
  />
);
