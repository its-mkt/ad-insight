import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CampaignKeywordBucket, KeywordGroup, KeywordRow } from '../../types/dashboard';
import { ctrText as ctr, fmt, mLabel, THIS_M } from '../../utils/format';
import { MediaPill } from '../common/MediaPill';
import { TableFootnote } from '../common/TableFootnote';
import { MoreButton } from '../common/MoreButton';
import { ChevronDown } from 'lucide-react';
import { useSort } from '../../hooks/useSort';
import { SortableTh } from '../common/SortableTh';
import { Th } from '../common/Th';
import { TabButton } from '../common/TabButton';
import { Card } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { AdApiSource } from '../common/ExtLink';
import { NumTd, TotalRow } from '../common/TableRows';
import { Muted } from '../common/Muted';
import { GroupAccordionRow, GroupChildRow } from '../common/GroupAccordionRow';

interface KeywordAccordionTableProps {
  topGroups: KeywordGroup[];
  campaigns: CampaignKeywordBucket[];
  month?: string;
  /** 키워드 실적이 있는 가장 이른 달 (YYYY-MM) — 이보다 앞선 달이면 빈 표에 이유를 적는다 */
  firstMonth?: string;
  /** 기준 기간 표시 (없으면 '2026년 10월' 처럼 month 로 만든다) */
  periodLabel?: string;
  media: 'all' | 'Google' | 'Naver';
  type: 'SA' | 'DA';
  kwTabIdx: number;
  onChangeTab: (idx: number) => void;
  /** 표 제목 (기본: 키워드) */
  title?: string;
  /** 매체 로고와 키워드의 입찰가·품질지수까지 보여 준다 (검색 결과) */
  detailed?: boolean;
}

const mediaKo = (m: string) => (m === 'Naver' ? '네이버' : m === 'Google' ? '구글' : m);
// 평균 CPC = 광고비 ÷ 클릭 (클릭 0 이면 – , 정렬에서는 맨 뒤로 가도록 -1)
const cpc = (cost: number, clk: number) => (clk ? cost / clk : undefined);
const cpcSort = (cost: number, clk: number) => (clk ? cost / clk : -1);

type SortKey = 'name' | 'imp' | 'clk' | 'ctr' | 'conv' | 'cpc' | 'cost';

const NUMERIC_COLS: { key: Exclude<SortKey, 'name'>; label: string }[] = [
  { key: 'imp', label: '노출' },
  { key: 'clk', label: '클릭' },
  { key: 'ctr', label: 'CTR' },
  { key: 'conv', label: '광고전환' },
  { key: 'cpc', label: '평균 CPC' },
  { key: 'cost', label: '광고비' },
];

/**
 * 광고그룹 실적 중 키워드별로 잡히지 않은 몫 — 그룹 합계를 따로 받은 경우(검색 결과·키워드 화면)만 생긴다.
 * 네이버는 광고그룹 실적에 키워드 확장으로 노출된 검색어, 삭제된 키워드, 쇼핑검색(상품 단위 입찰) 실적까지 들어 있지만 키워드 실적은 등록된 키워드만 모은다.
 * 차이가 없으면(구글처럼 키워드 합과 같으면) null
 */
const restOf = (g: KeywordGroup) => {
  if (!g.totals) return null;
  const sum = (f: (k: KeywordRow) => number) => g.list.reduce((a, k) => a + f(k), 0);
  const rest = {
    imp: Math.round(g.totals.imp - sum((k) => k.imp)),
    clk: Math.round(g.totals.clk - sum((k) => k.clk)),
    conv: Math.round(g.totals.conv - sum((k) => k.conv)),
    cost: Math.round(g.cost - sum((k) => k.cost)),
  };
  // 반올림 차이(1원·1회 미만)는 없는 것으로 본다
  return rest.imp > 0 || rest.clk > 0 || rest.conv > 0 || rest.cost > 0 ? rest : null;
};
const REST_TITLE =
  '광고그룹 실적에서 키워드 실적 합을 뺀 값입니다. 키워드 확장으로 노출된 검색어, 삭제되거나 수집 전에 중지된 키워드, 쇼핑검색(상품 단위 입찰)처럼 키워드가 없는 광고의 실적은 광고그룹에만 집계됩니다.';

