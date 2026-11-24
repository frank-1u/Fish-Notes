import { Mark, type JSONContent } from '@tiptap/core';
import { inlineHashtagPattern, leadingHashtag } from '../../../utils/hashtags';

// Codec-only mark for text already encoded as Markdown (literal hashtags
// or character references). The hashtag tokenizer returns ordinary text.
export const MarkdownLiteral = Mark.create({
  name: 'markdownLiteral',
  code: true,
  markdownTokenizer: {
    name: 'hashtagLiteral',
    level: 'inline',
    start: '#',
    tokenize(source, previous) {
      const preceding = previous.at(-1)?.raw;
      if (preceding && !/\s$/u.test(preceding)) return;
      const tag = leadingHashtag.exec(source)?.[0];
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
        marks: [...(node.marks ?? []), { type: MarkdownLiteral.name }],
      });
      end = match.index + match[0].length;
    }
    if (!parts.length) return node;
    if (end < text.length) parts.push({ ...node, text: text.slice(end) });
    return parts;
  });
}
