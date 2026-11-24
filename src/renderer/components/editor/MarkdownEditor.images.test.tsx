import type { PropsWithChildren } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '../../contexts/AppContext';
import { AssistantProvider } from '../../contexts/AssistantContext';
import { ThemeProvider } from '../../contexts/ThemeContext';
import i18n from '../../i18n';
import { buildExportHtml } from '../../utils/exportHtml';
import { renderPreview } from '../../utils/markdownRender';
import MarkdownEditor from './MarkdownEditor';

const uri = 'fish-image://photo.png';
const displayUrl = 'http://fish-image.localhost/photo.png';
const bytes = Uint8Array.from([1, 2, 3]).buffer;
const save = vi.fn<(buffer: unknown) => Promise<string>>();

function Providers({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <AppProvider>
        <AssistantProvider>{children}</AssistantProvider>
      </AppProvider>
    </ThemeProvider>
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  save.mockReset().mockResolvedValue(uri);
  mockIPC((command, args) => {
    if (command === 'images_save_from_buffer') return save(args);
    if (command.startsWith('encryption_')) return false;
    return [];
  });
  // jsdom has no hit testing. A drop with no hit uses the editor selection.
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      readonly pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    },
  );
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
});

afterEach(() => {
  clearMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'elementFromPoint');
  Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture');
});

async function openNote(source = '') {
  const change = vi.fn<(value: string) => void>();
  const note = (id: string, value: string) => (
    <MarkdownEditor
      noteId={id}
      defaultValue={value}
      onChange={(doc) => change(doc.toString())}
      showToolbar
    />
  );
  const mounted = render(note('first', source), { wrapper: Providers });
  await screen.findByRole('textbox');
  return {
    ...mounted,
    change,
    switchNote: (value: string) => mounted.rerender(note('second', value)),
  };
}

const methods = ['paste', 'drop', 'toolbar'] as const;
function insert(method: (typeof methods)[number]) {
  // jsdom's File lacks the browser arrayBuffer method.
  const file = Object.assign(new File([bytes], 'photo.png', { type: 'image/png' }), {
    arrayBuffer: async () => bytes,
  });
  const editor = screen.getByRole('textbox');
  if (method === 'paste') {
    fireEvent.paste(editor, {
      clipboardData: { items: [{ type: file.type, getAsFile: () => file }], getData: () => '' },
    });
  } else if (method === 'drop') {
    fireEvent.drop(editor, {
      dataTransfer: { files: [file], getData: () => '' },
      clientX: 2,
      clientY: 2,
    });
  } else {
    const picker = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement,
    ) {
      fireEvent.change(this, { target: { files: [file] } });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Insert image' }));
    expect(picker).toHaveBeenCalledOnce();
  }
}

it.each(methods)(
  'uploads an image via %s and keeps its unresized Markdown in MD View',
  async (method) => {
    const { change } = await openNote();
    insert(method);
    await waitFor(() => expect(change).toHaveBeenLastCalledWith('![](fish-image://photo.png)'));
    expect(save).toHaveBeenCalledWith(bytes);
    const img = screen.getByRole('textbox').querySelector('img[src]');
    expect(img?.getAttribute('src')).toBe(displayUrl);
    expect(img?.hasAttribute('width')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'MD' }));
    expect(screen.getByRole('textbox').textContent).toBe('![](fish-image://photo.png)');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('textbox').querySelector('img[src]')?.getAttribute('src')).toBe(
      displayUrl,
    );
  },
);

it.each(methods)('discards a late %s upload after switching notes', async (method) => {
  let finish!: (src: string) => void;
  save.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { change, switchNote } = await openNote('First note');
  insert(method);
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  switchNote('Second note');
  await act(async () => finish(uri));
  expect(screen.getByRole('textbox').textContent).toBe('Second note');
  expect(screen.getByRole('textbox').querySelector('img')).toBeNull();
  expect(change).not.toHaveBeenCalled();
});

it('saves the dragged width and restores inline and standalone resized images across MD View and reload', async () => {
  const { change, unmount } = await openNote('Before ![A & B](fish-image://photo.png) after');
  const img = screen.getByAltText('A & B');
  vi.spyOn(img, 'getBoundingClientRect')
    .mockReturnValueOnce(new DOMRect()) // No layout yet while the local asset is loading.
    .mockReturnValue(new DOMRect(10, 20, 200, 100));
  fireEvent.click(img);
  const handle = screen.getByLabelText('Resize image');
  fireEvent.pointerDown(handle, { button: 0, clientX: 210 });
  fireEvent.pointerUp(handle, { clientX: 210 });
  expect(change).not.toHaveBeenCalled();
  fireEvent.pointerDown(handle, { button: 0, clientX: 210 });
  fireEvent.pointerMove(handle, { clientX: 330 });
  fireEvent.pointerUp(handle, { clientX: 330 });
  const tag = '<img src="fish-image://photo.png" alt="A &amp; B" width="320" />';
  const source = 'Before ' + tag + ' after';
  expect(change).toHaveBeenLastCalledWith(source);
  fireEvent.click(screen.getByRole('button', { name: 'MD' }));
  expect(screen.getByRole('textbox').textContent).toBe(source);
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(screen.getByAltText('A & B').getAttribute('width')).toBe('320');
  unmount();
  await openNote(tag);
  expect(screen.getByAltText('A & B').getAttribute('width')).toBe('320');
  expect(screen.getByAltText('A & B').getAttribute('src')).toBe(displayUrl);
});

