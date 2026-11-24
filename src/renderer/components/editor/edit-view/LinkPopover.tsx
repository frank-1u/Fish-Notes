import { getMarkRange, type Editor, type Range } from '@tiptap/core';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { isExternalLink, openExternalLink } from '../externalLinks';

export function linkTarget(editor: Editor, anchor?: HTMLAnchorElement) {
  const { doc, schema, selection } = editor.state;
  const position = anchor ? editor.view.posAtDOM(anchor, 0) : selection.from;
  const range = getMarkRange(doc.resolve(position), schema.marks.link);
  const { from, to } = range || selection;
  const mark = range && schema.marks.link.isInSet(doc.nodeAt(from)?.marks ?? []);
  return {
    editor,
    doc,
    from,
    to,
    anchor,
    attrs: mark?.attrs,
    text: doc.textBetween(from, to, ' '),
    href: mark?.attrs.href as string | undefined,
  };
}

type LinkTarget = ReturnType<typeof linkTarget>;
export type { LinkTarget };

export function LinkPopover({ target, onClose }: { target: LinkTarget; onClose: () => void }) {
  const { t } = useTranslation();
  const { editor, from, to, anchor } = target;
  const [editing, setEditing] = useState(!anchor);
  const [text, setText] = useState(target.text || '');
  const [href, setHref] = useState(target.href ?? '');
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    function positionPanel() {
      if (!panel.current || editor.isDestroyed || editor.state.doc !== target.doc) return;
      const rect = anchor?.getBoundingClientRect() ?? editor.view.coordsAtPos(from);
      const { width, height } = panel.current.getBoundingClientRect();
      setPosition({
        left: Math.max(4, Math.min(rect.left, window.innerWidth - width - 4)),
        top:
          rect.bottom + height + 4 <= window.innerHeight
            ? rect.bottom + 4
            : Math.max(4, rect.top - height - 4),
      });
    }
    function dismiss(event: MouseEvent) {
      if (
        event.target instanceof Node &&
        !panel.current?.contains(event.target) &&
        !anchor?.contains(event.target)
      )
        onClose();
    }
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        editor.view.focus();
      }
    }
    positionPanel();
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', keydown);
    return () => {
      window.removeEventListener('resize', positionPanel);
      window.removeEventListener('scroll', positionPanel, true);
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', keydown);
    };
  }, [anchor, editor, from, target.doc, editing, onClose]);

  const destination = href.trim();
  const valid =
    destination.length > 0 &&
    !/[\r\n]/.test(destination) &&
    editor.can().setLink({ href: destination });
  function apply() {
    if (!valid || editor.state.doc !== target.doc) return;
    const label = text || (target.attrs ? target.text : destination);
    const range: Range = { from, to: label === target.text ? to : from + label.length };
    // Updating only the URL preserves the linked inline marks and title.
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        if (target.text !== label) tr.insertText(label, from, to);
        return true;
      })
      .setTextSelection(range)
      .setLink({ ...target.attrs, href: destination })
      .setTextSelection(range.to)
      .run();
    onClose();
  }

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={t('Link actions')}
      className="edit-link-popover"
      style={position}
    >
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <label>
            {t('Link URL')}
            <input autoFocus value={href} onChange={(e) => setHref(e.target.value)} />
          </label>
          <label>
            {t('Link text')}
            <input value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="edit-block-controls">
            <button type="submit" disabled={!valid}>
              {t('Apply')}
            </button>
            <button type="button" onClick={onClose}>
              {t('Cancel')}
            </button>
          </div>
        </form>
      ) : (
        <div className="edit-block-controls">
          <button
            type="button"
            disabled={!isExternalLink(href)}
            onClick={() => {
              openExternalLink(href);
              onClose();
            }}
          >
            {t('Open link')}
          </button>
          <button type="button" onClick={() => setEditing(true)}>
            {t('Edit link')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (editor.state.doc === target.doc)
                editor
                  .chain()
                  .focus()
                  .setTextSelection({ from, to })
                  .unsetLink()
                  .setTextSelection(to)
                  .run();
              onClose();
            }}
          >
            {t('Remove link')}
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
