import { api } from '../../../api';
import { EditorView } from '@codemirror/view';
import { EditorSelection, StateField } from '@codemirror/state';

async function fileToMarkdown(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null;
  try {
    const buffer = await file.arrayBuffer();
    const src = await api.images.saveFromBuffer(buffer, file.type);
    return `![](${src})`;
  } catch (err) {
    console.error('Failed to save image:', err);
    return null;
  }
}

function insertAt(view: EditorView, pos: number, text: string) {
  const insert = `${text}\n`;
  view.dispatch({
    changes: { from: pos, to: pos, insert },
    selection: EditorSelection.cursor(pos + insert.length),
    scrollIntoView: true,
  });
}

// Each loaded document owns its uploads, including while the same view is reused.
const imageOwner = StateField.define({
  create: () => Symbol(),
  update: (owner: symbol) => owner,
});

const imageEvents = EditorView.domEventHandlers({
  drop(event, view) {
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return false;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return false;

    event.preventDefault();
    event.stopPropagation();

    const pos =
      view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.from;
    const doc = view.state.doc;
    const owner = view.state.field(imageOwner);

    void (async () => {
      const images: string[] = [];
      for (const file of imageFiles) {
        const md = await fileToMarkdown(file);
        if (md) images.push(md);
      }
      if (images.length > 0 && view.dom.isConnected && view.state.field(imageOwner) === owner) {
        const insertionPoint = view.state.doc === doc ? pos : view.state.selection.main.from;
        insertAt(view, insertionPoint, images.join('\n'));
      }
    })();

    return true;
  },
  paste(event, view) {
    const items = event.clipboardData?.items;
    if (!items) return false;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (!blob) continue;
        event.preventDefault();
        event.stopPropagation();
        const owner = view.state.field(imageOwner);
        void (async () => {
          const md = await fileToMarkdown(blob);
          if (md && view.dom.isConnected && view.state.field(imageOwner) === owner) {
            insertAt(view, view.state.selection.main.from, md);
          }
        })();
        return true;
      }
    }
    return false;
  },
});

export const imageHandling = [imageOwner, imageEvents];
