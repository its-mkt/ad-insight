import React, { useState } from 'react';
import type { DashboardData, QuoteRawRow } from '../types/dashboard';
import { ViewHeader } from '../components/common/ViewHeader';
import { QuotesRawAdminTable, type QuoteChannel } from '../components/admin/QuotesRawAdminTable';
import { SegmentedControl } from '../components/common/SegmentedControl';
import { getCfg, quoteDetailsPending } from '../hooks/useDashboardData';
import { useAuth } from '../context/AuthContext';
import { quoteKey } from '../utils/format';
import type { DayRange } from '../utils/dayRange';

const CHANNEL_OPTIONS: { value: QuoteChannel; label: string }[] = [
  { value: 'live', label: '견적문의' },
  { value: 'phone', label: '전화문의' },
];

/** 표에 올릴 행 — 아이티켓은 2026-10 이후만, 다른 사이트는 건수가 적어 전체를 보여 준다 */
const toAdminRows = (raw: QuoteRawRow[], sites: QuoteRawRow[]): QuoteRawRow[] => [
  ...raw.filter((r) => r.date >= '2026-10'),
  ...sites,
];

interface AdminViewProps {
  data: DashboardData;
  /** 실데이터를 받는 중 (화면은 저장해 둔 이전 데이터로 먼저 그린다) */
  isSyncing?: boolean;
  /** 상단 기간 바에서 고른 달 (YYYY-MM) */
  selectedMonth: string;
  /** 상단 기간 바의 전체 기간 */
  allPeriod?: boolean;
  /** 상단 기간 바의 연도 합계 */
  yearTotal?: boolean;
  /** 상단 기간 바의 일·기간 선택 */
  dayRange?: DayRange | null;
  onUpdateQuotesRaw?: (newQuotes: QuoteRawRow[]) => void;
  onUpdateQuotesSites?: (newQuotes: QuoteRawRow[]) => void;
  /** 저장 후 서버에서 다시 계산한 데이터를 받아 온다 */
  onReload?: () => void;
}

