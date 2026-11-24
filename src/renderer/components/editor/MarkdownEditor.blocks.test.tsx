import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '../../contexts/AppContext';
import { AssistantProvider } from '../../contexts/AssistantContext';
import { ThemeProvider } from '../../contexts/ThemeContext';
import i18n from '../../i18n';
import MarkdownEditor from './MarkdownEditor';

const opened = vi.fn();

beforeEach(async () => {
  opened.mockClear();
  await i18n.changeLanguage('en');
  mockIPC((command, args) => {
    if (command === 'plugin:opener|open_url' && args && 'url' in args) return opened(args.url);
    if (command.startsWith('encryption_')) return false;
    if (['notes_list', 'tags_get_all', 'tags_get_by_note_id', 'chats_list'].includes(command))
      return [];
    throw new Error(`Unexpected IPC command: ${command}`);
  });
});
afterEach(clearMocks);

async function mount(source: string) {
  const onChange = vi.fn<(source: string) => void>();
  render(
    <ThemeProvider>
      <AppProvider>
        <AssistantProvider>
          <MarkdownEditor
            noteId="blocks"
            defaultValue={source}
            showToolbar
            onChange={(doc) => onChange(doc.toString())}
          />
        </AssistantProvider>
      </AppProvider>
    </ThemeProvider>,
  );
  const editor = await screen.findByRole('textbox');
  return { editor, onChange };
}

function clickButton(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

async function caret(editor: HTMLElement, container: Node, offset = 0) {
  editor.focus();
  window.getSelection()!.collapse(container, offset);
  await act(async () => {
    fireEvent(document, new Event('selectionchange'));
  });
}

// Supply the browser's default contenteditable insertion, absent in jsdom.
async function type(editor: HTMLElement, value: string) {
  for (const char of value) {
    const selection = window.getSelection()!;
    const range = selection.getRangeAt(0);
    const node = document.createTextNode(char);
    range.deleteContents();
    range.insertNode(node);
    selection.collapse(node, char.length);
    await act(async () => {
      fireEvent.input(editor, { inputType: 'insertText', data: char });
    });
  }
}

it('toggles a loaded task in a mixed GFM list and persists it through MD View', async () => {
  const source = '- Plan\n- [ ] **Ship**\n  - Notes\n- [x] Done';
  const { onChange } = await mount(source);
  const [ship, done] = screen.getAllByRole<HTMLInputElement>('checkbox');
  expect(ship.checked).toBe(false);
  expect(done.checked).toBe(true);
  fireEvent.click(ship);
  expect(screen.getAllByRole<HTMLInputElement>('checkbox')[0].checked).toBe(true);
  expect(onChange).toHaveBeenLastCalledWith(source.replace('[ ]', '[x]'));
  clickButton('MD');
  clickButton('Edit');
  const reopened = screen.getAllByRole<HTMLInputElement>('checkbox')[0];
  expect(reopened.checked).toBe(true);
  fireEvent.click(reopened);
  expect(onChange).toHaveBeenLastCalledWith(source);
});

it.each([' ', 'x'])('converts a naturally typed task marker with state [%s]', async (state) => {
  const { editor, onChange } = await mount('');
  await caret(editor, editor.querySelector('p')!);
  await type(editor, `- [${state}] Go`);
  expect(screen.getByRole<HTMLInputElement>('checkbox').checked).toBe(state === 'x');
  expect(onChange).toHaveBeenLastCalledWith(`- [${state}] Go`);
});

it('inserts a task with the toolbar and reopens the empty task', async () => {
  const { onChange } = await mount('');
  clickButton('Task list');
  expect(screen.getByRole<HTMLInputElement>('checkbox').checked).toBe(false);
  expect(onChange).toHaveBeenLastCalledWith('- [ ] ');
  clickButton('MD');
  clickButton('Edit');
  const reopened = screen.getByRole<HTMLInputElement>('checkbox');
  expect(reopened.checked).toBe(false);
  fireEvent.click(reopened);
  expect(onChange).toHaveBeenLastCalledWith('- [x] ');
});

it('inserts the picked table dimensions and edits adjacent cells using Tab and Shift+Tab', async () => {
  const { editor, onChange } = await mount('');
  clickButton('Table');
  fireEvent.click(screen.getByTestId('table-size-3x2'));
  const table = screen.getByRole('table');
  expect(within(table).getAllByRole('row')).toHaveLength(3);
  const [first, second] = within(table).getAllByRole('columnheader');
  await caret(editor, first.querySelector('p')!);
  await type(editor, 'A');
  fireEvent.keyDown(editor, { key: 'Tab', keyCode: 9 });
  await type(editor, 'B');
  fireEvent.keyDown(editor, { key: 'Tab', keyCode: 9, shiftKey: true });
  await type(editor, 'C');
  expect(first.textContent).toBe('C');
  expect(second.textContent).toBe('B');
  expect(onChange.mock.lastCall?.[0]).toMatch(
    /^\| C \| B \|\n\| --- \| --- \|\n\|\s*\|\s*\|\n\|\s*\|\s*\|$/,
  );
  clickButton('MD');
  clickButton('Edit');
  expect(screen.getByRole('columnheader', { name: 'C' })).toBeTruthy();
  expect(screen.getAllByRole('cell')).toHaveLength(4);
});

it('edits a loaded GFM table, preserves alignment and literal pipes, and adds or deletes rows, columns and the table', async () => {
  const { editor, onChange } = await mount(
    'Intro\n\n| Key | Value |\n| :--- | ---: |\n| A | **one** |',
  );
  const cell = screen.getByRole('cell', { name: 'A' });
  await caret(editor, cell.querySelector('p')!.firstChild!, 1);
  await type(editor, '|B');
  const edited = 'Intro\n\n| Key | Value |\n| :--- | ---: |\n| A\\|B | **one** |';
  expect(onChange).toHaveBeenLastCalledWith(edited);
  clickButton('Add row');
  expect(screen.getAllByRole('row')).toHaveLength(3);
  clickButton('Add column');
  expect(screen.getAllByRole('columnheader')).toHaveLength(3);
  const empty = screen.getAllByRole('row')[2].querySelectorAll('td')[1];
  await caret(editor, empty.querySelector('p')!);
  clickButton('Delete column');
  clickButton('Delete row');
  expect(onChange).toHaveBeenLastCalledWith(edited);
  clickButton('MD');
  clickButton('Edit');
  const reopened = screen.getByRole('cell', { name: 'A|B' });
  expect(screen.getByRole('cell', { name: 'one' }).querySelector('strong')).toBeTruthy();
  await caret(screen.getByRole('textbox'), reopened.querySelector('p')!.firstChild!);
  clickButton('Delete table');
  expect(screen.queryByRole('table')).toBeNull();
  expect(onChange).toHaveBeenLastCalledWith('Intro');
});

it('plain click opens link actions without navigation and supports open, edit and remove', async () => {
  const { onChange } = await mount('Go [old](https://old.example) now');
  const link = screen.getByRole('link', { name: 'old' });
  expect(fireEvent.click(link)).toBe(false);
  expect(opened).not.toHaveBeenCalled();
  clickButton('Open link');
  expect(opened).toHaveBeenCalledWith('https://old.example');
  fireEvent.click(link);
  clickButton('Edit link');
  fireEvent.change(screen.getByLabelText('Link text'), { target: { value: 'new' } });
  fireEvent.change(screen.getByLabelText('Link URL'), { target: { value: 'https://new.example' } });
  clickButton('Apply');
  expect(onChange).toHaveBeenLastCalledWith('Go [new](https://new.example) now');
  fireEvent.click(screen.getByRole('link', { name: 'new' }));
  clickButton('Remove link');
  expect(screen.queryByRole('link')).toBeNull();
  expect(onChange).toHaveBeenLastCalledWith('Go new now');
});

it.each(['ctrlKey', 'metaKey'])(
  'opens a %s-clicked link directly via the platform opener',
  async (modifier) => {
    await mount('[Fish](https://fish.example)');
    expect(fireEvent.click(screen.getByRole('link'), { [modifier]: true })).toBe(false);
    expect(opened).toHaveBeenCalledExactlyOnceWith('https://fish.example');
    expect(screen.queryByRole('button', { name: 'Remove link' })).toBeNull();
  },
);

it('keeps inline styling when editing only the URL and opens only external destinations', async () => {
  const { onChange } = await mount('Read [**our** guide](./guide "Manual")');
  const link = screen.getByRole('link', { name: 'our guide' });
  expect(fireEvent.click(link, { ctrlKey: true })).toBe(false);
  expect(opened).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('our'));
  clickButton('Edit link');
  fireEvent.change(screen.getByLabelText('Link URL'), {
    target: { value: 'https://fish.example/guide' },
  });
  clickButton('Apply');
  expect(screen.getByRole('link').querySelector('strong')?.textContent).toBe('our');
  expect(onChange).toHaveBeenLastCalledWith(
    'Read [**our** guide](https://fish.example/guide "Manual")',
  );
});

