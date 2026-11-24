import type { JSONContent } from '@tiptap/core';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';

const delimiters: Record<string, string> = { left: ':---', right: '---:', center: ':---:' };
const rowSource = (values: string[]) => '| ' + values.join(' | ') + ' |';

// GFM cells contain inline content on one line, with a single header row.
// Leave block separators to the Note Source codec.
export const gfmTables = [
  Table.extend({
    renderMarkdown(table, helpers) {
      const rows = table.content ?? [];
      if (!rows.length) return '';
      const renderCell = (cell: JSONContent) =>
        helpers
          .renderChildren(cell.content?.[0]?.content ?? [])
          .replace(/[ \t]*\r?\n/g, ' ')
          .replace(/\\.|\|/g, (match) => (match === '|' ? '\\|' : match));
      const lines = rows.map((row) => rowSource((row.content ?? []).map(renderCell)));
      lines.splice(
        1,
        0,
        rowSource((rows[0].content ?? []).map((cell) => delimiters[cell.attrs?.align] ?? '---')),
      );
      return lines.join('\n');
    },
  }),
  TableRow,
  TableHeader.extend({ content: 'paragraph' }),
  TableCell.extend({ content: 'paragraph' }),
];
