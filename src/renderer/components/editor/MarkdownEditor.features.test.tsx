import { act, fireEvent, render, screen } from '@testing-library/react';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppProvider } from '../../contexts/AppContext';
import { AssistantProvider, useAssistant } from '../../contexts/AssistantContext';
import { ThemeProvider } from '../../contexts/ThemeContext';
import i18n from '../../i18n';
import { parseTags } from '../../utils/tagParser';
import MarkdownEditor from './MarkdownEditor';

const polish = vi.fn<(text: string) => Promise<string>>();

beforeEach(async () => {
  await i18n.changeLanguage('zh-CN');
  polish.mockReset();
  mockIPC((command, args) => {
    switch (command) {
      case 'ai_polish_text':
        return polish((args as { text: string }).text);
      case 'encryption_has_password':
      case 'encryption_is_unlocked':
        return false;
      case 'notes_list':
      case 'tags_get_all':
      case 'chats_list':
        return [];
      default:
        throw new Error(`Unexpected IPC command: ${command}`);
    }
  });
});

afterEach(clearMocks);

function AssistantQuote() {
  const { prefill, isOpen } = useAssistant();
  return isOpen ? <output aria-label="Assistant quote">{prefill}</output> : null;
}

async function openEditor(source: string) {
  const onChange = vi.fn<(source: string) => void>();
  render(
    <ThemeProvider>
      <AppProvider>
        <AssistantProvider>
          <MarkdownEditor
            noteId="note-1"
            defaultValue={source}
            onChange={(doc) => onChange(doc.toString())}
            showToolbar={false}
          />
          <AssistantQuote />
        </AssistantProvider>
      </AppProvider>
    </ThemeProvider>,
  );
  return { editor: await screen.findByRole('textbox'), onChange };
}

async function select(editor: HTMLElement, start: Node, from: number, to: number, end = start) {
  await act(async () => {
    editor.focus();
    window.getSelection()!.setBaseAndExtent(start, from, end, to);
    fireEvent(document, new Event('selectionchange'));
  });
}

function paste(editor: HTMLElement, text: string) {
  fireEvent.paste(editor, {
    clipboardData: { getData: (type: string) => (type === 'text/plain' ? text : '') },
  });
}

it('highlights inline hashtags and emits their plain Note Source after edits', async () => {
  const source = '# 标题\n\n#工作/周报 #today x#skip `#literal`\n\n```md\n#code\n```';
  const { editor, onChange } = await openEditor(source);
  const highlighted = () => [...editor.querySelectorAll('.hashtag')].map((tag) => tag.textContent);
  expect(highlighted()).toEqual(['#工作/周报', '#today']);
  expect(editor.querySelector('h1')?.textContent).toBe('标题');
  expect(editor.querySelector('pre code')?.textContent).toBe('#code');
  const tag = screen.getByText('#today').firstChild!;
  await select(editor, tag, 0, 6);
  paste(editor, '#明天');
  expect(highlighted()).toEqual(['#工作/周报', '#明天']);
  expect(onChange).toHaveBeenLastCalledWith(source.replace('#today', '#明天'));
});

it('shows both selection actions at four trimmed characters and hides them at the caret', async () => {
  const { editor } = await openEditor('one four more');
  const text = editor.querySelector('p')!.firstChild!;
  await select(editor, text, 0, 4); // "one "
  expect(screen.queryByRole('button', { name: 'AI 润色' })).toBeNull();
  await select(editor, text, 4, 8);
  expect(screen.getByRole('button', { name: 'AI 润色' })).toBeTruthy();
  expect(screen.getByRole('button', { name: /问 Fish/ })).toBeTruthy();
  await select(editor, text, 4, 4);
  expect(screen.queryByRole('button', { name: 'AI 润色' })).toBeNull();
  expect(screen.queryByRole('button', { name: /问 Fish/ })).toBeNull();
});

it('preserves underscores in hashtag names for the existing tag extractor and MD View', async () => {
  const { editor, onChange } = await openEditor('Daily');
  await select(editor, editor.querySelector('p')!.firstChild!, 5, 5);
  paste(editor, ' #work_plan/本周 #_today_');
  const source = 'Daily #work_plan/本周 #_today_';
  expect(onChange).toHaveBeenLastCalledWith(source);
  expect(parseTags(onChange.mock.lastCall![0])).toEqual(['work_plan/本周', '_today_']);
  fireEvent.click(screen.getByRole('button', { name: 'MD' }));
  expect(screen.getByRole('textbox').textContent).toBe(source);
  fireEvent.click(screen.getByRole('button', { name: '编辑' }));
  expect(
    [...screen.getByRole('textbox').querySelectorAll('.hashtag')].map((tag) => tag.textContent),
  ).toEqual(['#work_plan/本周', '#_today_']);
});

it('keeps both actions inside the viewport when selecting near its lower right corner', async () => {
  const { editor } = await openEditor('near the edge');
  // jsdom has no layout. Supply the same viewport-relative rectangles the webview measures.
  const edge = new DOMRect(window.innerWidth - 4, window.innerHeight - 15, 4, 15);
  const rangeRect = vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue(edge);
  const realRect = HTMLElement.prototype.getBoundingClientRect;
  const elementRect = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      if (this.contains(editor)) return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
      if (this.querySelector('button') && this.textContent?.includes('AI 润色'))
        return new DOMRect(0, 0, 170, 30);
      return realRect.call(this);
    });
  try {
    await select(editor, editor.querySelector('p')!.firstChild!, 0, 4);
    const bubble = screen.getByRole('button', { name: 'AI 润色' }).parentElement!;
    expect(parseFloat(bubble.style.left)).toBe(window.innerWidth - 170);
    expect(parseFloat(bubble.style.top)).toBeLessThan(edge.top);
    expect(parseFloat(bubble.style.top)).toBeGreaterThan(0);
  } finally {
    rangeRect.mockRestore();
    elementRect.mockRestore();
  }
});

