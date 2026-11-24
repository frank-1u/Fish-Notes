import { decodeHtmlEntities, encodeHtmlEntities } from '@tiptap/core';
import { Image } from '@tiptap/extension-image';
import { Plugin } from '@tiptap/pm/state';
import type { Tokens } from 'marked';
import { imageNodeView } from './imageNodeView';
import { imageEvents } from './imageUploads';

function pixels(value: string | null) {
  const width = Number(value);
  return value && /^\d+$/.test(value) && Number.isSafeInteger(width) && width > 0 ? width : null;
}

// Marked emits HTML tokens for the exception. Read only a single image's
// attributes in an inert template; other HTML keeps the literal source fallback.
export function resizedImageToken(raw: string): (Tokens.Image & { width: number }) | undefined {
  if (!/^<img\s/i.test(raw)) return;
  const template = document.createElement('template');
  template.innerHTML = raw;
  const img = template.content.firstChild;
  if (!(img instanceof HTMLImageElement) || img.nextSibling) return;
  if (img.getAttributeNames().some((name) => !['src', 'alt', 'width', 'title'].includes(name)))
    return;
  const href = img.getAttribute('src');
  const width = pixels(img.getAttribute('width'));
  if (!href || !width) return;
  return {
    type: 'image',
    raw,
    href,
    width,
    text: img.alt,
    title: img.getAttribute('title'),
    tokens: [],
  };
}

function attribute(value: string) {
  return encodeHtmlEntities(value).replace(/"/g, '&quot;');
}

export const EditImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: { default: null, parseHTML: (el) => el.getAttribute('src') },
      alt: { default: '', parseHTML: (el) => el.getAttribute('alt') },
      title: { default: null, parseHTML: (el) => el.getAttribute('title') },
      // Pasted web pages often specify intrinsic image dimensions. Only a
      // Fish Notes image copied from the editor can carry a saved width here.
      width: {
        default: null,
        parseHTML: (el) =>
          el.getAttribute('src')?.startsWith('fish-image://')
            ? pixels(el.getAttribute('width'))
            : null,
      },
      height: { default: null, rendered: false, parseHTML: () => null },
    };
  },
  parseMarkdown: (token, helpers) =>
    helpers.createNode('image', {
      src: token.width ? token.href : decodeHtmlEntities(token.href ?? ''),
      alt: token.width ? token.text : decodeHtmlEntities(token.text ?? ''),
      title: token.title ? (token.width ? token.title : decodeHtmlEntities(token.title)) : null,
      width: token.width ?? null,
    }),
  renderMarkdown(node) {
    const { src, alt = '', width, title } = node.attrs ?? {};
    if (width) {
      const tooltip = title ? ` title="${attribute(title)}"` : '';
      return `<img src="${attribute(src)}" alt="${attribute(alt ?? '')}" width="${width}"${tooltip} />`;
    }
    const label = encodeHtmlEntities(alt ?? '').replace(/[\\[\]]/g, '\\$&');
    const destination = encodeHtmlEntities(src).replace(/[()\\]/g, '\\$&');
    const tooltip = title ? ` "${attribute(title).replace(/\\/g, '\\\\')}"` : '';
    return `![${label}](${/\s/.test(destination) ? '<' + destination + '>' : destination}${tooltip})`;
  },
  addNodeView: () => imageNodeView,
  addProseMirrorPlugins() {
    return [new Plugin({ props: { handleDOMEvents: imageEvents(this.editor) } })];
  },
}).configure({ inline: true });
