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
 * 숫자를 *** 로 — 숫자 덩어리(쉼표·소수점 포함)마다 자릿수와 상관없이 같은 길이(***)로 바꿔 글자 수로도 크기를 짐작하지 못하게 한다
 * (1,567,851원 → ***원). 날짜(2026-11·11/04·11월·2026년·18일)는 어느 때 값인지 알 수 있게 그대로 둔다
 */
// 영문자 바로 뒤 숫자(GA4 같은 이름의 일부)는 값이 아니라 남긴다
const TOKEN = /(?<![A-Za-z\d])(?:\d{4}-\d{2}(?:-\d{2})?|\d{1,2}\/\d{1,2}|\d[\d,.]*)/g;
const MASK = '***';
const maskDigits = (v: string): string =>
  v.replace(TOKEN, (m: string, at: number) => (/[-/]/.test(m) || /^\s*[년월일]/.test(v.slice(at + m.length)) ? m : MASK));

/** 값 글자를 가리는 표시 — 이 속성이 붙은 요소는 _views.scss 가 글자를 투명하게 하고 회색 자리표시 막대로 바꾼다 */
const MASK_ATTR = 'data-pv-mask';

/**
 * 값만 있는 짧은 글자인지 — ***·단위(원·건·회·개·만·억)·기호(% ▲▼ 괄호 등)를 빼면 글자가 두 자 이하일 때.
 * ***원 · ▲***% · ***만 (***%) 는 덮고, '(11월 · ***건)'·안내 문장처럼 다른 말이 섞인 글자는 *** 만 둔다
 */
const isValueText = (text: string): boolean => text.replace(/\*+|[\s원건회개만억%.,()▲▼+\-·/:|~]/g, '').length <= 2;
const MASK_ATTRS = ['title', 'aria-label', 'data-tip', 'data-tip-desc'];

/**
 * 숫자 자리의 글자를 *** 로 바꾸고(개발자 도구에서도 숫자가 보이지 않게) 그 글자를 회색 자리표시 막대로 바꾼다(어느 정도 수치인지 감도 오지 않게).
 * 미리보기 숫자는 예시라 실제 값은 아니지만 실제 실적으로 오해하지 않게 한다 (2026-11-19 사용자 결정 — * 는 개발자 도구용, 막대는 크기 짐작 방지용. 픽셀 모자이크·반투명 막대 대신 스켈레톤 같은 막대로).
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
      const parent = node.parentElement;
      if (!v || !parent?.closest(MASKED)) return;
      const masked = /\d/.test(v) ? maskDigits(v) : v;
      if (masked !== v) node.nodeValue = masked;
      // 가린 값이 든 글자는 화면에서도 막대로 바꿔 어느 정도 수치인지 감도 오지 않게 한다 (React 가 다루지 않는 속성이라 다시 그려도 남는다)
      // 차트(SVG) 글자와 문장 속 숫자는 *** 만 둔다 — 값만 있는 짧은 글자만 덮는다
      if (masked.includes(MASK) && !(parent instanceof SVGElement) && isValueText(parent.textContent || '') && !parent.hasAttribute(MASK_ATTR)) parent.setAttribute(MASK_ATTR, '');
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
