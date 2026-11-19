import React, { useEffect, useSyncExternalStore } from 'react';
import { CircleCheck, TriangleAlert, X } from 'lucide-react';

/** ok: 성공(초록, 잠시 뒤 자동으로 닫힘) · warn: 주의·부분 실패(주황) · error: 실패(빨강) — warn·error 는 직접 닫을 때까지 둔다 */
export type ToastTone = 'ok' | 'warn' | 'error';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: React.ReactNode;
}

/** 성공 토스트가 떠 있는 시간 */
const OK_MS = 3000;
/** 한 번에 쌓아 두는 최대 개수 — 넘치면 오래된 것부터 지운다 */
const MAX = 4;

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getSnapshot = () => items;

/** 토스트를 닫는다 */
export function dismissToast(id: number): void {
  items = items.filter((t) => t.id !== id);
  emit();
}

/**
 * 화면 위 가운데에 짧은 결과 알림을 띄운다 — 어느 화면·함수에서나 부를 수 있다 (ToastHost 가 그린다).
 * 저장·승인처럼 결과를 바로 알려야 하는 동작에 쓰고, 계속 보여야 하는 경고는 화면 안 Notice 로 둔다
 */
export function showToast(message: React.ReactNode, tone: ToastTone = 'ok'): number {
  const id = ++seq;
  items = [...items, { id, tone, message }].slice(-MAX);
  emit();
  return id;
}

const ToastView: React.FC<{ item: ToastItem }> = ({ item }) => {
  // 성공은 잠시 뒤 닫고, 주의·실패는 읽고 닫을 수 있게 둔다
  useEffect(() => {
    if (item.tone !== 'ok') return;
    const t = window.setTimeout(() => dismissToast(item.id), OK_MS);
    return () => window.clearTimeout(t);
  }, [item]);
  const Icon = item.tone === 'ok' ? CircleCheck : TriangleAlert;
  return (
    <div className={`toast ${item.tone}`} role={item.tone === 'ok' ? 'status' : 'alert'}>
      <Icon size="1rem" aria-hidden="true" />
      <span className="toast-msg">{item.message}</span>
      <button type="button" className="toast-close" aria-label="알림 닫기" onClick={() => dismissToast(item.id)}>
        <X size="0.875rem" aria-hidden="true" />
      </button>
    </div>
  );
};

/** 토스트 자리 — 앱에 한 번만 둔다 (App). 헤더 바로 아래 가운데에 쌓인다 */
export const ToastHost: React.FC = () => {
  const list = useSyncExternalStore(subscribe, getSnapshot);
  if (!list.length) return null;
  return (
    <div className="toast-host" aria-live="polite">
      {list.map((t) => (
        <ToastView key={t.id} item={t} />
      ))}
    </div>
  );
};
