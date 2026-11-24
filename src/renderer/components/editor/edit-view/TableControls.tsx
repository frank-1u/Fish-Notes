import type { Editor } from '@tiptap/core';
import { selectedRect } from '@tiptap/pm/tables';
import { useTranslation } from 'react-i18next';

const actions = [
  ['Add row', 'addRowAfter'],
  ['Add column', 'addColumnAfter'],
  ['Delete row', 'deleteRow'],
  ['Delete column', 'deleteColumn'],
  ['Delete table', 'deleteTable'],
] as const;

function changeTable(editor: Editor, action: (typeof actions)[number][1]) {
  const rect = selectedRect(editor.state);
  const chain = editor.chain().focus();
  if (
    action === 'deleteTable' ||
    (action === 'deleteRow' && rect.top === 0 && rect.bottom === rect.map.height) ||
    (action === 'deleteColumn' && rect.left === 0 && rect.right === rect.map.width)
  )
    return chain.deleteTable().run();

  chain[action]()
    .command(({ tr, state }) => {
      // Deleting the header promotes the next row. Adding a column to a
      // header-only table must also produce a header cell, as GFM requires.
      const table = tr.doc.nodeAt(rect.tableStart - 1);
      if (!table) return false;
      const header = table.child(0);
      table.forEach((row, rowOffset, rowIndex) => {
        row.forEach((cell, cellOffset, column) => {
          const type =
            rowIndex === 0 ? state.schema.nodes.tableHeader : state.schema.nodes.tableCell;
          const align =
            action === 'deleteRow' && rect.top === 0
              ? rect.table.child(0).child(column).attrs.align
              : header.child(column).attrs.align;
          if (cell.type !== type || cell.attrs.align !== align) {
            tr.setNodeMarkup(rect.tableStart + rowOffset + 1 + cellOffset, type, {
              ...cell.attrs,
              align,
            });
          }
        });
      });
      return true;
    })
    .run();
}

export function TableControls({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  return (
    <div className="edit-block-controls" role="group" aria-label={t('Table actions')}>
      {actions.map(([label, action]) => (
        <button
          type="button"
          key={action}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => changeTable(editor, action)}
        >
          {t(label)}
        </button>
      ))}
    </div>
  );
}
