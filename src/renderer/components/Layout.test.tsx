import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '../contexts/AppContext';
import { AssistantProvider } from '../contexts/AssistantContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import i18n from '../i18n';
import Layout from './Layout';

beforeEach(async () => {
  await i18n.changeLanguage('en');
  mockIPC((command) => {
    switch (command) {
      case 'encryption_has_password':
        return true;
      case 'encryption_is_unlocked':
        return false;
      case 'tags_get_all':
        return [
          { id: 'work', name: 'work', parentId: null, isPinned: false, sortOrder: 0, noteCount: 1 },
        ];
      case 'search_notes':
        return [{ id: 'private', title: 'Private journal', snippet: [] }];
      case 'notes_get':
        return { id: 'private', title: 'Private journal', content: '', isLocked: true };
      case 'notes_list':
      case 'tags_get_notes_by_tag':
      case 'chats_list':
        return [];
      default:
        throw new Error(`Unexpected IPC command: ${command}`);
    }
  });
});

afterEach(() => {
  clearMocks();
  vi.restoreAllMocks();
});

function renderLayout() {
  return act(async () =>
    render(
      <ThemeProvider>
        <AppProvider>
          <AssistantProvider>
            <Layout />
          </AssistantProvider>
        </AppProvider>
      </ThemeProvider>,
    ),
  );
}

function toggle(name: string) {
  return screen.getByRole('button', { name });
}

function expectPanes(sidebar: boolean, list: boolean) {
  expect(Boolean(screen.queryByRole('navigation', { name: 'Navigation Sidebar' }))).toBe(sidebar);
  expect(Boolean(screen.queryByRole('region', { name: 'Note List' }))).toBe(list);
  expect(toggle('Navigation Sidebar').getAttribute('aria-pressed')).toBe(String(sidebar));
  expect(toggle('Note List').getAttribute('aria-pressed')).toBe(String(list));
}

it('can hide and reopen each pane independently from the empty editor header', async () => {
  await renderLayout();
  expect(screen.getByText('Select or create a note to start writing')).toBeTruthy();
  expectPanes(true, true);
  fireEvent.click(toggle('Navigation Sidebar'));
  expectPanes(false, true);
  fireEvent.click(toggle('Note List'));
  expectPanes(false, false);
  fireEvent.click(toggle('Navigation Sidebar'));
  expectPanes(true, false);
  fireEvent.click(toggle('Note List'));
  expectPanes(true, true);
});

it('defaults both panes to visible when their preferences cannot be read', async () => {
  localStorage.setItem('fish-notes:sidebar-visible', 'false');
  localStorage.setItem('fish-notes:note-list-visible', 'false');
  const read = localStorage.getItem.bind(localStorage);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
    if (key.endsWith('-visible')) throw new DOMException('Access denied', 'SecurityError');
    return read(key);
  });
  await renderLayout();
  expectPanes(true, true);
});

it('keeps both pane toggles working when their preferences exceed the storage quota', async () => {
  const write = localStorage.setItem.bind(localStorage);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
    if (key.endsWith('-visible')) throw new DOMException('Storage full', 'QuotaExceededError');
    write(key, value);
  });
  await renderLayout();
  expectPanes(true, true);
  fireEvent.click(toggle('Navigation Sidebar'));
  fireEvent.click(toggle('Note List'));
  expectPanes(false, false);
  fireEvent.click(toggle('Note List'));
  fireEvent.click(toggle('Navigation Sidebar'));
  expectPanes(true, true);
});

it('keeps the Note List hidden through tag, view and search selection, even for a locked note', async () => {
  await renderLayout();
  fireEvent.click(toggle('Note List'));
  for (const name of ['work', 'Trash', 'All Notes']) {
    await act(async () => {
      fireEvent.click(screen.getByText(name));
    });
    expectPanes(true, false);
  }
  fireEvent.click(screen.getByText('Search'));
  const query = screen.getByPlaceholderText('Search notes...');
  expectPanes(true, false);
  fireEvent.change(query, { target: { value: 'journal' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Private journal' }));
  await screen.findByText('This note is encrypted. Enter password to view.');
  expectPanes(true, false);
  fireEvent.click(toggle('Navigation Sidebar'));
  expectPanes(false, false);
  fireEvent.click(toggle('Note List'));
  expectPanes(false, true);
  fireEvent.click(toggle('Navigation Sidebar'));
  expectPanes(true, true);
});

it.each([
  [
    'en',
    'Navigation Sidebar',
    'Hide Navigation Sidebar',
    'Show Navigation Sidebar',
    'Note List',
    'Hide Note List',
    'Show Note List',
  ],
  ['zh-CN', '导航侧栏', '隐藏导航侧栏', '显示导航侧栏', '笔记列表', '隐藏笔记列表', '显示笔记列表'],
])(
  'labels both toggles and their actions in %s',
  async (language, sidebar, hideSidebar, showSidebar, list, hideList, showList) => {
    await i18n.changeLanguage(language);
    await renderLayout();
    expect(toggle(sidebar).title).toBe(hideSidebar);
    expect(toggle(list).title).toBe(hideList);
    fireEvent.click(toggle(sidebar));
    fireEvent.click(toggle(list));
    expect(toggle(sidebar).title).toBe(showSidebar);
    expect(toggle(list).title).toBe(showList);
  },
);

it.each([
  [false, true],
  [true, false],
  [false, false],
])('restores Sidebar=%s and Note List=%s after remount', async (sidebar, list) => {
  const first = await renderLayout();
  if (!sidebar) fireEvent.click(toggle('Navigation Sidebar'));
  if (!list) fireEvent.click(toggle('Note List'));
  first.unmount();
  await renderLayout();
  expectPanes(sidebar, list);
});

it('restores the dragged width of both panes after editor-only mode', async () => {
  // jsdom doesn't lay out flex items. Apply the project's utilities to check their shrink policy.
  const { css } = await postcss([tailwindcss()]).process('@tailwind utilities;', {
    from: undefined,
  });
  render(<style>{css}</style>);
  await renderLayout();
  const sidebar = () => screen.getByRole('navigation', { name: 'Navigation Sidebar' });
  const list = () => screen.getByRole('region', { name: 'Note List' });

  function resize(pane: HTMLElement, delta: number) {
    expect(getComputedStyle(pane).flexShrink).toBe('0');
    const start = parseFloat(getComputedStyle(pane).width);
    fireEvent.mouseDown(within(pane).getByRole('separator'), { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 100 + delta });
    fireEvent.mouseUp(document);
    const width = `${start + delta}px`;
    expect(getComputedStyle(pane).width).toBe(width);
    return width;
  }

  const sidebarWidth = resize(sidebar(), 43);
  const listWidth = resize(list(), 61);
  fireEvent.click(toggle('Navigation Sidebar'));
  fireEvent.click(toggle('Note List'));
  fireEvent.click(toggle('Note List'));
  fireEvent.click(toggle('Navigation Sidebar'));
  expect(getComputedStyle(sidebar()).width).toBe(sidebarWidth);
  expect(getComputedStyle(list()).width).toBe(listWidth);
});

it.each([
  ['invalid', 'false', true, false],
  ['false', '', false, true],
] as const)(
  'defaults an invalid preference to visible (%s, %s)',
  async (nav, notes, sidebar, list) => {
    localStorage.setItem('fish-notes:sidebar-visible', nav);
    localStorage.setItem('fish-notes:note-list-visible', notes);
    await renderLayout();
    expectPanes(sidebar, list);
  },
);
