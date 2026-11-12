import { THIS_M, ym } from './format';

// 이번 달(THIS_M)·게스트 공개 범위 등은 처음 열 때 정해지므로, 열어 둔 채 달이 바뀌면 새로 불러와야 맞는 달로 보인다

let unsaved = false;

/** 저장하지 않은 수정이 있는 동안(어드민 카테고리 수정 중)은 달이 바뀌어도 새로고침하지 않는다 */
export const setUnsavedEdits = (value: boolean): void => {
  unsaved = value;
};

const monthNow = (): string => {
  const d = new Date();
  return ym(d.getFullYear(), d.getMonth() + 1);
};

/** 달이 바뀌었으면 화면을 보고 있을 때 한 번 새로 불러온다. 정리 함수를 돌려준다 */
export function watchMonthRollover(): () => void {
  const check = () => {
    if (!unsaved && document.visibilityState === 'visible' && monthNow() !== THIS_M) window.location.reload();
  };
  const timer = window.setInterval(check, 60 * 1000);
  document.addEventListener('visibilitychange', check);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', check);
  };
}
