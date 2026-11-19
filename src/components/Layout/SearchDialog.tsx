import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clock, Search, Star, X } from 'lucide-react';
import type { CategoryMap, DashboardData } from '../../types/dashboard';
import { fmt, mLabel } from '../../utils/format';
import { mediaKo } from '../../utils/constants';
import { adDisplayTitle } from '../../utils/creativeImage';
import { formatCategoryScope, formatScope, parseScope, searchDashboard, type SearchTab } from '../../utils/search';
import { clearRecentSearches, loadRecentSearches, removeRecentSearch, sameSearch } from '../../utils/recentSearches';
import { buildCategoryFilter } from '../common/CategoryFilter';
import { Dropdown, type DropdownOption } from '../common/Dropdown';
import { SegmentedControl } from '../common/SegmentedControl';
import { TextInput } from '../common/TextInput';

interface SearchDialogProps {
  data: DashboardData;
  categoryMap: CategoryMap;
  initialQuery: string;
  isLoggedIn: boolean;
  /** 새 검색의 기준 달(YYYY-MM) — 결과 페이지와 같은 기간으로 미리 보여 준다 */
  month: string;
  favorites: string[];
  onToggleFavorite: (query: string) => void;
  onClose: () => void;
  onSubmit: (query: string, tab?: SearchTab) => void;
}

const PREVIEW_LIMIT = 3;

/** 이름별로 광고비를 모아 큰 순서로 — 단계 선택 목록용 */
function rankedNames(rows: { name: string; media: string; cost: number }[]): { name: string; media: string }[] {
  const map = new Map<string, { name: string; medias: Set<string>; cost: number }>();
  rows.forEach((r) => {
    const name = r.name.trim();
    if (!name) return;
    const cur = map.get(name) || { name, medias: new Set<string>(), cost: 0 };
    cur.cost += r.cost;
    cur.medias.add(mediaKo(r.media));
    map.set(name, cur);
  });
  return [...map.values()]
    .sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name, 'ko'))
    .map((v) => ({ name: v.name, media: [...v.medias].join('·') }));
}

