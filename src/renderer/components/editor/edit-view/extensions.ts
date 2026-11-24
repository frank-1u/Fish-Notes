import { Extension, textblockTypeInputRule } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { CodeBlock } from '@tiptap/extension-code-block';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { ListItem } from '@tiptap/extension-list';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Blockquote } from '@tiptap/extension-blockquote';
import { joinBlocks, sourceFallbacks } from './noteSource';
import { EditImage } from './image';

const FencedCode = CodeBlock.extend({
  addInputRules() {
    return [...(this.parent?.() ?? []), textblockTypeInputRule({ find: /^```$/, type: this.type })];
  },
  renderMarkdown(node, helpers) {
    const code = helpers.renderChildren(node.content ?? []);
    let longestRun = 2;
    for (const match of code.matchAll(/^ {0,3}(`+)/gm)) {
      longestRun = Math.max(longestRun, match[1].length);
    }
    const fence = '`'.repeat(longestRun + 1);
    return [fence + (node.attrs?.language ?? ''), code, fence].join('\n');
  },
});

const TextParagraph = Paragraph.extend({
  parseMarkdown: (token, helpers) => ({
    type: 'paragraph',
    content: helpers.parseInline(token.tokens ?? []),
  }),
  renderMarkdown(node, helpers) {
    // Literal block markers typed/pasted into a paragraph must still be
    // literal after reopening. Inline delimiters are escaped by MarkdownManager.
    return helpers
      .renderChildren(node.content ?? [])
      .replace(/^( {0,3})(#{1,6}(?=\s|$)|[+-](?=\s|$)|-+(?= *$)|=+(?= *$))/gm, '$1\\$2')
      .replace(/^( {0,3}\d{1,9})([.)])(?=\s|$)/gm, '$1\\$2')
      .replace(/^ ( {3,})/gm, '&#32;$1');
  },
});

const Quote = Blockquote.extend({
  renderMarkdown(node, helpers) {
    const text = joinBlocks(node.content ?? [], (block) => helpers.renderChildren([block]));
    return text
      .split('\n')
      .map((line) => (line ? `> ${line}` : '>'))
      .join('\n');
  },
});

const MarkdownListItem = ListItem.extend({
  renderMarkdown(node, helpers, context) {
    const start: number = context.meta?.parentAttrs?.start ?? 1;
    const marker = context.parentType === 'orderedList' ? `${start + context.index}. ` : '- ';
    const text = joinBlocks(node.content ?? [], (block) => helpers.renderChildren([block]), true);
    return marker + text.replace(/\n(?=[^\n])/g, '\n' + ' '.repeat(marker.length));
  },
});

// MarkdownManager normally reopens crossed emphasis ranges with HTML tags.
// Use the alternative CommonMark delimiter for the reopened range instead.
const MarkdownBold = Bold.extend({ markdownOptions: { htmlReopen: { open: '__', close: '__' } } });
const MarkdownItalic = Italic.extend({
  markdownOptions: { htmlReopen: { open: '_', close: '_' } },
});

const Shortcuts = Extension.create({
  name: 'editViewShortcuts',
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-s': () => this.editor.commands.toggleStrike(),
      'Mod-Shift-.': () => this.editor.commands.toggleBlockquote(),
      'Mod-Shift-e': () => this.editor.commands.toggleCodeBlock(),
      'Mod-Shift-l': () => this.editor.commands.toggleBulletList(),
      'Mod-Shift-o': () => this.editor.commands.toggleOrderedList(),
    };
  },
});

// Rich nodes, marks and selection plugins belong here. The codec uses this
// same extension registry for their parseMarkdown/renderMarkdown handlers.
export const editViewExtensions = [
  StarterKit.configure({
    listItem: false,
    bold: false,
    italic: false,
    paragraph: false,
    blockquote: false,
    codeBlock: false,
    underline: false,
    trailingNode: false,
    link: { openOnClick: false, autolink: false, linkOnPaste: false },
  }),
  TextParagraph,
  Quote,
  FencedCode,
  MarkdownListItem,
  MarkdownBold,
  MarkdownItalic,
  EditImage,
  Shortcuts,
  ...sourceFallbacks,
];
