import React, { useMemo, useState } from 'react';
import { toggledSet } from '../../utils/toggleSet';
import type { SpendRow } from '../../types/dashboard';
import { ctrText, fmt } from '../../utils/format';
import { EXTERNAL_LINKS } from '../../utils/constants';
import { useSort } from '../../hooks/useSort';
import { Card } from '../common/Card';
import { SortableTh } from '../common/SortableTh';
import { NumTd, TotalRow, TreeChildRow, TreeParentRow } from '../common/TableRows';
import { MediaPill } from '../common/MediaPill';
import { EmptyState } from '../common/EmptyState';
import { TableFootnote } from '../common/TableFootnote';
import { AdApiSource, ExtLink } from '../common/ExtLink';
import { Th } from '../common/Th';
import { DeltaSpan } from '../charts/KpiCard';
import { TabButton } from '../common/TabButton';
import { SegmentedControl } from '../common/SegmentedControl';
import { GroupAccordionRow, GroupChildRow } from '../common/GroupAccordionRow';

/** 광고 구분 — 키워드 검색광고(SA, 쇼핑검색 제외) · 네이버 쇼핑검색(SA) · 디스플레이(DA) */
export type SaSegment = 'search' | 'shopping' | 'display';

/**
 * 네이버 쇼핑검색 광고인지 — 캠페인 유형(SHOPPING)으로 판단한다.
 * 유형이 없는 예전 자료(배포에 묶인 스냅숏 등)는 캠페인 이름의 "쇼핑검"으로 대신 본다
 */
export const isShoppingRow = (r: SpendRow): boolean =>
  r.media === 'Naver' && (r.campaignTp ? r.campaignTp === 'SHOPPING' : r.campaign.includes('쇼핑검'));

const inSegment = (r: SpendRow, segment: SaSegment) =>
  segment === 'display'
    ? r.type === 'DA'
    : r.type === 'SA' && (segment === 'shopping' ? isShoppingRow(r) : !isShoppingRow(r));

interface Stat {
  cost: number;
  imp: number;
  clk: number;
  conv: number;
}

interface CampaignStat extends Stat {
  name: string;
  /** 비교 기간 광고비 */
  prevCost: number;
  groups: (Stat & { name: string; prevCost: number })[];
}

type SortKey = 'name' | 'cost' | 'share' | 'imp' | 'clk' | 'ctr' | 'cpc' | 'conv' | 'cpa';

const MEDIA_KO = { Naver: '네이버', Google: '구글' } as const;
const SOURCE = {
  Naver: { label: '네이버 검색광고', href: EXTERNAL_LINKS.naverSearchAd },
  Google: { label: 'Google Ads', href: EXTERNAL_LINKS.googleAds },
} as const;

const COLS: { key: Exclude<SortKey, 'name'>; label: string }[] = [
  { key: 'imp', label: '노출' },
  { key: 'clk', label: '클릭' },
  { key: 'ctr', label: 'CTR' },
  { key: 'conv', label: '광고전환' },
  { key: 'cpc', label: '평균 CPC' },
  { key: 'cpa', label: '전환당 비용' },
  { key: 'cost', label: 'SA 광고비' },
  { key: 'share', label: '비중' },
];

const add = (a: Stat, r: Stat) => {
  a.cost += r.cost;
  a.imp += r.imp;
  a.clk += r.clk;
  a.conv += r.conv;
};
const zero = (): Stat => ({ cost: 0, imp: 0, clk: 0, conv: 0 });
const sumOf = (rows: SpendRow[]): Stat => {
  const t = zero();
  rows.forEach((r) => add(t, r));
  return t;
};

const ctrOf = (s: Stat) => (s.imp ? s.clk / s.imp : null);
const cpcOf = (s: Stat) => (s.clk ? s.cost / s.clk : null);
const cpaOf = (s: Stat) => (s.conv ? s.cost / s.conv : null);

/** 비율·단가는 분모가 0 이면 정렬에서 맨 뒤로 가도록 -1 */
const metric = (s: Stat, key: SortKey, total: number): number => {
  if (key === 'cost') return s.cost;
  if (key === 'share') return total ? s.cost / total : 0;
  if (key === 'imp') return s.imp;
  if (key === 'clk') return s.clk;
  if (key === 'conv') return s.conv;
  if (key === 'ctr') return ctrOf(s) ?? -1;
  if (key === 'cpc') return cpcOf(s) ?? -1;
  if (key === 'cpa') return cpaOf(s) ?? -1;
  return 0;
};

