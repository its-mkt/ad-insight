import React, { useEffect, useRef } from 'react';
import { FlaskConical } from 'lucide-react';
import { PreviewModeContext } from '../../context/PreviewModeContext';

/**
 * 흐리게 가리는 숫자 자리 — _views.scss 의 .preview-mode main 흐림 규칙과 같은 목록.
 * 실제 비중을 보여 주는 칸(.reveal)은 빠진다
 */
const MASKED = [
  'main .card:not(.preview-real) > :not(h3)',
  'main .card.preview-real td.n:not(.reveal)',
  'main .kpi .v',
  'main .kpi .d',
  'main .kpi .s',
  'main .kpi-detail',
].join(', ');

/** 글자·설명 속성에 남는 숫자를 * 로 */
const DIGITS = /\d/g;
const MASK_ATTRS = ['title', 'aria-label', 'data-tip', 'data-tip-desc'];

/**
 * 가려 둔 자리의 숫자를 * 로 바꾼다 (예: 1,567,851원 → *,***,***원).
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
        if (v && /\d/.test(v)) el.setAttribute(a, v.replace(DIGITS, '*'));
      });
    };
    const maskText = (node: Node) => {
      const v = node.nodeValue;
      if (v && /\d/.test(v) && node.parentElement?.closest(MASKED)) node.nodeValue = v.replace(DIGITS, '*');
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
  /** 화면 위에 띄울 로그인·회원가입 카드 내용 */
  children: React.ReactNode;
}

/**
 * 로그인 전 미리보기 — 대시보드를 예시 데이터(previewPayload)로 그대로 그리고, 숫자 자리는 흐리게 가린 채 로그인 카드를 띄운다.
 * 실제 데이터는 한 건도 받지 않는다 (웹앱도 로그인 토큰이 없으면 데이터를 주지 않는다, 2026-11-18 사용자 결정).
 * 화면을 보고 가입하고 싶어지게 실제와 같은 모양으로 보여 준다 (2026-11-19 사용자 결정)
 */
export const GuestPreview: React.FC<GuestPreviewProps> = ({ app, children }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  useMaskedNumbers(rootRef);
  return (
    <PreviewModeContext.Provider value>
      <div className="preview-mode" ref={rootRef}>
        {app}
      </div>
      <div className="preview-lock">
        <div className="preview-badge" role="note">
          <FlaskConical size="0.875rem" aria-hidden="true" />
          예시 데이터입니다 · 로그인하면 실제 수치를 볼 수 있습니다
        </div>
        <div className="card login-modal" role="region" aria-labelledby="access-gate-title">
          {children}
        </div>
      </div>
    </PreviewModeContext.Provider>
  );
};
