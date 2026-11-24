import type { PropsWithChildren } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '../../contexts/AppContext';
import { AssistantProvider } from '../../contexts/AssistantContext';
import { ThemeProvider } from '../../contexts/ThemeContext';
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

async function renderMarkdownEditor(defaultValue = '') {
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
        showToolbar
      />,
      { wrapper: Providers },
    );
  });
  return { onChange, onSave };
}

function paste(editor: HTMLElement, text: string) {
  fireEvent.paste(editor, {
    clipboardData: { getData: (type: string) => (type === 'text/plain' ? text : '') },
  });
}

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
  const setHeading = (level: number) => {
    fireEvent.click(screen.getByRole('button', { name: 'H' }));
    fireEvent.click(screen.getByRole('button', { name: `Heading ${level}` }));
  };
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
