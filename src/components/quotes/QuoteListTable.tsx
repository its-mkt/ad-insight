import React, { useEffect, useMemo, useState } from 'react';
import type { QuoteRawRow } from '../../types/dashboard';
import { fmt, parseCatParts, sourceColorVar } from '../../utils/format';
import { originOf } from '../../utils/quoteOrigin';
import { CATEGORY_HIERARCHY, QUOTE_SITES } from '../../utils/constants';
import { useAuth } from '../../context/AuthContext';
import { useSort } from '../../hooks/useSort';
import { Card } from '../common/Card';
import { Dropdown } from '../common/Dropdown';
import { FilterReset } from '../common/FilterReset';
import { EmptyState } from '../common/EmptyState';
import { Muted } from '../common/Muted';
import { Pagination } from '../common/Pagination';
import { SortableTh } from '../common/SortableTh';
import { TableFootnote } from '../common/TableFootnote';
import { SkelBar } from '../common/SkeletonView';

interface QuoteListTableProps {
  /** 선택한 기간의 접수 건 (실제 접수 날짜 그대로) */
  rows: QuoteRawRow[];
  /** 카드 제목 옆에 붙는 기간 글자 */
  periodLabel: string;
  /** 기간이 바뀌면 달라지는 값 — 바뀌면 첫 페이지로 돌아간다 */
  resetKey: string;
  /** 관리자 원본을 받는 중 — 비어 있는 상세 칸(SNO·제목·회사·작성자·연락처)을 '–' 대신 로딩으로 보여 준다 */
  detailsPending?: boolean;
}

type SortKey = 'date' | 'origin' | 'sno' | 'subject' | 'company' | 'name' | 'email' | 'category' | 'source' | 'rep';

const PAGE_SIZE = 20;
const ALL = '__all__';
const NO_REP = '미지정';
const NO_CAT2 = '2차 없음';
const ORIGINS = ['itket', 'zbyhp', 'cadkorea', '전화', '톡플러스', '메일'];
const catsOf = (r: QuoteRawRow) => parseCatParts(r.category || '기타');
const repOf = (r: QuoteRawRow): string => r.salesRep || NO_REP;
const sourceOf = (r: QuoteRawRow): string => r.source || '미수집';
/** 사이트 칸 — 어드민 원본 리스트와 같은 이름 (아이티켓·zbyhp·cadkorea), 전화문의 시트 건은 경로 */
const siteLabelOf = (r: QuoteRawRow): string => {
  const origin = originOf(r);
  return QUOTE_SITES.find((s) => s.id === origin)?.label ?? origin;
};
/** 이메일 칸 — 전화문의 시트 건은 이메일이 없어 전화번호를 보여 준다 */
const contactOf = (r: QuoteRawRow): string => r.email || r.phone || '';

const SORT_VALUE: Record<SortKey, (r: QuoteRawRow) => string> = {
  date: (r) => r.date,
  origin: siteLabelOf,
  sno: (r) => String(r.sno ?? ''),
  subject: (r) => r.subject || '',
  company: (r) => r.company || '',
  name: (r) => r.name || '',
  email: contactOf,
  category: (r) => r.category || '기타',
  source: sourceOf,
  rep: repOf,
};

/** 맨 앞에 '전체' 를 붙인 필터 목록 */
/** 기간을 바꿔 고른 값이 목록에서 빠져도 목록에 남긴다 — 빠지면 드롭다운 이름이 비어 무엇으로 걸렀는지 안 보인다 */
const keepSelected = (values: string[], selected: string): string[] =>
  selected === ALL || values.includes(selected) ? values : [...values, selected];

const optionsOf = (values: string[], allLabel: string, selected: string = ALL) => [
  { value: ALL, label: allLabel },
  ...[...new Set(keepSelected(values, selected))].map((v) => ({ value: v, label: v })),
];

/** 어드민 필터와 같은 순서 — 분류표 순서로, 분류표 밖 값은 뒤에 */
const inHierarchyOrder = (used: string[], known: string[]): string[] => [
  ...known.filter((c) => used.includes(c)),
  ...[...new Set(used)].filter((c) => !known.includes(c)),
];

/**
 * 견적 접수 목록 (읽기 전용) — 어드민 '견적 접수 원본 리스트'와 같은 열·순서·너비로 보여 준다.
 * 이 화면은 로그인 없이도 열리므로 제목·회사명·작성자·이메일은 로그인했을 때만 보여 준다
 * (이름·회사·이메일은 서버가 관리자에게만 내려 준다). 카테고리 지정은 어드민에서만 한다.
 */
