import { convertFileSrc } from '@tauri-apps/api/core';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

// Allow http(s)/mailto/tel links and our own fish-image: scheme; strip everything else
// (javascript:, inline event handlers, <script>, etc.) from rendered note content.
const SANITIZE_CONFIG = {
  ADD_ATTR: ['target', 'rel'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|fish-image):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$)|#)/i,
};

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

export function fishImageName(image: HTMLImageElement): string | undefined {
  return image.getAttribute('src')?.match(/^fish-image:\/\/([^/?#]+)$/i)?.[1];
}

export function renderMarkdown(markdown: string): DocumentFragment {
  const html = marked.parse(preserveBlankLines(markdown), {
    async: false,
    breaks: true,
    gfm: true,
  });
  const fragment = DOMPurify.sanitize(html, { ...SANITIZE_CONFIG, RETURN_DOM_FRAGMENT: true });

  for (const paragraph of fragment.querySelectorAll('p')) {
    if (paragraph.textContent === '\u00a0' && !paragraph.childElementCount) {
      paragraph.classList.add('md-blank');
    }
  }

  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  for (const node of textNodes) {
    if (node.parentElement?.closest('code, pre, style, textarea')) continue;
    const parts = node.data.split(/((?<=\s|^)#[\p{L}\p{N}_][\p{L}\p{N}_/]*)/gu);
    if (parts.length === 1) continue;
    node.replaceWith(
      ...parts.map((part, index) => {
        if (index % 2 === 0) return part;
        const tag = document.createElement('span');
        tag.className = 'hashtag';
        tag.textContent = part;
        return tag;
      }),
    );
  }
  return fragment;
}

export function renderPreview(markdown: string): string {
  const template = document.createElement('template');
  template.content.append(renderMarkdown(markdown));
  for (const image of template.content.querySelectorAll<HTMLImageElement>('img[src]')) {
    const name = fishImageName(image);
    if (name) image.setAttribute('src', convertFileSrc(name, 'fish-image'));
  }
  return template.innerHTML;
}
