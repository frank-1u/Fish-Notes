import { api } from '../../api';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import CodeMirrorView, { type CodeMirrorHandle, type PolishSelectionInfo } from './CodeMirrorView';
import { supportsEditFormat } from './edit-view/commands';
import type { EditorCommandAdapter } from './EditorCommandAdapter';
import EditorToolbar from './EditorToolbar';
import PolishDialog from './PolishDialog';
import type { AppTheme } from './extensions/themes';
import { useAssistantEntryPoints } from '../../contexts/AssistantContext';
import { RobotIcon } from '../icons';
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
const TOOLBAR_STORAGE_KEY = 'fish-notes:editor-toolbar';

function readMode(): EditorMode {
  const stored = localStorage.getItem(MODE_STORAGE_KEY);
  if (stored === 'preview' || stored === 'split') localStorage.setItem(MODE_STORAGE_KEY, 'edit');
  return stored === 'source' ? 'source' : 'edit';
}

function readToolbar(): boolean {
  const stored = localStorage.getItem(TOOLBAR_STORAGE_KEY);
  return stored === null ? true : stored === '1';
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
  showToolbar: showToolbarProp,
}: MarkdownEditorProps) {
  const { t, i18n } = useTranslation();
  const { resolvedTheme } = useTheme();
  const { askWithSelection } = useAssistantEntryPoints();
  const [mode, setMode] = useState<EditorMode>(readMode);
  const [toolbarVisible] = useState(readToolbar);
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
  const showToolbar = showToolbarProp ?? toolbarVisible;

  // Polish bubble state
  const [polishSel, setPolishSel] = useState<PolishSelectionInfo | null>(null);
  const [bubblePos, setBubblePos] = useState<{
    top: number;
    left: number;
    placement: 'above' | 'below';
  } | null>(null);
  const [polishDialog, setPolishDialog] = useState<{
    from: number;
    to: number;
    original: string;
    polished: string | null;
    loading: boolean;
    error: string | null;
  } | null>(null);

  // Recompute bubble position whenever selection changes or editor scrolls/resizes.
  useEffect(() => {
    if (!polishSel) {
      setBubblePos(null);
      return;
    }
    const view = editorRef.current?.view;
    if (!view) return;

    const update = () => {
      const v = editorRef.current?.view;
      if (!v) return;
      const startCoords = v.coordsAtPos(polishSel.from);
      const endCoords = v.coordsAtPos(polishSel.to);
      if (!startCoords || !endCoords) {
        setBubblePos(null);
        return;
      }
      // Clip horizontal anchor inside the editor's visible rect — when the selection
      // spans many lines, end is on a different line and using its left/right blindly
      // would yank the bubble off to the side.
      const editorRect = v.dom.getBoundingClientRect();
      const anchorTop = Math.min(startCoords.top, endCoords.top);
      const anchorBottom = Math.max(startCoords.bottom, endCoords.bottom);
      const sameLine = Math.abs(startCoords.top - endCoords.top) < 4;
      const left = sameLine
        ? (startCoords.left + endCoords.right) / 2
        : (editorRect.left + editorRect.right) / 2;
      // Flip below when not enough room above (e.g. toolbar covers the top).
      const BUBBLE_SAFE = 44;
      const placement: 'above' | 'below' =
        anchorTop - BUBBLE_SAFE < editorRect.top ? 'below' : 'above';
      const top = placement === 'above' ? anchorTop - 8 : anchorBottom + 8;
      setBubblePos({ top, left, placement });
    };

    update();
    const scroller = view.scrollDOM;
    scroller.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      scroller.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [polishSel]);

  const runPolish = useCallback(async (info: { from: number; to: number; text: string }) => {
    const request = {
      from: info.from,
      to: info.to,
      original: info.text,
      polished: null,
      loading: true,
      error: null,
    };
    setPolishDialog(request);
    try {
      const polished = await api.ai.polishText(info.text);
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

  const handlePolishClick = useCallback(() => {
    if (!polishSel) return;
    const captured = polishSel;
    setPolishSel(null);
    setBubblePos(null);
    runPolish(captured);
  }, [polishSel, runPolish]);

  const handleApplyPolish = useCallback(
    (polishedText: string) => {
      const view = editorRef.current?.view;
      const dialog = polishDialog;
      if (!view || !dialog) {
        setPolishDialog(null);
        return;
      }
      if (
        dialog.to > view.state.doc.length ||
        view.state.sliceDoc(dialog.from, dialog.to) !== dialog.original
      ) {
        message.warning(t('The selected text changed. Select it again to polish it.'));
        setPolishDialog(null);
        return;
      }
      // Replace the original range with polished text.
      view.dispatch({
        changes: { from: dialog.from, to: dialog.to, insert: polishedText },
        selection: { anchor: dialog.from + polishedText.length },
      });
      view.focus();
      setPolishDialog(null);
    },
    [polishDialog, t],
  );

  const handleRetryPolish = useCallback(() => {
    if (!polishDialog) return;
    runPolish({ from: polishDialog.from, to: polishDialog.to, text: polishDialog.original });
  }, [polishDialog, runPolish]);

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
    setBubblePos(null);
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

      {showToolbar && (
        <EditorToolbar
          commands={mode === 'edit' ? editRef : editorRef}
          supports={mode === 'edit' ? supportsEditFormat : undefined}
        />
      )}
      {mode === 'edit' ? (
        noteId && (
          <Suspense fallback={<span className="px-6 py-4">{t('Loading note...')}</span>}>
            <EditView
              ref={editRef}
              noteId={noteId}
              defaultValue={entry.source}
              onChange={handleChange}
              onSave={onSave}
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

      {polishSel &&
        bubblePos &&
        createPortal(
          <div
            className="fixed z-[9999] flex items-center gap-1.5"
            style={{
              top: bubblePos.top,
              left: bubblePos.left,
              transform:
                bubblePos.placement === 'above' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            }}
          >
            <button
              type="button"
              onMouseDown={(e) => {
                // Prevent the editor from losing selection before our click handler fires.
                e.preventDefault();
              }}
              onClick={handlePolishClick}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full shadow-lg text-xs font-medium transition-transform hover:scale-105"
              style={{ backgroundColor: '#f97316', color: 'white' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                />
              </svg>
              {t('AI polish')}
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const text = polishSel.text;
                setPolishSel(null);
                askWithSelection(text);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full shadow-lg text-xs font-medium transition-transform hover:scale-105"
              style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-primary)' }}
            >
              <RobotIcon size={14} /> {t('Ask Fish about selection')}
            </button>
          </div>,
          document.body,
        )}

      {polishDialog && (
        <PolishDialog
          loading={polishDialog.loading}
          error={polishDialog.error}
          original={polishDialog.original}
          polished={polishDialog.polished}
          onAccept={handleApplyPolish}
          onClose={() => setPolishDialog(null)}
          onRetry={handleRetryPolish}
        />
      )}
    </div>
  );
}
