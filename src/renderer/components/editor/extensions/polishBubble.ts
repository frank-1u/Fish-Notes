import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

import { minimumSelectionLength, type ActionSelection } from '../ActionSelection';

/**
 * 监听 CodeMirror 选区变化，当选中文字 >= MIN_LENGTH 时通过回调汇报选区
 * 信息；选区清空或太短时回调 null。React 层据此决定是否渲染浮动按钮。
 */
export function polishBubbleExtension(onChange: (sel: ActionSelection | null) => void): Extension {
  return EditorView.updateListener.of((update) => {
    if (!update.selectionSet && !update.docChanged) return;
    const main = update.state.selection.main;
    if (main.empty) {
      onChange(null);
      return;
    }
    const text = update.state.sliceDoc(main.from, main.to);
    if (text.trim().length < minimumSelectionLength) {
      onChange(null);
      return;
    }
    const { view } = update;
    const { from, to } = main;
    onChange({
      text,
      getMarkdown: () => text,
      getBounds: () => {
        const start = view.coordsAtPos(from);
        const end = view.coordsAtPos(to);
        return start && end ? { start, end, editor: view.dom.getBoundingClientRect() } : null;
      },
      replaceMarkdown(markdown) {
        if (to > view.state.doc.length || view.state.sliceDoc(from, to) !== text) return false;
        view.dispatch({
          changes: { from, to, insert: markdown },
          selection: { anchor: from + markdown.length },
        });
        view.focus();
        return true;
      },
    });
  });
}
