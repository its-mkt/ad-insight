import React from 'react';
import { ClipboardList, Lightbulb, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import type { Insight, InsightTone } from '../../utils/insights';
import { Card } from '../common/Card';
import { Muted } from '../common/Muted';

interface InsightPanelProps {
  /** 보여 줄 인사이트 (요약 → 확대 → 축소 순서로 넘긴다) */
  items: Insight[];
  /** 제목 옆 기준 문구 (예: '11월 기준') */
  basis: string;
  /** 카테고리 이름을 누르면 그 카테고리로 검색한다 */
  onSelectCategory?: (cat1: string) => void;
  /** 키워드를 누르면 그 키워드로 검색한다 */
  onSelectKeyword?: (keyword: string) => void;
}

const ICONS: Record<InsightTone, LucideIcon> = {
  summary: ClipboardList,
  good: TrendingUp,
  bad: TrendingDown,
  info: Lightbulb,
};

/** 종합 요약 KPI 아래의 자동 인사이트 — 실제 수집값을 규칙으로 읽어 요약·확대·축소 추천을 보여 준다 */
export const InsightPanel: React.FC<InsightPanelProps> = ({ items, basis, onSelectCategory, onSelectKeyword }) => {
  if (!items.length) return null;
  return (
    <Card
      name="overview-insight"
      id="overview-insight"
      title={
        <>
          <Lightbulb size="1rem" aria-hidden="true" className="ins-title-ic" />
          자동 인사이트
        </>
      }
      subtitle={`(${basis} · 수집 데이터 규칙 분석)`}
    >
      <ul className="ins-list">
        {items.map((it, i) => {
          const Icon = ICONS[it.tone];
          const onSelect = it.category ? onSelectCategory && (() => onSelectCategory(it.category!)) : it.target ? onSelectKeyword && (() => onSelectKeyword(it.target!)) : undefined;
          return (
            <li key={i} className={`ins-item ins-${it.tone}`}>
              <Icon size="1rem" aria-hidden="true" className="ins-ic" />
              <div className="ins-body">
                <strong className="ins-head">{it.head}</strong>
                {it.target &&
                  (onSelect ? (
                    <button type="button" className="ins-target" onClick={onSelect}>
                      {it.target}
                    </button>
                  ) : (
                    <span className="ins-target">{it.target}</span>
                  ))}
                <span className="ins-text">{it.text}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <Muted as="p" small className="ins-foot">
        ※ 견적은 카테고리 효율 화면과 같은 기준, 키워드는 매체 전환 기준입니다. 견적이 3건 미만인 카테고리는 확대 추천에서 뺍니다.
      </Muted>
    </Card>
  );
};
