import type { PropsWithChildren } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '../../contexts/AppContext';
import { AssistantProvider } from '../../contexts/AssistantContext';
import { ThemeProvider, useTheme } from '../../contexts/ThemeContext';
import i18n from '../../i18n';
import Editor from '../Editor';
import MarkdownEditor from './MarkdownEditor';

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
  mockIPC((command) => {
    switch (command) {
      case 'encryption_has_password':
      case 'encryption_is_unlocked':
        return false;
      case 'notes_list':
      case 'tags_get_all':
      case 'tags_get_by_note_id':
      case 'chats_list':
        return [];
      default:
        throw new Error(`Unexpected IPC command: ${command}`);
    }
  });
});

afterEach(clearMocks);

const modeKey = 'fish-notes:editor-mode';

async function renderMarkdownEditor(defaultValue = '', mdView = true, showToolbar?: boolean) {
  if (mdView) localStorage.setItem(modeKey, 'source');
  const onChange = vi.fn<(source: string) => void>();
  const onSave = vi.fn();
  // Allow the providers' initial IPC reads to settle before interacting.
  await act(async () => {
    render(
      <MarkdownEditor
        noteId="note-1"
        defaultValue={defaultValue}
        onChange={(doc) => onChange(doc.toString())}
        onSave={onSave}
        showToolbar={showToolbar}
      />,
      { wrapper: Providers },
    );
  });
  await screen.findByRole('textbox');
  return { onChange, onSave };
}

function paste(editor: HTMLElement, text: string) {
  fireEvent.paste(editor, {
    clipboardData: { getData: (type: string) => (type === 'text/plain' ? text : '') },
  });
}

it.each([undefined, false])(
  'ignores a legacy hidden toolbar setting with showToolbar=%s in both views',
  async (showToolbar) => {
    localStorage.setItem('fish-notes:editor-toolbar', '0');
    await renderMarkdownEditor('Note', false, showToolbar);
    const boldButton = () => screen.queryByRole('button', { name: 'Bold' });
    expect(Boolean(boldButton())).toBe(showToolbar !== false);
    fireEvent.click(screen.getByRole('button', { name: 'MD' }));
    expect(Boolean(boldButton())).toBe(showToolbar !== false);
  },
);

it('emits edited Note Source immediately from MD View', async () => {
  const { onChange } = await renderMarkdownEditor('周报');
  paste(screen.getByRole('textbox'), '## ');
  expect(onChange).toHaveBeenLastCalledWith('## 周报');
});

it.each([
  ['Bold', '****'],
  ['Italic', '**'],
  ['Strikethrough', '~~~~'],
  ['Blockquote', '> '],
  ['Link', '[text](url)'],
  ['Inline code', '``'],
  ['Code block', '\n```\n\n```\n'],
  ['Bulleted list', '- '],
  ['Numbered list', '1. '],
  ['Task list', '- [ ] '],
  ['Insert image', '![](url)'],
  ['Horizontal rule', '---\n\n'],
])('applies the %s toolbar command to Note Source', async (name, expected) => {
  const { onChange } = await renderMarkdownEditor();
  fireEvent.click(screen.getByRole('button', { name }));
  expect(onChange).toHaveBeenLastCalledWith(expected);
});

it.each(['#', '##', '###', '####', '#####', '######'])(
  'applies heading %s from the toolbar',
  async (prefix) => {
    const { onChange } = await renderMarkdownEditor('Agenda');
    fireEvent.click(screen.getByRole('button', { name: 'H' }));
    fireEvent.click(screen.getByRole('button', { name: `Heading ${prefix.length}` }));
    expect(onChange).toHaveBeenLastCalledWith(`${prefix} Agenda`);
  },
);

it.each([3, 4, 5, 6])('toggles heading level %i with its Edit View shortcut', async (level) => {
  const { onChange } = await renderMarkdownEditor('Agenda', false);
  const editor = screen.getByRole('textbox');
  fireEvent.keyDown(editor, { key: String(level), ctrlKey: true });
  expect(screen.queryByRole('heading', { name: 'Agenda', level })).toBeTruthy();
  expect(onChange).toHaveBeenLastCalledWith('#'.repeat(level) + ' Agenda');
  fireEvent.keyDown(editor, { key: String(level), ctrlKey: true });
  expect(screen.queryByRole('heading')).toBeNull();
  expect(onChange).toHaveBeenLastCalledWith('Agenda');
});