it('creates a link on the selected text from the Edit View toolbar', async () => {
  const { editor, onChange } = await mount('Fish Notes');
  editor.focus();
  const text = editor.querySelector('p')!.firstChild!;
  window.getSelection()!.setBaseAndExtent(text, 0, text, 4);
  await act(async () => {
    fireEvent(document, new Event('selectionchange'));
  });
  clickButton('Link');
  expect(screen.getByLabelText<HTMLInputElement>('Link text').value).toBe('Fish');
  fireEvent.change(screen.getByLabelText('Link URL'), {
    target: { value: 'https://fish.example' },
  });
  clickButton('Apply');
  expect(onChange).toHaveBeenLastCalledWith('[Fish](https://fish.example) Notes');
});

it('promotes a new GFM header after deleting the first row, including its column alignment', async () => {
  const { editor, onChange } = await mount('| Header |\n| :---: |\n| Keep |');
  await caret(editor, screen.getByRole('columnheader').querySelector('p')!);
  clickButton('Delete row');
  expect(screen.getByRole('columnheader', { name: 'Keep' })).toBeTruthy();
  expect(onChange).toHaveBeenLastCalledWith('| Keep |\n| :---: |');
  clickButton('Add column');
  expect(screen.getAllByRole('columnheader')).toHaveLength(2);
});

it('reopens a link whose edited URL contains a space and a closing parenthesis', async () => {
  await mount('[Guide](https://fish.example/old)');
  fireEvent.click(screen.getByRole('link'));
  clickButton('Edit link');
  const href = 'https://fish.example/team docs/plan)';
  fireEvent.change(screen.getByLabelText('Link URL'), { target: { value: href } });
  clickButton('Apply');
  clickButton('MD');
  clickButton('Edit');
  expect(screen.getByRole('link', { name: 'Guide' }).getAttribute('href')).toBe(href);
});
