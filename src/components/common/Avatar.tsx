import React from 'react';

interface AvatarProps {
  /** 프로필 사진 주소 — 없으면 이니셜을 그린다 */
  src?: string;
  /** 이니셜을 뽑을 이름(또는 이메일) — 첫 글자를 대문자로 쓴다 */
  name?: string;
  /** 크기 — sm: 헤더 버튼 · lg: 프로필 메뉴 · xl: 내 계정 설정 */
  size?: 'sm' | 'lg' | 'xl';
  /** 감싸는 태그 (줄 안에 둘 때 span) */
  as?: 'span' | 'div';
}

/** 사용자 프로필 사진 동그라미 — 사진이 없으면 이름 첫 글자 */
export const Avatar: React.FC<AvatarProps> = ({ src, name, size = 'sm', as: Tag = 'span' }) => (
  <Tag className={`pm-avatar${size !== 'sm' ? ` ${size}` : ''}`}>{src ? <img src={src} alt="" /> : (name || 'A')[0].toUpperCase()}</Tag>
);
