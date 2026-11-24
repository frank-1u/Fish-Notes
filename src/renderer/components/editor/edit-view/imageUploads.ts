import type { Editor } from '@tiptap/core';
import type { EditorView } from '@tiptap/pm/view';
import { saveImageFile } from '../saveImageFile';

// Edit View creates a new ProseMirror view for each loaded Note Source. Keep
// the initiating view through the picker and upload, including A → B → A.
async function upload(editor: Editor, files: File[], dropAt?: number) {
  if (editor.isDestroyed) return;
  const view = editor.view;
  const doc = view.state.doc;
  const images = await Promise.all(files.map(saveImageFile));
  if (view.isDestroyed || !view.dom.isConnected) return;
  const nodes = images.flatMap((src) => (src ? [{ type: 'image', attrs: { src } }] : []));
  if (!nodes.length) return;
  const pos = doc === view.state.doc ? dropAt : undefined;
  const { from, to } = view.state.selection;
  editor
    .chain()
    .focus()
    .insertContentAt(pos ?? { from, to }, nodes)
    .run();
}

export function imageEvents(editor: Editor) {
  return {
    paste(_view: EditorView, event: ClipboardEvent) {
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
      if (!files.length) return false;
      event.preventDefault();
      void upload(editor, files);
      return true;
    },
    drop(view: EditorView, event: DragEvent) {
      const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
        file.type.startsWith('image/'),
      );
      if (!files.length) return false;
      event.preventDefault();
      const pos =
        view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ??
        view.state.selection.from;
      void upload(editor, files, pos);
      return true;
    },
  };
}

export function chooseImage(editor: Editor) {
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'image/*';
  picker.onchange = () => {
    if (picker.files?.length) void upload(editor, Array.from(picker.files));
  };
  picker.click();
}