it('inserts the dimensions chosen in the toolbar table picker', async () => {
  const { onChange } = await renderMarkdownEditor();
  // jsdom has no canvas font metrics. Use the same fallback as a missing 2D context.
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    fireEvent.click(screen.getByTestId('table-size-3x2'));
    expect(onChange).toHaveBeenLastCalledWith(
      '|     |     |\n| --- | --- |\n|     |     |\n|     |     |\n',
    );
  } finally {
    canvas.mockRestore();
  }
});

it('formats selected text and requests an explicit save with keyboard shortcuts', async () => {
  const { onChange, onSave } = await renderMarkdownEditor('MD');
  const editor = screen.getByRole('textbox');
  fireEvent.keyDown(editor, { key: 'a', ctrlKey: true });
  fireEvent.keyDown(editor, { key: 'b', ctrlKey: true });
  expect(onChange).toHaveBeenLastCalledWith('**MD**');
  fireEvent.keyDown(editor, { key: 's', ctrlKey: true });
  expect(onSave).toHaveBeenCalledOnce();
});

it('saves only the latest Note Source after 500 ms of inactivity', async () => {
  localStorage.setItem(modeKey, 'source');
  vi.useFakeTimers();
  const onContentChange = vi.fn();
  // Editor owns the autosave callback passed to MarkdownEditor in the app.
  await act(async () => {
    render(
      <Editor
        noteId="note-1"
        title="Meeting"
        content="Agenda"
        isLocked={false}
        loading={false}
        onContentChange={onContentChange}
      />,
      { wrapper: Providers },
    );
  });
  setHeading(1);
  act(() => {
    vi.advanceTimersByTime(300);
  });
  setHeading(2);
  act(() => {
    vi.advanceTimersByTime(499);
  });
  expect(onContentChange).not.toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(onContentChange.mock.calls).toEqual([['note-1', '## Agenda']]);
});

it.each([null, 'preview', 'split'])(
  'opens %s mode in Edit View and remembers mode shortcuts',
  async (legacy) => {
    if (legacy) localStorage.setItem(modeKey, legacy);
    const { onChange } = await renderMarkdownEditor('## Agenda', false);
    expect(screen.getByRole('heading', { level: 2, name: 'Agenda' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Preview|Split/ })).toBeNull();
    if (legacy) expect(localStorage.getItem(modeKey)).toBe('edit');
    fireEvent.keyDown(screen.getByRole('textbox'), { key: '2', ctrlKey: true });
    expect(screen.getByRole('textbox').textContent).toBe('## Agenda');
    expect(localStorage.getItem(modeKey)).toBe('source');
    fireEvent.keyDown(screen.getByRole('textbox'), { key: '1', metaKey: true });
    expect(screen.getByRole('heading', { name: 'Agenda' })).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  },
);

function setHeading(level: number) {
  fireEvent.click(screen.getByRole('button', { name: 'H' }));
  fireEvent.click(screen.getByRole('button', { name: `Heading ${level}` }));
}

it('keeps unsaved Note Source and its blank lines in both modes', async () => {
  const { onChange } = await renderMarkdownEditor('\nFirst\n\n\n\nLast\n\n', false);
  const editor = screen.getByRole('textbox');
  // Place the caret in the first text paragraph.
  editor.focus();
  window.getSelection()!.collapse(screen.getByText('First').firstChild, 0);
  await act(async () => {
    fireEvent(document, new Event('selectionchange'));
  });
  setHeading(2);
  expect(onChange).toHaveBeenLastCalledWith('\n## First\n\n\n\nLast\n\n');
  fireEvent.click(screen.getByRole('button', { name: 'MD' }));
  paste(screen.getByRole('textbox'), 'Start');
  expect(onChange).toHaveBeenLastCalledWith('Start\n## First\n\n\n\nLast\n\n');
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(screen.getByRole('heading', { name: 'First' })).toBeTruthy();
  expect(screen.getByText('Start')).toBeTruthy();
  expect(screen.getByText('Last')).toBeTruthy();
});

