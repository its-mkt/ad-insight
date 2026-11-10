/**
 * 아이티켓 고도몰 관리자 > 통계 > 주문통계(월별)의 '구매건수'.
 * 결제완료 일자 기준이고 고객 정보는 담지 않는다. 시트(godo_orders_monthly)를 받기 전에 보여 주는 초기값이며, 시트 값이 오면 applyGodoOrders 로 덮는다.
 */
export let GODOMALL_ORDERS_AS_OF = '2026-11-09';

export const GODOMALL_ORDERS: Record<string, number> = {
  '2022-01': 3, '2022-02': 4, '2022-03': 7, '2022-04': 7, '2022-05': 4, '2022-06': 6, '2022-07': 7,
  '2022-08': 10, '2022-09': 8, '2022-10': 5, '2022-11': 8, '2022-12': 8,
  '2023-01': 11, '2023-02': 10, '2023-03': 18, '2023-04': 4, '2023-05': 6, '2023-06': 9,
  '2023-07': 9, '2023-08': 8, '2023-09': 9, '2023-10': 6, '2023-11': 6, '2023-12': 7,
  '2024-01': 11, '2024-02': 8, '2024-03': 7, '2024-04': 7, '2024-05': 10, '2024-06': 8,
  '2024-07': 3, '2024-08': 6, '2024-09': 4, '2024-10': 7, '2024-11': 10, '2024-12': 6,
  '2025-01': 7, '2025-02': 5, '2025-03': 6, '2025-04': 5, '2025-05': 4, '2025-06': 6,
  '2025-07': 7, '2025-08': 16, '2025-09': 8, '2025-10': 8, '2025-11': 11, '2025-12': 8,
  '2026-01': 9, '2026-02': 8, '2026-03': 14, '2026-04': 14, '2026-05': 12, '2026-06': 18,
  '2026-07': 13, '2026-08': 7, '2026-09': 11, '2026-10': 7, '2026-11': 3,
};

/** 수집 시트의 월별 건수를 반영한다. servedAt 은 응답 시각('YYYY-MM-DD HH:mm') */
export function applyGodoOrders(rows: { month?: unknown; count?: unknown }[], servedAt?: string): void {
  if (!rows.length) return;
  rows.forEach((r) => {
    const month = String(r.month ?? '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(month)) GODOMALL_ORDERS[month] = Number(r.count) || 0;
  });
  if (servedAt) GODOMALL_ORDERS_AS_OF = servedAt.slice(0, 10);
}

export interface GodoGoodsRow {
  no: string;
  name: string;
  orders: number;
  qty: number;
  amount: number;
}

/** 달별 판매 제품 (결제완료일 기준). 고객별 일회성 결제 상품은 수집 단계에서 '개별 결제 상품'으로 묶는다. 시트 godo_goods_monthly 에서 받는다 */
export const GODOMALL_GOODS: Record<string, GodoGoodsRow[]> = {};

export function applyGodoGoods(rows: { month?: unknown; goods_no?: unknown; goods_name?: unknown; orders?: unknown; qty?: unknown; amount?: unknown }[]): void {
  Object.keys(GODOMALL_GOODS).forEach((month) => delete GODOMALL_GOODS[month]);
  rows.forEach((r) => {
    const month = String(r.month ?? '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    (GODOMALL_GOODS[month] ??= []).push({ no: String(r.goods_no ?? ''), name: String(r.goods_name ?? ''), orders: Number(r.orders) || 0, qty: Number(r.qty) || 0, amount: Number(r.amount) || 0 });
  });
}

export interface GodoDailyRow {
  /** 'YYYY-MM-DD' */
  date: string;
  /** 그날 결제된 주문 (판매 건수와 같은 기준) */
  paid: number;
  /** 그날 쇼핑몰 화면에서 접수된 주문 (입금 대기 포함, 결제 실패 제외, GA4 가 완료 화면으로 세는 대상) */
  reached: number;
  /** 그날 결제됐지만 쇼핑몰 화면 밖에서 접수된 주문 (네이버페이 등) */
  notWeb: number;
}

/** GA4 와 같은 기준으로 비교하는 일별 주문 건수. 시트 godo_orders_daily 에서 받으며, 주문이 있는 날만 있다 */
export const GODOMALL_DAILY: GodoDailyRow[] = [];

export function applyGodoDaily(rows: { date?: unknown; paid?: unknown; reached?: unknown; not_web?: unknown }[]): void {
  GODOMALL_DAILY.length = 0;
  rows.forEach((r) => {
    const date = String(r.date ?? '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) GODOMALL_DAILY.push({ date, paid: Number(r.paid) || 0, reached: Number(r.reached) || 0, notWeb: Number(r.not_web) || 0 });
  });
}

/** 주문번호로 실제 결제 주문과 맞춘 달별·매체별 판매 건수. 유입 경로를 기록하기 시작한 달부터만 있다 */
export const GODOMALL_ORDER_INFLOW: Record<string, Record<string, number>> = {};

export function applyGodoOrderInflow(rows: { month?: unknown; source?: unknown; count?: unknown }[]): void {
  Object.keys(GODOMALL_ORDER_INFLOW).forEach((month) => delete GODOMALL_ORDER_INFLOW[month]);
  rows.forEach((r) => {
    const month = String(r.month ?? '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    (GODOMALL_ORDER_INFLOW[month] ??= {})[String(r.source ?? '미수집')] = Number(r.count) || 0;
  });
}