/** 한 줄의 숫자 칸 — COLS 순서 (노출 · 클릭 · CTR · 전환 · 평균 CPC · SA 광고비 · 비중 · 전환당 비용) */
const StatCells: React.FC<{ s: Stat; total: number; bold?: boolean }> = ({ s, total, bold }) => (
  <>
    <NumTd value={Math.round(s.imp)} />
    <NumTd value={Math.round(s.clk)} />
    <NumTd>{ctrText(s.clk, s.imp)}</NumTd>
    <NumTd value={Math.round(s.conv * 10) / 10} />
    <NumTd value={s.clk ? Math.round(s.cost / s.clk) : null} unit="원" />
    <NumTd value={s.conv ? Math.round(s.cost / s.conv) : null} unit="원" />
    <NumTd value={Math.round(s.cost)} unit="원" bold={bold} />
    <NumTd>{total ? `${((s.cost / total) * 100).toFixed(1)}%` : '–'}</NumTd>
  </>
);

/** 비교 기간 대비 증감 칸 — COLS 순서. 비중은 매체 간 몫이라 %p(포인트) 차이로 보인다 */
const DeltaCells: React.FC<{ s: Stat; p: Stat; total: number; prevTotal: number }> = ({ s, p, total, prevTotal }) => {
  const share = total ? (s.cost / total) * 100 : null;
  const prevShare = prevTotal ? (p.cost / prevTotal) * 100 : null;
  return (
    <>
      <NumTd className="sub-t"><DeltaSpan a={s.imp} b={p.imp} /></NumTd>
      <NumTd className="sub-t"><DeltaSpan a={s.clk} b={p.clk} /></NumTd>
      <NumTd className="sub-t"><DeltaSpan a={ctrOf(s)} b={ctrOf(p)} /></NumTd>
      <NumTd className="sub-t"><DeltaSpan a={s.conv} b={p.conv} /></NumTd>
      <NumTd className="sub-t"><DeltaSpan a={cpcOf(s)} b={cpcOf(p)} /></NumTd>
      <NumTd className="sub-t"><DeltaSpan a={cpaOf(s)} b={cpaOf(p)} /></NumTd>
      <NumTd className="sub-t"><DeltaSpan a={s.cost} b={p.cost} /></NumTd>
      <NumTd className="sub-t"><DeltaSpan a={share} b={prevShare} points /></NumTd>
    </>
  );
};

/** 표 열 너비 — 이름 칸 + COLS 순서 (+ 광고비 증감 칸) */
const StatCols: React.FC<{ withDelta?: boolean }> = ({ withDelta }) => (
  <colgroup>
    <col />
    <col className="col-ms-count" />
    <col className="col-ms-count" />
    <col className="col-ms-rate" />
    <col className="col-ms-count" />
    <col className="col-ms-unit" />
    <col className="col-ms-unit" />
    <col className="col-ms-amount" />
    <col className="col-ms-rate" />
    {withDelta && <col className="col-ms-rate" />}
  </colgroup>
);

interface CompareProps {
  /** 이미 기간으로 거른 광고비 행 */
  rows: SpendRow[];
  /** 비교 기간의 광고비 행 — 없으면(전체 기간) 증감 줄을 그리지 않는다 */
  prevRows?: SpendRow[] | null;
  /** 비교 기간 이름 (전월 · 전년 동기 · 직전 같은 일수 …) */
  cmpLabel?: string;
  /** 기준 기간 표시 ("2026년 11월" 등) */
  periodLabel: string;
}

/**
 * 네이버·구글 검색광고(SA) 실적을 한 표에서 나란히 비교한다.
 * 네이버 쇼핑검색은 키워드 검색광고와 노출·CTR 구조가 달라 비교·합계에서 빼고 맨 아래 따로 보인다
 */
