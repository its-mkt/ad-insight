/** 처음 열 때 다크 모드 여부 — 저장한 테마가 있으면 그것, 없으면 시스템 설정 */
export function getInitialDark(): boolean {
  try {
    const t = localStorage.getItem('theme');
    if (t) {
      document.documentElement.dataset.theme = t;
      return t === 'dark';
    }
  } catch {
    // ignore
  }
  const r = document.documentElement;
  return r.dataset.theme ? r.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme:dark)').matches;
}

/** 테마를 바꾸고 다음 방문을 위해 저장한다 */
export function applyTheme(dark: boolean): void {
  const theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('theme', theme);
  } catch {
    // ignore
  }
}