/** 헤더 검색 — 입력하는 동안 묶음별 상위 결과와 합계를 보여 주고, Enter 로 요약 페이지에 간다. 바탕을 누르거나 Esc 로 닫는다 */
export const SearchDialog: React.FC<SearchDialogProps> = ({
  data,
  categoryMap,
  initialQuery,
  isLoggedIn,
  month,
  favorites,
  onToggleFavorite,
  onClose,
  onSubmit,
}) => {
  const PERIOD_LABEL = mLabel(month);
  const [query, setQuery] = useState(initialQuery);
  const [recents, setRecents] = useState(() => loadRecentSearches(isLoggedIn));
  // 단계 선택(1차 캠페인 › 2차 광고그룹) — 표준 카테고리 필터(1차·2차)와 같은 방식. 지금 검색어가 단계 검색이면 그 값으로 시작한다
  const initialScope = parseScope(initialQuery);
  // 찾는 기준: 캠페인·광고그룹 이름, 또는 표준 카테고리(분류표) 1차·2차
  const [scopeKind, setScopeKind] = useState<'campaign' | 'category'>(initialScope?.cat1 ? 'category' : 'campaign');
  const [cat1, setCat1] = useState(initialScope?.cat1 || '');
  const [cat2, setCat2] = useState(initialScope?.cat2 || '');
  const [campaign, setCampaign] = useState(initialScope?.campaign || '');
  const [adgroup, setAdgroup] = useState(initialScope?.adgroup || '');
  const [keyword, setKeyword] = useState(initialScope?.keyword || '');
  const campaignOptions = useMemo(() => {
    const groupsOf = new Map<string, Set<string>>();
    data.spend.forEach((r) => {
      const c = r.campaign.trim();
      if (c) groupsOf.set(c, (groupsOf.get(c) || new Set()).add(r.adgroup.trim()));
    });
    return rankedNames(data.spend.map((r) => ({ name: r.campaign, media: r.media, cost: r.cost }))).map((o) => ({
      ...o,
      count: groupsOf.get(o.name)?.size ?? 0,
    }));
  }, [data.spend]);
  const adgroupOptions = useMemo(
    () =>
      campaign
        ? rankedNames(
            data.spend
              .filter((r) => r.campaign.trim() === campaign)
              .map((r) => ({ name: r.adgroup, media: r.media, cost: r.cost }))
          )
        : [],
    [data.spend, campaign]
  );
  // 표준 카테고리 목록은 분류표(CATEGORY_HIERARCHY) 기준 — 데이터에 아직 없는 분류도 고를 수 있다
  const categoryFilter = buildCategoryFilter([], {
    cat1,
    cat2,
    setCat1: (v: string) => {
      setCat1(v);
      setCat2('');
    },
    setCat2,
  });
  const keywordOptions = useMemo(
    () =>
      campaign && adgroup
        ? rankedNames(
            data.keywords
              .filter((k) => k.campaign.trim() === campaign && k.adgroup.trim() === adgroup)
              .map((k) => ({ name: k.keyword, media: k.media, cost: k.cost }))
          )
        : [],
    [data.keywords, campaign, adgroup]
  );
  const toOptions = (all: string, list: { name: string; count?: number }[]): DropdownOption<string>[] => [
    { value: '', label: all },
    ...list.map((o) => ({ value: o.name, label: o.name, hint: o.count ? `· ${o.count}` : undefined, title: o.name })),
  ];
  // 데이터가 많아도 입력이 끊기지 않게 계산은 늦춘다
  const deferred = useDeferredValue(query.trim());
  const result = useMemo(
    () => (deferred ? searchDashboard(data, categoryMap, deferred, [month]) : null),
    [data, categoryMap, deferred, month]
  );

  useEffect(() => {
    // 드롭다운 목록을 Esc 로 닫을 때(이미 처리됨)는 검색창까지 닫지 않는다
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = query.trim();
  // 즐겨찾기에 있는 검색어는 최근 검색어에 다시 보여 주지 않는다
  const shownRecents = recents.filter((r) => !favorites.some((f) => sameSearch(f, r)));

  const starButton = (r: string, on: boolean) => (
    <button
      type="button"
      className={`sd-star btn-search-star${on ? ' on' : ''}`}
      data-btn="search-star"
      aria-pressed={on}
      aria-label={on ? `즐겨찾기에서 ${r} 빼기` : `즐겨찾기에 ${r} 추가`}
      title={on ? '즐겨찾기 해제' : '즐겨찾기'}
      onClick={() => onToggleFavorite(r)}
    >
      <Star size="0.875rem" aria-hidden="true" />
    </button>
  );
  const hasHistory = favorites.length > 0 || shownRecents.length > 0;
  const empty =
    !!result && !result.groups.length && !result.keywords.length && !result.ads.length && !result.quotes.length;

  const section = (
    tab: SearchTab,
    title: string,
    total: number,
    rows: { key: string; name: string; meta: string }[]
  ) =>
    total > 0 && (
      <section className="sd-group" key={tab}>
        <h3>
          {title} <span>{fmt(total)}</span>
        </h3>
        {rows.slice(0, PREVIEW_LIMIT).map((r) => (
          <button type="button" key={r.key} className="sd-row btn-search-row" data-btn="search-row" onClick={() => onSubmit(q, tab)}>
            <span className="sd-name">{r.name}</span>
            <span className="sd-meta">{r.meta}</span>
          </button>
        ))}
      </section>
    );

  return (
    <div className="login-backdrop search-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`card search-dialog${hasHistory ? ' has-history' : ''}`} role="dialog" aria-modal="true" aria-label="검색">
        <form
          className="sd-form"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (q) onSubmit(q);
          }}
        >
          <Search size="1.125rem" aria-hidden="true" />
          <TextInput
            className="sd-input"
            type="search"
            placeholder="제품, 카테고리, 매체, 키워드 검색"
            aria-label="검색어"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button type="button" className="sd-close btn-search-close" data-btn="search-close" aria-label="닫기" onClick={onClose}>
            <X size="1rem" aria-hidden="true" />
          </button>
        </form>

        {/* 글자 검색 대신 목록에서 골라 찾는다. 기준은 캠페인 › 광고그룹 › 키워드(3단계) 또는 표준 카테고리 1차 › 2차(분류표). 표준 카테고리 필터와 같은 Dropdown·같은 모양. */}
        <div className="sd-scope" role="group" aria-label="단계 선택 검색">
          <SegmentedControl
            mini
            value={scopeKind}
            onChange={setScopeKind}
            options={[
              { value: 'campaign', label: '캠페인' },
              { value: 'category', label: '표준 카테고리' },
            ]}
          />
          {scopeKind === 'campaign' ? (
            <>
              <Dropdown
                className="sd-dd"
                ariaLabel="1차 캠페인 필터"
                value={campaign}
                options={toOptions('캠페인 전체', campaignOptions)}
                onChange={(v) => {
                  setCampaign(v);
                  setAdgroup('');
                  setKeyword('');
                }}
              />
              <span aria-hidden="true">›</span>
              <Dropdown
                className="sd-dd"
                ariaLabel="2차 광고그룹 필터"
                value={adgroup}
                disabled={!campaign}
                options={toOptions('광고그룹 전체', adgroupOptions)}
                onChange={(v) => {
                  setAdgroup(v);
                  setKeyword('');
                }}
              />
              <span aria-hidden="true">›</span>
              <Dropdown
                className="sd-dd"
                ariaLabel="3차 키워드 필터"
                value={keyword}
                disabled={!adgroup}
                options={toOptions('키워드 전체', keywordOptions)}
                onChange={setKeyword}
              />
            </>
          ) : (
            <>
              <Dropdown
                className="sd-dd"
                ariaLabel="1차 표준 카테고리 필터"
                value={categoryFilter.cat1}
                options={categoryFilter.cat1Options}
                onChange={categoryFilter.setCat1}
              />
              <span aria-hidden="true">›</span>
              <Dropdown
                className="sd-dd"
                ariaLabel="2차 표준 카테고리 필터"
                value={categoryFilter.cat2}
                disabled={!categoryFilter.hasCat2}
                options={categoryFilter.cat2Options}
                onChange={categoryFilter.setCat2}
              />
            </>
          )}
          <button
            type="button"
            className="sd-scope-go btn-search-scope"
            data-btn="search-scope"
            disabled={scopeKind === 'campaign' ? !campaign : !categoryFilter.cat1}
            onClick={() =>
              onSubmit(
                scopeKind === 'campaign'
                  ? formatScope([campaign, adgroup, keyword])
                  : formatCategoryScope(categoryFilter.cat1, categoryFilter.cat2)
              )
            }
          >
            검색
          </button>
        </div>

        <div className="sd-body">
          <div className="sd-main">
            {!q ? (
              <p className="sd-hint">
                관련된 광고와 견적을 {PERIOD_LABEL} 기준으로 찾습니다(결과 화면에서 전체 기간으로 넓힐 수 있습니다). 예: HPE, 워크스테이션, 네이버, cadkorea
                {isLoggedIn ? ', 고객사 이름' : ''}
              </p>
            ) : !result ? null : empty ? (
              <p className="sd-hint">{PERIOD_LABEL}에 &quot;{q}&quot;와 일치하는 결과가 없습니다. Enter를 누르면 결과 화면에서 전체 기간으로 넓힐 수 있습니다.</p>
            ) : (
              <>
                <p className="sd-summary">
                  {PERIOD_LABEL} · 광고비 <b>{fmt(result.cost)}원</b> · 견적 <b>{fmt(result.quotes.length)}건</b>
                </p>
                <div className="sd-results">
                  {section(
                    'groups',
                    '캠페인·광고그룹',
                    result.groups.length,
                    result.groups.slice(0, PREVIEW_LIMIT).map((g) => ({
                      key: `${g.media}|${g.type}|${g.campaign}|${g.adgroup}`,
                      name: `${g.campaign} › ${g.adgroup}`,
                      meta: `${fmt(g.cost)}원`,
                    }))
                  )}
                  {section(
                    'keywords',
                    '키워드',
                    result.keywords.length,
                    result.keywords.slice(0, PREVIEW_LIMIT).map((k) => ({
                      key: `${k.media}|${k.campaign}|${k.adgroup}|${k.keyword}|${k.match || ''}`,
                      name: `${k.keyword} · ${k.campaign}`,
                      meta: `클릭 ${fmt(k.clk)}`,
                    }))
                  )}
                  {section(
                    'ads',
                    '소재',
                    result.ads.length,
                    result.ads.slice(0, PREVIEW_LIMIT).map(({ ad, stat }) => ({
                      key: `${ad.media}|${ad.adId}`,
                      name: adDisplayTitle(ad),
                      meta: stat ? `${fmt(stat.cost)}원` : '실적 없음',
                    }))
                  )}
                  {section(
                    'quotes',
                    '견적',
                    result.quotes.length,
                    isLoggedIn
                      ? result.quotes.slice(0, PREVIEW_LIMIT).map((r, i) => ({
                          key: `${r.id || i}`,
                          name: r.subject || r.category || '제목 없음',
                          meta: r.date.slice(0, 10),
                        }))
                      : [{ key: 'login', name: `${fmt(result.quotes.length)}건 · 제목은 로그인 후 표시`, meta: '' }]
                  )}
                </div>
              </>
            )}
          </div>

          {/* 즐겨찾기·최근 검색어는 입력 중에도 그대로 둔다 — 자리가 움직이지 않게 항상 같은 곳에 */}
          {hasHistory && (
              <aside className="sd-history" aria-label="즐겨찾기와 최근 검색어">
                {favorites.length > 0 && (
                  <section className="sd-group sd-recent" id="sd-favorites">
                    <h3>즐겨찾기</h3>
                    {favorites.map((r) => (
                      <div className="sd-recent-row" key={r}>
                        <button type="button" className="sd-row btn-search-favorite" data-btn="search-favorite" onClick={() => onSubmit(r)}>
                          <Search size="0.875rem" aria-hidden="true" />
                          <span className="sd-name">{r}</span>
                        </button>
                        <span className="sd-recent-acts">{starButton(r, true)}</span>
                      </div>
                    ))}
                  </section>
                )}
                {shownRecents.length > 0 && (
                <section className="sd-group sd-recent" id="sd-recents">
                  <h3>
                    최근 검색어
                    <button
                      type="button"
                      className="sd-recent-clear btn-search-recent-clear"
                      data-btn="search-recent-clear"
                      onClick={() => setRecents(clearRecentSearches(isLoggedIn))}
                    >
                      전체 삭제
                    </button>
                  </h3>
                  {shownRecents.map((r) => (
                    <div className="sd-recent-row" key={r}>
                      <button type="button" className="sd-row btn-search-recent" data-btn="search-recent" onClick={() => onSubmit(r)}>
                        <Clock size="0.875rem" aria-hidden="true" />
                        <span className="sd-name">{r}</span>
                      </button>
                      <span className="sd-recent-acts">
                        {starButton(r, false)}
                        <button
                          type="button"
                          className="sd-recent-del btn-search-recent-del"
                          data-btn="search-recent-del"
                          aria-label={`최근 검색어 ${r} 삭제`}
                          onClick={() => setRecents(removeRecentSearch(r, isLoggedIn))}
                        >
                          <X size="0.875rem" aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                  ))}
                </section>
                )}
              </aside>
          )}
        </div>

        {q && !empty && (
          <button type="button" className="sd-more btn-search-submit" data-btn="search-submit" onClick={() => onSubmit(q)}>
            <span>Enter로 전체 요약 보기</span>
            <ArrowRight size="0.875rem" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
};
