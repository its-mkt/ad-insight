import React, { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Images } from 'lucide-react';
import type { AdGroupCreatives, AdRow } from '../../types/dashboard';
import { adStatKey, displayAdTitle, getCreativeImages, hasUnavailableImage, MEDIA_COLOR_VARS, type AdStat } from '../../utils/creativeImage';
import { ctrText, fmt } from '../../utils/format';
import { useSort } from '../../hooks/useSort';
import { SortableTh } from '../common/SortableTh';
import { Card } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { AdApiSource, ExtLink } from '../common/ExtLink';
import { SkelTable } from '../common/SkeletonView';
import { TableFootnote } from '../common/TableFootnote';
import { Muted } from '../common/Muted';
import { NumTd, TotalRow } from '../common/TableRows';
import { AccordionChevron } from '../common/AccordionChevron';
import { LIST_LIMIT, MoreButton, ShowMoreButton } from '../common/MoreButton';
import { GoogleLogo, NaverLogo } from '../common/MediaPill';

interface AdCreativesListProps {
  groups: AdGroupCreatives[];
  /** `${media}\u0001${adId}` → 기준월 성과 */
  stats: Record<string, AdStat>;
  /** 실데이터를 받는 중 — 아직 없는 성과는 – 대신 스켈레톤으로 보여 준다 */
  loading: boolean;
  /** 기준 기간 표시 (예: 2026년 10월, 2026년 1~11월) */
  periodLabel: string;
  media: 'all' | 'Google' | 'Naver';
  type: 'SA' | 'DA';
}

// RSA_AD·TEXT_45·SHOPPING_PRODUCT_AD 처럼 제목 자리에 소재 종류 코드만 있으면 캠페인·그룹명으로 대신한다
const cleanTitle = (t: string) => (t && !/^[A-Z0-9_]+$/.test(t) ? displayAdTitle(t) : '');

const adTitle = (c: AdRow) => cleanTitle(c.title) || `${c.campaign} · ${c.adgroup}` || '파워링크 검색광고';

// CTR = 클릭 ÷ 노출 × 100, 평균 CPC = 광고비 ÷ 클릭 (분모 0 이면 –)
const METRICS: { key: string; label: string; value: (s: AdStat) => string }[] = [
  { key: 'imp', label: '노출', value: (s) => fmt(s.imp) },
  { key: 'clk', label: '클릭', value: (s) => fmt(s.clk) },
  {
    key: 'ctr',
    label: 'CTR',
    value: (s) => ctrText(s.clk, s.imp),
  },
  { key: 'conv', label: '광고전환', value: (s) => fmt(Math.round(s.conv * 10) / 10) },
  {
    key: 'cpc',
    label: '평균 CPC',
    value: (s) => (s.clk ? `${fmt(s.cost / s.clk)}원` : '–'),
  },
  { key: 'cost', label: '광고비', value: (s) => `${fmt(s.cost)}원` },
];

/** 수집된 실제 이미지만 보여 주고, 없거나 주소가 깨지면 텍스트 광고 표시로 바꾼다 */
const CreativeImage: React.FC<{ ad: AdRow; src: string; title: string }> = ({ ad, src, title }) => {
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const showImg = src && !broken;
  const canOpen = showImg && loaded;

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightbox]);

  return (
    // 이미지는 외부(소재 서버)에서 늦게 올 수 있어, 받기 전까지 스켈레톤 면을 보여 준다
    <>
      <div
        className={`cr-img${showImg && !loaded ? ' is-loading' : ''}${canOpen ? ' is-clickable' : ''}`}
        style={showImg ? undefined : { background: `var(${MEDIA_COLOR_VARS[ad.media] || '--c-it'})` }}
        aria-busy={showImg && !loaded ? true : undefined}
        onClick={canOpen ? () => setLightbox(true) : undefined}
      >
        {showImg ? (
          <img
            src={src}
            alt={title}
            loading="lazy"
            referrerPolicy="no-referrer"
            onLoad={() => setLoaded(true)}
            onError={() => setBroken(true)}
          />
        ) : (
          <>
            {title}
            <small>
              {broken
                ? '이미지를 불러오지 못함'
                : ad.type === 'SA'
                  ? '텍스트 광고 · 이미지 소재 없음'
                  : '이미지 소재 없음'}
            </small>
          </>
        )}
      </div>
      {lightbox && createPortal(
        <div className="cr-lightbox" onClick={() => setLightbox(false)}>
          <img
            src={src}
            alt={title}
            referrerPolicy="no-referrer"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}
    </>
  );
};

