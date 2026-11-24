import type { Editor } from '@tiptap/core';
import { Slice, type Fragment } from '@tiptap/pm/model';
import { AllSelection, TextSelection } from '@tiptap/pm/state';
import { minimumSelectionLength, type ActionSelection } from '../ActionSelection';
import type { createNoteSourceCodec } from './noteSource';

// ProseMirror keeps its last model selection when the browser selection leaves
// the editor or loses all ranges. Also handle restoring that same range, which
// does not necessarily dispatch a ProseMirror selection transaction.
export function watchNativeSelection(editor: Editor, onChange: (inside: boolean) => void) {
  const dom = editor.view.dom;
  const document = dom.ownerDocument;
  let wasInside = true;
  function update() {
    const selection = document.getSelection();
    const inside =
      !!selection &&
      !selection.isCollapsed &&
      dom.contains(selection.anchorNode) &&
      dom.contains(selection.focusNode);
    if (inside !== wasInside) onChange(inside);
    wasInside = inside;
  }
  document.addEventListener('selectionchange', update);
  return () => document.removeEventListener('selectionchange', update);
}

function replacementSlice(content: Fragment, original: Slice) {
  // Join partial paragraphs to the untouched text on each side. Join other
  // block wrappers only when they were already part of the captured selection.
  // Otherwise an open slice would paste a new heading as ordinary inline text.
  function openDepth(edge: 'firstChild' | 'lastChild', limit: number) {
    let before = original.content[edge];
    let after = content[edge];
    let depth = 0;
    while (depth < limit && after && !after.isLeaf) {
      if (after.type.name === 'paragraph') return depth + 1;
      if (!before?.sameMarkup(after)) break;
      depth++;
      before = before[edge];
      after = after[edge];
    }
    return depth;
  }
  return new Slice(
    content,
    openDepth('firstChild', original.openStart),
    openDepth('lastChild', original.openEnd),
  );
}

export function editViewSelection(
  editor: Editor,
  codec: ReturnType<typeof createNoteSourceCodec>,
): ActionSelection | null {
  const { doc, selection } = editor.state;
  if (
    selection.empty ||
    !(selection instanceof TextSelection || selection instanceof AllSelection)
  ) {
    return null;
  }
  const { from, to } = selection;
  const text = doc.textBetween(from, to, '\n', (node) =>
    node.type.name === 'hardBreak' ? '\n' : '',
  );
  if (text.trim().length < minimumSelectionLength) return null;
  return {
    text,
    getMarkdown: () => codec.serialize(doc.copy(selection.content().content)),
    getBounds() {
      if (editor.isDestroyed || editor.state.doc !== doc) return null;
      const view = editor.view;
      return {
        start: view.coordsAtPos(from),
        end: view.coordsAtPos(to),
        editor: view.dom.parentElement!.getBoundingClientRect(),
      };
    },
    replaceMarkdown(markdown) {
      if (editor.isDestroyed || editor.state.doc !== doc) return false;
      const parsed = editor.schema.nodeFromJSON(codec.parse(markdown));
      const tr = editor.state.tr;
      selection.replace(tr, replacementSlice(parsed.content, selection.content()));
      editor.view.dispatch(tr.scrollIntoView());
      editor.view.focus();
      return true;
    },
  };
}
