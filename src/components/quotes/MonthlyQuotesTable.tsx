import React, { useState, useMemo } from 'react';
import type { QuoteRawRow, QuoteRow } from '../../types/dashboard';
import {
  mLabel,
  cat1Of,
  QUOTE_COLORS,
  quoteCat1Order,
  fmt,
  sumBy,
  THIS_M,
  ym,
} from '../../utils/format';
import { DeltaSpan } from '../charts/KpiCard';
import { SourceBarChart } from '../charts/SourceBarChart';
import { SourceShareTable } from './SourceShareTable';
import { TableFootnote } from '../common/TableFootnote';
import { TabButton } from '../common/TabButton';
import { LIST_LIMIT, ShowMoreButton } from '../common/MoreButton';
import { Card } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { Th } from '../common/Th';
import { MonthHeadCells, MonthRow } from '../common/TableRows';

interface MonthlyQuotesTableProps {
  /** 이 카드가 보여 줄 기준 */
  group: 'cat' | 'rep';
  quotes: QuoteRow[];
  quotesRaw: QuoteRawRow[];
  yr: string;
  curM: string;
  months: string[];
  allMonths: string[];
  /** 기간 선택이 '전체' — months·allMonths 에 연도(YYYY)가 들어오고 yr 은 빈 값이다 */
  allPeriod?: boolean;
  /** 월 선택이 '전체' — 한 달 범위가 없으므로 연도 누적부터 보여 준다 */
  yearTotal?: boolean;
  /** 그래프·표 보기 — 화면 위쪽 탭에서 고른다 */
  viewMode: 'chart' | 'table';
  /** 제목 앞에 붙는 기간 ('11월', '2026년', '전체 기간') */
  periodLabel: string;
  /** 일·기간 보기 — 달 전체와 맞지 않는 전년 비교 줄을 뺀다 */
  isRange?: boolean;
}

const REP_UNASSIGNED = '미지정';
const REP_EMPTY_TEXT ='담당자 데이터가 아직 수집되지 않았습니다. 견적 데이터 수집이 다시 실행되면 표시됩니다.';
const CAT_OTHER = '기타';

const monthOf = (r: QuoteRawRow): string => r.date?.slice(0, 7) ?? '';
const repOf = (r: QuoteRawRow): string => r.salesRep || REP_UNASSIGNED;
/** 집계 키 — 'YYYY-MM…' 값의 연도(YYYY)·달(YYYY-MM). startsWith(연도|달) 비교와 같은 결과가 되도록 형식이 맞을 때만 */
const prefixesOf = (v?: string): string[] => {
  if (!v) return [];
  const out: string[] = [];
  if (v.length >= 4) out.push(v.slice(0, 4));
  if (v.length >= 7) out.push(v.slice(0, 7));
  return out;
};

/** 행을 키별로 한 번에 센다 (weightOf 를 주면 그 값을 더한다) */
function tally<T>(rows: T[], keyOf: (row: T) => string, weightOf: (row: T) => number = () => 1): Map<string, number> {
  const counts = new Map<string, number>();
  rows.forEach((r) => counts.set(keyOf(r), (counts.get(keyOf(r)) || 0) + weightOf(r)));
  return counts;
}

/** 건수 큰 순 키 목록. lastKey('미지정'·'기타')는 맨 뒤로 보낸다 */
const orderKeys = (counts: Map<string, number>, lastKey?: string): string[] =>
  [...counts.keys()].sort((a, b) => (a === lastKey ? 1 : b === lastKey ? -1 : counts.get(b)! - counts.get(a)!));

/** 막대 목록 데이터 — 건수 순 정렬과 비중·최댓값 계산 */
function rankGroups(counts: Map<string, number>, lastKey?: string) {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const items = orderKeys(counts, lastKey)
    .filter((k) => counts.get(k)! > 0)
    .map((k) => {
      const count = counts.get(k)!;
      return { k, count, pct: total > 0 ? (count / total) * 100 : 0 };
    });
  return { items, total, max: Math.max(...items.map((s) => s.count), 1) };
}

