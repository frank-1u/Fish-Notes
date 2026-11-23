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
import { convertFileSrc } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { parseAppError } from '../../api';
import { message } from '../message';

// Allow http(s)/mailto/tel links and our own fish-image: scheme; strip everything else
// (javascript:, inline event handlers, <script>, etc.) from rendered note content.
const SANITIZE_CONFIG = {
  ADD_ATTR: ['target', 'rel'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|fish-image):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$)|#)/i,
};

interface MarkdownPreviewProps {
  value: string;
  className?: string;
}

const EXTERNAL_LINK_RE = /^(https?|mailto|tel):/i;

// Standard Markdown collapses 2+ consecutive blank lines into a single paragraph
// break. Users typing extra Enter expect that vertical whitespace to show up in
// preview/export, so we inject visible "&nbsp;" paragraphs for each blank beyond
// the first. Code fences are skipped so multi-line code blocks keep their blanks.
function preserveBlankLines(md: string): string {
  const lines = md.split('\n');
  const result: string[] = [];
  let consecutiveBlank = 0;
  let inCodeBlock = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      consecutiveBlank = 0;
      continue;
    }
    if (inCodeBlock) {
      result.push(line);
      consecutiveBlank = 0;
      continue;
    }
    if (line.trim() === '') {
      consecutiveBlank++;
      if (consecutiveBlank === 1) {
        result.push('');
      } else {
        result.push('&nbsp;');
        result.push('');
      }
    } else {
      consecutiveBlank = 0;
      result.push(line);
    }
  }

  return result.join('\n');
}

function renderMarkdown(md: string): string {
  if (!md) return '';
  const tagPlaceholders: string[] = [];
  const processed = preserveBlankLines(md).replace(
    /(?<=\s|^)#([\p{L}\p{N}_][\p{L}\p{N}_/]*)/gu,
    (match) => {
      const idx = tagPlaceholders.length;
      tagPlaceholders.push(match);
      return `%%HASHTAG_${idx}%%`;
    },
  );

  const rendered = marked.parse(processed, { async: false, breaks: true, gfm: true });
  // Sanitize marked's output before our trusted post-processing — note content may
  // contain <script>, onerror=, javascript: links, etc.
  const fragment = DOMPurify.sanitize(rendered, { ...SANITIZE_CONFIG, RETURN_DOM_FRAGMENT: true });
  for (const image of fragment.querySelectorAll('img[src]')) {
    const filename = image.getAttribute('src')?.match(/^fish-image:\/\/([^/?#]+)$/i)?.[1];
    if (filename) image.setAttribute('src', convertFileSrc(filename, 'fish-image'));
  }
  const template = document.createElement('template');
  template.content.append(fragment);
  let html = template.innerHTML;
  for (let i = 0; i < tagPlaceholders.length; i++) {
    html = html.replace(`%%HASHTAG_${i}%%`, `<span class="hashtag">${tagPlaceholders[i]}</span>`);
  }

  // Tag blank-line paragraphs (the &nbsp; rows we injected) so CSS can collapse
  // their margins and match source's per-line spacing.
  html = html.replace(/<p>\s*&nbsp;\s*<\/p>/g, '<p class="md-blank">&nbsp;</p>');

  return html;
}

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
    const html = useMemo(() => renderMarkdown(value), [value]);
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
        className={`markdown-preview prose prose-sm max-w-none ${className ?? ''}`}
        onClick={handleClick}
      />
    );
  },
);

MarkdownPreview.displayName = 'MarkdownPreview';

export default memo(MarkdownPreview);
