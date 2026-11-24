import { Extension, getChangedRanges } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { inlineHashtagPattern } from '../../../utils/hashtags';

const key = new PluginKey<DecorationSet>('inlineHashtags');

function decorateBlocks(doc: Node, set: DecorationSet, from: number, to: number) {
  const decorations: Decoration[] = [];
  doc.nodesBetween(from, to, (block, pos) => {
    if (!block.isTextblock) return;
    const start = pos + 1;
    set = set.remove(set.find(start, start + block.content.size));
    if (block.type.spec.code) return false;

    // Marks split text nodes. Match against the whole line so a mark boundary
    // does not turn "word#tag" into a hashtag. Keep ProseMirror offsets intact.
    let text = '';
    block.forEach((child) => {
      if (child.isText) {
        text += child.marks.some((mark) => mark.type.spec.code)
          ? child.text!.replace(/\S/g, '\uFFFC')
          : child.text;
      } else {
        text += child.type.name === 'hardBreak' ? '\n' : '\uFFFC'.repeat(child.nodeSize);
      }
    });
    for (const match of text.matchAll(inlineHashtagPattern)) {
      const from = start + match.index;
      decorations.push(Decoration.inline(from, from + match[0].length, { class: 'hashtag' }));
    }
    return false;
  });
  return set.add(doc, decorations);
}

export const InlineHashtags = Extension.create({
  name: 'inlineHashtags',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        state: {
          init: (_, { doc }) => decorateBlocks(doc, DecorationSet.empty, 0, doc.content.size),
          apply(tr, set) {
            if (!tr.docChanged) return set;
            let mapped = set.map(tr.mapping, tr.doc);
            for (const { newRange } of getChangedRanges(tr)) {
              mapped = decorateBlocks(tr.doc, mapped, newRange.from, newRange.to);
            }
            return mapped;
          },
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ];
  },
});
