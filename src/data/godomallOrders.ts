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

/** 달별 제품·유입 경로별 판매 건수 (주문번호로 맞춘 값). 유입 기록을 시작한 달부터만 있다. 시트 godo_goods_inflow_monthly 에서 받는다 */
export const GODOMALL_GOODS_INFLOW: Record<string, { goodsNo: string; source: string; orders: number }[]> = {};

export function applyGodoGoodsInflow(rows: { month?: unknown; goods_no?: unknown; source?: unknown; orders?: unknown }[]): void {
  Object.keys(GODOMALL_GOODS_INFLOW).forEach((month) => delete GODOMALL_GOODS_INFLOW[month]);
  rows.forEach((r) => {
    const month = String(r.month ?? '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    (GODOMALL_GOODS_INFLOW[month] ??= []).push({ goodsNo: String(r.goods_no ?? ''), source: String(r.source ?? '미수집'), orders: Number(r.orders) || 0 });
  });
}

/** 구매 제품 표 펼침용 주문 줄 (주문 × 제품). 시트 godo_order_lines 에서 받는다. 고객 정보는 없다 */
export interface GodoOrderLine {
  /** 결제 달 'YYYY-MM' */
  month: string;
  /** 주문 키 (주문번호의 짧은 해시) — 관리자 전용 주문자 정보와 잇는 데 쓴다 */
  key: string;
  goodsNo: string;
  /** 주문(접수) 일시 'YYYY-MM-DD HH:mm' */
  placed: string;
  /** 결제 일시 'YYYY-MM-DD HH:mm' */
  paid: string;
  /** 고도몰 주문 상태 코드 (d2, c1 …) */
  status: string;
  /** 고도몰 결제 수단 코드 (pc, gb …) */
  settle: string;
  /** '회원' | '비회원' */
  member: string;
  qty: number;
  amount: number;
  /** 유입 경로 (화면 이름, 모르면 '미수집') */
  source: string;
  /** 경로 근거: '기록'(주문 완료 화면 기록) | 'GA4'(접수일 GA4 경로) | '' */
  basis: string;
  /** 유입 상세 (검색어·광고 종류·첫 페이지) — 기록이 있는 주문만 */
  detail: string;
  /** 고도몰 주문 형태 (pc · mobile · write …). 수집 전 줄은 빈 값 */
  device: string;
}

export const GODOMALL_ORDER_LINES: GodoOrderLine[] = [];

export function applyGodoOrderLines(rows: Record<string, unknown>[]): void {
  GODOMALL_ORDER_LINES.length = 0;
  const s = (v: unknown) => String(v ?? '');
  rows.forEach((r) => {
    const month = s(r.month).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    GODOMALL_ORDER_LINES.push({
      month, key: s(r.key), goodsNo: s(r.goods_no), placed: s(r.placed), paid: s(r.paid), status: s(r.status), settle: s(r.settle), member: s(r.member),
      qty: Number(r.qty) || 0, amount: Number(r.amount) || 0, source: s(r.source) || '미수집', basis: s(r.basis), detail: s(r.detail), device: s(r.device),
    });
  });
}

/** 마케팅용 주문자 정보 — 관리자 로그인 응답에만 있는 시트 godo_order_customers. 주문 키로 찾는다 (이름·연락처·주소·주문번호는 수집하지 않는다) */
export interface GodoOrderCustomer {
  /** 회원 등급 (비회원이면 빈 값) */
  memberGroup: string;
  /** 주문자 이메일 도메인 — 회사 메일이면 어느 회사인지 알 수 있다 */
  emailDomain: string;
}

export const GODOMALL_ORDER_CUSTOMERS = new Map<string, GodoOrderCustomer>();

export function applyGodoOrderCustomers(rows: Record<string, unknown>[]): void {
  GODOMALL_ORDER_CUSTOMERS.clear();
  const s = (v: unknown) => String(v ?? '').trim();
  rows.forEach((r) => {
    if (!s(r.key)) return;
    GODOMALL_ORDER_CUSTOMERS.set(s(r.key), { memberGroup: s(r.member_group), emailDomain: s(r.email_domain) });
  });
}

/** 고도몰 주문 상태 코드 → 화면 이름 (모르는 코드는 코드 그대로) */
export function orderStatusLabel(code: string): string {
  const exact: Record<string, string> = { d1: '배송 중', d2: '배송 완료' };
  const byKind: Record<string, string> = { o: '입금 대기', p: '결제 완료', g: '상품 준비', d: '배송', s: '구매 확정', c: '취소', r: '환불', b: '반품', e: '교환', f: '결제 실패' };
  return exact[code] ?? byKind[code.charAt(0)] ?? code;
}

/** 고도몰 결제 수단 코드 → 화면 이름 (모르는 코드는 코드 그대로) */
export function settleLabel(code: string): string {
  const labels: Record<string, string> = {
    pc: '신용카드', pb: '계좌이체', pv: '가상계좌', ph: '휴대폰', gb: '무통장 입금',
    ec: '에스크로 신용카드', eb: '에스크로 계좌이체', ev: '에스크로 가상계좌',
  };
  return labels[code] ?? code;
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

/** 달 목록('YYYY-MM')의 판매 건수 합 — 수집 범위 안의 달이 하나도 없으면 null */
/** 판매를 세는 마지막 날 — 로그인하지 않으면 어제까지만 센다 (App 이 정한다, 빈 값이면 제한 없음) */
let SALES_CUTOFF = '';
export const setSalesCutoff = (day: string) => {
  SALES_CUTOFF = day;
};
export const salesCutoff = () => SALES_CUTOFF;

export function salesInMonths(months: string[]): number | null {
  if (SALES_CUTOFF) {
    // 마지막 날이 든 달은 일별 판매로 1일~마지막 날만, 그 뒤 달은 세지 않는다
    const cm = SALES_CUTOFF.slice(0, 7);
    const parts = months.filter((m) => m <= cm).map((m) => (m === cm ? salesInRange(`${m}-01`, SALES_CUTOFF) : m in GODOMALL_ORDERS ? GODOMALL_ORDERS[m] : null));
    return parts.some((n) => n !== null) ? parts.reduce<number>((sum, n) => sum + (n ?? 0), 0) : null;
  }
  return months.some((m) => m in GODOMALL_ORDERS) ? months.reduce((sum, m) => sum + (GODOMALL_ORDERS[m] ?? 0), 0) : null;
}

/** 날짜 범위('YYYY-MM-DD', 양끝 포함)의 판매 건수 합. 일별 값은 주문이 있는 날만 있으므로, 수집 시작일 이후 범위면 빈 날은 0건으로 본다 */
export function salesInRange(from: string, to: string): number | null {
  const first = GODOMALL_DAILY.reduce((min, r) => (!min || r.date < min ? r.date : min), '');
  if (!first || to < first) return null;
  const end = SALES_CUTOFF && SALES_CUTOFF < to ? SALES_CUTOFF : to;
  return GODOMALL_DAILY.reduce((sum, r) => (r.date >= from && r.date <= end ? sum + r.paid : sum), 0);
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
