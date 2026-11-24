import { api } from '../../api';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import SelectionActionBubble from './SelectionActionBubble';
import type { ActionSelection } from './ActionSelection';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import CodeMirrorView, { type CodeMirrorHandle } from './CodeMirrorView';
import type { EditorCommandAdapter } from './EditorCommandAdapter';
import EditorToolbar from './EditorToolbar';
import PolishDialog from './PolishDialog';
import type { AppTheme } from './extensions/themes';
import { useAssistantEntryPoints } from '../../contexts/AssistantContext';
import { message } from '../message';

const EditView = lazy(() => import('./edit-view/EditView'));

export type EditorMode = 'edit' | 'source';

export interface NoteSourceSnapshot {
  toString(): string;
}

interface MarkdownEditorProps {
  noteId: string | null;
  defaultValue: string;
  onChange: (doc: NoteSourceSnapshot) => void;
  onSave?: () => void;
  showToolbar?: boolean;
}

const MODE_STORAGE_KEY = 'fish-notes:editor-mode';

function readMode(): EditorMode {
  const stored = localStorage.getItem(MODE_STORAGE_KEY);
  if (stored === 'preview' || stored === 'split') localStorage.setItem(MODE_STORAGE_KEY, 'edit');
  return stored === 'source' ? 'source' : 'edit';
}

interface TabButtonProps {
  label: string;
  shortcut: string;
  active: boolean;
  onClick: () => void;
}

function TabButton({ label, shortcut, active, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`px-3 py-1 text-xs rounded-full transition-all ${active ? '' : 'fn-tool-btn'}`}
      style={{
        color: active ? 'var(--accent-fg)' : 'var(--text-tertiary)',
        background: active ? 'var(--accent-bg)' : 'transparent',
        boxShadow: active ? 'var(--accent-shadow)' : undefined,
        fontWeight: active ? 600 : 500,
      }}
      title={`${label} (${shortcut})`}
    >
      {label}
    </button>
  );
}

export default function MarkdownEditor({
  noteId,
  defaultValue,
  onChange,
  onSave,
  showToolbar = true,
}: MarkdownEditorProps) {
  const { t, i18n } = useTranslation();
  const { resolvedTheme } = useTheme();
  const { askWithSelection } = useAssistantEntryPoints();
  const [mode, setMode] = useState<EditorMode>(readMode);
  const editorRef = useRef<CodeMirrorHandle>(null);
  const editRef = useRef<EditorCommandAdapter>(null);
  const latestDoc = useRef<NoteSourceSnapshot | null>(null);
  const [entry, setEntry] = useState({
    noteId,
    defaultValue,
    source: defaultValue,
    focusOnMount: false,
  });
  if (entry.noteId !== noteId || entry.defaultValue !== defaultValue) {
    setEntry({ noteId, defaultValue, source: defaultValue, focusOnMount: false });
  }

  const [polishSel, setPolishSel] = useState<ActionSelection | null>(null);
  const [polishDialog, setPolishDialog] = useState<{
    selection: ActionSelection;
    original: string;
    polished: string | null;
    loading: boolean;
    error: string | null;
  } | null>(null);

  const runPolish = useCallback(async (selection: ActionSelection) => {
    const request = {
      selection,
      original: selection.getMarkdown(),
      polished: null,
      loading: true,
      error: null,
    };
    setPolishDialog(request);
    try {
      const polished = await api.ai.polishText(request.original);
      setPolishDialog((current) =>
        current === request ? { ...request, polished, loading: false } : current,
      );
    } catch (error) {
      setPolishDialog((current) =>
        current === request
          ? {
              ...request,
              loading: false,
              error: error instanceof Error ? error.message : String(error),
            }
          : current,
      );
    }
  }, []);

  const handleApplyPolish = (markdown: string) => {
    if (polishDialog && !polishDialog.selection.replaceMarkdown(markdown)) {
      message.warning(t('The selected text changed. Select it again to polish it.'));
    }
    setPolishDialog(null);
  };

  const updateMode = useCallback(
    (next: EditorMode) => {
      if (next === mode) return;
      setEntry({
        noteId,
        defaultValue,
        source: latestDoc.current?.toString() ?? defaultValue,
        focusOnMount: true,
      });
      setMode(next);
      localStorage.setItem(MODE_STORAGE_KEY, next);
    },
    [mode, noteId, defaultValue],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.isComposing)
        return;
      if (event.key !== '1' && event.key !== '2') return;
      event.preventDefault();
      updateMode(event.key === '1' ? 'edit' : 'source');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [updateMode]);

  useLayoutEffect(() => {
    latestDoc.current = null;
  }, [noteId, defaultValue]);
  useLayoutEffect(() => {
    setPolishSel(null);
    setPolishDialog(null);
  }, [noteId, defaultValue, mode]);

  useLayoutEffect(() => {
    if (mode === 'source' && entry.focusOnMount) editorRef.current?.focus();
  }, [mode, entry.focusOnMount]);

  const handleChange = useCallback(
    (doc: NoteSourceSnapshot) => {
      latestDoc.current = doc;
      onChange(doc);
    },
    [onChange],
  );

  const language = i18n.resolvedLanguage ?? i18n.language;
  const modifier = /Mac|iPad|iPhone/.test(navigator.platform) ? '⌘' : 'Ctrl+';
  const themeKey: AppTheme = (resolvedTheme as AppTheme) ?? 'light';

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div
        className="flex items-center gap-1 px-2 py-1 shrink-0 no-select"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-secondary)',
        }}
      >
        <TabButton
          label={t('Edit')}
          shortcut={modifier + '1'}
          active={mode === 'edit'}
          onClick={() => updateMode('edit')}
        />
        <TabButton
          label="MD"
          shortcut={modifier + '2'}
          active={mode === 'source'}
          onClick={() => updateMode('source')}
        />
      </div>

      {showToolbar && <EditorToolbar commands={mode === 'edit' ? editRef : editorRef} />}
      {mode === 'edit' ? (
        noteId && (
          <Suspense fallback={<span className="px-6 py-4">{t('Loading note...')}</span>}>
            <EditView
              ref={editRef}
              noteId={noteId}
              defaultValue={entry.source}
              onChange={handleChange}
              onSave={onSave}
              onPolishSelection={setPolishSel}
              language={language}
              focusOnMount={entry.focusOnMount}
            />
          </Suspense>
        )
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden">
          <CodeMirrorView
            ref={editorRef}
            noteId={noteId}
            defaultValue={entry.source}
            onChange={handleChange}
            onSave={onSave}
            onPolishSelection={setPolishSel}
            theme={themeKey}
            language={language}
            className="h-full"
          />
        </div>
      )}

      {polishSel && !polishDialog && (
        <SelectionActionBubble
          selection={polishSel}
          onAsk={() => {
            askWithSelection(polishSel.text);
            setPolishSel(null);
          }}
          onPolish={() => {
            void runPolish(polishSel);
            setPolishSel(null);
          }}
        />
      )}

      {polishDialog && (
        <PolishDialog
          loading={polishDialog.loading}
          error={polishDialog.error}
          original={polishDialog.original}
          polished={polishDialog.polished}
          onAccept={handleApplyPolish}
          onClose={() => setPolishDialog(null)}
          onRetry={() => void runPolish(polishDialog.selection)}
        />
      )}
    </div>
  );
}
