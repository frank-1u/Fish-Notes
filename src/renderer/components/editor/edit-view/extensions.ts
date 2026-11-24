import { Extension, textblockTypeInputRule } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { CodeBlock } from '@tiptap/extension-code-block';
import { Link } from '@tiptap/extension-link';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Blockquote } from '@tiptap/extension-blockquote';
import { gfmTables } from './tables';
import { taskLists } from './tasks';
import { joinBlocks, sourceFallbacks } from './noteSource';
import { InlineHashtags } from './inlineHashtags';
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

const MarkdownLink = Link.extend({
  renderMarkdown(node, helpers) {
    const href: string = node.attrs?.href ?? '';
    const destination = /[\s()<>\\]/.test(href)
      ? '<' + href.replace(/[<>\\]/g, '\\$&') + '>'
      : href;
    const title = node.attrs?.title;
    return `[${helpers.renderChildren(node)}](${destination}${title ? ' "' + title.replace(/["\\]/g, '\\$&') + '"' : ''})`;
  },
}).configure({ openOnClick: false, autolink: false, linkOnPaste: false });

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
      'Mod-Shift-t': () => this.editor.commands.toggleTaskItem(),
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
    bulletList: false,
    orderedList: false,
    bold: false,
    italic: false,
    paragraph: false,
    blockquote: false,
    codeBlock: false,
    underline: false,
    trailingNode: false,
    link: false,
  }),
  TextParagraph,
  Quote,
  FencedCode,
  ...taskLists,
  ...gfmTables,
  MarkdownLink,
  MarkdownBold,
  MarkdownItalic,
  EditImage,
  Shortcuts,
  InlineHashtags,
  ...sourceFallbacks,
];
