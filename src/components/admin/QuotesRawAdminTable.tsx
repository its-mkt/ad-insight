import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { QuoteRawRow } from '../../types/dashboard';
import { EXTERNAL_LINKS } from '../../utils/constants';
import { fmt, parseCatParts, quoteKey, sourceColorVar } from '../../utils/format';
import type { DayRange } from '../../utils/dayRange';
import { CATEGORY_HIERARCHY, QUOTE_PHONE_SHEET, QUOTE_SITES } from '../../utils/constants';
import { SkelRows } from '../common/SkeletonView';
import { Dropdown, type DropdownOption } from '../common/Dropdown';
import { FilterReset } from '../common/FilterReset';
import { Tooltip } from '../common/Tooltip';
import { Download, ExternalLink, Save } from 'lucide-react';
import { useSort } from '../../hooks/useSort';
import { SortableTh } from '../common/SortableTh';
import { Button, ButtonLink } from '../common/Button';
import { TextInput } from '../common/TextInput';
import { Pagination } from '../common/Pagination';
import { Card } from '../common/Card';
import { TabButton } from '../common/TabButton';
import { Notice } from '../common/Notice';

interface QuotesRawAdminTableProps {
  quotes: QuoteRawRow[];
  /** 보고 있는 문의 종류 (어드민 머리말 아래 전환 버튼) */
  channel?: QuoteChannel;
  /** 상단 기간 바에서 고른 달 (YYYY-MM) */
  selectedMonth: string;
  /** 상단 기간 바의 전체 기간 — 날짜로 거르지 않는다 */
  allPeriod?: boolean;
  /** 상단 기간 바의 연도 합계 — selectedMonth 의 연도 전체 */
  yearTotal?: boolean;
  /** 상단 기간 바의 일·기간 선택 — 있으면 월 선택보다 우선한다 */
  dayRange?: DayRange | null;
  /** 전화문의 행 — 카테고리는 시트에서 관리해 여기서는 읽기만 한다 */
  phoneQuotes?: QuoteRawRow[];
  /** 실데이터를 받는 중 — 아직 없는 광고 꼬리표는 스켈레톤으로 보여 준다 */
  loading?: boolean;
  /** 저장 전 변경의 원래 값 (quoteKey → 바꾸기 전 카테고리) */
  originals?: Map<string, string>;
  onUpdateQuoteCategory?: (quoteIdOrIndex: string | number, newCategory: string) => void;
  /** 저장 전 변경 건수 — 1건 이상이면 화면 아래에 저장 바를 띄운다 */
  changedCount?: number;
  onSave?: () => void;
  onReset?: () => void;
  saving?: boolean;
  /** 저장 결과 — 목록 아래쪽에서 저장해도 보이도록 저장 바에 함께 보여 준다 */
  saveMsg?: { text: string; ok: boolean } | null;
}

type SortKey = 'idx' | 'sno' | 'site' | 'date' | 'subject' | 'company' | 'name' | 'email' | 'phone' | 'rep' | 'category' | 'source';
export type QuoteChannel = 'live' | 'phone';

/** 2차 필터의 '2차 없음' — 1차로만 분류된 행을 고른다 */
const NO_CAT2 = '__NONE__';

/** 1차 목록 항목 옆 '· 2' — 분류표에 있는 2차 개수, 2차가 없으면 표시하지 않는다 */
const cat2CountHint = (count: number): string | undefined => (count ? `· ${count}` : undefined);

/** 아이티켓 원장 행은 site 가 비어 있다 */
const siteOf = (q: QuoteRawRow): string => q.site || 'itket';
const siteLabelOf = (q: QuoteRawRow): string => QUOTE_SITES.find((s) => s.id === siteOf(q))?.label || siteOf(q);

/** '2026-10-23 14:51:00' → '10.23 14:51' */
const shortAt = (at: string) => {
  const m = at.match(/^\d{4}-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/);
  return m ? `${m[1]}.${m[2]} ${m[3]}` : at;
};

