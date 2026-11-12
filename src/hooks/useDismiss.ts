import { useEffect, type RefObject } from 'react';

/**
 * 열린 메뉴·목록을 바깥 클릭이나 Esc 로 닫는다.
 * @param ref 이 요소 안을 누르면 닫지 않는다
 * @param open 열려 있을 때만 듣는다
 * @param close 닫을 때 부를 함수
 */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // close 는 setState 를 부르는 함수라 바뀌어도 다시 달 필요가 없다
  }, [open]);
}
