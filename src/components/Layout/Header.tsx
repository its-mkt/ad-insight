import React from 'react';
import { HeaderProfileMenu } from './HeaderProfileMenu';
import { Menu, Moon, Search, Sun } from 'lucide-react';
import { Button } from '../common/Button';
import type { ThemeMode } from '../../utils/theme';
import type { ViewId } from '../../types/dashboard';

interface HeaderProps {
  title: string;
  /** 제목 오른쪽에 함께 보여 줄 값 (예: 검색어) */
  titleDetail?: string;
  /** 제목 오른쪽 값 옆에 둘 버튼 (예: 검색어 즐겨찾기) */
  titleAction?: React.ReactNode;
  drawerOpen: boolean;
  isDark: boolean;
  onOpenDrawer: () => void;
  onToggleTheme: () => void;
  /** 지금 고른 테마 (프로필 메뉴 표시용 — 로그인 전 둘러보기 화면은 넘기지 않는다) */
  themeMode?: ThemeMode;
  /** 프로필 메뉴에서 테마를 고를 때 (없으면 메뉴에 테마 줄을 두지 않는다) */
  onThemeMode?: (mode: ThemeMode) => void;
  /** 프로필 메뉴의 바로가기(계정 관리 등)로 화면을 옮길 때 (없으면 바로가기를 두지 않는다) */
  onNavigate?: (view: ViewId) => void;
  /** 헤더 로그인 버튼 → 로그인 모달 */
  onLogin: () => void;
  /** 헤더 검색 버튼 → 검색창 */
  onSearch: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  titleDetail,
  titleAction,
  drawerOpen,
  isDark,
  onOpenDrawer,
  onToggleTheme,
  themeMode,
  onThemeMode,
  onNavigate,
  onLogin,
  onSearch,
}) => {
  return (
    <header className="top">
      <Button
        iconOnly
        icon={Menu}
        className="burger"
        id="burger"
        data-btn="burger"
        aria-label="메뉴 열기"
        aria-expanded={drawerOpen}
        aria-controls="side"
        onClick={onOpenDrawer}
      />
      <h1>
        <span className="ttx">광고 &amp; 견적 대시보드 </span>
        <span className="crumb" id="crumb">
          {title}
          {titleDetail && (
            <span className="crumb-detail" title={titleDetail}>
              &quot;{titleDetail}&quot;
            </span>
          )}
          {titleAction}
        </span>
      </h1>
      <span className="sp" />
      <div className="acts">
        <Button
          iconOnly
          icon={Search}
          className="btn-search"
          id="btn-search"
          data-btn="search"
          aria-label="검색"
          title="검색 (Ctrl+K)"
          onClick={onSearch}
        />

        {/* 테마 전환 — 지금 테마의 반대(바꿀 테마) 아이콘을 보여 준다 */}
        <Button
          iconOnly
          icon={isDark ? Sun : Moon}
          className="btn-theme"
          id="theme"
          data-btn="theme"
          aria-label={isDark ? '라이트 모드로 바꾸기' : '다크 모드로 바꾸기'}
          title={isDark ? '라이트 모드' : '다크 모드'}
          onClick={onToggleTheme}
        />

        {/* 헤더 프로필 & 로그인 유도 버튼 (맨 오른쪽) */}
        <HeaderProfileMenu onLogin={onLogin} themeMode={themeMode} onThemeMode={onThemeMode} onNavigate={onNavigate} />
      </div>
    </header>
  );
};
