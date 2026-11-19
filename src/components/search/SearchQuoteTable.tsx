import React from 'react';
import type { QuoteRawRow } from '../../types/dashboard';
import type { SortOrder } from '../../hooks/useSort';
import { AccordionChevron } from '../common/AccordionChevron';
import { SortableTh } from '../common/SortableTh';
import { Th } from '../common/Th';
import { CUSTOMER_FALLBACK, QUOTE_CHIP_LABELS, QUOTE_WIDE_LABEL, quoteDetails } from './searchHelpers';

interface SearchQuoteDetailRowProps {
  /** 펼친 견적 */
  quote: QuoteRawRow;
  /** 줄 키 — 상세 줄 id 에 쓴다 */
  rowKey: string;
}

/** 견적 표에서 펼친 줄 아래의 상세 패널 */
export const SearchQuoteDetailRow: React.FC<SearchQuoteDetailRowProps> = ({ quote: r, rowKey: key }) => {
  const details = quoteDetails(r);
  return (
    <tr className="search-q-detail cr-detail-row" id={`search-q-detail-${key}`}>
      <td colSpan={6}>
        {/* 소재 표(.cr-detail)와 같은 흰 패널 — 항목은 이름 위, 값 아래로 칸에 맞춰 늘어놓는다 */}
        <div className="cr-detail search-q-panel">
          {/* 머리말: 전체 제목 + 짧은 정보(번호·사이트·문의 유형)는 칩으로. 긴 값(유입 경로)은 아래 칸에서 한 줄 전체 폭을 쓴다 */}
          <div className="search-q-head">
            {r.subject && <p className="search-q-subject">{r.subject}</p>}
            <div className="search-q-chips">
              {details
                .filter(([label]) => QUOTE_CHIP_LABELS.includes(label))
                .map(([label, value]) => (
                  <span key={label} className="search-q-chip">
                    <small>{label}</small>
                    {value}
                  </span>
                ))}
            </div>
          </div>
          <dl>
            {details
              .filter(([label]) => !QUOTE_CHIP_LABELS.includes(label))
              .map(([label, value]) => (
                <div key={label} className={label === QUOTE_WIDE_LABEL ? 'wide' : undefined}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
        </div>
      </td>
    </tr>
  );
};

interface SearchQuoteTableProps {
  /** 검색어와 일치한 견적 (최근 순) */
  quotes: QuoteRawRow[];
  /** 보여 줄 줄 수 (없으면 전부) */
  limit?: number;
  /** 정렬 중인 열 */
  sortKey: 'date';
  /** 정렬 방향 */
  order: SortOrder;
  /** 머리글을 눌러 정렬을 바꿀 때 */
  onSort: (key: 'date') => void;
  /** 펼친 줄의 키 */
  openQuotes: Set<string>;
  /** 줄을 눌러 펼치거나 접을 때 */
  onToggle: (key: string) => void;
}

/** 검색 결과 '견적' 탭의 표 (로그인 상태) — 줄을 누르면 상세가 펼쳐진다 */
export const SearchQuoteTable: React.FC<SearchQuoteTableProps> = ({ quotes, limit, sortKey: qKey, order: qOrd, onSort: qSort, openQuotes, onToggle: toggleQuote }) => (
  <div className="tw">
    <table className="stk" id="tbSearchQuotes">
      <colgroup>
        <col className="col-sq-date" />
        <col className="col-sq-subject" />
        <col className="col-sq-customer" />
        <col className="col-sq-text" />
        <col className="col-sq-text" />
        <col className="col-sq-text" />
      </colgroup>
      <thead>
        <tr>
          <SortableTh sortKey="date" activeKey={qKey} order={qOrd} onSort={qSort}>
            접수일
          </SortableTh>
          <Th>제목</Th>
          <Th>고객</Th>
          <Th>카테고리</Th>
          <Th>유입</Th>
          <Th>담당자</Th>
        </tr>
      </thead>
      <tbody>
        {(qOrd === 'asc' ? [...quotes].reverse() : quotes).slice(0, limit).map((r, i) => {
          const key = String(r.id || i);
          const isOpen = openQuotes.has(key);
          return (
            <React.Fragment key={key}>
              {/* 소재 표(.cr-row)와 같은 방식: 행 전체를 눌러 펼치고, 화살표 버튼은 키보드 조작용 */}
              <tr
                className={`cr-row can-open${isOpen ? ' open' : ''}`}
                title={isOpen ? '클릭하여 상세 접기' : '클릭하여 상세 펼치기'}
                onClick={() => toggleQuote(key)}
              >
                <td className="search-nowrap">
                  <button
                    type="button"
                    className="search-q-toggle grp-acc-main"
                    aria-expanded={isOpen}
                    aria-controls={`search-q-detail-${key}`}
                  >
                    <AccordionChevron open={isOpen} />
                    {r.date.slice(0, 10)}
                  </button>
                </td>
                <td className="search-ellipsis" title={r.subject}>{r.subject || CUSTOMER_FALLBACK}</td>
                <td className="search-ellipsis">{[r.company, r.name].filter(Boolean).join(' · ') || CUSTOMER_FALLBACK}</td>
                <td className="search-ellipsis">{r.category || CUSTOMER_FALLBACK}</td>
                <td className="search-ellipsis">{r.inquiryType || r.source || CUSTOMER_FALLBACK}</td>
                <td className="search-ellipsis">{r.salesRep || CUSTOMER_FALLBACK}</td>
              </tr>
              {isOpen && (
                <SearchQuoteDetailRow quote={r} rowKey={key} />
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  </div>
);