export const MonthlyQuotesTable: React.FC<MonthlyQuotesTableProps> = ({
  group,
  quotes,
  quotesRaw,
  yr,
  curM,
  months: monthsProp,
  allMonths: allMonthsProp,
  allPeriod = false,
  yearTotal = false,
  viewMode,
  periodLabel,
  isRange = false,
}) => {
  // 월·일 기간을 고르면 그 기간만 보여 준다. 월별·연도별 표와 누적 탭은 '전체'를 골랐을 때만
  const single = !allPeriod && !yearTotal;
  const allMonths = single ? [curM] : allMonthsProp;
  // 부모가 렌더마다 새 배열을 넘기므로 값이 같으면 같은 배열을 쓴다 (아래 집계 메모가 매번 다시 돌지 않게)
  const months = useMemo(() => (single ? [curM] : monthsProp), [single, curM, monthsProp.join()]);
  const [timeScope, setTimeScope] = useState<'cur' | 'ytd' | 'all'>('cur');
  const scope = allPeriod ? 'all' : single ? 'cur' : timeScope === 'all' ? 'all' : 'ytd';
  // 카테고리·담당자는 10개까지만 보이고 나머지는 '더보기'로 (막대 목록·표 함께)
  const [showAllRows, setShowAllRows] = useState(false);
  const rowLimit = showAllRows ? undefined : LIST_LIMIT;

  const isFuture = (mo: string) => mo > curM;
  const colLabel = (mo: string) => (allPeriod ? `${mo}년` : mLabel(mo));

  // 칸마다 전체 행을 다시 훑지 않도록, 달(YYYY-MM)·연도(YYYY) 단위 건수를 한 번에 세어 둔다
  const counts = useMemo(() => {
    const quote = new Map<string, number>();
    const raw = new Map<string, number>();
    const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) || 0) + n);
    quotes.forEach((r) => {
      const cat1 = cat1Of(r.category || CAT_OTHER);
      for (const p of prefixesOf(r.month)) {
        add(quote, p, r.count);
        add(quote, `${p}\u0001${cat1}`, r.count);
      }
    });
    quotesRaw.forEach((r) => {
      const rep = repOf(r);
      for (const p of prefixesOf(r.date)) {
        add(raw, p, 1);
        add(raw, `${p}\u0001${rep}`, 1);
      }
    });
    return { quote, raw };
  }, [quotes, quotesRaw]);
  // 달·연도가 아닌 값이 오면 예전처럼 직접 센다
  const indexed = (mo: string) => mo.length === 4 || mo.length === 7;

  // 카테고리는 분류표 1차 기준 — "SAN 스토리지 > 화웨이" 같은 2차 견적은 1차 행에 합산한다
  const cntCat = (mo: string, cat1: string) =>
    indexed(mo)
      ? counts.quote.get(`${mo}\u0001${cat1}`) || 0
      : quotes.filter((r) => r.month.startsWith(mo) && cat1Of(r.category || CAT_OTHER) === cat1).reduce((a, r) => a + r.count, 0);
  // 올해 견적이 있는 1차 카테고리 전부, 건수 큰 순 ('기타'는 맨 뒤)
  const yearCats = useMemo(() => quoteCat1Order(quotes.filter((r) => months.includes(r.month))), [quotes, months]);

  const totMonth = (mo: string) =>
    indexed(mo) ? counts.quote.get(mo) || 0 : quotes.filter((r) => r.month.startsWith(mo)).reduce((a, r) => a + r.count, 0);

  // 진행 중인 달은 작년 같은 날짜까지만 세어 다 끝난 달과 비교되지 않게 한다 (끝난 달은 월 합계 그대로)
  const today = new Date().getDate();
  const lastYearQuote = (mo: string) => {
    const lastYear = ym(+yr - 1, +mo.slice(5));
    if (mo !== THIS_M) return totMonth(lastYear);
    const until = `${lastYear}-${String(today).padStart(2, '0')}`;
    return quotesRaw.filter((r) => r.date?.startsWith(lastYear) && r.date.slice(0, 10) <= until).length;
  };
  const lastYearLabel = single && curM === THIS_M ? `전년 동기간 (1~${today}일)` : '전년 동월';

  // 담당자별: 원장(quotes_raw)의 영업담당 기준. 값이 없는 건은 '미지정'으로 모은다
  const hasRepData = useMemo(() => quotesRaw.some((r) => r.salesRep), [quotesRaw]);
  const cntRep = (mo: string, rep: string) =>
    indexed(mo) ? counts.raw.get(`${mo}\u0001${rep}`) || 0 : quotesRaw.filter((r) => r.date?.startsWith(mo) && repOf(r) === rep).length;

  // 표의 행 목록: 올해 견적이 있는 담당자, 건수 큰 순
  const yearRaw = useMemo(() => {
    const set = new Set(months);
    return quotesRaw.filter((r) => set.has(monthOf(r)));
  }, [quotesRaw, months]);
  const yearReps = useMemo(
    () => (hasRepData ? orderKeys(tally(yearRaw, repOf), REP_UNASSIGNED) : []),
    [yearRaw, hasRepData]
  );

  // 전체 누적: 데이터가 있는 모든 달과, 올해 없는 항목까지 포함한 목록
  const dataMonths = useMemo(
    () => [...new Set([...quotes.map((r) => r.month), ...quotesRaw.map(monthOf)])].filter(Boolean).sort(),
    [quotes, quotesRaw]
  );
  const allCats = useMemo(() => quoteCat1Order(quotes), [quotes]);
  const allReps = useMemo(
    () => (hasRepData ? orderKeys(tally(quotesRaw, repOf), REP_UNASSIGNED) : []),
    [quotesRaw, hasRepData]
  );

  const totRawMonth = (mo: string) => (indexed(mo) ? counts.raw.get(mo) || 0 : quotesRaw.filter((r) => r.date?.startsWith(mo)).length);

  // 차트 모드 데이터 산출: 선택 범위의 행을 한 번만 훑어 항목별로 센다
  const chartData = useMemo(() => {
    const scopeMonths = new Set(scope === 'cur' ? [curM] : scope === 'ytd' ? months : dataMonths);
    const scopeRaw = quotesRaw.filter((r) => scopeMonths.has(monthOf(r)));
    if (group === 'rep') {
      return rankGroups(tally(hasRepData ? scopeRaw : [], repOf), REP_UNASSIGNED);
    }
    return rankGroups(tally(quotes.filter((r) => scopeMonths.has(r.month)), (r) => cat1Of(r.category || CAT_OTHER), (r) => r.count), CAT_OTHER);
  }, [group, scope, curM, months, dataMonths, quotes, quotesRaw, hasRepData]);

  const isRep = group === 'rep';
  // 표: 카테고리·담당자는 행 기준만 다르고 구성이 같다
  const groupRows = isRep ? (allPeriod ? allReps : yearReps) : allPeriod ? allCats : yearCats;
  const cntGroup = isRep ? cntRep : cntCat;
  const totGroupMonth = isRep ? totRawMonth : totMonth;

  // 범위 탭의 건수: 이 카드 기준의 달별 합계를 더한다
  const monthTotals = useMemo(
    () => ({
      raw: tally(quotesRaw, monthOf),
      quote: tally(quotes, (r) => r.month, (r) => r.count),
    }),
    [quotes, quotesRaw]
  );
  const countIn = (list: string[]): number => {
    if (isRep && !hasRepData) return 0;
    const totals = isRep ? monthTotals.raw : monthTotals.quote;
    return sumBy(list, (mo) => totals.get(mo) || 0);
  };
  const groupNoun = isRep ? '담당자' : '카테고리';
  // 그래프의 '전체 누적' 범위와 전체 기간 표는 전체 달로 적는다
  const showsAllMonths = scope === 'all' && (viewMode === 'chart' || allPeriod);

  return (
    <Card
      name="quotes-monthly"
      tableWrap
      id={`quotes-${group}`}
      title={`${groupNoun}별 접수 현황`}
      subtitle={`(${showsAllMonths ? '전체 기간' : periodLabel} · ${fmt(countIn(showsAllMonths ? dataMonths : months))}건)`}
    >

      {viewMode === 'chart' ? (
        <div className="quote-chart-view">
          {!single && (
            <div className="kw-tabs seg-src-platform">
              {!allPeriod && (
                <>
                  <TabButton
                    className="btn-scope"
                    id={`scope-ytd-${group}`}
                    data-btn="ytd"
                    active={scope === 'ytd'}
                    label={`${yr}년 누적`}
                    count={countIn(months)}
                    onClick={() => setTimeScope('ytd')}
                  />
                </>
              )}
              <TabButton
                className="btn-scope"
                id={`scope-all-${group}`}
                data-btn="all"
                active={scope === 'all'}
                label="전체 누적"
                count={countIn(dataMonths)}
                title={dataMonths.length ? `${dataMonths[0]} ~ ${dataMonths[dataMonths.length - 1]}` : undefined}
                onClick={() => {
                  // 전체 기간 선택 중에는 이 탭만 보인다. 월로 돌아갔을 때 보던 범위를 유지한다
                  if (!allPeriod) setTimeScope('all');
                }}
              />
            </div>
          )}

          {chartData.items.length ? (
            <>
              <SourceBarChart
                id={`chQuoteGroup-${group}`}
                nameLabel={groupNoun}
                itemColors
                colorTop={5}
                items={chartData.items.slice(0, rowLimit).map((it, idx) => ({
                  k: it.k,
                  // 항목마다 순서대로 색을 준다. '기타'·'미지정'은 묶음이라 따로 둔다
                  c: it.k === CAT_OTHER || it.k === REP_UNASSIGNED ? '--c-etc' : QUOTE_COLORS[idx % QUOTE_COLORS.length],
                  count: it.count,
                  // 건이 있는데 0% 로 보이지 않게 한다
                  v: it.pct > 0 && it.pct < 0.1 ? 0.1 : Math.round(it.pct * 10) / 10,
                }))}
              />
              <ShowMoreButton noun={groupNoun} total={chartData.items.length} expanded={showAllRows} onToggle={() => setShowAllRows((v) => !v)} />
            </>
          ) : (
            <EmptyState
              message={isRep && !hasRepData ? REP_EMPTY_TEXT : '선택한 조건의 견적 접수 데이터가 없습니다.'}
              style={{ margin: '1.5rem 0' }}
            />
          )}
        </div>
      ) : isRep && !hasRepData ? (
        <EmptyState message={REP_EMPTY_TEXT} style={{ margin: '1.5rem 0' }} />
      ) : (
        <div id={`tbQuotesSummary-${group}`}>
          {/* 연도 열만 있을 때는 월별 표의 min-width(72rem)가 불필요한 가로 스크롤을 만든다 */}
          {single ? (
            // 한 기간만 볼 때는 월 열 대신 건수·점유율로 보여 준다
            <SourceShareTable
              tableId={`tbQuotesShare-${group}`}
              nameLabel={groupNoun}
              total={totGroupMonth(curM)}
              items={groupRows.slice(0, rowLimit).map((k) => {
                const count = cntGroup(curM, k);
                const whole = totGroupMonth(curM);
                const pct = whole > 0 ? (count / whole) * 100 : 0;
                return { k, c: '--acc', count, v: pct > 0 && pct < 0.1 ? 0.1 : Math.round(pct * 10) / 10 };
              })}
            >
              {!isRange && (
                <>
                  <MonthRow sub label={lastYearLabel} columns={allMonths} isFuture={isFuture} value={lastYearQuote} total="" />
                  <MonthRow sub label="전년비" columns={allMonths} isFuture={isFuture} value={(mo) => <DeltaSpan a={totGroupMonth(mo)} b={lastYearQuote(mo)} />} total="" />
                </>
              )}
            </SourceShareTable>
          ) : (
          <table className="stk quotes-group-table" style={allPeriod ? { minWidth: 'auto' } : undefined}>
            <colgroup>
              <col className="col-mo-label" />
              {allMonths.map((mo) => (
                <col key={mo} className="col-mo-val" />
              ))}
              <col className="col-mo-total" />
            </colgroup>
            <thead>
              <tr>
                <Th>{groupNoun}</Th>
                <MonthHeadCells columns={allMonths} label={colLabel} isFuture={isFuture} />
                <Th className="n">합계</Th>
              </tr>
            </thead>
            <tbody>
              {groupRows.slice(0, rowLimit).map((c) => (
                <MonthRow
                  key={c}
                  label={c}
                  columns={allMonths}
                  isFuture={isFuture}
                  value={(mo) => cntGroup(mo, c)}
                  total={sumBy(allMonths, (mo) => cntGroup(mo, c))}
                  totalBold
                />
              ))}
              <MonthRow grp label="합계" columns={allMonths} isFuture={isFuture} value={totGroupMonth} total={sumBy(allMonths, totGroupMonth)} totalBold />
              {!allPeriod && (
                <>
                  <MonthRow sub label={lastYearLabel} columns={allMonths} isFuture={isFuture} value={lastYearQuote} total={sumBy(months, lastYearQuote)} />
                  <MonthRow
                    sub
                    label="전년비"
                    columns={allMonths}
                    isFuture={isFuture}
                    value={(mo) => <DeltaSpan a={totGroupMonth(mo)} b={lastYearQuote(mo)} />}
                    total={<DeltaSpan a={sumBy(months, totGroupMonth)} b={sumBy(months, lastYearQuote)} />}
                  />
                </>
              )}
            </tbody>
          </table>
          )}
          <ShowMoreButton noun={groupNoun} total={groupRows.length} expanded={showAllRows} onToggle={() => setShowAllRows((v) => !v)} />
        </div>
      )}

      <TableFootnote
        basis={`${isRep ? '영업담당 기준' : '분류표 1차 기준'}${allPeriod ? '' : ' · 당월 전년 비교: 같은 날짜까지'}`}
      />
    </Card>
  );
};