it('opens Fish with the selected visible text quoted in the assistant', async () => {
  const { editor } = await openEditor('Before **selected words** after');
  await select(editor, editor.querySelector('strong')!.firstChild!, 0, 8);
  fireEvent.click(screen.getByRole('button', { name: /问 Fish/ }));
  expect(screen.getByLabelText('Assistant quote').textContent).toBe('> selected\n\n');
  expect(screen.queryByRole('button', { name: /问 Fish/ })).toBeNull();
});

it('hides selection actions when the native selection is cleared', async () => {
  const { editor } = await openEditor('Select this');
  await select(editor, editor.querySelector('p')!.firstChild!, 0, 6);
  expect(screen.getByRole('button', { name: /问 Fish/ })).toBeTruthy();
  await act(async () => {
    window.getSelection()!.removeAllRanges();
    fireEvent(document, new Event('selectionchange'));
  });
  expect(screen.queryByRole('button', { name: /问 Fish/ })).toBeNull();
});

it('polishes selected Markdown and replaces just that range with rendered formatting', async () => {
  polish.mockResolvedValue('**清楚** 与 *简洁*');
  const { editor, onChange } = await openEditor('Before **wording** after');
  await select(editor, editor.querySelector('strong')!.firstChild!, 0, 7);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'AI 润色' })));
  expect(polish).toHaveBeenCalledWith('**wording**');
  fireEvent.click(screen.getByRole('button', { name: '应用润色' }));
  expect(editor.querySelector('strong')?.textContent).toBe('清楚');
  expect(editor.querySelector('em')?.textContent).toBe('简洁');
  expect(onChange).toHaveBeenLastCalledWith('Before **清楚** 与 *简洁* after');
});

it('warns on accepting a stale polish and keeps the concurrent edit', async () => {
  polish.mockResolvedValue('Stale rewrite');
  const { editor, onChange } = await openEditor('Before wording after');
  await select(editor, editor.querySelector('p')!.firstChild!, 7, 14);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'AI 润色' })));
  paste(editor, 'new wording');
  expect(onChange).toHaveBeenLastCalledWith('Before new wording after');
  fireEvent.click(screen.getByRole('button', { name: '应用润色' }));
  expect(
    await screen.findByText(i18n.t('The selected text changed. Select it again to polish it.')),
  ).toBeTruthy();
  expect(editor.textContent).toBe('Before new wording after');
  expect(onChange).toHaveBeenCalledTimes(1);
});

it('round-trips a selection across paragraphs and preserves both unselected ends', async () => {
  polish.mockResolvedValue('*first*\n\n## Middle\n\n**last**');
  const { editor, onChange } = await openEditor('Keep **first**\n\n*last* suffix');
  await select(
    editor,
    editor.querySelector('strong')!.firstChild!,
    0,
    4,
    editor.querySelector('em')!.firstChild!,
  );
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'AI 润色' })));
  expect(polish).toHaveBeenCalledWith('**first**\n\n*last*');
  fireEvent.click(screen.getByRole('button', { name: '应用润色' }));
  expect(editor.querySelector('h2')?.textContent).toBe('Middle');
  expect(onChange).toHaveBeenLastCalledWith('Keep *first*\n\n## Middle\n\n**last** suffix');
});

it.each([
  ['> Before wording after', 'blockquote p', '> wording', '> *clear*', '> Before *clear* after'],
  ['- Before wording after', 'li p', '- wording', '- *clear*', '- Before *clear* after'],
  ['## Before wording after', 'h2', '## wording', '## *clear*', '## Before *clear* after'],
  [
    '```md\nBefore wording after\n```',
    'pre code',
    '```md\nwording\n```',
    '```md\nclear\n```',
    '```md\nBefore clear after\n```',
  ],
])(
  'preserves the surrounding block when polishing part of %s',
  async (source, selector, input, replacement, result) => {
    polish.mockResolvedValue(replacement);
    const { editor, onChange } = await openEditor(source);
    await select(editor, editor.querySelector(selector)!.firstChild!, 7, 14);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'AI 润色' })));
    expect(polish).toHaveBeenCalledWith(input);
    fireEvent.click(screen.getByRole('button', { name: '应用润色' }));
    expect(onChange).toHaveBeenLastCalledWith(result);
  },
);

it('applies a polished list when it replaces a whole paragraph', async () => {
  polish.mockResolvedValue('- **one**\n- two');
  const { editor, onChange } = await openEditor('Intro\n\nwording\n\nAfter');
  await select(editor, screen.getByText('wording').firstChild!, 0, 7);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'AI 润色' })));
  fireEvent.click(screen.getByRole('button', { name: '应用润色' }));
  expect([...editor.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
    'one',
    'two',
  ]);
  expect(onChange.mock.lastCall?.[0]).toMatch(/^Intro\n\n- \*\*one\*\*\n+?- two\n\nAfter$/);
});

it('keeps unselected text out of a new heading returned for part of a paragraph', async () => {
  polish.mockResolvedValue('## Replacement');
  const { editor, onChange } = await openEditor('before wording after');
  await select(editor, editor.querySelector('p')!.firstChild!, 7, 14);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'AI 润色' })));
  fireEvent.click(screen.getByRole('button', { name: '应用润色' }));
  expect(editor.querySelector('h2')?.textContent).toBe('Replacement');
  expect(editor.firstElementChild?.textContent).toBe('before ');
  expect(editor.lastElementChild?.textContent).toBe(' after');
  expect(onChange).toHaveBeenCalledOnce();
});