it('renders core formatting and edits fenced code language without exposing delimiters', async () => {
  const { onChange } = await renderMarkdownEditor(
    '```js\nx()\n\nend()\n```\n\n> **bold** *italic* ~~strike~~ `code`\n\n- one\n\n1. two\n\n---',
    false,
  );
  const editor = screen.getByRole('textbox');
  expect(editor.querySelector('pre code')?.textContent).toBe('x()\n\nend()');
  expect(editor.querySelector('blockquote strong')?.textContent).toBe('bold');
  expect(editor.querySelector('em')?.textContent).toBe('italic');
  expect(editor.querySelector('s')?.textContent).toBe('strike');
  expect(editor.querySelector('blockquote code')?.textContent).toBe('code');
  expect(editor.querySelector('ul li')?.textContent).toBe('one');
  expect(editor.querySelector('ol li')?.textContent).toBe('two');
  expect(editor.querySelector('hr')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Code language'), { target: { value: 'python' } });
  expect(onChange.mock.lastCall?.[0]).toContain('```python\nx()\n\nend()\n```');
});

it('formats Edit View with the keyboard and saves its Markdown', async () => {
  const { onChange, onSave } = await renderMarkdownEditor('Agenda', false);
  const editor = screen.getByRole('textbox');
  editor.focus();
  fireEvent.keyDown(editor, { key: 'a', ctrlKey: true });
  fireEvent.keyDown(editor, { key: 'b', ctrlKey: true });
  expect(editor.querySelector('strong')?.textContent).toBe('Agenda');
  expect(onChange).toHaveBeenLastCalledWith('**Agenda**');
  fireEvent.keyDown(editor, { key: 's', ctrlKey: true });
  expect(onSave).toHaveBeenCalledOnce();
});

// jsdom does not perform the default contenteditable text insertion.
async function typeCharacter(editor: HTMLElement, char: string) {
  const selection = window.getSelection()!;
  if (selection.anchorNode === editor && editor.firstElementChild) {
    selection.collapse(editor.firstElementChild, 0);
  }
  const range = selection.getRangeAt(0);
  const text = document.createTextNode(char);
  range.deleteContents();
  range.insertNode(text);
  selection.collapse(text, 1);
  await act(async () => {
    fireEvent.input(editor, { data: char, inputType: 'insertText' });
  });
}

it.each([
  ['#', ' ', 'h1'],
  ['######', ' ', 'h6'],
  ['-', ' ', 'ul'],
  ['1.', ' ', 'ol'],
  ['>', ' ', 'blockquote'],
  ['``', '`', 'pre'],
  ['--', '-', 'hr'],
  ['**bold*', '*', 'strong'],
  ['*italic', '*', 'em'],
  ['`code', '`', 'code'],
  ['~~strike~', '~', 's'],
])('auto-converts typed %s%s in Edit View', async (prefix, last, tag) => {
  await renderMarkdownEditor('', false);
  const editor = screen.getByRole('textbox');
  editor.focus();
  for (const ch of prefix + last) await typeCharacter(editor, ch);
  expect(editor.querySelector(tag)).toBeTruthy();
});

function ThemeSwitcher() {
  const { setTheme } = useTheme();
  return (
    <>
      <button onClick={() => setTheme('dark')}>Dark</button>
      <button onClick={() => setTheme('ink')}>Ink</button>
    </>
  );
}

it('flushes encrypted edits to their own note across theme and note changes', async () => {
  mockIPC((command) => {
    if (command === 'notes_get_decrypted') return { content: 'Secret\n\n\nTail' };
    if (command.startsWith('encryption_')) return true;
    return [];
  });
  const onContentChange = vi.fn();
  const note = (id: string, locked: boolean) => (
    <>
      <ThemeSwitcher />
      <Editor
        noteId={id}
        title="Title"
        content={locked ? '' : 'Next'}
        loading={false}
        isLocked={locked}
        onContentChange={onContentChange}
      />
    </>
  );
  const view = render(note('private', true), { wrapper: Providers });
  await screen.findByText('Secret');
  vi.useFakeTimers();
  setHeading(1);
  fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ink' }));
  expect(screen.getByRole('heading', { name: 'Secret' })).toBeTruthy();
  expect(onContentChange).not.toHaveBeenCalled();
  view.rerender(note('public', false));
  expect(onContentChange.mock.calls).toEqual([['private', '# Secret\n\n\nTail']]);
  expect(screen.queryByText('Secret')).toBeNull();
  setHeading(2);
  act(() => vi.advanceTimersByTime(499));
  expect(onContentChange).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(1));
  expect(onContentChange).toHaveBeenLastCalledWith('public', '## Next');
});

it('keeps GFM tasks, tables, links and local image source when editing another paragraph', async () => {
  const existing =
    '- [x] done\n- [ ] next\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n[link](https://example.com) ![img](fish-image://image.png)';
  const { onChange } = await renderMarkdownEditor('Title\n\n' + existing, false);
  setHeading(1);
  expect(onChange).toHaveBeenLastCalledWith('# Title\n\n' + existing);
});

