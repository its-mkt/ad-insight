import React, { useMemo, useState } from 'react';
import { ClipboardList, Lightbulb, Sparkles, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import type { Insight, InsightTone } from '../../utils/insights';
import { AI_ERROR_TEXT, cachedAiInsight, requestAiInsight, type AiInsightFacts, type AiInsightResult } from '../../lib/aiInsight';
import { Card } from './Card';
import { Muted } from './Muted';
import { Button } from './Button';
import { Notice } from './Notice';
import { SkelBar } from './SkeletonView';

interface InsightPanelProps {
  /** 화면 이름 — 카드 id(`{name}-insight`)에 쓴다 */
  name: string;
  /** 보여 줄 인사이트 (요약 → 확대 → 축소 순서로 넘긴다). 비면 카드를 그리지 않는다 */
  items: Insight[];
  /** 제목 옆 기준 문구 (예: '11월') */
  basis: string;
  /** 카드 아래 기준 설명 (※ 문구) */
  foot?: React.ReactNode;
  /** 화면 제목 (예: '종합 요약') — 주면 제목 줄에 「AI 분석」 버튼이 생기고, 이 카드의 문장만 Claude 에 보낸다 */
  aiPage?: string;
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

const todayKey = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 인사이트 한 줄 (규칙 결과·AI 결과 공용) */
const InsightLine: React.FC<{ tone: InsightTone; head: string; target?: React.ReactNode; text: string }> = ({ tone, head, target, text }) => {
  const Icon = ICONS[tone];
  return (
    <li className={`ins-item ins-${tone}`}>
      <Icon size="1rem" aria-hidden="true" className="ins-ic" />
      <div className="ins-body">
        <strong className="ins-head">{head}</strong>
        {target}
        <span className="ins-text">{text}</span>
      </div>
    </li>
  );
};

/** KPI 아래의 자동 인사이트 — 실제 수집값을 규칙으로 읽은 요약·확대·축소 추천 (문장은 utils/insights 가 만든다). aiPage 를 주면 Claude 분석을 덧붙일 수 있다 */
export const InsightPanel: React.FC<InsightPanelProps> = ({ name, items, basis, foot, aiPage, onSelectCategory, onSelectKeyword }) => {
  const facts = useMemo<AiInsightFacts | null>(
    () =>
      aiPage && items.length
        ? { page: aiPage, basis, today: todayKey(), insights: items.map((it) => ({ type: it.tone, head: it.head, target: it.target, text: it.text })) }
        : null,
    [aiPage, basis, items]
  );
  const factsKey = facts ? JSON.stringify(facts) : '';
  // 결과는 자료가 바뀌면 버린다 (같은 날 같은 자료면 저장해 둔 답을 바로 보여 준다)
  const [ai, setAi] = useState<{ key: string; result?: AiInsightResult; error?: string; loading?: boolean }>({ key: '' });
  const cached = facts && ai.key !== factsKey ? cachedAiInsight(facts) : null;
  const view = ai.key === factsKey ? ai : cached ? { key: factsKey, result: cached } : { key: factsKey };

  if (!items.length) return null;

  const runAi = () => {
    if (!facts || view.loading) return;
    setAi({ key: factsKey, loading: true });
    requestAiInsight(facts)
      .then((result) => setAi((prev) => (prev.key === factsKey ? { key: factsKey, result } : prev)))
      .catch((e: Error) => setAi((prev) => (prev.key === factsKey ? { key: factsKey, error: e.message } : prev)));
  };

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
      tools={
        facts && (
          <Button size="xs" icon={Sparkles} onClick={runAi} disabled={view.loading} className="ins-ai-btn">
            {view.loading ? 'AI 분석 중…' : view.result ? 'AI 다시 분석' : 'AI 분석'}
          </Button>
        )
      }
    >
      {(view.loading || view.result || view.error) && (
        <div className="ins-ai" aria-live="polite">
          <p className="ins-ai-head">
            <Sparkles size="0.875rem" aria-hidden="true" />
            Claude 분석
            <Muted small>아래 숫자만으로 해석한 내용입니다</Muted>
          </p>
          {view.loading && (
            <div className="ins-ai-skel">
              <SkelBar w="90%" />
              <SkelBar w="75%" />
              <SkelBar w="82%" />
            </div>
          )}
          {view.error && <Notice tone="warn">{AI_ERROR_TEXT[view.error] || `AI 분석에 실패했습니다. (${view.error})`}</Notice>}
          {view.result && (
            <>
              <p className="ins-ai-summary">{view.result.summary}</p>
              <ul className="ins-list">
                {view.result.actions.map((a, i) => (
                  <InsightLine key={i} tone={a.tone} head={a.title} text={a.text} />
                ))}
              </ul>
              {view.result.caution && (
                <Muted as="p" className="ins-foot">
                  ※ {view.result.caution}
                </Muted>
              )}
            </>
          )}
        </div>
      )}
      <ul className="ins-list">
        {items.map((it, i) => {
          const onSelect = it.category
            ? onSelectCategory && (() => onSelectCategory(it.category!))
            : it.target
              ? onSelectKeyword && (() => onSelectKeyword(it.target!))
              : undefined;
          const target =
            it.target &&
            (onSelect ? (
              <button type="button" className="ins-target" onClick={onSelect}>
                {it.target}
              </button>
            ) : (
              <span className="ins-target">{it.target}</span>
            ));
          return <InsightLine key={i} tone={it.tone} head={it.head} target={target} text={it.text} />;
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
