import {
  memo,
  useMemo,
  useCallback,
  useRef,
  useImperativeHandle,
  useLayoutEffect,
  forwardRef,
  type MouseEvent,
} from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { parseAppError } from '../../api';
import { renderPreview } from '../../utils/markdownRender';
import { message } from '../message';

interface MarkdownPreviewProps {
  value: string;
  className?: string;
}

const EXTERNAL_LINK_RE = /^(https?|mailto|tel):/i;

function updatePreview(container: HTMLDivElement, html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const previous = container.childNodes;
  const next = template.content.childNodes;

  // Keep identical leading and trailing blocks mounted. The full Markdown parse
  // still handles syntax that can change earlier blocks, such as link definitions.
  let start = 0;
  while (
    start < previous.length &&
    start < next.length &&
    previous[start].isEqualNode(next[start])
  ) {
    start++;
  }
  let oldEnd = previous.length;
  let newEnd = next.length;
  while (oldEnd > start && newEnd > start && previous[oldEnd - 1].isEqualNode(next[newEnd - 1])) {
    oldEnd--;
    newEnd--;
  }
  if (oldEnd === start && newEnd === start) return;

  const after = previous[oldEnd] ?? null;
  for (let index = oldEnd - 1; index >= start; index--) {
    container.removeChild(previous[index]);
  }
  const replacement = document.createDocumentFragment();
  for (let remaining = newEnd - start; remaining > 0; remaining--) {
    replacement.appendChild(next[start]);
  }
  container.insertBefore(replacement, after);
}

const MarkdownPreview = forwardRef<HTMLDivElement, MarkdownPreviewProps>(
  ({ value, className }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => containerRef.current!, []);
    const html = useMemo(() => renderPreview(value), [value]);
    useLayoutEffect(() => {
      if (containerRef.current) updatePreview(containerRef.current, html);
    }, [html]);

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
        ref={containerRef}
        className={`markdown-preview ${className ?? ''}`}
        onClick={handleClick}
      />
    );
  },
);

MarkdownPreview.displayName = 'MarkdownPreview';

export default memo(MarkdownPreview);