export const QuoteListTable: React.FC<QuoteListTableProps> = ({ rows, periodLabel, resetKey, detailsPending = false }) => {
  const { isLoggedIn } = useAuth();
  const detail = (v: React.ReactNode, w: string) => v || (detailsPending ? <SkelBar w={w} /> : '–');
  const [origin, setOrigin] = useState(ALL);
  const [cat1, setCat1] = useState(ALL);
  const [cat2, setCat2] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const [rep, setRep] = useState(ALL);
  const [page, setPage] = useState(1);
  // 어드민 원본 리스트와 같이 접수날짜 오름차순으로 시작한다
  const { sortKey, sortOrder, toggleSort } = useSort<SortKey>('date', 'asc');

  useEffect(() => setPage(1), [resetKey, origin, cat1, cat2, source, rep, sortKey, sortOrder]);

  const resetFilters = () => {
    setOrigin(ALL);
    setCat1(ALL);
    setCat2(ALL);
    setSource(ALL);
    setRep(ALL);
  };

  const filtered = useMemo(() => {
    const value = SORT_VALUE[sortKey];
    return rows
      .filter(
        (r) =>
          (origin === ALL || originOf(r) === origin) &&
          (cat1 === ALL || catsOf(r).cat1 === cat1) &&
          (cat2 === ALL || (catsOf(r).cat2 || NO_CAT2) === cat2) &&
          (source === ALL || sourceOf(r) === source) &&
          (rep === ALL || repOf(r) === rep)
      )
      .sort((a, b) => {
        const diff = value(a).localeCompare(value(b), 'ko', { numeric: true }); // SNO 는 숫자 크기로 정렬
        return sortOrder === 'asc' ? diff : -diff;
      });
  }, [rows, origin, cat1, cat2, source, rep, sortKey, sortOrder]);

  // 어드민 필터와 같은 순서 — 카테고리는 분류표 순서, 담당자는 가나다순에 미지정을 맨 뒤로
  const cat1Values = inHierarchyOrder(rows.map((r) => catsOf(r).cat1), CATEGORY_HIERARCHY.map((n) => n.cat1));
  const cat2Parts = cat1 === ALL ? [] : rows.filter((r) => catsOf(r).cat1 === cat1).map((r) => catsOf(r).cat2);
  const cat2Values = [
    ...inHierarchyOrder(cat2Parts.filter(Boolean), CATEGORY_HIERARCHY.find((n) => n.cat1 === cat1)?.cat2 ?? []),
    ...(cat2Parts.some((c) => !c) && cat2Parts.some(Boolean) ? [NO_CAT2] : []),
  ];
  // 1차 목록 뒤에 붙는 2차 개수 — 이 기간에 실제로 고를 수 있는 2차만 센다 ('전체'·'2차 없음' 제외). 없으면 표시하지 않는다
  // 1차 옵션마다 행 전체를 다시 훑지 않게 1차별 2차 목록을 한 번에 모아 둔다
  const cat2ByCat1 = useMemo(() => {
    const out = new Map<string, Set<string>>();
    rows.forEach((r) => {
      const { cat1: c1, cat2: c2 } = catsOf(r);
      if (!c2) return;
      const set = out.get(c1);
      if (set) set.add(c2);
      else out.set(c1, new Set([c2]));
    });
    return out;
  }, [rows]);
  const cat2CountHint = (c1: string): string | undefined => {
    const count = cat2ByCat1.get(c1)?.size ?? 0;
    return count ? `· ${count}` : undefined;
  };
  const repNames = [...new Set(rows.map(repOf))].filter((v) => v !== NO_REP).sort((a, b) => a.localeCompare(b, 'ko'));
  const repValues = rows.some((r) => !r.salesRep) ? [...repNames, NO_REP] : repNames;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageRows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const th = (key: SortKey, label: string) => (
    <SortableTh sortKey={key} activeKey={sortKey} order={sortOrder} onSort={toggleSort}>
      {label}
    </SortableTh>
  );

  return (
    <Card name="quote-list" id="quote-list" title="견적 접수 목록" subtitle={`(${periodLabel} · ${fmt(filtered.length)}건)`}>
      <div className="ql-filters">
        <Dropdown
          fixedMenu
          ariaLabel="사이트 필터"
          value={origin}
          options={[
            { value: ALL, label: '사이트 전체' },
            ...[...new Set([...(rows.some((r) => originOf(r) === 'oncore') ? [] : ORIGINS), ...keepSelected(rows.map(originOf), origin)])].map((v) => ({ value: v, label: QUOTE_SITES.find((s) => s.id === v)?.label ?? v })),
          ]}
          onChange={setOrigin}
        />
        <Dropdown fixedMenu ariaLabel="담당자 필터" value={rep} options={optionsOf(repValues, '담당자 전체', rep)} onChange={setRep} />
        <Dropdown
          fixedMenu
          ariaLabel="1차 카테고리 필터"
          value={cat1}
          options={optionsOf(cat1Values, '1차 카테고리 전체', cat1).map((o) => ({ ...o, hint: cat2CountHint(o.value) }))}
          onChange={(v) => {
            setCat1(v);
            setCat2(ALL);
          }}
        />
        <Dropdown fixedMenu ariaLabel="2차 카테고리 필터" value={cat2} disabled={cat2Values.length === 0} options={optionsOf(cat2Values, '2차 카테고리 전체', cat2)} onChange={setCat2} />
        <Dropdown fixedMenu ariaLabel="유입 경로 필터" value={source} options={optionsOf(rows.map(sourceOf), '유입 경로 전체', source)} onChange={setSource} />
        {[origin, rep, cat1, source].some((v) => v !== ALL) && <FilterReset onClick={resetFilters} />}
      </div>
      {filtered.length === 0 ? (
        <EmptyState message="조건에 맞는 견적 접수 내역이 없습니다." />
      ) : (
        <>
          <div className="tw">
            <table className={`stk${isLoggedIn ? ' with-subject' : ''}`} id="tbQuoteList">
              {/* 열 폭을 고정한다 — 필터·페이지에 따라 칸 너비가 달라지지 않게 */}
              <colgroup>
                <col className="ql-col-origin" />
                <col className="ql-col-sno" />
                <col className="ql-col-date" />
                {isLoggedIn && (
                  <>
                    <col className="ql-col-subject" />
                    <col className="ql-col-company" />
                    <col className="ql-col-name" />
                    <col className="ql-col-email" />
                  </>
                )}
                <col className="ql-col-rep" />
                <col className="ql-col-cat" />
                <col className="ql-col-source" />
              </colgroup>
              <thead>
                <tr>
                  {th('origin', '사이트')}
                  {th('sno', 'SNO')}
                  {th('date', '접수날짜')}
                  {isLoggedIn && (
                    <>
                      {th('subject', '제목 (문의 내용)')}
                      {th('company', '회사명')}
                      {th('name', '작성자')}
                      {th('email', '이메일')}
                    </>
                  )}
                  {th('rep', '영업담당')}
                  {th('category', '표준 카테고리')}
                  {th('source', '유입경로')}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => {
                  return (
                    <tr key={`${r.id ?? r.sno ?? ''}-${r.date}-${i}`}>
                      <td className="ql-nowrap">{siteLabelOf(r)}</td>
                      <td className="ql-nowrap">{detail(r.sno, '2.5rem')}</td>
                      <td className="ql-nowrap">{r.date.slice(0, 10)}</td>
                      {isLoggedIn && (
                        <>
                          <td className="ql-subject" title={r.subject}>
                            {detail(r.subject, '70%')}
                          </td>
                          <td className="ql-nowrap" title={r.company || undefined}>{detail(r.company, '4rem')}</td>
                          <td className="ql-nowrap" title={r.name || undefined}>{detail(r.name, '3rem')}</td>
                          <td className="ql-nowrap" title={contactOf(r) || undefined}>{detail(contactOf(r), '6rem')}</td>
                        </>
                      )}
                      <td className="ql-nowrap" title={repOf(r)}>{repOf(r)}</td>
                      <td className="ql-nowrap" title={r.category || '기타'}>{r.category || '기타'}</td>
                      <td className="ql-nowrap" title={r.sourceDetail ? `${sourceOf(r)} - ${r.sourceDetail}` : undefined}>
                        {/* 색은 유입경로마다 달라 인라인으로 둔다 */}
                        <span style={{ color: `var(${sourceColorVar(sourceOf(r))})` }}>{sourceOf(r)}</span>
                        {r.sourceDetail && <Muted small> {r.sourceDetail}</Muted>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && <Pagination page={current} totalPages={totalPages} onChange={setPage} />}
        </>
      )}
      <TableFootnote
        basis={
          isLoggedIn
            ? '읽기 전용 · 어드민 견적 접수 원본 리스트와 같은 데이터이며, 카테고리 지정은 어드민에서 합니다 · 전화문의 건은 이메일 칸에 전화번호를 보여 줍니다'
            : '읽기 전용 · 제목·회사명·작성자·이메일은 로그인 후 볼 수 있습니다'
        }
      />
    </Card>
  );
};
