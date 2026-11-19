import React, { useLayoutEffect, useRef, useState, useEffect } from 'react';
import { Settings, type LucideIcon } from 'lucide-react';
import { useDismiss } from '../../hooks/useDismiss';

export interface ActionMenuItem {
  /** 항목 구분용 키 */
  key: string;
  /** 메뉴에 보이는 이름 */
  label: string;
  /** 이름 앞 아이콘 */
  icon?: LucideIcon;
  /** 눌렀을 때 할 일 (메뉴는 닫힌다) */
  onSelect: () => void;
  /** 삭제처럼 되돌릴 수 없는 항목 — 경고색으로 보인다 */
  danger?: boolean;
  /** 있으면 한 번 누를 때 이 문구로 바뀌고, 한 번 더 눌러야 실행한다 (예: '한 번 더 누르면 삭제') */
  confirmLabel?: string;
  disabled?: boolean;
}

interface ActionMenuProps {
  /** 메뉴 항목 — 비어 있으면 버튼을 그리지 않는다 */
  items: ActionMenuItem[];
  /** 버튼 이름 (스크린 리더·툴팁) */
  ariaLabel: string;
  /** 버튼 아이콘 (기본: 설정 톱니) */
  icon?: LucideIcon;
  /** 처리 중이라 누를 수 없을 때 */
  disabled?: boolean;
  /** 메뉴를 버튼의 어느 끝에 맞출지 — start: 왼쪽 끝 · end: 오른쪽 끝(기본) */
  align?: 'start' | 'end';
}

/**
 * 아이콘 버튼을 누르면 할 일 목록을 띄우는 메뉴 — 표 줄마다 버튼 여러 개를 늘어놓는 대신 쓴다.
 * 표 스크롤 영역에 잘리지 않게 화면 기준으로 띄우고(아래가 모자라면 위로), 바깥 클릭·Esc·스크롤에 닫는다
 */
export const ActionMenu: React.FC<ActionMenuProps> = ({ items, ariaLabel, icon: Icon = Settings, disabled, align = 'end' }) => {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState('');
  const [style, setStyle] = useState<React.CSSProperties>();
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setArmed('');
  };
  useDismiss(rootRef, open, close);

  // 버튼 한쪽 끝(align)에 맞춰 아래로, 공간이 모자라면 위로 펼친다
  useLayoutEffect(() => {
    if (!open || !btnRef.current || !menuRef.current) {
      setStyle(undefined);
      return;
    }
    const GAP = 4;
    const MARGIN = 8;
    const b = btnRef.current.getBoundingClientRect();
    const { offsetHeight, offsetWidth } = menuRef.current;
    const below = window.innerHeight - b.bottom - GAP - MARGIN;
    const down = offsetHeight <= below || below >= b.top - GAP - MARGIN;
    setStyle({
      position: 'fixed',
      left: Math.max(MARGIN, Math.min(align === 'start' ? b.left : b.right - offsetWidth, window.innerWidth - offsetWidth - MARGIN)),
      top: down ? b.bottom + GAP : 'auto',
      bottom: down ? 'auto' : window.innerHeight - b.top + GAP,
    });
  }, [open, align]);

  // 화면 기준으로 띄운 메뉴는 버튼을 따라가지 않으므로 바깥이 스크롤·크기 변경되면 닫는다
  useEffect(() => {
    if (!open) return;
    const startTop = btnRef.current?.getBoundingClientRect().top ?? 0;
    const onScroll = () => {
      if (Math.abs((btnRef.current?.getBoundingClientRect().top ?? startTop) - startTop) > 1) close();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (!items.length) return null;

  const pick = (it: ActionMenuItem) => {
    if (it.disabled) return;
    if (it.confirmLabel && armed !== it.key) {
      setArmed(it.key);
      return;
    }
    close();
    btnRef.current?.focus({ preventScroll: true });
    it.onSelect();
  };

  return (
    <div className="act-menu" ref={rootRef}>
      <button
        type="button"
        ref={btnRef}
        className={`btn ic btn-sm act-menu-btn${open ? ' on' : ''}`}
        data-btn="action-menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icon size="0.875rem" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="act-menu-pop"
          ref={menuRef}
          aria-label={ariaLabel}
          style={style ?? { position: 'fixed', visibility: 'hidden' }}
        >
          {items.map((it) => {
            const ItemIcon = it.icon;
            const isArmed = armed === it.key;
            return (
              <button
                key={it.key}
                type="button"
                role="menuitem"
                className={`act-menu-item${it.danger ? ' danger' : ''}${isArmed ? ' armed' : ''}`}
                data-btn={`action-${it.key}`}
                disabled={it.disabled}
                onClick={() => pick(it)}
              >
                {ItemIcon && <ItemIcon size="0.875rem" aria-hidden="true" />}
                <span>{isArmed ? it.confirmLabel : it.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
