import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, FlaskConical } from 'lucide-react';
import { OPEN_PREVIEW_LOGIN_EVENT, PreviewModeContext } from '../../context/PreviewModeContext';
import { Modal } from '../common/Modal';

/**
 * 숫자를 * 로 바꾸는 자리 — _views.scss 의 .preview-mode main 규칙(누르지 못하게 막는 자리)과 거의 같고, 카드 제목 줄까지 넓다.
 * 실제 비중을 보여 주는 칸(.reveal)은 빠진다
 */
const MASKED = [
  // 카드 제목 줄도 포함 — '(11월 · 60건)' 같은 보조 글자의 건수를 가린다 (날짜는 maskDigits 가 남긴다)
  'main .card:not(.preview-real)',
  'main .card.preview-real td.n:not(.reveal)',
  'main .kpi .v',
  'main .kpi .d',
  'main .kpi .s',
  'main .kpi-detail',
].join(', ');

/**
 * 숫자를 * 로 — 날짜(2026-11·11/04·11월·2026년·18일)는 어느 때 값인지 알 수 있게 그대로 둔다.
 * 숫자 덩어리(쉼표·소수점 포함)마다 보고, 날짜 모양이거나 바로 뒤에 년·월·일이 붙으면 남긴다
 */
const TOKEN = /\d{4}-\d{2}(?:-\d{2})?|\d{1,2}\/\d{1,2}|\d[\d,.]*/g;
const maskDigits = (v: string): string =>
  v.replace(TOKEN, (m: string, at: number) => (/[-/]/.test(m) || /^\s*[년월일]/.test(v.slice(at + m.length)) ? m : m.replace(/\d/g, '*')));
const MASK_ATTRS = ['title', 'aria-label', 'data-tip', 'data-tip-desc'];

/**
 * 숫자 자리의 글자를 * 로 바꾼다 (예: 1,567,851원 → *,***,***원). 흐리게 가리지 않고 또렷하게 보여 비로그인 사람이 궁금해지게 한다.
 * 미리보기 숫자는 예시라 실제 값은 아니지만, 개발자 도구로 보고 실제 실적으로 오해하지 않게 화면 글자에서도 지운다 (2026-11-19 사용자 결정).
 * React 가 값을 다시 그려도 바로 다시 가린다.
 */
function useMaskedNumbers(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const maskElement = (el: Element) => {
      if (!el.closest(MASKED)) return;
      MASK_ATTRS.forEach((a) => {
        const v = el.getAttribute(a);
        if (!v || !/\d/.test(v)) return;
        const masked = maskDigits(v);
        // 바뀔 때만 쓴다 — 날짜처럼 숫자를 남기는 글자에 같은 값을 다시 쓰면 감시가 끝없이 다시 불린다
        if (masked !== v) el.setAttribute(a, masked);
      });
    };
    const maskText = (node: Node) => {
      const v = node.nodeValue;
      if (!v || !/\d/.test(v) || !node.parentElement?.closest(MASKED)) return;
      const masked = maskDigits(v);
      if (masked !== v) node.nodeValue = masked;
    };
    const maskTree = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) return maskText(node);
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as Element;
      maskElement(el);
      el.querySelectorAll('*').forEach(maskElement);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) maskText(t);
    };
    maskTree(root);
    const observer = new MutationObserver((records) =>
      records.forEach((r) => {
        if (r.type === 'characterData') maskText(r.target);
        else if (r.type === 'attributes') maskElement(r.target as Element);
        else r.addedNodes.forEach(maskTree);
      })
    );
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: MASK_ATTRS });
    return () => observer.disconnect();
  }, [rootRef]);
}

interface GuestPreviewProps {
  /** 미리보기로 그릴 대시보드 (App) */
  app: React.ReactNode;
  /** 회원가입 도중이라 로그인·회원가입 창을 닫지 못하게 계속 띄울지 */
  keepOpen?: boolean;
  /** 로그인·회원가입 창 내용 */
  children: React.ReactNode;
}

/**
 * 로그인 전 미리보기 — 대시보드를 예시 데이터(previewPayload)로 그대로 그리고 숫자는 * 로 바꾼다. 메뉴·화면은 자유롭게 둘러보고,
 * 로그인·회원가입 창은 헤더 로그인 버튼이나 예시 데이터 표시를 누를 때만 띄운다 (2026-11-19 사용자 결정).
 * 실제 데이터는 한 건도 받지 않는다 (웹앱도 로그인 토큰이 없으면 데이터를 주지 않는다, 2026-11-18 사용자 결정).
 * 화면을 보고 가입하고 싶어지게 실제와 같은 모양으로 보여 준다 (2026-11-19 사용자 결정)
 */
export const GuestPreview: React.FC<GuestPreviewProps> = ({ app, keepOpen = false, children }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  useMaskedNumbers(rootRef);
  // 로그인·회원가입 창 — 처음에는 닫아 두어 메뉴·화면을 둘러보게 하고, 헤더 로그인 버튼이나 예시 데이터 표시를 누르면 연다
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_PREVIEW_LOGIN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PREVIEW_LOGIN_EVENT, onOpen);
  }, []);
  return (
    <PreviewModeContext.Provider value>
      <div className="preview-mode" ref={rootRef}>
        {app}
      </div>
      {!(open || keepOpen) && (
        <div className="preview-lock">
          <button type="button" className="preview-badge" data-btn="preview-login" onClick={() => setOpen(true)}>
            <FlaskConical size="0.875rem" aria-hidden="true" />
            <span className="preview-badge-long">로그인하면 실제 수치를 확인할 수 있습니다</span>
            <span className="preview-badge-short">실제 수치는 로그인 후 확인</span>
            <span className="preview-badge-cta">
              로그인
              <ArrowRight size="0.875rem" aria-hidden="true" />
            </span>
          </button>
        </div>
      )}
      {/* 회원가입 도중(인증 후 정보 입력)에는 닫지 못하게 계속 띄운다 */}
      <Modal open={open || keepOpen} onClose={() => setOpen(false)} dismissible={!keepOpen} labelledBy="access-gate-title" backdropClassName="preview-login">
        {children}
      </Modal>
    </PreviewModeContext.Provider>
  );
};
