import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { ViewId } from '../../types/dashboard';
import { VIEW_TITLES } from '../../utils/constants';
import { navigateTo, parseRoute, routePath } from '../../utils/route';
import { fmt, pct } from '../../utils/format';
import { Muted } from '../common/Muted';

interface KpiCardProps {
  label: React.ReactNode;
  /** 큰 값 — 글자, 또는 보조 값을 흐리게 덧붙일 때는 요소 */
  value: React.ReactNode;
  cur?: number | null;
  prev?: number | null;
  cmpLabel?: string;
  sub?: React.ReactNode;
  /** 카드 하단 보조 줄 (cmpLabel·sub와 별개로 항상 표시) */
  detail?: React.ReactNode;
  /** 증감 표시 방식 — 'pct'(기본): 비율 변화 ▲12.3%, 'pp': 점유율처럼 이미 % 인 값의 차이(포인트) ▲4.5% — 사용자 요청으로 %p 대신 % 로 표기 */
  deltaUnit?: 'pct' | 'pp';
  /** 누르면 이동할 화면 — 카드 전체가 그 화면으로 가는 링크가 된다 (기간 선택은 화면 간에 공유된다) */
  to?: ViewId;
}

/** 링크 카드에 마우스를 올리면 보여 줄 "이동할 화면에서 볼 수 있는 내용" — 공용 툴팁(#tip) 설명 */
const VIEW_TIPS: Partial<Record<ViewId, string>> = {
  ads: '매체별, 광고 형태별 월 광고비 추이와 일평균 광고비, MDF 소진, 집행 상세 표를 볼 수 있습니다.',
  quotes: '월별 접수 견적을 카테고리, 담당자별로 나눠 보고 유입 매체와 접수처 비중을 볼 수 있습니다.',
  'cat-efficiency': '카테고리별 광고비, 클릭, 총 접수 견적, 견적전환율, CPA를 비교해 효율이 좋은 카테고리를 볼 수 있습니다.',
  keywords: '광고그룹별 키워드의 광고비, 클릭, 전환과 운영 중인 소재를 볼 수 있습니다.',
};

/** 이미 % 인 값(점유율 등)의 차이 — 28.3% → 17.6% 면 ▼ 10.7% (비율 변화가 아니라 두 값의 차) */
const ppDelta = (a: number, b: number) => {
  const d = Math.round((a - b) * 10) / 10;
  return { cls: d === 0 ? 'flat' : d > 0 ? 'up' : 'down', txt: `${d === 0 ? '–' : d > 0 ? '▲' : '▼'} ${Math.abs(d)}%` };
};

/** 큰 값 뒤에 작고 흐린 보조 값을 붙인다 — KpiCard 의 value 로 쓴다 */
export const KpiSubValue: React.FC<{
  /** 큰 값 */
  main: React.ReactNode;
  /** 뒤에 붙는 작고 흐린 값 */
  sub: React.ReactNode;
}> = ({ main, sub }) => (
  <>
    {main}
    <Muted small>{sub}</Muted>
  </>
);

/** 견적 카드 값 — "견적 48건/판매 3건" 꼴로, 판매 건수는 흐리게. 판매 값이 없으면 '–' */
export const QuoteSalesValue: React.FC<{
  /** 견적 건수 */
  quotes: number;
  /** 같은 기간 고도몰 판매 건수 (수집 범위 밖이면 null) */
  sales: number | null;
}> = ({ quotes, sales }) => <KpiSubValue main={`${fmt(quotes)}건`} sub={`/${sales === null ? '–' : `${fmt(sales)}건`}`} />;

/** 카드 하단 보조 줄의 항목 목록 — "이름 값 | 이름 값" */
export const KpiDetailItems: React.FC<{ items: [string, number | string][] }> = ({ items }) => (
  <>
    {items.map(([label, value], i) => (
      <React.Fragment key={label}>
        {i > 0 && <i>|</i>}
        <p>
          {label} <b>{typeof value === 'number' ? fmt(value) : value}</b>
        </p>
      </React.Fragment>
    ))}
  </>
);

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  cur,
  prev,
  cmpLabel,
  sub,
  detail,
  deltaUnit = 'pct',
  to,
}) => {
  const p = cur != null && prev != null ? (deltaUnit === 'pp' ? ppDelta(cur, prev) : pct(cur, prev)) : null;
  // 색은 지표의 좋고 나쁨이 아니라 방향만 따른다 (▲ 빨강 · ▼ 파랑) — 표의 증감 열과 같다. CPA·CPC 같은 비용 지표도 반전하지 않는다
  const displayCls = p ? p.cls : null;
  const cls = displayCls && displayCls !== 'flat' ? ` ${displayCls}` : '';

  const body = (
    <>
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      {cmpLabel ? (
        p && displayCls ? (
          <div className={`d ${displayCls}`}>
            {p.txt} <small>{cmpLabel}</small>
          </div>
        ) : (
          <div className="d flat">
            – <small>{cmpLabel} 값 없음</small>
          </div>
        )
      ) : sub ? (
        <div className="s">{sub}</div>
      ) : null}
      {detail && <div className="kpi-detail">{detail}</div>}
    </>
  );

  if (!to) return <div className={`kpi${cls}`}>{body}</div>;
  const href = routePath(parseRoute().site, to);
  return (
    <a
      className={`kpi kpi-link${cls}`}
      href={href}
      data-tip={`${VIEW_TITLES[to]}에서 자세히 보기|${VIEW_TIPS[to] ?? '눌러서 관련 화면으로 이동합니다.'}`}
      data-tip-desc=""
      onClick={(e) => {
        // 새 탭·창으로 여는 경우는 브라우저에 맡기고, 그냥 누르면 새로고침 없이 이동한다
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
        e.preventDefault();
        navigateTo(href);
        // 화면이 바뀐 뒤 새 화면의 맨 위부터 보이게 한다
        window.scrollTo({ top: 0 });
      }}
    >
      <ArrowUpRight className="kpi-link-ico" aria-hidden="true" />
      {body}
    </a>
  );
};

/** 데이터가 없을 때 KPI 자리에 두는 안내 카드 */
export const KpiPlaceholder: React.FC<{ label: React.ReactNode; value?: string; message: React.ReactNode }> = ({
  label,
  value = '–',
  message,
}) => (
  <div className="kpi">
    <div className="l">{label}</div>
    <div className="v">{value}</div>
    <div className="d flat">{message}</div>
  </div>
);

/** KPI 카드 묶음 컨테이너 — className="kpis" 를 단일 출처로 관리 */
export const KpiSection: React.FC<{ id?: string; children: React.ReactNode }> = ({ id, children }) => (
  <div className="kpis" id={id}>
    {children}
  </div>
);

export const DeltaSpan: React.FC<{ a?: number | null; b?: number | null }> = ({ a, b }) => {
  const p = pct(a, b);
  if (!p) return <>–</>;
  return <span className={`d ${p.cls}`}>{p.txt}</span>;
};
