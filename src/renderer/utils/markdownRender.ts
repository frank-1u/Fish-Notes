import { convertFileSrc } from '@tauri-apps/api/core';
import { commonmarkLanguage } from '@codemirror/lang-markdown';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { inlineHashtagPattern } from './hashtags';

// Allow http(s)/mailto/tel links and our own fish-image: scheme; strip everything else
// (javascript:, inline event handlers, <script>, etc.) from rendered note content.
const SANITIZE_CONFIG = {
  ADD_ATTR: ['target', 'rel', 'width'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|fish-image):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$)|#)/i,
};

// Standard Markdown collapses 2+ consecutive blank lines into a single paragraph
// break. Users typing extra Enter expect that vertical whitespace to show up in
// preview/export, so we inject visible "&nbsp;" paragraphs for each blank beyond
// the first. Code fences are skipped so multi-line code blocks keep their blanks.
function preserveBlankLines(md: string): string {
  let syntax: ReturnType<typeof commonmarkLanguage.parser.parse> | undefined;
  let previousBlank = false;
  let offset = 0;
  return md
    .split('\n')
    .map((line) => {
      const start = offset;
      offset += line.length + 1;
      const blank = !line.trim();
      const extraBlank = previousBlank && blank;
      previousBlank = blank;
      if (!extraBlank) return line;

      // The MD View's CommonMark parser tracks fence character and length,
      // closing-line whitespace, and indentation relative to list containers.
      syntax ??= commonmarkLanguage.parser.parse(md);
      const node = syntax.resolve(start, -1);
      if (node.name === 'CodeText' || node.name === 'FencedCode' || node.name === 'CodeBlock')
        return line;
      return '&nbsp;\n';
    })
    .join('\n');
}

export function fishImageName(image: HTMLImageElement): string | undefined {
  return localImageName(image.getAttribute('src') ?? '');
}

function localImageName(src: string): string | undefined {
  return src.match(/^fish-image:\/\/([^/?#]+)$/i)?.[1];
}

export function imageDisplayUrl(src: string): string {
  const name = localImageName(src);
  return name ? convertFileSrc(name, 'fish-image') : src;
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
    const parts = node.data.split(inlineHashtagPattern);
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
    image.setAttribute('src', imageDisplayUrl(image.getAttribute('src')!));
  }
  return template.innerHTML;
}