it('preserves user-entered empty paragraphs and their position when reopened', async () => {
  const { onChange } = await renderMarkdownEditor('', false);
  const editor = screen.getByRole('textbox');
  editor.focus();
  await typeCharacter(editor, 'A');
  for (let i = 0; i < 3; i++) fireEvent.keyDown(editor, { key: 'Enter', keyCode: 13 });
  await typeCharacter(editor, 'B');
  expect(editor.querySelectorAll('p')).toHaveLength(4);
  expect(onChange).toHaveBeenLastCalledWith('A\n\n\n\nB');
  fireEvent.click(screen.getByRole('button', { name: 'MD' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect([...screen.getByRole('textbox').querySelectorAll('p')].map((p) => p.textContent)).toEqual([
    'A',
    '',
    '',
    'B',
  ]);
});

it('retains code fences, literal Markdown and vertical spacing inside quotations', async () => {
  const source = 'First\n\n> a\n>\n>\n> b\n\n````md\n```\ncode\n```\n````\n\n\\# literal';
  const { onChange } = await renderMarkdownEditor(source, false);
  setHeading(1);
  expect(onChange).toHaveBeenLastCalledWith('# ' + source);
});

it('round-trips overlapping bold and italic selections as pure Markdown', async () => {
  const { onChange } = await renderMarkdownEditor('**abcdef**ghijkl', false);
  const editor = screen.getByRole('textbox');
  editor.focus();
  window
    .getSelection()!
    .setBaseAndExtent(
      screen.getByText('abcdef').firstChild!,
      3,
      editor.querySelector('p')!.lastChild!,
      3,
    );
  await act(async () => {
    fireEvent(document, new Event('selectionchange'));
  });
  fireEvent.click(screen.getByRole('button', { name: 'Italic' }));
  expect(editor.querySelector('em')?.textContent).toContain('def');
  expect(onChange.mock.lastCall?.[0]).not.toMatch(/<\/?(em|strong)>/);
  fireEvent.click(screen.getByRole('button', { name: 'MD' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  const reopened = screen.getByRole('textbox');
  expect([...reopened.querySelectorAll('em')].map((el) => el.textContent).join('')).toBe('defghi');
  expect([...reopened.querySelectorAll('strong')].map((el) => el.textContent).join('')).toBe(
    'abcdef',
  );
});

it('retains a literal underscore inside crossed word-internal emphasis', async () => {
  const { onChange } = await renderMarkdownEditor('aa_a zz', false);
  const editor = screen.getByRole('textbox');
  editor.focus();
  const text = editor.querySelector('p')!.firstChild!;
  window.getSelection()!.setBaseAndExtent(text, 0, text, 3);
  await act(async () => {
    fireEvent(document, new Event('selectionchange'));
  });
  fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
  window
    .getSelection()!
    .setBaseAndExtent(
      editor.querySelector('strong')!.firstChild!,
      2,
      editor.querySelector('p')!.lastChild!,
      1,
    );
  await act(async () => {
    fireEvent(document, new Event('selectionchange'));
  });
  fireEvent.click(screen.getByRole('button', { name: 'Italic' }));
  expect(onChange.mock.lastCall?.[0]).not.toMatch(/<\/?(?:em|strong)>/);
  fireEvent.click(screen.getByRole('button', { name: 'MD' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  const reopened = screen.getByRole('textbox');
  expect(reopened.textContent).toBe('aa_a zz');
  expect([...reopened.querySelectorAll('strong')].map((el) => el.textContent).join('')).toBe('aa_');
  expect([...reopened.querySelectorAll('em')].map((el) => el.textContent).join('')).toBe('_a');
});

it('preserves loose and nested list content and blank lines after editing', async () => {
  const list = '- root\n  - nested\n\n\n  after\n\n- second\n\n3. first\n4. last';
  const { onChange } = await renderMarkdownEditor('Title\n\n' + list, false);
  setHeading(1);
  expect(onChange).toHaveBeenLastCalledWith('# Title\n\n' + list);
});

it('keeps the typing focus on the editor after a mode shortcut', async () => {
  await renderMarkdownEditor('Note', false);
  screen.getByRole('textbox').focus();
  fireEvent.keyDown(screen.getByRole('textbox'), { key: '2', ctrlKey: true });
  expect(document.activeElement).toBe(screen.getByRole('textbox'));
  fireEvent.keyDown(screen.getByRole('textbox'), { key: '1', ctrlKey: true });
  expect(document.activeElement).toBe(screen.getByRole('textbox'));
});