/**
 * 카테고리 칸 아래 흔적 한 줄 — 저장 전 변경이면 원래 값, 저장된 수동 지정이면 저장 시각.
 * 마우스를 올리면 자동 분류 결과와 저장한 관리자를 보여 준다.
 */
const CategoryTrace: React.FC<{ quote: QuoteRawRow; original?: string }> = ({ quote, original }) => {
  if (original !== undefined) {
    return <span className="qr-cat-trace pending">저장 전 · 이전: {original || '없음'}</span>;
  }
  const m = quote.manual;
  if (!m) return null;
  const tip = [`자동 분류: ${quote.autoCategory || '–'}`, `수동 지정: ${m.category}`, m.by && `저장: ${m.by}`, m.at && `시각: ${m.at}`]
    .filter(Boolean)
    .join('\n');
  return (
    <span className="qr-cat-trace" title={tip}>
      수동 지정{m.at ? ` · ${shortAt(m.at)}` : ''}
    </span>
  );
};

/**
 * 표준 카테고리 지정 — 1차·2차를 따로 고른다 (분류표 CATEGORY_HIERARCHY 기준).
 * 저장 값은 예전과 같은 문자열("1차" 또는 "1차 > 2차")이라 시트·집계는 그대로 쓴다.
 * 1차를 바꾸면 2차는 비워지고, 2차가 없는 1차는 2차 칸이 꺼진다. 분류표에 없는 예전 값은 "(기존)"으로 남겨 둔다.
 */
const CategoryPicker: React.FC<{ value: string; changed: boolean; onChange: (category: string) => void }> = ({
  value,
  changed,
  onChange,
}) => {
  const { cat1, cat2 } = parseCatParts(value || '기타');
  const node = CATEGORY_HIERARCHY.find((n) => n.cat1 === cat1);
  const cat2List = node?.cat2 ?? [];
  const cat1Options: DropdownOption<string>[] = [
    ...CATEGORY_HIERARCHY.map((n) => ({ value: n.cat1, label: n.cat1, hint: cat2CountHint(n.cat2.length) })),
    ...(node ? [] : [{ value: cat1, label: `${cat1} (기존)` }]),
  ];
  const cat2Options: DropdownOption<string>[] = [
    { value: '', label: '2차 없음' },
    ...cat2List.map((c) => ({ value: c, label: c })),
    ...(cat2 && !cat2List.includes(cat2) ? [{ value: cat2, label: `${cat2} (기존)` }] : []),
  ];
  const cls = `dd-cat${changed ? ' is-changed' : ''}`;
  return (
    <div className="qr-cat-pair">
      <Dropdown
        className={cls}
        fixedMenu
        ariaLabel="1차 카테고리 선택"
        value={cat1}
        options={cat1Options}
        onChange={(v) => onChange(v)}
      />
      <Dropdown
        className={cls}
        fixedMenu
        ariaLabel="2차 카테고리 선택"
        value={cat2}
        disabled={!node || cat2List.length === 0}
        options={cat2Options}
        onChange={(v) => onChange(v ? `${cat1} > ${v}` : cat1)}
      />
    </div>
  );
};

