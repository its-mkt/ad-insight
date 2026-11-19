import { createContext, useContext } from 'react';

/**
 * 로그인 전 미리보기 — 접속 화면(AccessGate)이 대시보드를 예시 데이터로 그리게 할 때 true.
 * 켜지면 useDashboardData 가 웹앱에 요청하지 않고 previewPayload() 로 화면을 채운다.
 */
export const PreviewModeContext = createContext(false);

/** 지금 화면이 로그인 전 미리보기인지 */
export const usePreviewMode = () => useContext(PreviewModeContext);

/** 미리보기의 로그인·회원가입 창을 여는 신호 (GuestPreview 가 듣는다) */
export const OPEN_PREVIEW_LOGIN_EVENT = 'adi:open-preview-login';

/** 미리보기의 로그인·회원가입 창을 연다 (헤더의 로그인·검색 버튼) */
export const openPreviewLogin = () => window.dispatchEvent(new Event(OPEN_PREVIEW_LOGIN_EVENT));