/** 그룹 합계 — 따로 받은 실적이 있으면 그 값, 없으면 키워드 합 */
const groupTotals = (g: KeywordGroup) =>
  g.totals || {
    imp: g.list.reduce((sum, k) => sum + k.imp, 0),
    clk: g.list.reduce((sum, k) => sum + k.clk, 0),
    conv: g.list.reduce((sum, k) => sum + k.conv, 0),
  };

const getGroupMetric = (g: KeywordGroup, key: SortKey) => {
  if (key === 'cost') return g.cost;
  const { imp, clk, conv } = groupTotals(g);
  if (key === 'imp') return imp;
  if (key === 'clk') return clk;
  if (key === 'ctr') return imp > 0 ? clk / imp : 0;
  if (key === 'conv') return conv;
  if (key === 'cpc') return cpcSort(g.cost, clk);
  return 0;
};

const getKwMetric = (k: KeywordRow, key: SortKey) => {
  if (key === 'cost') return k.cost;
  if (key === 'imp') return k.imp;
  if (key === 'clk') return k.clk;
  if (key === 'conv') return k.conv;
  if (key === 'ctr') return k.imp > 0 ? k.clk / k.imp : 0;
  if (key === 'cpc') return cpcSort(k.cost, k.clk);
  return 0;
};
/** 탭으로 바로 보이는 캠페인 수. 나머지는 '더보기' 목록에서 고른다 */
const VISIBLE_TABS = 10;

