import { Mark, type JSONContent } from '@tiptap/core';

export const inlineHashtagPattern = /(?<=\s|^)#[\p{L}\p{N}_][\p{L}\p{N}_/]*/gu;

// This mark exists only in the Markdown codec. It tells MarkdownManager to
// write the literal tag name (including underscores) without adding delimiters.
// The tokenizer returns ordinary text even for names like #_today_.
export const HashtagLiteral = Mark.create({
  name: 'hashtagLiteral',
  code: true,
  markdownTokenizer: {
    name: 'hashtagLiteral',
    level: 'inline',
    start: '#',
    tokenize(source, previous) {
      const preceding = previous.at(-1)?.raw;
      if (preceding && !/\s$/u.test(preceding)) return;
      const tag = /^#[\p{L}\p{N}_][\p{L}\p{N}_/]*/u.exec(source)?.[0];
      if (tag) return { type: 'text', raw: tag, text: tag };
    },
  },
});

export function literalHashtagNames(nodes: JSONContent[]): JSONContent[] {
  return nodes.flatMap((node) => {
    const text = node.text;
    if (
      !text?.includes('#') ||
      !text.includes('_') ||
      node.marks?.some((mark) => mark.type === 'code')
    )
      return node;
    const parts: JSONContent[] = [];
    let end = 0;
    for (const match of text.matchAll(inlineHashtagPattern)) {
      if (!match[0].includes('_')) continue;
      if (end < match.index) parts.push({ ...node, text: text.slice(end, match.index) });
      parts.push({
        ...node,
        text: match[0],
        marks: [...(node.marks ?? []), { type: HashtagLiteral.name }],
      });
      end = match.index + match[0].length;
    }
    if (!parts.length) return node;
    if (end < text.length) parts.push({ ...node, text: text.slice(end) });
    return parts;
  });
}