export const AdminView: React.FC<AdminViewProps> = ({ data, isSyncing = false, selectedMonth, allPeriod, yearTotal, dayRange, onUpdateQuotesRaw, onUpdateQuotesSites, onReload }) => {
  const [localQuotes, setLocalQuotes] = useState<QuoteRawRow[]>(() =>
    toAdminRows(data.quotesRaw || [], data.quotesSites || [])
  );
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [channel, setChannel] = useState<QuoteChannel>('live');
  // 수동 변경된 행(quoteKey) → 새 카테고리 추적 (저장 시 Apps Script로 전송)
  const [pendingOverrides, setPendingOverrides] = useState<Map<string, string>>(new Map());
  // 저장 전 변경의 원래 값 (quoteKey → 처음 바꾸기 전 카테고리) — 표에 '이전: ○○' 흔적으로 보여 준다
  const [originals, setOriginals] = useState<Map<string, string>>(new Map());
  const { user } = useAuth();

  // 수정을 시작하기 전 전체 원장 — 되돌리기 때 이 상태로 돌린다
  const baseQuotes = React.useRef<QuoteRawRow[]>(data.quotesRaw || []);
  const baseSites = React.useRef<QuoteRawRow[]>(data.quotesSites || []);

  // 저장해 둔 이전 데이터로 먼저 그린 뒤 실데이터가 오면 바꿔 끼운다 (수정 중이면 그대로 둔다)
  React.useEffect(() => {
    if (!isDirty && data.quotesRaw?.length) {
      baseQuotes.current = data.quotesRaw;
      baseSites.current = data.quotesSites || [];
      setLocalQuotes(toAdminRows(data.quotesRaw, data.quotesSites || []));
    }
  }, [data.quotesRaw, data.quotesSites, isDirty]);

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // 저장 성공 안내는 표를 가리지 않도록 잠시 뒤 닫는다 (실패 안내는 다시 시도할 때까지 둔다)
  React.useEffect(() => {
    if (!saveMsg?.ok) return;
    const timer = window.setTimeout(() => setSaveMsg(null), 6000);
    return () => window.clearTimeout(timer);
  }, [saveMsg]);

  // 개별 행 카테고리 수동 지정 변경 — 변경된 행을 pendingOverrides에 기록
  const handleUpdateQuoteCategory = (idOrIndex: string | number, newCategory: string) => {
    let changedSno: string | undefined;
    let changedId: string | undefined;
    let changedIsSite = false;
    let prevCategory = '';
    const updated = localQuotes.map((q, idx) => {
      const match = typeof idOrIndex === 'string' ? q.id === idOrIndex : idx === idOrIndex;
      if (match) {
        changedSno = q.sno != null && q.sno !== '' ? quoteKey(q) : '';
        changedId = q.id;
        changedIsSite = !!q.site;
        prevCategory = q.category;
        return { ...q, category: newCategory };
      }
      return q;
    });
    setLocalQuotes(updated);
    setIsDirty(true);
    setSaveMsg(null);
    if (changedSno) {
      const sno = changedSno;
      const original = originals.has(sno) ? originals.get(sno)! : prevCategory;
      // 원래 값으로 되돌리면 저장할 변경에서 뺀다
      if (newCategory === original) {
        setPendingOverrides((prev) => {
          const next = new Map(prev);
          next.delete(sno);
          return next;
        });
        setOriginals((prev) => {
          const next = new Map(prev);
          next.delete(sno);
          return next;
        });
      } else {
        setPendingOverrides((prev) => new Map(prev).set(sno, newCategory));
        setOriginals((prev) => (prev.has(sno) ? prev : new Map(prev).set(sno, original)));
      }
    }
    // 화면에는 10월 이후만 보이지만 앱 전체 원장은 지난달까지 들고 있다 — 바뀐 한 건만 갈아 끼운다
    if (changedId) {
      const withChange = (rows: QuoteRawRow[]) => rows.map((q) => (q.id === changedId ? { ...q, category: newCategory } : q));
      if (changedIsSite) onUpdateQuotesSites?.(withChange(data.quotesSites || []));
      else onUpdateQuotesRaw?.(withChange(data.quotesRaw));
    }
  };

  // Apps Script manual_categories 시트에 오버라이드 저장 → 서버가 바로 quotes_monthly 재산출 (실패하면 다음 정기 수집 때)
  const handleSaveOverrides = async () => {
    if (pendingOverrides.size === 0) {
      setSaveMsg({ text: '저장할 변경사항이 없습니다.', ok: false });
      return;
    }
    setSaving(true);
    setSaveMsg(null);

    const { url, key } = getCfg();
    const overrides = Array.from(pendingOverrides.entries()).map(([sno, category]) => ({ sno, category }));
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ key, action: 'saveManualCategories', overrides, by: user?.email || user?.name || '' }),
      });
      const json = await res.json();
      if (json.success) {
        // recalculated 가 없으면 아직 이전 버전 웹앱이다 — 정기 수집 때 반영된다
        if (json.recalculated === true) {
          setSaveMsg({ text: `${overrides.length}건 저장하고 통계에 반영했습니다.`, ok: true });
        } else if (json.recalculated === false) {
          setSaveMsg({ text: `${overrides.length}건 저장했지만 통계 반영에 실패했습니다. 다음 동기화(최대 1시간) 때 반영됩니다.`, ok: false });
        } else {
          setSaveMsg({ text: `${overrides.length}건 저장됨. 다음 동기화(최대 1시간) 후 반영됩니다.`, ok: true });
        }
        // 저장한 행은 '수동 지정' 흔적으로 바로 바꿔 보여 준다 (다음 동기화 전에도)
        const at = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 19);
        const by = user?.email || user?.name || undefined;
        setLocalQuotes((prev) =>
          prev.map((q) => {
            const cat = pendingOverrides.get(quoteKey(q));
            return cat ? { ...q, manual: { category: cat, at, ...(by ? { by } : {}) } } : q;
          })
        );
        setPendingOverrides(new Map());
        setOriginals(new Map());
        setIsDirty(false);
        if (json.recalculated === true) onReload?.();
      } else {
        setSaveMsg({ text: json.error || '저장 실패', ok: false });
      }
    } catch (err: any) {
      setSaveMsg({ text: err.message || '네트워크 오류', ok: false });
    }
    setSaving(false);
  };

  // 변경사항 되돌리기 (최초 로드 상태로 리셋)
  const handleResetChanges = () => {
    if (confirm('저장하지 않은 모든 카테고리 수동 변경사항을 되돌리시겠습니까?')) {
      const original = baseQuotes.current;
      setLocalQuotes(toAdminRows(original, baseSites.current));
      setIsDirty(false);
      setPendingOverrides(new Map());
      setOriginals(new Map());
      setSaveMsg(null);
      if (onUpdateQuotesRaw) onUpdateQuotesRaw(original);
      if (onUpdateQuotesSites) onUpdateQuotesSites(baseSites.current);
    }
  };

  // 로그인한 관리자에게만 그려진다 (App 에서 막는다)
  return (
    <div className="admin-view">
      <ViewHeader
        title="어드민 관리"
        description="견적 접수 원본 리스트(Google 시트) 및 표준 카테고리 수동 지정 · 데이터 저장 관리"
        status="live"
      />

      {/* 아래 카드 전체(제목·열·필터)가 바뀌는 전환이라 카드 밖 머리말 아래에 둔다 */}
      <div className="admin-channel">
        <SegmentedControl<QuoteChannel> id="seg-quote-channel" options={CHANNEL_OPTIONS} value={channel} onChange={setChannel} />
      </div>

      {/* 견적 원본 스프레드시트 관리 테이블 */}
      <div className="admin-body">
        <QuotesRawAdminTable
          quotes={localQuotes}
          channel={channel}
          selectedMonth={selectedMonth}
          allPeriod={allPeriod}
          yearTotal={yearTotal}
          dayRange={dayRange}
          phoneQuotes={data.quotesPhone || []}
          originals={originals}
          loading={isSyncing}
          detailsPending={quoteDetailsPending(data, isSyncing, true)}
          onUpdateQuoteCategory={handleUpdateQuoteCategory}
          changedCount={pendingOverrides.size}
          onSave={handleSaveOverrides}
          onReset={handleResetChanges}
          saving={saving}
          saveMsg={saveMsg}
        />
      </div>
    </div>
  );
};