// 표 열 수: 광고그룹 + 이미지 + 성과 6
const COLS = 8;

const UNAVAILABLE_NOTE = 'Google 스톡 이미지는 미리보기를 제공하지 않아 여기에 표시되지 않습니다. 전체 이미지는 Google Ads에서 확인해 주세요.';

/** 펼친 상세의 한 묶음 — 왼쪽에 이름·개수, 오른쪽에 내용 */
const DetailGroup: React.FC<{
  label: string;
  count?: number;
  children: React.ReactNode;
}> = ({ label, count, children }) => (
  <section className="cr-group" aria-label={count == null ? label : `${label} ${count}개`}>
    <h4>
      {label} {count != null && <Muted>{count}</Muted>}
    </h4>
    {children}
  </section>
);

/** 제목·설명 목록 — 번호를 붙여 몇 번째 문구인지 보이게 한다. 짧은 제목은 칩으로 줄바꿈해 세로 길이를 줄인다 */
const TextList: React.FC<{ items: string[]; chips?: boolean }> = ({ items, chips }) => (
  <ol className={chips ? 'cr-chips' : 'cr-lines'}>
    {items.map((t, i) => (
      <li key={`${i}-${t}`}>
        <span className="cr-idx">{i + 1}</span>
        {displayAdTitle(t)}
      </li>
    ))}
  </ol>
);

/** 소재 종류 이름표와 마우스를 올렸을 때 보이는 설명 */
const AD_TYPES: Record<string, { label: string; tip: string }> = {
  RSA_AD: {
    label: '반응형',
    tip: '반응형 검색광고 · 등록한 제목·설명 중 일부를 매체가 검색마다 자동으로 조합해 노출',
  },
  RESPONSIVE_SEARCH_AD: {
    label: '반응형',
    tip: '반응형 검색광고 · 등록한 제목·설명 중 일부를 매체가 검색마다 자동으로 조합해 노출',
  },
  TEXT_45: {
    label: '텍스트',
    tip: '텍스트 광고 · 등록한 제목·설명 한 벌을 그대로 노출',
  },
  EXPANDED_TEXT_AD: {
    label: '텍스트',
    tip: '텍스트 광고 · 등록한 제목·설명 한 벌을 그대로 노출',
  },
  SHOPPING_PRODUCT_AD: {
    label: '쇼핑 상품',
    tip: '쇼핑검색 상품광고 · 스토어 상품 정보(이미지·가격)로 노출',
  },
  BRAND_SEARCH_AD: {
    label: '브랜드검색',
    tip: '브랜드검색 광고 · 브랜드 키워드 검색 결과 상단에 이미지·문구로 노출',
  },
  LOCAL_AD: {
    label: '플레이스',
    tip: '플레이스 광고 · 지도·플레이스 영역에 업체 정보로 노출',
  },
  RESPONSIVE_DISPLAY_AD: {
    label: '반응형 디스플레이',
    tip: '반응형 디스플레이 광고 · 등록한 이미지·제목·설명을 지면 크기에 맞춰 자동으로 조합해 노출',
  },
};

const adTexts = (ad: AdRow) => ({
  titles: (ad.titles?.length ? ad.titles : [ad.title]).map(cleanTitle).filter(Boolean),
  descs: ad.descs ?? [],
});

