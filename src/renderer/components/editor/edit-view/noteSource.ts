import { Node, type JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { Lexer, Marked, type Token, type marked } from 'marked';
import type { Node as DocumentNode } from '@tiptap/pm/model';
import type { Extensions } from '@tiptap/core';
import { resizedImageToken } from './image';

// Unsupported Markdown remains literal and editable in MD View. Never feed
// arbitrary note HTML into the rich editor or discard it on an unrelated edit.
function sourceNode(name: string, inline: boolean) {
  return Node.create({
    name,
    group: inline ? 'inline' : 'block',
    inline,
    atom: true,
    addAttributes: () => ({ source: { default: '', rendered: false } }),
    renderHTML: ({ node }) => [inline ? 'span' : 'pre', {}, node.attrs.source],
    parseMarkdown: (token) => ({ type: name, attrs: { source: token.raw } }),
    renderMarkdown: (node) => node.attrs?.source ?? '',
  });
}

export const sourceFallbacks = [sourceNode('sourceBlock', false), sourceNode('sourceInline', true)];

function inlineTokens(tokens: Token[]): Token[] {
  return tokens.map((token) => {
    if (token.type === 'html') {
      return resizedImageToken(token.raw) ?? { type: 'sourceInline', raw: token.raw };
    }
    if (token.type === 'checkbox') {
      return { type: 'sourceInline', raw: token.raw };
    }
    if ('tokens' in token && token.tokens) return { ...token, tokens: inlineTokens(token.tokens) };
    return token;
  });
}

function separatorBefore(type: string | undefined, inListItem: boolean) {
  return inListItem && (type === 'list' || type === 'bulletList' || type === 'orderedList') ? 1 : 2;
}

function blockTokens(tokens: Token[], inListItem = false): Token[] {
  const result: Token[] = [];
  let lineBreaks = 0;
  const blanks = (count: number) => {
    for (let i = 0; i < count; i++)
      result.push({ type: 'paragraph', raw: '', text: '', tokens: [] });
  };
  for (const token of tokens) {
    if (token.type === 'space') {
      lineBreaks += token.raw.split('\n').length - 1;
      continue;
    }
    blanks(result.length ? lineBreaks - separatorBefore(token.type, inListItem) : lineBreaks);
    const raw = token.raw.replace(/\n+$/, '');
    lineBreaks = token.raw.length - raw.length;
    if (token.type === 'html' && /^<img\s/i.test(raw)) {
      // A standalone <img> can start a Marked HTML block that also includes
      // following lines of prose or images up to the next blank line.
      const inline = inlineTokens(Lexer.lexInline(raw));
      result.push(
        inline[0]?.type === 'image'
          ? { type: 'paragraph', raw, text: raw, tokens: inline }
          : { type: 'sourceBlock', raw },
      );
    } else if (
      ['table', 'def', 'html'].includes(token.type) ||
      (token.type === 'list' && token.items.some((item: { task?: boolean }) => item.task))
    ) {
      result.push({ type: 'sourceBlock', raw });
    } else if (token.type === 'blockquote') {
      result.push({ ...token, raw, tokens: blockTokens(token.tokens ?? []) });
    } else if (token.type === 'list') {
      result.push({
        ...token,
        raw,
        items: token.items.map((item: Token) => ({
          ...item,
          tokens: 'tokens' in item && item.tokens ? blockTokens(item.tokens, true) : [],
        })),
      });
    } else if ('tokens' in token && token.tokens) {
      result.push({
        ...token,
        type: token.type === 'text' ? 'paragraph' : token.type,
        raw,
        tokens: inlineTokens(token.tokens),
      });
    } else {
      result.push({ ...token, raw });
    }
  }
  blanks(lineBreaks + (result.length === 0 ? 1 : 0));
  return result;
}

class NoteSourceLexer<ParserOutput = string, RendererOutput = string> extends Lexer<
  ParserOutput,
  RendererOutput
> {
  lex(source: string) {
    const tokens = super.lex(source);
    return Object.assign(blockTokens(tokens), { links: tokens.links });
  }
}

// One empty paragraph stores one extra line beyond the ordinary block separator.
// At document boundaries each empty paragraph represents a leading/trailing newline.
export function joinBlocks(
  blocks: JSONContent[],
  render: (block: JSONContent) => string,
  inListItem = false,
): string {
  let markdown = '';
  let blanks = 0;
  let hasBlock = false;
  for (const block of blocks) {
    if (block.type === 'paragraph' && !block.content?.length) {
      blanks++;
      continue;
    }
    markdown +=
      '\n'.repeat(blanks + (hasBlock ? separatorBefore(block.type, inListItem) : 0)) +
      render(block);
    blanks = 0;
    hasBlock = true;
  }
  return markdown + '\n'.repeat(hasBlock ? blanks : Math.max(0, blanks - 1));
}

class NoteSourceMarkdown extends MarkdownManager {
  override renderNodes(
    nodes: JSONContent | JSONContent[],
    parent?: JSONContent,
    separator = '',
    index = 0,
    level = 0,
  ) {
    if (!Array.isArray(nodes) || separator)
      return super.renderNodes(nodes, parent, separator, index, level);
    // CommonMark forbids an underscore closing emphasis inside a word. For
    // a crossed range ending there, encode the next letter as a character
    // reference. Split only where all marks have already ended.
    let result = '';
    let start = 0;
    const append = (end: number) => {
      const run = start === 0 && end === nodes.length ? nodes : nodes.slice(start, end);
      const text = super.renderNodes(run, parent, separator, index, level);
      result += result.endsWith('_')
        ? text.replace(/^./u, (letter) => `&#${letter.codePointAt(0)};`)
        : text;
      start = end;
    };
    for (let i = 1; i < nodes.length; i++) {
      const node = nodes[i];
      if (
        !nodes[i - 1].marks?.length ||
        node.marks?.length ||
        node.type !== 'text' ||
        !/^[\p{L}\p{N}]/u.test(node.text ?? '')
      )
        continue;
      append(i);
    }
    append(nodes.length);
    return result;
  }
}

export function createNoteSourceCodec(extensions: Extensions) {
  // MarkdownManager uses Marked's instance methods but types the dependency as
  // the callable global singleton. Isolate editor tokenizers from HTML/PDF export.
  const lexer = new Marked();
  lexer.Lexer = NoteSourceLexer;
  const markdown = new NoteSourceMarkdown({
    marked: lexer as unknown as typeof marked,
    extensions,
  });
  return {
    parse: (source: string) => markdown.parse(source),
    serialize(doc: DocumentNode): string {
      return joinBlocks(doc.toJSON().content ?? [], (block) =>
        markdown.renderNodeToMarkdown(block),
      );
    },
  };
}
