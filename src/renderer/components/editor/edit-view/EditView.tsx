import './interactive.css';
import { Editor } from '@tiptap/core';
import { isInTable } from '@tiptap/pm/tables';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { EditorCommandAdapter } from '../EditorCommandAdapter';
import { editViewExtensions } from './extensions';
import { createNoteSourceCodec } from './noteSource';
import { openExternalLink } from '../externalLinks';
import { linkTarget, LinkPopover, type LinkTarget } from './LinkPopover';
import { TableControls } from './TableControls';
import { formatters } from './commands';
import type { NoteSourceSnapshot } from '../MarkdownEditor';
import type { ActionSelection } from '../ActionSelection';
import { editViewSelection, watchNativeSelection } from './selectionActions';

const codec = createNoteSourceCodec(editViewExtensions);
const languages = [
  'bash',
  'c',
  'cpp',
  'css',
  'html',
  'javascript',
  'json',
  'markdown',
  'python',
  'rust',
  'sql',
  'typescript',
  'yaml',
];

interface Props {
  noteId: string | null;
  defaultValue: string;
  language: string;
  onChange: (doc: NoteSourceSnapshot) => void;
  onPolishSelection: (selection: ActionSelection | null) => void;
  focusOnMount: boolean;
  onSave?: () => void;
}

export default forwardRef<EditorCommandAdapter, Props>(function EditView(
  { noteId, defaultValue, language, onChange, onSave, onPolishSelection, focusOnMount },
  ref,
) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const callbacks = useRef({ onChange, onSave, onPolishSelection });
  const [link, setLink] = useState<LinkTarget | null>(null);
  const closeLink = useCallback(() => setLink(null), []);
  const [tableEditor, setTableEditor] = useState<Editor | null>(null);
  const [codeLanguage, setCodeLanguage] = useState<string | null>(null);
  useLayoutEffect(() => {
    callbacks.current = { onChange, onSave, onPolishSelection };
  }, [onChange, onSave, onPolishSelection]);
  useImperativeHandle(
    ref,
    () => ({
      format(command) {
        const editor = editorRef.current;
        if (!editor) return;
        if (command === 'insertLink') setLink(linkTarget(editor));
        else formatters[command](editor);
      },
      insertTable(rows, columns) {
        editorRef.current?.chain().focus().insertTable({ rows, cols: columns }).run();
      },
      toggleHeading(level) {
        editorRef.current?.chain().focus().toggleHeading({ level }).run();
      },
    }),
    [],
  );

  useLayoutEffect(() => {
    if (!noteId || !container.current) return;
    const showControls = (editor: Editor) => {
      setTableEditor(isInTable(editor.state) ? editor : null);
      setCodeLanguage(
        editor.isActive('codeBlock') ? (editor.getAttributes('codeBlock').language ?? '') : null,
      );
    };
    const editor = new Editor({
      element: container.current,
      extensions: editViewExtensions,
      content: codec.parse(defaultValue),
      editorProps: {
        attributes: {
          role: 'textbox',
          'aria-multiline': 'true',
          class: 'markdown-preview edit-view',
        },
        handleDOMEvents: {
          click: (_view, event) => {
            const anchor = event.target instanceof Element && event.target.closest('a');
            if (!anchor || event.button !== 0) return false;
            event.preventDefault();
            if (event.ctrlKey || event.metaKey) {
              setLink(null);
              openExternalLink(anchor.getAttribute('href')?.trim() ?? '');
            } else {
              setLink(linkTarget(editor, anchor));
            }
            return true;
          },
        },
        handleKeyDown: (_view, event) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === 'k' &&
            !event.altKey &&
            !event.shiftKey
          ) {
            setLink(linkTarget(editor));
            return true;
          }
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === 's' &&
            !event.shiftKey &&
            !event.altKey
          ) {
            callbacks.current.onSave?.();
            return true;
          }
          return false;
        },
      },
      onTransaction: ({ editor, transaction }) => {
        showControls(editor);
        if (transaction.selectionSet || transaction.docChanged) {
          callbacks.current.onPolishSelection(editViewSelection(editor, codec));
        }
      },
      onUpdate: ({ editor }) => {
        setLink(null);
        // Hold the immutable document for this edit. The 500 ms save, export or
        // a mode switch reads it lazily, even if another note is open by then.
        const doc = editor.state.doc;
        let markdown: string | undefined;
        callbacks.current.onChange({ toString: () => (markdown ??= codec.serialize(doc)) });
      },
    });
    editorRef.current = editor;
    const stopWatching = watchNativeSelection(editor, (inside) =>
      callbacks.current.onPolishSelection(inside ? editViewSelection(editor, codec) : null),
    );
    setLink(null);
    showControls(editor);
    if (focusOnMount) editor.view.focus();
    return () => {
      stopWatching();
      editorRef.current = null;
      editor.destroy();
    };
  }, [noteId, defaultValue, focusOnMount]);
  useLayoutEffect(() => {
    editorRef.current?.view.dom.setAttribute('lang', language);
  }, [language, noteId, defaultValue]);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {link && (
        <LinkPopover
          key={`${link.from}-${link.to}-${!!link.anchor}`}
          target={link}
          onClose={closeLink}
        />
      )}
      {tableEditor && <TableControls editor={tableEditor} />}
      {noteId && codeLanguage !== null && (
        <label className="edit-code-language">
          {t('Code language')}
          <input
            value={codeLanguage}
            list="edit-code-languages"
            placeholder={t('Plain text')}
            onChange={(event) =>
              editorRef.current?.commands.updateAttributes('codeBlock', {
                language: event.target.value.replace(/[\s`~]/g, '') || null,
              })
            }
          />
          <datalist id="edit-code-languages">
            {languages.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
      )}
      <div ref={container} className="flex-1 min-h-0 overflow-auto px-6 py-4" />
    </div>
  );
});