const sumStats = (list: (AdStat | undefined)[]): AdStat | undefined => {
  const hit = list.filter((s): s is AdStat => !!s);
  if (!hit.length) return undefined;
  return hit.reduce(
    (t, s) => ({
      cost: t.cost + s.cost,
      imp: t.imp + s.imp,
      clk: t.clk + s.clk,
      conv: t.conv + s.conv,
    }),
    {
      cost: 0,
      imp: 0,
      clk: 0,
      conv: 0,
    },
  );
};

/** 이미지 묶음 — 같은 높이로 원래 비율대로 늘어놓고, 누르면 원본을 새 탭에서 연다 */
const Gallery: React.FC<{ ad: AdRow; images: string[]; label?: string }> = ({ ad, images, label = '이미지' }) => {
  const title = adTitle(ad);
  return (
    <DetailGroup label={label} count={images.length}>
      <ul className="cr-gallery">
        {images.map((src, i) => (
          <li key={src}>
            <div>
              <CreativeImage ad={ad} src={src} title={`${title} (${i + 1}/${images.length})`} />
              <span className="cr-no">
                {i + 1} / {images.length}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </DetailGroup>
  );
};

/**
 * 소재 하나의 문구·링크·이미지. 하나뿐인 제목·설명·링크는 검색광고 미리보기처럼 이름표 없이 세 줄로,
 * 여러 개인 제목·설명(반응형)은 이름표를 단 목록으로 보여 준다.
 * 링크는 소재마다 다를 수 있어 표 줄이 아닌 여기에만 둔다.
 */
const AdBody: React.FC<{
  ad: AdRow;
  showImages: boolean;
}> = ({ ad, showImages }) => {
  const { titles, descs } = adTexts(ad);
  const images = getCreativeImages(ad);
  const oneTitle = titles.length === 1 ? titles[0] : '';
  const oneDesc = descs.length === 1 ? displayAdTitle(descs[0]) : '';
  const { url } = ad;
  return (
    <>
      {(oneTitle || oneDesc || url) && (
        <div className="cr-preview">
          {oneTitle && <h4 className="cr-preview-title">{oneTitle}</h4>}
          {oneDesc && <span>{oneDesc}</span>}
          {url && (
            <ExtLink className="cr-url" href={url}>
              {url}
            </ExtLink>
          )}
        </div>
      )}
      {titles.length > 1 && (
        <DetailGroup label="제목" count={titles.length}>
          <TextList items={titles} chips />
        </DetailGroup>
      )}
      {descs.length > 1 && (
        <DetailGroup label="설명" count={descs.length}>
          <TextList items={descs} />
        </DetailGroup>
      )}
      {showImages && images.length > 0 && <Gallery ad={ad} images={images} />}
    </>
  );
};

/** 펼친 소재 카드 머리의 성과 — 칸 너비를 고정해 소재끼리 위아래로 견줘 볼 수 있게 한다 */
const Metrics: React.FC<{ stat?: AdStat; loading: boolean }> = ({ stat, loading }) => {
  const pending = !stat && loading;
  // 실적이 없으면 빈 칸 다섯 개 대신 한 줄로
  if (!stat && !pending) return <p className="cr-metrics is-empty">선택 기간 실적 없음</p>;
  return (
    <dl className="cr-metrics" aria-busy={pending || undefined}>
      {METRICS.map((m) => (
        <div key={m.key} className={`cr-m cr-m-${m.key}`}>
          <dt>{m.label}</dt>
          <dd>{stat ? m.value(stat) : <span className="skel cr-skel" />}</dd>
        </div>
      ))}
    </dl>
  );
};

/** 표 한 줄의 성과 6칸 */
const MetricCells: React.FC<{ stat?: AdStat; loading: boolean }> = ({ stat, loading }) => {
  const pending = !stat && loading;
  return (
    <>
      {METRICS.map((m) => (
        <NumTd key={m.key} className={`cr-m-${m.key}${stat || pending ? '' : ' is-empty'}`} aria-busy={pending || undefined}>
          {stat ? m.value(stat) : pending ? <span className="skel cr-skel" /> : '–'}
        </NumTd>
      ))}
    </>
  );
};

// 제목·설명·링크는 펼친 상세에서만 보이므로 하나라도 있으면 펼칠 수 있어야 한다
const singleHasDetail = (ad: AdRow) => {
  const { titles, descs } = adTexts(ad);
  return !!ad.url || titles.length > 0 || descs.length > 0 || getCreativeImages(ad).length > 0;
};

type SortKey = 'name' | 'img' | 'imp' | 'clk' | 'ctr' | 'conv' | 'cpc' | 'cost';

interface GroupRow {
  group: AdGroupCreatives;
  /** 그룹 안 소재 성과 합계 */
  stat?: AdStat;
  /** 그룹 안 소재들의 이미지 수 (같은 이미지는 한 번만) */
  imageCount: number;
  /** 미리보기를 받을 수 없는 스톡 이미지가 포함되어 있다 */
  hasUnavailable: boolean;
}

// 실적이 없는 줄은 내림차순에서 맨 뒤로 가도록 -1
const SORT_VALUE: Record<Exclude<SortKey, 'name'>, (r: GroupRow) => number> = {
  img: (r) => r.imageCount,
  imp: (r) => (r.stat ? r.stat.imp : -1),
  clk: (r) => (r.stat ? r.stat.clk : -1),
  ctr: (r) => (r.stat?.imp ? r.stat.clk / r.stat.imp : -1),
  conv: (r) => (r.stat ? r.stat.conv : -1),
  cpc: (r) => (r.stat?.clk ? r.stat.cost / r.stat.clk : -1),
  cost: (r) => (r.stat ? r.stat.cost : -1),
};

const groupName = (g: AdGroupCreatives) => `${g.media} ${g.type} · ${g.campaign} › ${g.adgroup}`;

const MEDIA_LOGO: Record<string, React.FC<{ size?: string }>> = { Google: GoogleLogo, Naver: NaverLogo };

/** 매체 로고 (로고가 없는 매체는 이름표). 광고 유형(SA·DA)은 화면 필터로 이미 골라져 있어 따로 쓰지 않는다 */
const MediaMark: React.FC<{ media: string }> = ({ media }) => {
  const Logo = MEDIA_LOGO[media];
  if (!Logo) return <span className="cr-n">{media}</span>;
  return (
    <span className="cr-media" role="img" aria-label={media} data-tip={media}>
      <Logo size="0.875rem" />
    </span>
  );
};

/**
 * 광고그룹 한 줄(표의 tr) — 이름과 그룹 안 소재 성과 합계만 둔다.
 * 펼치면 소재마다 제목·설명·링크·이미지·성과를 따로 보여 준다 (소재마다 문구·랜딩이 다를 수 있다).
 */
const CreativeItem: React.FC<{
  row: GroupRow;
  stats: Record<string, AdStat>;
  loading: boolean;
}> = ({ row, stats, loading }) => {
  const { group, stat, imageCount, hasUnavailable } = row;
  const [open, setOpen] = useState(false);
  const [showAllAds, setShowAllAds] = useState(false);
  const detailId = useId();
  const { ads } = group;
  const top = ads[0];
  const statOf = (a: AdRow) => stats[adStatKey(a.media, a.adId)];
  const multi = ads.length > 1;
  const hasDetail = multi || hasUnavailable || singleHasDetail(top);
  // 확장소재 이미지는 광고그룹에 걸려 소재마다 같은 경우가 많다 — 모두 같으면 한 번만 보여 준다
  const imageSets = ads.map((a) => getCreativeImages(a).join(' '));
  const sharedImages = multi && imageSets[0] !== '' && imageSets.every((k) => k === imageSets[0]);
  const titleContent = (
    <>
      <AccordionChevron open={open} placeholder={!hasDetail} />
      <MediaMark media={group.media} />
      <b>
        {group.campaign} › {group.adgroup}
      </b>
      {multi && <span className="cr-n badge-sm">소재 {ads.length}</span>}
    </>
  );

  return (
    <>
      <tr
        className={`cr-row${open ? ' open' : ''}${hasDetail ? ' can-open' : ''}`}
        title={!hasDetail ? undefined : open ? '클릭하여 상세 접기' : '클릭하여 상세 펼치기'}
        onClick={hasDetail ? () => setOpen((v) => !v) : undefined}
      >
        <td>
          <div className="cr-meta">
            {/* 행 전체를 눌러 펼친다. 제목 버튼은 키보드 조작용 — 눌림은 행으로 올라가 한 번만 처리된다 */}
            {hasDetail ? (
              <button
                type="button"
                className="cr-title cr-title-btn"
                data-btn="cr-title"
                aria-expanded={open}
                aria-controls={detailId}
              >
                {titleContent}
              </button>
            ) : (
              <span className="cr-title">{titleContent}</span>
            )}
          </div>
        </td>
        <td className="c">
          {imageCount > 0 ? (
            <span className="cr-count" title={hasUnavailable ? `이미지 ${imageCount}장 · ${UNAVAILABLE_NOTE}` : `이미지 ${imageCount}장`}>
              <Images size="0.75rem" aria-hidden="true" />
              {imageCount}
            </span>
          ) : hasUnavailable ? (
            <Muted title={UNAVAILABLE_NOTE}>미제공</Muted>
          ) : (
            <Muted>–</Muted>
          )}
        </td>
        <MetricCells stat={stat} loading={loading} />
      </tr>
      {hasDetail && (
        <tr className="cr-detail-row" id={detailId} hidden={!open}>
          <td colSpan={COLS}>
            <div className="cr-detail">
              {hasUnavailable && (
                <DetailGroup label="미리보기 불가">
                  <Muted as="p">{UNAVAILABLE_NOTE}</Muted>
                </DetailGroup>
              )}
              {sharedImages && <Gallery ad={top} images={getCreativeImages(top)} label="공통 이미지" />}
              {multi ? (
                <>
                <ol className="cr-ads">
                  {(showAllAds ? ads : ads.slice(0, LIST_LIMIT)).map((a, i) => (
                    <li key={a.adId || i} className="cr-ad">
                      <div className="cr-ad-head">
                        <span className="cr-ad-name">
                          소재 {i + 1}
                          {AD_TYPES[a.adType] && (
                            <span
                              className="cr-n"
                              data-tip={AD_TYPES[a.adType].tip}
                              aria-label={AD_TYPES[a.adType].tip}
                            >
                              {AD_TYPES[a.adType].label}
                            </span>
                          )}
                        </span>
                        <Metrics stat={statOf(a)} loading={loading} />
                      </div>
                      <AdBody ad={a} showImages={!sharedImages} />
                    </li>
                  ))}
                </ol>
                <ShowMoreButton noun="소재" total={ads.length} expanded={showAllAds} onToggle={() => setShowAllAds((v) => !v)} />
                </>
              ) : (
                <AdBody ad={top} showImages />
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

/** 처음에 보이는 광고그룹 수, 더보기 한 번에 늘어나는 수 */
const PAGE = 10;

export const AdCreativesList: React.FC<AdCreativesListProps> = ({
  groups,
  stats,
  loading,
  periodLabel,
  media,
  type,
}) => {
  const { sortKey, sortOrder, toggleSort } = useSort<SortKey>('cost');
  const rows = useMemo(() => {
    const list: GroupRow[] = groups.map((group) => ({
      group,
      stat: sumStats(group.ads.map((a) => stats[adStatKey(a.media, a.adId)])),
      imageCount: new Set(group.ads.flatMap(getCreativeImages)).size,
      hasUnavailable: group.ads.some(hasUnavailableImage),
    }));
    const dir = sortOrder === 'desc' ? -1 : 1;
    return list.sort((a, b) =>
      sortKey === 'name'
        ? dir * groupName(a.group).localeCompare(groupName(b.group), 'ko')
        : dir * (SORT_VALUE[sortKey](a) - SORT_VALUE[sortKey](b)),
    );
  }, [groups, stats, sortKey, sortOrder]);

  // 정렬은 전체에 적용하고 앞에서부터 보여 준다. 조회 조건이 바뀌면 다시 처음 개수로
  const [visible, setVisible] = useState(PAGE);
  const groupsKey = groups.map((g) => g.key).join('|');
  useEffect(() => setVisible(PAGE), [groupsKey]);
  const shown = rows.slice(0, visible);
  const remain = rows.length - shown.length;
  // 합계: 보이는 줄만이 아니라 모든 광고그룹의 소재 성과 (더보기로 보게 될 것까지 포함)
  const totalStat = useMemo(() => sumStats(rows.map((r) => r.stat)), [rows]);

  return (
    <Card
      name="ad-creatives"
      id="ad-creatives"
      title="주요 · 확장 소재"
      subtitle={
        <>
          {periodLabel}
          {rows.length > 0 &&
            ` · 광고그룹 ${remain > 0 ? `${shown.length} / ${rows.length}` : rows.length}개 · 펼치면 소재별 제목·설명·이미지`}
        </>
      }
    >
      {groups.length > 0 ? (
        <>
          <div className="cr-scroll">
            <table className="cr-table" id="creatives">
              <colgroup>
                <col />
                <col className="col-cr-img" />
                {METRICS.map((m) => (
                  <col key={m.key} className={`col-cr-${m.key}`} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <SortableTh sortKey="name" activeKey={sortKey} order={sortOrder} onSort={toggleSort}>
                    광고그룹 · 대표 소재
                  </SortableTh>
                  <SortableTh sortKey="img" activeKey={sortKey} order={sortOrder} onSort={toggleSort} className="c">
                    이미지
                  </SortableTh>
                  {METRICS.map((m) => (
                    <SortableTh
                      key={m.key}
                      sortKey={m.key as SortKey}
                      activeKey={sortKey}
                      order={sortOrder}
                      onSort={toggleSort}
                      className="n"
                    >
                      {m.label}
                    </SortableTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <CreativeItem key={r.group.key} row={r} stats={stats} loading={loading} />
                ))}
                <TotalRow className="cr-total" label={<>합계<small className="grp-total-cnt">({fmt(rows.length)}개 광고그룹)</small></>}>
                  <td />
                  <MetricCells stat={totalStat} loading={loading} />
                </TotalRow>
              </tbody>
            </table>
          </div>
          {rows.length > PAGE && (
            <div className="kw-more-wrap">
              {remain > 0 ? (
                <MoreButton
                  label={`광고그룹 더보기 (+${Math.min(remain, PAGE)}개 · 전체 ${rows.length}개)`}
                  dataBtn="cr-more"
                  onClick={() => setVisible((v) => v + PAGE)}
                />
              ) : (
                <MoreButton label={`상위 ${PAGE}개만 보기`} open dataBtn="cr-more" onClick={() => setVisible(PAGE)} />
              )}
            </div>
          )}
          <TableFootnote
            unit="원·회"
            basis={`산출 근거: ${periodLabel} 실적(당월은 수집 시점까지) · 광고그룹별 소재 합계 · CTR = 클릭 ÷ 노출 · 평균 CPC = 광고비 ÷ 클릭`}
            sources={[
              <AdApiSource key="src" prefix="출처:" suffix="(하루 1회 갱신)" />,
            ]}
          />
        </>
      ) : loading ? (
        <SkelTable rows={5} />
      ) : (
        <EmptyState
          message={
            media === 'Google'
              ? '수집된 Google 광고 소재가 없습니다.'
              : type === 'DA'
                ? '수집된 디스플레이 광고(DA) 배너 소재가 없습니다.'
                : '조회 조건에 해당하는 소재가 없습니다.'
          }
          subMessage={
            media === 'Google'
              ? 'Google Ads 스크립트 실행 후 자동 수집됩니다.'
              : type === 'DA'
                ? 'GFA 무인 스케줄러 동기화 후 자동 표시됩니다.'
                : undefined
          }
        />
      )}
    </Card>
  );
};