export const MediaCompareTable: React.FC<CompareProps> = ({ rows, prevRows, cmpLabel = '전월', periodLabel }) => {
  const pick = (list: SpendRow[], media?: string) =>
    sumOf(list.filter((r) => inSegment(r, 'search') && (!media || r.media === media)));
  const shop = (list: SpendRow[]) => sumOf(list.filter((r) => inSegment(r, 'shopping')));
  const total = pick(rows);
  const prevTotal = prevRows ? pick(prevRows) : null;
  const lines = (['Naver', 'Google'] as const).map((m) => ({
    media: m,
    s: pick(rows, m),
    p: prevRows ? pick(prevRows, m) : null,
  }));
  const shopNow = shop(rows);
  const shopPrev = prevRows ? shop(prevRows) : null;
  const hasShop = shopNow.cost > 0 || shopNow.imp > 0 || !!(shopPrev && (shopPrev.cost > 0 || shopPrev.imp > 0));
  // 키워드 검색광고(네이버·구글 비교)와 네이버 쇼핑검색을 탭으로 나눠 본다
  const [tab, setTab] = useState<SaSegment>('search');
  const showShop = hasShop && tab === 'shopping';
  // 줄을 누르면 그 아래에 비교 기간 대비 증감 줄이 펼쳐진다 (처음에는 모두 접힘)
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const toggleRow = (key: string) =>
    setOpenRows((prev) => toggledSet(prev, key));
  /** 펼칠 수 있는 줄 + (펼쳤으면) 증감 줄 */
  const accRow = (
    key: string,
    head: { title: React.ReactNode; icon?: React.ReactNode; sub?: React.ReactNode; total?: boolean },
    s: Stat,
    p: Stat | null,
    t: number,
    pt: number
  ) => (
    <React.Fragment key={key}>
      <GroupAccordionRow
        title={head.title}
        icon={head.icon}
        count={head.sub}
        open={!!p && openRows.has(key)}
        canOpen={!!p}
        onToggle={() => toggleRow(key)}
        toggleLabel={`${cmpLabel} 대비`}
        plain={!head.total}
      >
        <StatCells s={s} total={t} bold={head.total} />
      </GroupAccordionRow>
      {p && openRows.has(key) && (
        <GroupChildRow label={<span className="sub-t">{cmpLabel} 대비</span>}>
          <DeltaCells s={s} p={p} total={t} prevTotal={pt} />
        </GroupChildRow>
      )}
    </React.Fragment>
  );

  return (
    <Card
      name="media-compare"
      id="media-compare"
      tableWrap
      title="매체별 검색광고(SA) 비교"
      subtitle={<>{periodLabel} · 디스플레이(DA) 제외</>}
    >
      {hasShop && (
        <div className="kw-tabs">
          <TabButton
            className="btn-media-compare-tab"
            data-btn="media-compare-search"
            active={!showShop}
            label="검색광고 (네이버·구글)"
            onClick={() => setTab('search')}
          />
          <TabButton
            className="btn-media-compare-tab"
            data-btn="media-compare-shopping"
            active={showShop}
            label="네이버 쇼핑검색"
            onClick={() => setTab('shopping')}
          >
            <MediaPill media="Naver" iconOnly size="0.75rem" />
          </TabButton>
        </div>
      )}
      <table className="stk media-stats-table">
        <StatCols />
        <thead>
          <tr>
            <Th>매체</Th>
            {COLS.map(({ key, label }) => (
              <Th key={key} className="n">
                {label}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {showShop ? (
            accRow('shopping', { title: '네이버 쇼핑검색', icon: <MediaPill media="Naver" iconOnly size="0.875rem" /> }, shopNow, shopPrev, 0, 0)
          ) : (
            <>
              {lines.map(({ media, s, p }) =>
                accRow(
                  media,
                  {
                    title: MEDIA_KO[media],
                    icon: <MediaPill media={media} iconOnly size="0.875rem" />,
                    sub: media === 'Naver' && hasShop ? '(쇼핑검색 제외)' : undefined,
                  },
                  s,
                  p,
                  total.cost,
                  prevTotal?.cost || 0
                )
              )}
              {accRow('total', { title: '합계', total: true }, total, prevTotal, total.cost, prevTotal?.cost || 0)}
            </>
          )}
        </tbody>
      </table>
      <TableFootnote
        unit="원·회"
        // CTR·CPC·전환당 비용 식은 머리글 설명(ⓘ)에 있어 각주에는 집계 기준만 둔다
        basis={`산출 근거: ${periodLabel} SA 실적(당월은 수집 시점까지) · 쇼핑검색은 별도 탭 · 줄을 누르면 ${cmpLabel} 대비(비중은 %p)`}
        sources={[<AdApiSource key="src" prefix="출처:" suffix="API" />]}
      />
    </Card>
  );
};

interface MediaStatsTableProps {
  /** 매체 코드 — 'Naver' | 'Google' */
  media: 'Naver' | 'Google';
  /** 구분 — search: 키워드 검색광고(SA, 쇼핑검색 제외, 기본), shopping: 네이버 쇼핑검색, display: 디스플레이(DA) */
  segment?: SaSegment;
  /** 이미 기간으로 거른 광고비 행 (이 매체·구분의 것만 골라 쓴다) */
  rows: SpendRow[];
  /** 비교 기간의 광고비 행 — 있으면 '광고비 증감' 칸을 붙인다 */
  prevRows?: SpendRow[] | null;
  /** 비교 기간 이름 (전월 · 전년 동기 …) */
  cmpLabel?: string;
  /** 기준 기간 표시 ("2026년 11월" 등) */
  periodLabel: string;
  /** 카드 id (기본: media-stats-{매체}) */
  cardId?: string;
  /** 표 위에 놓을 탭 (매체 전환 등) */
  tabs?: React.ReactNode;
  /** 카드 제목 줄 오른쪽 끝에 놓을 것 (SA·DA 전환 등) */
  tools?: React.ReactNode;
}

/** 매체 하나(또는 네이버 쇼핑검색)의 광고 성과 표 — 캠페인 줄을 누르면 광고그룹이 펼쳐진다 */
export const MediaStatsTable: React.FC<MediaStatsTableProps> = ({
  media,
  segment = 'search',
  rows,
  prevRows,
  cmpLabel = '전월',
  periodLabel,
  cardId,
  tabs,
  tools,
}) => {
  const { sortKey, sortOrder, toggleSort } = useSort<SortKey>('cost');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const withDelta = !!prevRows;
  const label =
    segment === 'shopping' ? '네이버 쇼핑검색' : segment === 'display' ? `${MEDIA_KO[media]} 디스플레이(DA)` : `${MEDIA_KO[media]} 검색광고(SA)`;
  // 광고비 열 머리글 — 구분에 맞춰 SA 광고비 / DA 광고비
  const cols = COLS.map((c) => (c.key === 'cost' && segment === 'display' ? { ...c, label: 'DA 광고비' } : c));

  const { camps, total, prevTotal } = useMemo(() => {
    const mine = (r: SpendRow) => r.media === media && inSegment(r, segment);
    const prevCost = new Map<string, number>();
    const prevT = zero();
    (prevRows || []).filter(mine).forEach((r) => {
      add(prevT, r);
      const ck = r.campaign.trim();
      const gk = `${ck}\u0001${r.adgroup.trim()}`;
      prevCost.set(ck, (prevCost.get(ck) || 0) + r.cost);
      prevCost.set(gk, (prevCost.get(gk) || 0) + r.cost);
    });
    const map = new Map<string, CampaignStat & { gmap: Map<string, Stat & { name: string; prevCost: number }> }>();
    const t = zero();
    rows.filter(mine).forEach((r) => {
      const ck = r.campaign.trim();
      let c = map.get(ck);
      if (!c) {
        c = { name: ck, prevCost: prevCost.get(ck) || 0, groups: [], gmap: new Map(), ...zero() };
        map.set(ck, c);
      }
      add(c, r);
      add(t, r);
      const gk = r.adgroup.trim();
      let g = c.gmap.get(gk);
      if (!g) {
        g = { name: gk, prevCost: prevCost.get(`${ck}\u0001${gk}`) || 0, ...zero() };
        c.gmap.set(gk, g);
      }
      add(g, r);
    });
    const list = [...map.values()]
      .map(({ gmap, ...c }) => ({ ...c, groups: [...gmap.values()] }))
      // 기간 안에 광고비·노출이 모두 0 인 캠페인은 빼서 표를 짧게 한다
      .filter((c) => c.cost > 0 || c.imp > 0);
    return { camps: list, total: t, prevTotal: prevT };
  }, [rows, prevRows, media, segment]);

  const sortList = <T extends Stat & { name: string }>(list: T[]): T[] =>
    [...list].sort((a, b) => {
      const diff =
        sortKey === 'name'
          ? a.name.localeCompare(b.name)
          : metric(a, sortKey, total.cost) - metric(b, sortKey, total.cost);
      return (sortOrder === 'desc' ? -diff : diff) || b.cost - a.cost;
    });

  const toggle = (key: string) =>
    setOpen((prev) => toggledSet(prev, key));

  const colCount = withDelta ? 10 : 9;
  const id = cardId || (segment === 'shopping' ? 'media-stats-naver-shopping' : `media-stats-${media.toLowerCase()}`);

  return (
    <Card
      name={id}
      id={id}
      tableWrap
      title={
        <>
          <MediaPill media={media} iconOnly size="0.875rem" /> {label} 성과
        </>
      }
      subtitle={<>{periodLabel} · 캠페인 {fmt(camps.length)}개</>}
      tools={tools}
    >
      {tabs}
      <table className={`stk media-stats-table${withDelta ? ' with-delta' : ''}`}>
        <StatCols withDelta={withDelta} />
        <thead>
          <tr>
            <SortableTh sortKey="name" activeKey={sortKey} order={sortOrder} onSort={toggleSort}>
              캠페인 › 광고그룹
            </SortableTh>
            {cols.map(({ key, label: l }) => (
              <SortableTh key={key} sortKey={key} activeKey={sortKey} order={sortOrder} onSort={toggleSort} className="n">
                {l}
              </SortableTh>
            ))}
            {withDelta && <Th className="n">광고비 증감</Th>}
          </tr>
        </thead>
        <tbody>
          {!camps.length ? (
            <tr>
              <td colSpan={colCount}>
                <EmptyState
                  message={`${periodLabel}에 수집된 ${label} 실적이 없습니다.`}
                  subMessage={
                    // 네이버 DA(GFA)는 API 가 없어 정기 보고서 메일로만 들어온다 — 지금은 집행하지 않지만 다시 할 수 있다
                    segment === 'display' && media === 'Naver'
                      ? '네이버 DA(GFA)는 GFA 정기 보고서 메일로 수집합니다. 집행 중인데 비어 있다면 보고서 발송 설정을 확인해 주세요.'
                      : undefined
                  }
                />
              </td>
            </tr>
          ) : (
            <>
              {sortList(camps).map((c) => {
                const isOpen = open.has(c.name);
                return (
                  <React.Fragment key={c.name}>
                    <TreeParentRow
                      label={c.name}
                      childCount={c.groups.length}
                      countUnit="개 그룹"
                      open={isOpen}
                      onToggle={() => toggle(c.name)}
                    >
                      <StatCells s={c} total={total.cost} />
                      {withDelta && <NumTd><DeltaSpan a={c.cost} b={c.prevCost} /></NumTd>}
                    </TreeParentRow>
                    {isOpen &&
                      sortList(c.groups).map((g) => (
                        <TreeChildRow key={g.name} label={g.name || '(이름 없음)'}>
                          <StatCells s={g} total={total.cost} />
                          {withDelta && <NumTd><DeltaSpan a={g.cost} b={g.prevCost} /></NumTd>}
                        </TreeChildRow>
                      ))}
                  </React.Fragment>
                );
              })}
              <TotalRow label={<>합계<small className="grp-total-cnt">({fmt(camps.length)}개 캠페인)</small></>}>
                <StatCells s={total} total={total.cost} bold />
                {withDelta && <NumTd><DeltaSpan a={total.cost} b={prevTotal.cost} /></NumTd>}
              </TotalRow>
            </>
          )}
        </tbody>
      </table>
      <TableFootnote
        unit="원·회"
        basis={`산출 근거: ${periodLabel} 실적(당월은 수집 시점까지${segment === 'search' && media === 'Naver' ? ', 쇼핑검색 제외' : ''}) · 비중 = 표 안 광고비 몫${withDelta ? ` · 증감 = ${cmpLabel} 대비` : ''}`}
        sources={[
          <span key="src">
            출처: <ExtLink href={SOURCE[media].href}>{SOURCE[media].label}</ExtLink> API
          </span>,
        ]}
      />
    </Card>
  );
};

type MediaStatsTabsProps = Omit<MediaStatsTableProps, 'media' | 'segment' | 'cardId' | 'tabs'>;

const STATS_TABS = {
  SA: [
    { id: 'naver', media: 'Naver', segment: 'search', label: '네이버' },
    { id: 'google', media: 'Google', segment: 'search', label: '구글' },
    { id: 'naver-shopping', media: 'Naver', segment: 'shopping', label: '네이버 쇼핑검색' },
  ],
  // 쇼핑검색은 SA 안의 구분이라 DA 에는 없다
  DA: [
    { id: 'naver', media: 'Naver', segment: 'display', label: '네이버' },
    { id: 'google', media: 'Google', segment: 'display', label: '구글' },
  ],
} as const;

type StatsTabId = (typeof STATS_TABS)['SA'][number]['id'];

/** 기간 안에 실적(광고비·노출·클릭)이 있는 "매체|구분" 목록 — 탭마다 행 전체를 다시 훑지 않게 한 번에 모은다 */
const statKeysOf = (rows: SpendRow[]): Set<string> => {
  const keys = new Set<string>();
  rows.forEach((r) => {
    if (!(r.cost > 0 || r.imp > 0 || r.clk > 0)) return;
    const segment: SaSegment | null = r.type === 'DA' ? 'display' : r.type === 'SA' ? (isShoppingRow(r) ? 'shopping' : 'search') : null;
    if (segment) keys.add(`${r.media}|${segment}`);
  });
  return keys;
};

/** 매체별 성과 표 — 오른쪽 위 SA·DA 전환 + 매체 탭(SA: 네이버·구글·쇼핑검색, DA: 네이버·구글) */
export const MediaStatsTabs: React.FC<MediaStatsTabsProps> = (props) => {
  const [adType, setAdType] = useState<'SA' | 'DA'>('SA');
  const [tabId, setTabId] = useState<StatsTabId>('naver');
  const statKeys = useMemo(() => statKeysOf(props.rows), [props.rows]);
  // 기간 안에 실적이 없는 탭은 막는다. DA 탭이 모두 비면 DA 전환 자체를 막는다
  const hasData = (t: { media: 'Naver' | 'Google'; segment: SaSegment }) => statKeys.has(`${t.media}|${t.segment}`);
  // 기간을 바꿔 DA 실적이 모두 없어지면 SA 로 본다
  const shownType = adType === 'DA' && !STATS_TABS.DA.some(hasData) ? 'SA' : adType;
  const list: readonly { id: StatsTabId; media: 'Naver' | 'Google'; segment: SaSegment; label: string }[] = STATS_TABS[shownType];
  const daEmpty = !STATS_TABS.DA.some(hasData);
  // 고른 탭이 없거나(DA 로 바꿨을 때 쇼핑검색) 실적이 없으면 실적이 있는 첫 탭으로
  const picked = list.find((t) => t.id === tabId);
  const tab = (picked && hasData(picked) ? picked : list.find(hasData)) || picked || list[0];
  return (
    <MediaStatsTable
      // 탭을 바꾸면 펼침·정렬 상태를 새로 시작한다
      key={`${shownType}-${tab.id}`}
      {...props}
      media={tab.media}
      segment={tab.segment}
      cardId="media-stats"
      tabs={
        <div className="kw-tabs">
          {list.map((t) => (
            <TabButton
              key={t.id}
              className="btn-media-stats-tab"
              data-btn={`media-stats-${t.id}`}
              active={tab.id === t.id}
              disabled={tab.id !== t.id && !hasData(t)}
              title={hasData(t) ? undefined : '이 기간에 실적이 없습니다'}
              label={t.label}
              onClick={() => setTabId(t.id)}
            >
              <MediaPill media={t.media} iconOnly size="0.75rem" />
            </TabButton>
          ))}
        </div>
      }
      tools={
        <SegmentedControl<'SA' | 'DA'>
          mini
          dataKey="media-stats-type"
          options={[
            { value: 'SA', label: 'SA', title: '검색광고' },
            { value: 'DA', label: 'DA', title: daEmpty ? '이 기간에 디스플레이 광고 실적이 없습니다' : '디스플레이 광고', disabled: daEmpty },
          ]}
          value={shownType}
          onChange={setAdType}
        />
      }
    />
  );
};
