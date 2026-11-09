import React from 'react';
import { EXTERNAL_LINKS } from '../../utils/constants';

export type ExtLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement>;

/** 새 탭으로 여는 외부 링크 — target·rel 을 한 곳에서 관리한다 */
export const ExtLink: React.FC<ExtLinkProps> = ({ target = '_blank', rel = 'noopener', children, ...rest }) => (
  <a {...rest} target={target} rel={rel}>
    {children}
  </a>
);

interface AdApiSourceProps {
  /** 앞 글자 — 표 각주는 '출처:' 로 시작한다 */
  prefix?: string;
  /** 링크 뒤에 붙는 설명 */
  suffix?: React.ReactNode;
  /** 두 매체 사이 구분 글자 */
  separator?: string;
  /** 스마트스토어·Meta 처럼 매체를 더 보여 줄 때 */
  extra?: React.ReactNode;
}

/** 표 각주의 'Google Ads · 네이버 검색광고 API 자동 수집' 출처 한 줄 */
export const AdApiSource: React.FC<AdApiSourceProps> = ({
  prefix,
  suffix = 'API 자동 수집',
  separator = '·',
  extra,
}) => (
  <span>
    {prefix && <>{prefix} </>}
    <ExtLink href={EXTERNAL_LINKS.googleAds}>Google Ads</ExtLink> {separator}{' '}
    <ExtLink href={EXTERNAL_LINKS.naverSearchAd}>네이버 검색광고</ExtLink>
    {extra && <> {separator} {extra}</>}
    {suffix && <> {suffix}</>}
  </span>
);
