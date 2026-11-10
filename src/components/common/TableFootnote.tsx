import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { ExtLink } from './ExtLink';

export interface FootnoteSourceItem {
  label?: string;
  text?: string;
  href?: string;
}

export interface TableFootnoteProps {
  id?: string;
  unit?: string;
  basis?: string;
  sources?: (string | FootnoteSourceItem | React.ReactNode)[];
  action?: {
    text: string;
    href: string;
  };
  className?: string;
  children?: React.ReactNode;
}

export const TableFootnote: React.FC<TableFootnoteProps> = ({
  id,
  unit,
  basis,
  sources = [],
  action,
  className = '',
  children,
}) => {
  return (
    <div id={id} className={`tbl-src ${className}`.trim()}>
      {basis &&<span className="tbl-src-basis">{basis}</span>}
      {sources.map((item, idx) => {
        if (!item) return null;
        if (typeof item === 'string') {
          return <span key={idx}>{item}</span>;
        }
        if (React.isValidElement(item)) {
          return <span key={idx}>{item}</span>;
        }
        const srcItem = item as FootnoteSourceItem;
        return (
          <span key={idx}>
            {srcItem.label && `${srcItem.label} — `}
            {srcItem.href ? (
              <ExtLink href={srcItem.href}>
                {srcItem.text || srcItem.label}
              </ExtLink>
            ) : (
              srcItem.text
            )}
          </span>
        );
      })}
      {children}
      {action && (
        <ExtLink href={action.href} className="tbl-src-action">
          {action.text}
          <ArrowUpRight size="0.75rem" aria-hidden="true" />
        </ExtLink>
      )}
      {/* 단위는 차트 범례와 같이 우측 하단에 둔다 */}
      {unit && <span className="tbl-src-unit">단위: {unit}</span>}
    </div>
  );
};
