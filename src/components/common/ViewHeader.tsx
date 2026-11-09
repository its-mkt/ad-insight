import React from 'react';
import { ExtLink } from './ExtLink';
import type { SyncStatus } from '../../types/dashboard';

export interface SourceLinkItem {
  label: string;
  href?: string;
}

interface ViewHeaderProps {
  title: string;
  /** 제목 안에서 강조(푸른색)할 글자 — 제목에 그대로 들어 있을 때만 적용 */
  highlight?: string;
  description: string;
  status: SyncStatus;
}

export const ViewHeader: React.FC<ViewHeaderProps> = ({ title, highlight, description, status }) => {
  const live = status === 'live';
  const at = highlight ? title.indexOf(highlight) : -1;

  return (
    <div className="mod-h">
      <div>
        <h2>
          {at < 0 ? (
            title
          ) : (
            <>
              {title.slice(0, at)}
              <span className="h-hl">{highlight}</span>
              {title.slice(at + highlight!.length)}
            </>
          )}
        </h2>
        <p>{description}</p>
      </div>
      {!live && (
        <span className="ex" data-src>데이터 대기 중</span>
      )}
    </div>
  );
};

export const SecSrc: React.FC<{ sources: SourceLinkItem[] }> = ({ sources }) => (
  <p className="sec-src">
    {sources.map((src, idx) =>
      src.href ? (
        <ExtLink key={`${src.label}-${idx}`} href={src.href}>
          {src.label}
        </ExtLink>
      ) : (
        <span key={`${src.label}-${idx}`}>{src.label}</span>
      )
    )}
  </p>
);
