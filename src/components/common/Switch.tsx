import React from 'react';

interface SwitchProps {
  /** 켜져 있는지 */
  checked: boolean;
  /** 누르면 바뀔 값으로 부른다 */
  onChange: (next: boolean) => void;
  /** 스위치 옆에 보이는 글자 (지금 상태 이름 등) */
  label?: React.ReactNode;
  /** 화면 읽기 프로그램용 이름 — label 이 없거나 상태 이름뿐일 때 무엇을 켜고 끄는지 적는다 */
  ariaLabel?: string;
  /** 마우스를 올리면 뜨는 설명 */
  title?: string;
  disabled?: boolean;
  className?: string;
  /** 클릭 추적용 이름 (data-btn) */
  dataBtn?: string;
}

/** 켜기·끄기 스위치 — 두 상태를 오가는 설정 (계정 관리의 열람 허용 등) */
export const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, ariaLabel, title, disabled, className, dataBtn }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    title={title}
    disabled={disabled}
    data-btn={dataBtn}
    className={`switch${checked ? ' on' : ''}${className ? ` ${className}` : ''}`}
    onClick={() => onChange(!checked)}
  >
    <span className="switch-track" aria-hidden="true">
      <span className="switch-thumb" />
    </span>
    {label != null && <span className="switch-label">{label}</span>}
  </button>
);
