import { Editor } from '@tiptap/core';
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EditorCommandAdapter } from '../EditorCommandAdapter';
import { editViewExtensions } from './extensions';
import { createNoteSourceCodec } from './noteSource';
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
  const [codeLanguage, setCodeLanguage] = useState<string | null>(null);
  useLayoutEffect(() => {
    callbacks.current = { onChange, onSave, onPolishSelection };
  }, [onChange, onSave, onPolishSelection]);
  useImperativeHandle(
    ref,
    () => ({
      format(command) {
        if (editorRef.current) formatters[command]?.(editorRef.current);
      },
      toggleHeading(level) {
        editorRef.current?.chain().focus().toggleHeading({ level }).run();
      },
    }),
    [],
  );

  useLayoutEffect(() => {
    if (!noteId || !container.current) return;
    const showLanguage = (editor: Editor) =>
      setCodeLanguage(
        editor.isActive('codeBlock') ? (editor.getAttributes('codeBlock').language ?? '') : null,
      );
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
        handleKeyDown: (_view, event) => {
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
        showLanguage(editor);
        if (transaction.selectionSet || transaction.docChanged) {
          callbacks.current.onPolishSelection(editViewSelection(editor, codec));
        }
      },
      onUpdate: ({ editor }) => {
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
    showLanguage(editor);
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
