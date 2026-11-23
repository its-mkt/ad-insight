import React from 'react';
import { ClipboardList, Lightbulb, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import type { Insight, InsightTone } from '../../utils/insights';
import { Card } from './Card';
import { Muted } from './Muted';

interface InsightPanelProps {
  /** 화면 이름 — 카드 id(`{name}-insight`)에 쓴다 */
  name: string;
  /** 보여 줄 인사이트 (요약 → 확대 → 축소 순서로 넘긴다). 비면 카드를 그리지 않는다 */
  items: Insight[];
  /** 제목 옆 기준 문구 (예: '11월') */
  basis: string;
  /** 카드 아래 기준 설명 (※ 문구) */
  foot?: React.ReactNode;
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

/** KPI 아래의 자동 인사이트 — 실제 수집값을 규칙으로 읽은 요약·확대·축소 추천 (문장은 utils/insights 가 만든다) */
export const InsightPanel: React.FC<InsightPanelProps> = ({ name, items, basis, foot, onSelectCategory, onSelectKeyword }) => {
  if (!items.length) return null;
  return (
    <Card
      name="insight"
      id={`${name}-insight`}
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
          const onSelect = it.category
            ? onSelectCategory && (() => onSelectCategory(it.category!))
            : it.target
              ? onSelectKeyword && (() => onSelectKeyword(it.target!))
              : undefined;
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
      {foot && (
        <Muted as="p" className="ins-foot">
          {foot}
        </Muted>
      )}
    </Card>
  );
};