export const KeywordAccordionTable: React.FC<KeywordAccordionTableProps> = ({
  topGroups,
  campaigns,
  month = THIS_M,
  firstMonth,
  periodLabel: periodLabelProp,
  media,
  type,
  kwTabIdx,
  onChangeTab,
  title = '키워드',
  detailed = false,
}) => {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [expandedKwGroups, setExpandedKwGroups] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(10);
  const [moreOpen, setMoreOpen] = useState(false);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const { sortKey, sortOrder, toggleSort } = useSort<SortKey>('cost');

  // 더보기 목록: 바깥 클릭·Esc 로 닫는다
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!tabBarRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  const toggleGroup = (groupKey: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
        setExpandedKwGroups((prevKw) => {
          if (!prevKw.has(groupKey)) return prevKw;
          const nextKw = new Set(prevKw);
          nextKw.delete(groupKey);
          return nextKw;
        });
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const toggleExpandKwGroup = (groupKey: string) => {
    setExpandedKwGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  // 같은 캠페인 이름이 Google·Naver 양쪽에 있으면 한 탭으로 합치고, 탭 오른쪽에 매체 아이콘을 모두 붙인다
  const campLabel = (c: CampaignKeywordBucket) => c.campaign.trim();

  const safeKwIdx = kwTabIdx >= 0 && kwTabIdx <= campaigns.length ? kwTabIdx : 0;
  const selectedCamp = safeKwIdx > 0 ? campaigns[safeKwIdx - 1] : null;

  // 탭 또는 월 변경 시 더보기 리셋
  const prevKey = useRef(`${month}-${safeKwIdx}`);
  if (prevKey.current !== `${month}-${safeKwIdx}`) {
    prevKey.current = `${month}-${safeKwIdx}`;
    setVisibleCount(10);
  }

  const displayGroups = selectedCamp ? selectedCamp.groups : topGroups.slice(0, visibleCount);
  const sortedDisplayGroups = useMemo(() => {
    const list = [...displayGroups];
    const groupName = (g: KeywordGroup) => (selectedCamp ? g.adgroup : `${g.campaign} › ${g.adgroup}`);
    list.sort((a, b) => {
      if (sortKey === 'name') {
        const c = groupName(a).localeCompare(groupName(b));
        return sortOrder === 'desc' ? -c : c;
      }
      const valA = getGroupMetric(a, sortKey);
      const valB = getGroupMetric(b, sortKey);
      const diff = sortOrder === 'desc' ? valB - valA : valA - valB;
      if (diff !== 0) return diff;
      return b.cost - a.cost;
    });
    return list;
  }, [displayGroups, sortKey, sortOrder, selectedCamp]);
  // 합계: 화면에 펼쳐 둔 그룹만이 아니라 이 탭의 모든 광고그룹 (그룹 더보기로 보게 될 것까지 포함)
  const totalGroups = selectedCamp ? selectedCamp.groups : topGroups;
  const kwTotal = totalGroups.reduce(
    (t, g) => {
      const { imp, clk, conv } = groupTotals(g);
      return { imp: t.imp + imp, clk: t.clk + clk, conv: t.conv + conv, cost: t.cost + g.cost };
    },
    { imp: 0, clk: 0, conv: 0, cost: 0 }
  );
  const hiddenCamps = campaigns.slice(VISIBLE_TABS);
  const hiddenSelected = safeKwIdx > VISIBLE_TABS;
  const selectTab = (idx: number) => {
    setMoreOpen(false);
    onChangeTab(idx);
  };
  const campTitle = (c: CampaignKeywordBucket) =>
    `${c.medias.map(mediaKo).join('·')} · ${c.campaign} (${c.groups.length}개 그룹)`;
  const campIcons = (c: CampaignKeywordBucket) =>
    c.medias.map((m) => <MediaPill key={m} media={m} iconOnly size="0.625rem" />);
  const periodLabel = periodLabelProp || `${month.slice(0, 4)}년 ${mLabel(month)}`;

  return (
    <Card
      name="kw-list"
      id="kw-list"
      titleId="ttKw"
      title={title}
      subtitle={
        type === 'DA' ? undefined : !campaigns.length ? (
          <>{periodLabel} · 광고비 상위 캠페인</>
        ) : safeKwIdx === 0 ? (
          <>
            {periodLabel} · 광고비 상위{' '}
            {visibleCount < topGroups.length
              ? `${visibleCount} / ${topGroups.length}`
              : topGroups.length}개 그룹, 그룹당 상위 10개
          </>
        ) : (
          <>
            {periodLabel} · {selectedCamp?.campaign}
            <small className="kw-head-sub">({selectedCamp?.groups.length}개 광고그룹)</small>
          </>
        )
      }
    >

      {type === 'SA' && campaigns.length > 0 && (
        <div id="kwTabBar" className="kw-tabs" ref={tabBarRef}>
          {['전체', ...campaigns.slice(0, VISIBLE_TABS).map(campLabel)].map((lbl, i) => (
            <TabButton
              key={i}
              className="kw-tab-btn btn-camp-tab"
              data-btn="camp-tab"
              active={safeKwIdx === i}
              label={lbl}
              title={i === 0 ? '전체 (상위 10개 광고그룹)' : campTitle(campaigns[i - 1])}
              onClick={() => selectTab(i)}
            >
              {i > 0 && campIcons(campaigns[i - 1])}
            </TabButton>
          ))}

          {hiddenCamps.length > 0 && (
            <button
              type="button"
              className={`kw-more btn-kw-more${hiddenSelected ? ' on' : ''}`}
              id="btn-kw-more"
              data-btn="kw-more"
              aria-haspopup="listbox"
              aria-expanded={moreOpen}
              title={hiddenSelected && selectedCamp ? campTitle(selectedCamp) : '광고비 11위 이하 캠페인'}
              onClick={() => setMoreOpen((v) => !v)}
            >
              {hiddenSelected && selectedCamp ? (
                <>
                  <span>{campLabel(selectedCamp)}</span>
                  {campIcons(selectedCamp)}
                </>
              ) : (
                <span>+{hiddenCamps.length}개 더보기</span>
              )}
              <ChevronDown className={`kw-more-chev${moreOpen ? ' open' : ''}`} strokeWidth={2.25} aria-hidden="true" />
            </button>
          )}

          {moreOpen && (
            <div className="kw-more-menu" role="listbox" aria-label="광고비 11위 이하 캠페인">
              {hiddenCamps.map((c, j) => {
                const idx = VISIBLE_TABS + j + 1;
                return (
                  <button
                    key={c.campaign}
                    type="button"
                    role="option"
                    aria-selected={safeKwIdx === idx}
                    className={`kw-more-item btn-kw-more-item${safeKwIdx === idx ? ' on' : ''}`}
                    data-btn="kw-more-item"
                    title={campTitle(c)}
                    onClick={() => selectTab(idx)}
                  >
                    <span className="kw-more-rank">{idx}</span>
                    <span className="kw-more-name">{campLabel(c)}</span>
                    {campIcons(c)}
                    <span className="kw-more-cost">{fmt(c.cost)}원</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="tw">
        <table className="stk" id="tbKw">
          <colgroup>
            <col className="col-kw-name" />
            <col className="col-kw-imp" />
            <col className="col-kw-clk" />
            <col className="col-kw-ctr" />
            <col className="col-kw-conv" />
            <col className="col-kw-cpc" />
            <col className="col-kw-cost" />
          </colgroup>
          {type === 'DA' ? (
            <tbody>
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    message="디스플레이 광고(DA)는 키워드 입찰을 진행하지 않습니다."
                    subMessage="타겟팅 배너로 운영되어 키워드 목록이 없습니다."
                  />
                </td>
              </tr>
            </tbody>
          ) : !topGroups.length ? (
            <>
              <thead>
                <tr>
                  <Th>캠페인 › 광고그룹 › 키워드</Th>
                  <Th className="n">노출</Th>
                  <Th className="n">클릭</Th>
                  <Th className="n">CTR</Th>
                  <Th className="n">광고전환</Th>
                  <Th className="n">평균 CPC</Th>
                  <Th className="n">광고비</Th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      message={
                        media === 'Google'
                          ? '수집된 Google 검색광고 키워드가 없습니다.'
                          : firstMonth && month < firstMonth
                            ? '키워드 재구성 이전 기간이라 키워드별 실적이 없습니다.'
                            : '조회 조건에 해당하는 키워드가 없습니다.'
                      }
                      subMessage={media === 'Google' ? 'Google Ads 스크립트 실행 후 자동 수집됩니다.' : undefined}
                    />
                  </td>
                </tr>
              </tbody>
            </>
          ) : (
            <>
              <thead>
                <tr>
                  <SortableTh sortKey="name" activeKey={sortKey} order={sortOrder} onSort={toggleSort}>
                    {selectedCamp ? '광고그룹 › 키워드' : '캠페인 › 광고그룹 › 키워드'}
                  </SortableTh>
                  {NUMERIC_COLS.map(({ key, label }) => (
                    <SortableTh key={key} sortKey={key} activeKey={sortKey} order={sortOrder} onSort={toggleSort} className="n">
                      {label}
                    </SortableTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedDisplayGroups.map((g) => {
                  const groupKey = `${g.media}-${g.campaign}-${g.adgroup}`;
                  const isOpen = openGroups.has(groupKey);
                  const isKwExpanded = expandedKwGroups.has(groupKey);
                  const allSortedKws = [...g.list].sort((a, b) => {
                    if (sortKey === 'name') {
                      const c = a.keyword.localeCompare(b.keyword);
                      return sortOrder === 'desc' ? -c : c;
                    }
                    const valA = getKwMetric(a, sortKey);
                    const valB = getKwMetric(b, sortKey);
                    const diff = sortOrder === 'desc' ? valB - valA : valA - valB;
                    if (diff !== 0) return diff;
                    return b.cost - a.cost || b.clk - a.clk;
                  });
                  const sortedKws = isKwExpanded ? allSortedKws : allSortedKws.slice(0, 10);
                  const remainCount = allSortedKws.length - 10;
                  const { imp: grpImp, clk: grpClk, conv: grpConv } = groupTotals(g);
                  const rest = restOf(g);
                  const canOpen = g.list.length > 0 || !!rest;

                  return (
                    <React.Fragment key={groupKey}>
                      <GroupAccordionRow
                        title={selectedCamp ? g.adgroup : `${g.campaign} › ${g.adgroup}`}
                        icon={detailed && <MediaPill media={g.media} iconOnly size="0.875rem" />}
                        count={<>({g.list.length}개 키워드 · {mediaKo(g.media)})</>}
                        open={isOpen}
                        canOpen={canOpen}
                        onToggle={() => toggleGroup(groupKey)}
                        toggleLabel="키워드 목록"
                        tone={`grp-${g.media.toLowerCase()}`}
                      >
                        <NumTd value={grpImp} />
                        <NumTd value={grpClk} />
                        <NumTd>{ctr(grpClk, grpImp)}</NumTd>
                        <NumTd value={grpConv} />
                        <NumTd value={cpc(g.cost, grpClk)} unit="원" />
                        <NumTd value={g.cost} unit="원" bold />
                      </GroupAccordionRow>

                      {isOpen &&
                        sortedKws.map((k, ki) => (
                          <GroupChildRow
                            key={`${k.keyword}-${ki}`}
                            label={
                              <>
                                {k.keyword}
                                {detailed && (k.bid > 0 || k.quality > 0) && (
                                  <Muted small className="kw-detail">
                                    {[k.bid > 0 && `입찰가 ${fmt(k.bid)}원`, k.quality > 0 && `품질지수 ${k.quality}`].filter(Boolean).join(' · ')}
                                  </Muted>
                                )}
                              </>
                            }
                          >
                            <NumTd value={k.imp} />
                            <NumTd value={k.clk} />
                            <NumTd>{ctr(k.clk, k.imp)}</NumTd>
                            <NumTd value={k.conv} />
                            <NumTd value={cpc(k.cost, k.clk)} unit="원" />
                            <NumTd value={k.cost} unit="원" />
                          </GroupChildRow>
                        ))}

                      {isOpen && rest && (
                        <GroupChildRow
                          label={
                            <Muted title={REST_TITLE}>
                              그 밖의 실적 <small>(키워드별로 집계되지 않음)</small>
                            </Muted>
                          }
                        >
                          <NumTd value={rest.imp} />
                          <NumTd value={rest.clk} />
                          <NumTd>{ctr(rest.clk, rest.imp)}</NumTd>
                          <NumTd value={rest.conv} />
                          <NumTd value={rest.clk > 0 ? rest.cost / rest.clk : undefined} unit="원" />
                          <NumTd value={rest.cost} unit="원" />
                        </GroupChildRow>
                      )}

                      {isOpen && remainCount > 0 && (
                        <tr className="kw-more-row">
                          <td colSpan={7}>
                            <MoreButton
                              label={isKwExpanded ? '상위 10개만 보기' : `키워드 더보기 (+${remainCount}개)`}
                              open={isKwExpanded}
                              dataBtn="expand"
                              onClick={() => toggleExpandKwGroup(groupKey)}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                <TotalRow className="kw-total" label={<>합계<small className="grp-total-cnt">({fmt(totalGroups.length)}개 그룹)</small></>}>
                  <NumTd value={kwTotal.imp} />
                  <NumTd value={kwTotal.clk} />
                  <NumTd>{ctr(kwTotal.clk, kwTotal.imp)}</NumTd>
                  <NumTd value={kwTotal.conv} />
                  <NumTd value={cpc(kwTotal.cost, kwTotal.clk)} unit="원" />
                  <NumTd value={kwTotal.cost} unit="원" bold />
                </TotalRow>
              </tbody>
            </>
          )}
        </table>

        {safeKwIdx === 0 && visibleCount < topGroups.length && (
          <div className="kw-more-wrap">
            <MoreButton
              label={`그룹 더보기 (+${Math.min(topGroups.length - visibleCount, 10)}개 · 전체 ${topGroups.length}개)`}
              onClick={() => setVisibleCount((v) => Math.min(v + 10, topGroups.length))}
            />
          </div>
        )}

        <TableFootnote
          unit="원·회"
          basis={`산출 근거: ${periodLabel} 실적(당월은 수집 시점까지) · 광고비 상위 캠페인/그룹 · CTR = 클릭 ÷ 노출 · 평균 CPC = 광고비 ÷ 클릭`}
          sources={[
            <AdApiSource key="src" prefix="출처:" suffix="API" />,
          ]}
        />
      </div>
    </Card>
  );
};
