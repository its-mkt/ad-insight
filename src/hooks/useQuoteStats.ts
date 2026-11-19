import { useMemo } from 'react';
import type { DashboardData, QuoteRow, QuoteRawRow } from '../types/dashboard';
import { quoteStatsOf } from '../utils/quoteStats';

/** quoteStatsOf 를 견적 원본이 바뀔 때만 다시 계산한다 (화면마다 같은 메모를 복사하지 않게) */
export function useQuoteStats(
  data: Pick<DashboardData, 'quotes' | 'quotesRaw' | 'quotesExtra'> & Partial<Pick<DashboardData, 'quotesSites' | 'quotesPhone'>>
): { quotes: QuoteRow[]; quotesRaw: QuoteRawRow[] } {
  const { quotes, quotesRaw, quotesExtra, quotesSites, quotesPhone } = data;
  return useMemo(
    () => quoteStatsOf({ quotes, quotesRaw, quotesExtra, quotesSites, quotesPhone }),
    [quotes, quotesRaw, quotesExtra, quotesSites, quotesPhone]
  );
}
