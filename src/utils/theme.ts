import { readString, removeKey, writeString } from './storage';

/** 테마를 바꾸고 다음 방문을 위해 저장한다 */
export function applyTheme(dark: boolean): void {
  const theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  writeString('theme', theme);
}

/** 테마 고르기 — light·dark 는 저장해 고정, system 은 저장을 지우고 시스템 설정(다크 모드 여부)을 따른다 */
export type ThemeMode = 'light' | 'dark' | 'system';

/** 지금 고른 테마 — 저장한 값이 없으면 system */
export function getThemeMode(): ThemeMode {
  const t = readString('theme');
  if (t === 'light' || t === 'dark') return t;
  return 'system';
}

/** 테마를 고르고, 그 결과 다크 모드인지 돌려준다 */
export function applyThemeMode(mode: ThemeMode): boolean {
  if (mode !== 'system') {
    applyTheme(mode === 'dark');
    return mode === 'dark';
  }
  delete document.documentElement.dataset.theme;
  removeKey('theme');
  return window.matchMedia('(prefers-color-scheme:dark)').matches;
}
