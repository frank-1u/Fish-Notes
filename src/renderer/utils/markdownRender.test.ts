import { expect, it, vi } from 'vitest';
import { buildExportHtml } from './exportHtml';
import { renderMarkdown } from './markdownRender';
import { printNote } from './printNote';

it.each([
  ['````md', '```', '~~~~', '```` text', '`````'],
  ['~~~~md', '~~~', '````', '~~~~ text', '~~~~~'],
])(
  'preserves blank lines inside %s fences in the HTML used for export and printing',
  async (open, short, other, withText, close) => {
    const code = [short, '', '', other, '', '', withText, '', '', 'end'].join('\n');
    const source = [open, code, close + '  ', '', '', 'After'].join('\n');
    const html = await buildExportHtml('Note', source, async () => '');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    try {
      await printNote('Note', source);
      expect(print).toHaveBeenCalledOnce();
      for (const body of [doc, document.querySelector('.print-note')!]) {
        expect(body.querySelector('pre code')?.textContent).toBe(code + '\n');
        expect(body.querySelectorAll('.md-blank')).toHaveLength(1);
      }
    } finally {
      window.dispatchEvent(new Event('afterprint'));
      print.mockRestore();
    }
  },
);

it('preserves fenced code indented relative to its list item', () => {
  const fragment = renderMarkdown('- Item\n\n    ````md\n    ```\n\n\n    end\n    ````');
  expect(fragment.querySelector('li pre code')?.textContent).toBe('```\n\n\nend\n');
});

it('highlights Unicode and nested hashtag names outside code and at word boundaries', () => {
  const fragment = renderMarkdown('#Team_2/今日 and #42, word#inside #/empty `#code`');
  expect([...fragment.querySelectorAll('.hashtag')].map((tag) => tag.textContent)).toEqual([
    '#Team_2/今日',
    '#42',
  ]);
});