it('shrinks a local WebP when the pointer leaves its resize handle before release', async () => {
  const src = 'fish-image://f4b47198-be5f-48c5-9d97-1f7c1e508cb1.webp';
  const { change } = await openNote(`![](${src})`);
  const img = screen.getByRole('textbox').querySelector<HTMLImageElement>('img[src]')!;
  expect(img.src).toBe('http://fish-image.localhost/f4b47198-be5f-48c5-9d97-1f7c1e508cb1.webp');
  vi.spyOn(img, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 582, 1256));
  const handle = screen.getByLabelText('Resize image');
  fireEvent.pointerDown(handle, { button: 0, clientX: 578 });
  fireEvent.pointerUp(handle, { clientX: 578 });
  fireEvent.pointerDown(handle, { button: 0, clientX: 578 });
  // WebView2 can target the image on the first move away from the handle.
  fireEvent.pointerMove(img, { clientX: 518 });
  expect(img.width).toBe(522);
  expect(change).not.toHaveBeenCalled();
  fireEvent.pointerUp(img, { clientX: 458 });
  expect(change).toHaveBeenLastCalledWith(`<img src="${src}" alt="" width="462" />`);
});

it('restores the saved width when a resize is canceled outside the image', async () => {
  const { change } = await openNote(
    '<img src="fish-image://photo.webp" alt="saved" width="420" />',
  );
  const img = screen.getByAltText<HTMLImageElement>('saved');
  vi.spyOn(img, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 420, 900));
  fireEvent.pointerDown(screen.getByLabelText('Resize image'), { button: 0, clientX: 415 });
  fireEvent.pointerMove(document.body, { clientX: 475 });
  expect(img.width).toBe(480);
  fireEvent.pointerCancel(document.body);
  fireEvent.pointerUp(document.body, { clientX: 535 });
  expect(img.width).toBe(420);
  expect(change).not.toHaveBeenCalled();
});

it('continues resizing on the document after the handle loses pointer capture', async () => {
  const { change } = await openNote('![Tall](fish-image://tall.webp)');
  const img = screen.getByAltText<HTMLImageElement>('Tall');
  vi.spyOn(img, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 582, 1256));
  const handle = screen.getByLabelText('Resize image');
  fireEvent.pointerDown(handle, { pointerId: 7, button: 0, clientX: 578 });
  fireEvent.pointerMove(handle, { pointerId: 7, clientX: 548 });
  expect(img.width).toBe(552);
  fireEvent.lostPointerCapture(handle, { pointerId: 7 });
  fireEvent.pointerMove(document, { pointerId: 7, clientX: 518 });
  expect(img.width).toBe(522);
  expect(change).not.toHaveBeenCalled();
  fireEvent.pointerUp(document, { pointerId: 7, clientX: 458 });
  expect(change).toHaveBeenCalledOnce();
  expect(change).toHaveBeenCalledWith(
    '<img src="fish-image://tall.webp" alt="Tall" width="462" />',
  );
});

it.each(['Backspace', 'Delete'])('deletes only the clicked image with %s', async (key) => {
  const { change } = await openNote('Before ![selected](fish-image://photo.png) after');
  fireEvent.click(screen.getByAltText('selected'));
  fireEvent.keyDown(screen.getByRole('textbox'), { key });
  expect(change).toHaveBeenLastCalledWith('Before  after');
  expect(screen.queryByAltText('selected')).toBeNull();
});

it('preserves width and sanitizes note markup in HTML export and the PDF print body', async () => {
  const source =
    '<img src="fish-image://photo.png" width="320" onload="ignored" /><script type="text/plain">unsafe</script>';
  const exported = await buildExportHtml('Note', source, async () => 'data:image/png;base64,AQID');
  for (const [html, src] of [
    [exported, 'data:image/png;base64,AQID'],
    [renderPreview(source), displayUrl],
  ]) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('img')?.getAttribute('width')).toBe('320');
    expect(doc.querySelector('img')?.getAttribute('src')).toBe(src);
    expect(doc.querySelector('script, [onload]')).toBeNull();
  }
});
