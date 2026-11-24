import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Lightbulb, RotateCw, Sparkles, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import type { Insight, InsightTone } from '../../utils/insights';
import { AI_ERROR_TEXT, cachedAiInsight, requestAiInsight, type AiInsightFacts, type AiInsightResult } from '../../lib/aiInsight';
import { Card } from './Card';
import { Muted } from './Muted';
import { Button } from './Button';
import { Notice } from './Notice';
import { MoreButton } from './MoreButton';
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
  /** 화면 제목 (예: '종합 요약') — 주면 화면을 열 때 이 카드의 문장만 Claude 에 보내 핵심 요약을 받아 둔다 */
  aiPage?: string;
  /** Claude 에 함께 보낼 화면 수치 요약 (utils/aiFacts) — 규칙 문장만으로 부족한 화면에서 쓴다 */
  aiData?: Record<string, unknown>;
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

type AiState = { key: string; result?: AiInsightResult; error?: string; loading?: boolean };

/**
 * KPI 아래의 자동 인사이트 — 핵심 요약 한 단락만 보이고, 추천은 「자세히 보기」로 펼친다.
 * aiPage 를 주면 화면을 열 때 Claude 요약을 받아 핵심 요약 자리에 둔다 (받는 동안·실패하면 규칙 요약).
 * 규칙 문장은 utils/insights 가 만든다.
 */
export const InsightPanel: React.FC<InsightPanelProps> = ({ name, items, basis, foot, aiPage, aiData, onSelectCategory, onSelectKeyword }) => {
  const facts = useMemo<AiInsightFacts | null>(
    () =>
      aiPage && items.length
        ? { page: aiPage, basis, today: todayKey(), insights: items.map((it) => ({ type: it.tone, head: it.head, target: it.target, text: it.text })), ...(aiData && { data: aiData }) }
        : null,
    [aiPage, aiData, basis, items]
  );
  const factsKey = facts ? JSON.stringify(facts) : '';
  const [ai, setAi] = useState<AiState>({ key: '' });
  const [open, setOpen] = useState(false);

  const run = (f: AiInsightFacts, key: string) => {
    setAi({ key, loading: true });
    requestAiInsight(f)
      .then((result) => setAi((prev) => (prev.key === key ? { key, result } : prev)))
      .catch((e: Error) => setAi((prev) => (prev.key === key ? { key, error: e.message } : prev)));
  };

  // 자료가 바뀌면(화면·기간·필터) 같은 날 받아 둔 답을 쓰고, 없으면 바로 묻는다
  useEffect(() => {
    if (!facts) return;
    const cached = cachedAiInsight(facts);
    if (cached) setAi({ key: factsKey, result: cached });
    else run(facts, factsKey);
    // facts 는 factsKey 로 대표된다
  }, [factsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!items.length) return null;

  const view: AiState = ai.key === factsKey ? ai : { key: factsKey, loading: !!facts };
  const ruleSummary = items.find((it) => it.tone === 'summary');
  // Claude 답이 있으면 추천이 규칙 문장을 이미 반영하므로 규칙 목록은 보여 주지 않는다.
  // 없으면(받는 중·실패·aiPage 없음) 규칙 요약(없으면 첫 줄)을 핵심 요약 자리에 쓰고 나머지를 자세히 보기에 둔다
  const ruleKey = ruleSummary ?? items[0];
  const details = view.result ? [] : items.filter((it) => it !== ruleKey);
  const detailCount = (view.result?.actions.length ?? 0) + details.length;
  const targetOf = (it: Insight) => {
    if (!it.target) return undefined;
    const onSelect = it.category
      ? onSelectCategory && (() => onSelectCategory(it.category!))
      : onSelectKeyword && (() => onSelectKeyword(it.target!));
    return onSelect ? (
      <button type="button" className="ins-target" onClick={onSelect}>
        {it.target}
      </button>
    ) : (
      <span className="ins-target">{it.target}</span>
    );
  };

  return (
    <Card
      name="insight"
      id={`${name}-insight`}
      // Claude 답을 받았을 때만 'AI 요약' — 받는 중·실패·aiPage 없음은 규칙 문장이므로 '자동 인사이트'
      title={
        view.result ? (
          <>
            <Sparkles size="1rem" aria-hidden="true" className="ins-title-ic" />
            AI 요약
          </>
        ) : (
          <>
            <Lightbulb size="1rem" aria-hidden="true" className="ins-title-ic" />
            자동 인사이트
          </>
        )
      }
      subtitle={`(${basis}${view.result ? ' · Claude 분석' : ' · 수집 데이터 규칙 분석'})`}
      // 답을 받으면 다시 묻지 않는다 (같은 날 같은 자료는 같은 답). 실패했을 때만 다시 시도할 수 있게 둔다
      tools={
        facts &&
        view.error && (
          <Button size="xs" icon={RotateCw} onClick={() => run(facts, factsKey)} className="ins-ai-btn">
            다시 시도
          </Button>
        )
      }
    >
      {/* 핵심 요약 — 항상 보인다 */}
      <div className="ins-key" aria-live="polite">
        {view.result ? (
          <p className="ins-key-text">
            <Sparkles size="0.875rem" aria-hidden="true" className="ins-key-ic" />
            {view.result.summary}
          </p>
        ) : (
          <p className="ins-key-text">
            <ClipboardList size="0.875rem" aria-hidden="true" className="ins-key-ic" />
            {ruleKey.tone !== 'summary' && <strong className="ins-head">{ruleKey.head}</strong>}
            {ruleKey.tone !== 'summary' && targetOf(ruleKey)}
            {ruleKey.text}
          </p>
        )}
        {view.loading && (
          <div className="ins-ai-skel" aria-label="Claude 요약을 받는 중">
            <SkelBar w="88%" />
            <SkelBar w="64%" />
          </div>
        )}
      </div>

      {detailCount > 0 && (
        <div className="ins-more">
          <MoreButton
            label={open ? '접기' : `자세히 보기 (${view.result ? '추천' : '인사이트'} ${detailCount}건)`}
            open={open}
            onClick={() => setOpen((v) => !v)}
            dataBtn={`${name}-insight-more`}
          />
        </div>
      )}

      {open && (
        <div className="ins-detail">
          {view.error && <Notice tone="warn">{AI_ERROR_TEXT[view.error] || `AI 분석에 실패했습니다. (${view.error})`}</Notice>}
          {view.result && (
            <div className="ins-ai">
              <p className="ins-ai-head">
                <Sparkles size="0.875rem" aria-hidden="true" />
                Claude 추천
                <Muted small>아래 숫자만으로 해석한 내용입니다</Muted>
              </p>
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
            </div>
          )}
          {details.length > 0 && (
            <ul className="ins-list">
              {details.map((it, i) => (
                <InsightLine key={i} tone={it.tone} head={it.head} target={targetOf(it)} text={it.text} />
              ))}
            </ul>
          )}
          {foot && !view.result && (
            <Muted as="p" className="ins-foot">
              {foot}
            </Muted>
          )}
        </div>
      )}
    </Card>
  );
};
