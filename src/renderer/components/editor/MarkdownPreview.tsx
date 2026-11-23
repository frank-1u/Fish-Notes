import { useMemo, useCallback, forwardRef, type MouseEvent } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { parseAppError } from '../../api';
import { renderPreview } from '../../utils/markdownRender';
import { message } from '../message';

interface MarkdownPreviewProps {
  value: string;
  className?: string;
}

const EXTERNAL_LINK_RE = /^(https?|mailto|tel):/i;

const MarkdownPreview = forwardRef<HTMLDivElement, MarkdownPreviewProps>(
  ({ value, className }, ref) => {
    const html = useMemo(() => renderPreview(value), [value]);

    const handleClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
      if (!(e.target instanceof Element)) return;
      const anchor = e.target.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href')?.trim();
      if (!href || !EXTERNAL_LINK_RE.test(href)) return;
      e.preventDefault();
      void openUrl(href).catch((error: unknown) => message.error(parseAppError(error).message));
    }, []);

    return (
      <div
        ref={ref}
        className={`markdown-preview ${className ?? ''}`}
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  },
);

MarkdownPreview.displayName = 'MarkdownPreview';

export default MarkdownPreview;
