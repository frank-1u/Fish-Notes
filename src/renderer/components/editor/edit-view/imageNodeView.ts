import type { NodeViewRenderer } from '@tiptap/core';
import i18n from '../../../i18n';
import { imageDisplayUrl } from '../../../utils/markdownRender';
import './image.css';

export const imageNodeView: NodeViewRenderer = ({ node, editor, getPos }) => {
  const dom = document.createElement('span');
  dom.className = 'edit-image';
  const image = document.createElement('img');
  image.alt = node.attrs.alt ?? '';
  if (node.attrs.title) image.title = node.attrs.title;
  if (node.attrs.width) image.width = node.attrs.width;
  const src = String(node.attrs.src ?? '');
  const protocol = URL.canParse(src, document.baseURI) && new URL(src, document.baseURI).protocol;
  if (src && (protocol === 'fish-image:' || protocol === 'https:' || protocol === 'http:')) {
    image.src = imageDisplayUrl(src);
  }
  const handle = document.createElement('span');
  handle.className = 'edit-image-handle';
  handle.setAttribute('aria-label', i18n.t('Resize image'));
  handle.title = i18n.t('Resize image');
  dom.append(image, handle);

  const selectImage = () => {
    const pos = getPos();
    if (pos !== undefined)
      editor.chain().setNodeSelection(pos).focus(null, { scrollIntoView: false }).run();
  };
  image.onclick = selectImage;

  let drag: { id: number; x: number; width: number; listeners: AbortController } | undefined;
  function restoreWidth() {
    if (!drag) return;
    drag.listeners.abort();
    drag = undefined;
    if (node.attrs.width) image.width = node.attrs.width;
    else image.removeAttribute('width');
  }
  const dragWidth = (event: PointerEvent) =>
    drag && drag.id === event.pointerId
      ? Math.max(1, Math.round(drag.width + event.clientX - drag.x))
      : undefined;
  function previewWidth(event: PointerEvent) {
    const width = dragWidth(event);
    if (width !== undefined) image.width = width;
  }
  function commitWidth(event: PointerEvent) {
    const width = dragWidth(event);
    if (width === undefined || !drag) return;
    const changed = event.clientX !== drag.x && Math.round(drag.width) !== width;
    restoreWidth();
    const pos = getPos();
    if (changed && pos !== undefined) {
      editor.chain().setNodeSelection(pos).updateAttributes('image', { width }).run();
    }
  }
  function cancelDrag(event: PointerEvent) {
    if (drag?.id === event.pointerId) restoreWidth();
  }
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || drag) return;
    event.preventDefault();
    selectImage();
    const listeners = new AbortController();
    drag = {
      id: event.pointerId,
      x: event.clientX,
      width: image.getBoundingClientRect().width,
      listeners,
    };
    // WebView2 can deliver the next move/up to the image despite accepting capture.
    const options = { signal: listeners.signal };
    const doc = handle.ownerDocument;
    doc.addEventListener('pointermove', previewWidth, options);
    doc.addEventListener('pointerup', commitWidth, options);
    doc.addEventListener('pointercancel', cancelDrag, options);
    handle.addEventListener('lostpointercapture', cancelDrag, options);
    doc.defaultView?.addEventListener('blur', restoreWidth, options);
    handle.setPointerCapture(event.pointerId);
  });
  return {
    dom,
    stopEvent: (event) => event.target === handle,
    ignoreMutation: (mutation) => mutation.type !== 'selection',
    destroy: restoreWidth,
  };
};