export const QuotesRawAdminTable: React.FC<QuotesRawAdminTableProps> = ({
  quotes: liveQuotes,
  channel = 'live',
  selectedMonth,
  allPeriod = false,
  yearTotal = false,
  dayRange = null,
  phoneQuotes = [],
  loading = false,
  originals,
  onUpdateQuoteCategory,
  changedCount = 0,
  onSave,
  onReset,
  saving,
  saveMsg,
}) => {
  const isPhone = channel === 'phone';
  // 아래 필터·건수·정렬은 모두 고른 문의 종류의 행을 기준으로 한다
  const quotes = isPhone ? phoneQuotes : liveQuotes;
  const [search, setSearch] = useState('');
  const [selectedSite, setSelectedSite] = useState('ALL');
  // 전체 탭은 사이트가 섞이고 sno 도 겹칠 수 있어 사이트 열을 함께 보여 준다
  const showSiteCol = selectedSite === 'ALL' && !isPhone;
  const [selectedCat1, setSelectedCat1] = useState('ALL');
  const [selectedCat2, setSelectedCat2] = useState('ALL');
  const [selectedSource, setSelectedSource] = useState('ALL');
  // 담당자 없는 행은 빈 문자열 값(미지정)으로 고른다
  const [selectedRep, setSelectedRep] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const { sortKey, sortOrder, toggleSort } = useSort<SortKey>('date', 'asc');

  // 필터 목록: 실제 견적에 붙은 값만 (분류표 순서, 분류표 밖 값은 뒤에). 표에서 분류를 바꿔 값이 사라져도 고른 값은 목록에 남긴다
  const cat1List = useMemo(() => {
    const used = new Set(quotes.map((q) => parseCatParts(q.category || '').cat1).filter(Boolean));
    if (selectedCat1 !== 'ALL') used.add(selectedCat1);
    const known = CATEGORY_HIERARCHY.map((n) => n.cat1);
    return ['ALL', ...known.filter((c) => used.has(c)), ...[...used].filter((c) => !known.includes(c))];
  }, [quotes, selectedCat1]);

  const cat2List = useMemo(() => {
    if (selectedCat1 === 'ALL') return [];
    const parts = quotes.map((q) => parseCatParts(q.category || '')).filter((p) => p.cat1 === selectedCat1);
    const used = new Set(parts.map((p) => p.cat2).filter(Boolean));
    if (selectedCat2 !== 'ALL' && selectedCat2 !== NO_CAT2) used.add(selectedCat2);
    const known = CATEGORY_HIERARCHY.find((n) => n.cat1 === selectedCat1)?.cat2 ?? [];
    const list = [...known.filter((c) => used.has(c)), ...[...used].filter((c) => !known.includes(c))];
    // 2차가 있는 1차에서만 '2차 없음'이 의미가 있다
    const hasNone = parts.some((p) => !p.cat2) || selectedCat2 === NO_CAT2;
    return list.length ? [...list, ...(hasNone ? [NO_CAT2] : [])] : [];
  }, [quotes, selectedCat1, selectedCat2]);

  const sources = useMemo(() => {
    return ['ALL', ...Array.from(new Set(quotes.map((q) => q.source).filter(Boolean)))];
  }, [quotes]);

  // 상단 기간 바에서 고른 기간에 드는 날짜인가
  const inPeriod = useCallback(
    (date = ''): boolean => {
      if (dayRange) return date.slice(0, 10) >= dayRange.from && date.slice(0, 10) <= dayRange.to;
      if (allPeriod) return true;
      return yearTotal ? date.slice(0, 4) === selectedMonth.slice(0, 4) : date.slice(0, 7) === selectedMonth;
    },
    [selectedMonth, allPeriod, yearTotal, dayRange]
  );

  // 선택한 기간에 견적이 있는 담당자만 목록에 둔다
  const reps = useMemo(() => {
    const periodRows = quotes.filter((q) => inPeriod(q.date));
    const names = new Set(periodRows.map((q) => q.salesRep).filter((r): r is string => !!r));
    return ['ALL', ...[...names].sort((a, b) => a.localeCompare(b, 'ko')), ...(periodRows.some((q) => !q.salesRep) ? [''] : [])];
  }, [quotes, inPeriod]);

  // 기간을 바꿔 고른 담당자가 목록에서 빠지면 '담당자 전체'로 푼다
  useEffect(() => {
    if (!reps.includes(selectedRep)) setSelectedRep('ALL');
  }, [reps, selectedRep]);

  // 행 식별 키 (id 우선, 없으면 sno, 없으면 index)
  const getRowKey = (q: QuoteRawRow, index: number): string | number => {
    return q.id ?? q.sno ?? index;
  };

  // 카테고리·경로 값이 문의 종류마다 달라 옮길 때 두 필터를 풀어 준다
  useEffect(() => {
    setSelectedCat1('ALL');
    setSelectedCat2('ALL');
    setSelectedSource('ALL');
    setSelectedRep('ALL');
    setPage(1);
  }, [channel]);

  // 상단 기간 바에서 기간을 바꾸면 첫 페이지부터 보여 준다
  useEffect(() => {
    setPage(1);
  }, [selectedMonth, allPeriod, yearTotal, dayRange]);

  const resetFilters = () => {
    setSearch('');
    setSelectedRep('ALL');
    setSelectedCat1('ALL');
    setSelectedCat2('ALL');
    setSelectedSource('ALL');
    setPage(1);
  };

  const handleSort = (key: SortKey) => {
    toggleSort(key);
    setPage(1);
  };

  // 사이트 탭을 뺀 나머지 조건으로 거른다 (원래 인덱스를 유지하여 식별) — 탭 옆 건수에 쓴다
  const matchedQuotes = useMemo(() => {
    return quotes
      .map((q, originalIndex) => ({ q, originalIndex }))
      .filter(({ q }) => {
        if (selectedCat1 !== 'ALL') {
          const { cat1, cat2 } = parseCatParts(q.category || '');
          if (cat1 !== selectedCat1) return false;
          if (selectedCat2 === NO_CAT2 ? cat2 !== '' : selectedCat2 !== 'ALL' && cat2 !== selectedCat2) return false;
        }
        if (selectedSource !== 'ALL' && q.source !== selectedSource) return false;
        if (selectedRep !== 'ALL' && (q.salesRep || '') !== selectedRep) return false;
        if (!inPeriod(q.date)) return false;
        if (search) {
          const s = search.toLowerCase();
          const match =
            String(q.sno || '').toLowerCase().includes(s) ||
            String(q.subject || '').toLowerCase().includes(s) ||
            String(q.company || '').toLowerCase().includes(s) ||
            String(q.name || '').toLowerCase().includes(s) ||
            String(q.email || '').toLowerCase().includes(s) ||
            String(q.phone || '').toLowerCase().includes(s) ||
            String(q.salesRep || '').toLowerCase().includes(s) ||
            String(q.receiver || '').toLowerCase().includes(s) ||
            String(q.date || '').toLowerCase().includes(s) ||
            String(q.category || '').toLowerCase().includes(s) ||
            String(q.source || '').toLowerCase().includes(s) ||
            q.sourceDetail.toLowerCase().includes(s);
          if (!match) return false;
        }
        return true;
      });
  }, [quotes, selectedCat1, selectedCat2, selectedSource, selectedRep, inPeriod, search]);

  const siteCounts = useMemo(() => {
    const counts = new Map<string, number>();
    matchedQuotes.forEach(({ q }) => counts.set(siteOf(q), (counts.get(siteOf(q)) || 0) + 1));
    return counts;
  }, [matchedQuotes]);

  const siteTotal = useMemo(
    () => (selectedSite === 'ALL' ? quotes.length : quotes.filter((q) => siteOf(q) === selectedSite).length),
    [quotes, selectedSite]
  );
  const siteInfo = QUOTE_SITES.find((s) => s.id === selectedSite);

  // 사이트 탭까지 적용해 정렬
  const filteredQuotesWithIndex = useMemo(() => {
    return matchedQuotes
      .filter(({ q }) => selectedSite === 'ALL' || siteOf(q) === selectedSite)
      .sort((a, b) => {
        let diff = 0;
        if (sortKey === 'idx') {
          diff = a.originalIndex - b.originalIndex;
        } else if (sortKey === 'sno') {
          diff = Number(a.q.sno || 0) - Number(b.q.sno || 0);
        } else if (sortKey === 'site') {
          diff = siteLabelOf(a.q).localeCompare(siteLabelOf(b.q));
        } else if (sortKey === 'date') {
          diff = (a.q.date || '').localeCompare(b.q.date || '');
        } else if (sortKey === 'subject') {
          diff = (a.q.subject || '').localeCompare(b.q.subject || '');
        } else if (sortKey === 'company') {
          diff = (a.q.company || '').localeCompare(b.q.company || '');
        } else if (sortKey === 'name') {
          diff = (a.q.name || '').localeCompare(b.q.name || '');
        } else if (sortKey === 'email') {
          diff = (a.q.email || '').localeCompare(b.q.email || '');
        } else if (sortKey === 'phone') {
          diff = (a.q.phone || '').localeCompare(b.q.phone || '');
        } else if (sortKey === 'rep') {
          diff = (a.q.salesRep || '').localeCompare(b.q.salesRep || '');
        } else if (sortKey === 'category') {
          diff = (a.q.category || '').localeCompare(b.q.category || '');
        } else if (sortKey === 'source') {
          diff = (a.q.source || '').localeCompare(b.q.source || '');
        }
        return sortOrder === 'asc' ? diff : -diff;
      });
  }, [matchedQuotes, selectedSite, sortKey, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredQuotesWithIndex.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredQuotesWithIndex.slice(start, start + pageSize);
  }, [filteredQuotesWithIndex, currentPage, pageSize]);

  // CSV 내보내기 (구글 스프레드시트 전체 원본 열 기준 1:1 출력)
  const handleExportCsv = () => {
    const cell = (v?: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = isPhone
      ? ['번호', '접수일시', '메모', '고객사', '고객사담당', '전화번호', '카테고리', '경로', '연결영업대표', '전화수신자']
      : ['SNO', '제목', '작성자', '회사명', '이메일', '영업담당', '접수날짜', '유입경로', '유입 광고', '표준카테고리', '사이트'];
    const rows = filteredQuotesWithIndex.map(({ q }) => isPhone ? [
      q.sno, q.date, q.subject, q.company, q.name, q.phone, q.category, q.source, q.salesRep, q.receiver,
    ].map(cell) : [
      `"${q.sno || ''}"`,
      `"${(q.subject || '').replace(/"/g, '""')}"`,
      `"${(q.name || '').replace(/"/g, '""')}"`,
      `"${(q.company || '').replace(/"/g, '""')}"`,
      `"${q.email || ''}"`,
      cell(q.salesRep),
      `"${q.date || ''}"`,
      `"${q.source || ''}"`,
      `"${q.sourceDetail.replace(/"/g, '""')}"`,
      `"${q.category || ''}"`,
      `"${siteLabelOf(q)}"`,
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${isPhone ? 'quotes_phone' : 'quotes_raw'}_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Card name="admin-quotes" id="card-admin-quotes">
      {/* 카드 헤더 및 툴바 */}
      <div className="qr-head">
        <div className="qr-head-meta">
          <h3 className="qr-title">
            {isPhone ? '전화문의 원본 리스트' : '견적 접수 원본 리스트'} (Google 스프레드시트 연동)
            <span className="qr-count muted">
              총 <b>{fmt(siteTotal)}</b>건 중 <b>{fmt(filteredQuotesWithIndex.length)}</b>건 표시
            </span>
          </h3>
          <p className="qr-sheet-info">
            {isPhone ? (
              <>시트 ID: <code>{QUOTE_PHONE_SHEET.sheetId}</code> · 카테고리는 시트에서 관리</>
            ) : (
              <>{siteInfo ? <>시트 ID: <code>{siteInfo.sheetId}</code></> : <>견적요청 DB 시트 {QUOTE_SITES.length}개 통합</>} · 카테고리 수동 재분류 가능</>
            )}
          </p>
        </div>

        <div className="qr-head-actions">
          <ButtonLink
            href={
              isPhone
                ? `https://docs.google.com/spreadsheets/d/${QUOTE_PHONE_SHEET.sheetId}/edit?gid=${QUOTE_PHONE_SHEET.gid}#gid=${QUOTE_PHONE_SHEET.gid}`
                : siteInfo
                  ? `https://docs.google.com/spreadsheets/d/${siteInfo.sheetId}/edit`
                  : EXTERNAL_LINKS.quotesRawSheet
            }
            size="sm"
            icon={ExternalLink}
            iconPosition="end"
            className="btn-sheet-link"
            id="btn-admin-sheet-link"
            data-btn="sheet-link"
          >
            시트 원본 열기
          </ButtonLink>

          <Button
            size="sm"
            icon={Download}
            className="btn-export-csv"
            id="btn-admin-export-csv"
            data-btn="export-csv"
            onClick={handleExportCsv}
          >
            CSV 다운로드
          </Button>
        </div>
      </div>

      {/* 사이트 탭 — 건수는 아래 필터를 적용한 값 */}
      <div className="kw-tabs qr-site-tabs">
        <TabButton
          className="btn-quote-site"
          data-btn="quote-site-all"
          active={selectedSite === 'ALL'}
          label="전체"
          count={matchedQuotes.length}
          onClick={() => { setSelectedSite('ALL'); setPage(1); }}
        />
        {QUOTE_SITES.map((site) => (
          <TabButton
            key={site.id}
            className="btn-quote-site"
            data-btn={`quote-site-${site.id}`}
            active={selectedSite === site.id}
            label={site.label}
            count={siteCounts.get(site.id) || 0}
            onClick={() => { setSelectedSite(site.id); setPage(1); }}
          />
        ))}
      </div>

      {/* 필터 바 */}
      <div className="qr-filter">
        <label className="qr-filter-item">
          <TextInput
            aria-label="검색"
            placeholder={isPhone ? '메모, 고객사, 담당, 전화번호...' : '제목, 회사명, 성명, 카테고리...'}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </label>

        <div className="qr-filter-item">
          <Dropdown
            fixedMenu
            ariaLabel="담당자 필터"
            value={selectedRep}
            options={reps.map((r) => ({ value: r, label: r === 'ALL' ? '담당자 전체' : r || '미지정' }))}
            onChange={(v) => { setSelectedRep(v); setPage(1); }}
          />
        </div>

        <div className="qr-filter-item">
          <Dropdown
            fixedMenu
            ariaLabel="1차 카테고리 필터"
            value={selectedCat1}
            options={cat1List.map((c) => ({
              value: c,
              label: c === 'ALL' ? '1차 카테고리 전체' : c,
              hint: cat2CountHint(CATEGORY_HIERARCHY.find((n) => n.cat1 === c)?.cat2.length ?? 0),
            }))}
            onChange={(v) => { setSelectedCat1(v); setSelectedCat2('ALL'); setPage(1); }}
          />
        </div>

        <div className="qr-filter-item">
          <Dropdown
            fixedMenu
            ariaLabel="2차 카테고리 필터"
            value={selectedCat2}
            disabled={cat2List.length === 0}
            options={[
              { value: 'ALL', label: '2차 카테고리 전체' },
              ...cat2List.map((c) => ({ value: c, label: c === NO_CAT2 ? '2차 없음' : c })),
            ]}
            onChange={(v) => { setSelectedCat2(v); setPage(1); }}
          />
        </div>

        <div className="qr-filter-item">
          <Dropdown
            fixedMenu
            ariaLabel={isPhone ? '경로 선택' : '유입경로 선택'}
            value={selectedSource}
            options={sources.map((s) => ({ value: s, label: s === 'ALL' ? (isPhone ? '경로 전체' : '유입경로 전체') : s }))}
            onChange={(v) => { setSelectedSource(v); setPage(1); }}
          />
        </div>

        {(search || selectedRep !== 'ALL' || selectedCat1 !== 'ALL' || selectedSource !== 'ALL') && <FilterReset onClick={resetFilters} />}

        <div className="qr-filter-item ml-auto">
          <Dropdown
            fixedMenu
            ariaLabel="페이지당 표시 개수"
            value={pageSize}
            options={[
              { value: 20, label: '20개씩' },
              { value: 50, label: '50개씩' },
              { value: 100, label: '100개씩' },
              { value: 200, label: '200개씩' },
            ]}
            onChange={(v) => { setPageSize(v); setPage(1); }}
          />
        </div>
      </div>

      <div className="qr-table-wrap">
        <table className="tbl tw stk qr-table">
          <thead>
            <tr>
              {showSiteCol && <SortableTh sortKey="site" activeKey={sortKey} order={sortOrder} onSort={handleSort} className="col-site">사이트</SortableTh>}
              <SortableTh sortKey="sno" activeKey={sortKey} order={sortOrder} onSort={handleSort} className="col-sno">{isPhone ? '번호' : 'SNO'}</SortableTh>
              <SortableTh sortKey="date" activeKey={sortKey} order={sortOrder} onSort={handleSort} className={isPhone ? 'col-datetime' : 'col-date'}>{isPhone ? '접수일시' : '접수날짜'}</SortableTh>
              <SortableTh sortKey="subject" activeKey={sortKey} order={sortOrder} onSort={handleSort} className="col-subject">{isPhone ? '메모' : '제목 (문의 내용)'}</SortableTh>
              <SortableTh sortKey="company" activeKey={sortKey} order={sortOrder} onSort={handleSort} className="col-company">{isPhone ? '고객사' : '회사명'}</SortableTh>
              <SortableTh sortKey="name" activeKey={sortKey} order={sortOrder} onSort={handleSort} className="col-name">{isPhone ? '고객사담당' : '작성자'}</SortableTh>
              {isPhone ? (
                <SortableTh sortKey="phone" activeKey={sortKey} order={sortOrder} onSort={handleSort} className="col-phone">전화번호</SortableTh>
              ) : (
                <SortableTh sortKey="email" activeKey={sortKey} order={sortOrder} onSort={handleSort} className="col-email">이메일</SortableTh>
              )}
              {!isPhone && <SortableTh sortKey="rep" activeKey={sortKey} order={sortOrder} onSort={handleSort} className="col-sales-rep">영업담당</SortableTh>}
              <SortableTh sortKey="category" activeKey={sortKey} order={sortOrder} onSort={handleSort} className={isPhone ? 'col-phone-category' : 'col-category'}>{isPhone ? '카테고리' : '표준 카테고리 (수동 지정)'}</SortableTh>
              <SortableTh sortKey="source" activeKey={sortKey} order={sortOrder} onSort={handleSort} className={isPhone ? 'col-phone-source' : 'col-source'}>{isPhone ? '경로' : '유입경로'}</SortableTh>
              {isPhone && <SortableTh sortKey="rep" activeKey={sortKey} order={sortOrder} onSort={handleSort} className="col-rep">연결영업대표 · 수신자</SortableTh>}
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && loading ? (
              <SkelRows rows={8} widths={[...(showSiteCol ? ['4rem'] : []), '3rem', '5rem', '60%', '50%', '4rem', '70%', '5rem', '5rem', '5rem']} />
            ) : pageItems.length === 0 ? (
              <tr>
                <td colSpan={showSiteCol ? 10 : 9} className="qr-empty">
                  {isPhone
                    ? phoneQuotes.length === 0
                      ? '전화문의가 아직 수집되지 않았습니다.'
                      : '조회 조건에 해당하는 전화문의 내역이 없습니다.'
                    : siteInfo && siteTotal === 0
                      ? `${siteInfo.label} 견적이 아직 수집되지 않았습니다.`
                      : '조회 조건에 해당하는 견적 접수 내역이 없습니다.'}
                </td>
              </tr>
            ) : (
              pageItems.map(({ q, originalIndex }) => {
                const rowKey = getRowKey(q, originalIndex);

                return (
                  <tr key={rowKey}>
                    {showSiteCol && <td className="qr-site">{siteLabelOf(q)}</td>}
                    <td className="qr-sno">{q.sno || '–'}</td>
                    <td className="qr-date">
                      {q.date || '–'}
                    </td>
                    <Tooltip content={q.subject}>
                      <td className="qr-subject">
                        {q.subject || '–'}
                      </td>
                    </Tooltip>
                    <td>
                      <Tooltip content={q.company}>
                        <span className="cell-truncate">{q.company || '–'}</span>
                      </Tooltip>
                    </td>
                    <td>
                      <Tooltip content={q.name}>
                        <span className="cell-wrap">{q.name || '–'}</span>
                      </Tooltip>
                    </td>
                    <td className="qr-email" title={(isPhone ? q.phone : q.email) || undefined}>{(isPhone ? q.phone : q.email) || '–'}</td>
                    {!isPhone && (
                      <td>
                        <Tooltip content={q.salesRep}>
                          <span className="cell-truncate">{q.salesRep || '–'}</span>
                        </Tooltip>
                      </td>
                    )}
                    {isPhone ? (
                      <td>
                        <Tooltip content={q.category}>
                          <span className="cell-truncate">{q.category || '–'}</span>
                        </Tooltip>
                      </td>
                    ) : (
                    <td className="qr-cat">
                      <CategoryPicker
                        value={q.category || '기타'}
                        changed={!!originals?.has(quoteKey(q))}
                        onChange={(v) => onUpdateQuoteCategory?.(rowKey, v)}
                      />
                      <CategoryTrace quote={q} original={originals?.get(quoteKey(q))} />
                    </td>
                    )}
                    <td className="qr-source" title={q.sourceDetail ? `${q.source} - ${q.sourceDetail}` : undefined}>
                      {/* 색은 유입경로마다 달라 인라인으로 둔다 */}
                      <span
                        className={`qr-src${q.source?.includes('광고') ? ' ad' : ''}`}
                        style={{ color: `var(${sourceColorVar(q.source)})` }}
                      >
                        {q.source || '미수집'}
                      </span>
                      {q.sourceDetail ? (
                        <span className="qr-src-detail">{q.sourceDetail}</span>
                      ) : (
                        // 광고 유입은 꼬리표(광고 이름)가 실데이터로 와서, 받는 동안 자리만 잡아 둔다
                        loading &&
                        q.source?.includes('광고') && <span className="qr-src-detail skel" aria-hidden="true" />
                      )}
                    </td>
                    {isPhone && (
                      <td className="qr-rep">
                        {q.salesRep || '–'}
                        {q.receiver && <span className="qr-receiver"> · {q.receiver}</span>}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      <div className="qr-pagination">
        <span className="qr-pagination-info">
          {filteredQuotesWithIndex.length > 0
            ? `${fmt((currentPage - 1) * pageSize + 1)} ~ ${fmt(Math.min(currentPage * pageSize, filteredQuotesWithIndex.length))}건 (전체 ${fmt(filteredQuotesWithIndex.length)}건)`
            : '0건'}
        </span>

        <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
      </div>

      {/* 저장 바 — 목록을 아래로 내려도 화면 아래에 붙어 있다 */}
      {(changedCount > 0 || saveMsg) && (
        <div className="qr-savebar">
          <div className="qr-savebar-status">
            {changedCount > 0 && <span className="qr-unsaved">● 미저장 변경 {fmt(changedCount)}건</span>}
            {saveMsg && <Notice tone={saveMsg.ok ? 'ok' : 'warn'}>{saveMsg.text}</Notice>}
          </div>

          {changedCount > 0 && (
            <div className="qr-savebar-actions">
              {onReset && (
                <Button
                  size="sm"
                  className="btn-reset-quotes"
                  id="btn-admin-reset-quotes"
                  data-btn="reset-quotes"
                  onClick={onReset}
                  disabled={saving}
                >
                  수정 취소
                </Button>
              )}

              {onSave && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={Save}
                  className={`btn-save-supabase${saving ? ' saving' : ''}`}
                  id="btn-admin-save-supabase"
                  data-btn="save-supabase"
                  onClick={onSave}
                  disabled={saving}
                >
                  {saving ? '저장 중...' : '변경사항 저장'}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
