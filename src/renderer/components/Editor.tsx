import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { api, parseAppError } from '../api';
import { unavailable } from '../api/client';
import React, { useCallback, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import MarkdownEditor from './editor/MarkdownEditor';
import TagBar from './TagBar';
import PasswordPrompt from './PasswordPrompt';
import { useAutoSave } from '../hooks/useAutoSave';
import { useApp } from '../contexts/AppContext';
import { useTheme } from '../contexts/ThemeContext';
import { message } from './message';

interface EditorProps {
  noteId: string | null;
  title: string;
  content: string;
  isLocked: boolean;
  loading: boolean;
  loadError?: string;
  onContentChange?: (noteId: string, content: string) => void;
}

function Editor({
  noteId,
  title,
  content,
  isLocked,
  loading,
  loadError,
  onContentChange,
}: EditorProps) {
  const { t, i18n } = useTranslation();
  const { save, flush } = useAutoSave(500);
  const { save: saveTitle, flush: flushTitle } = useAutoSave(500);
  const {
    updateNoteTitle,
    sessionUnlocked,
    verifyPassword,
    encryptionReady,
    lockNote,
    unlockNote,
    refreshEncryptionState,
    registerNoteEditFlush,
  } = useApp();
  const { resolvedTheme } = useTheme();
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [localTitle, setLocalTitle] = useState(title);
  const [suggestingTitle, setSuggestingTitle] = useState(false);
  const [titleCandidate, setTitleCandidate] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const titleRequest = useRef(0);

  const [decrypted, setDecrypted] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);

  const lastContentRef = useRef(content);
  const prevNoteIdRef = useRef(noteId);
  if (noteId !== prevNoteIdRef.current) {
    lastContentRef.current = content;
    prevNoteIdRef.current = noteId;
    setLocalTitle(title);
    setDecrypted(false);
    setDecryptError(null);
    setShowExportMenu(false);
    titleRequest.current += 1;
    setSuggestingTitle(false);
    setTitleCandidate(null);
  }

  // Fetch decrypted content when a locked note is opened and session is unlocked
  useEffect(() => {
    if (!noteId || !isLocked) return;
    if (!sessionUnlocked) {
      lastContentRef.current = '';
      setDecrypted(false);
      setDecryptError(null);
      setShowExportMenu(false);
      setTitleCandidate(null);
      return;
    }
    let cancelled = false;
    void api.notes
      .getDecrypted(noteId)
      .then((note) => {
        if (cancelled) return;
        lastContentRef.current = note.content;
        setDecrypted(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const appError = parseAppError(error);
        setDecryptError(appError.message);
        if (appError.code === 'session_locked') {
          void refreshEncryptionState().catch((error: unknown) =>
            message.error(parseAppError(error).message),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [noteId, isLocked, sessionUnlocked, refreshEncryptionState]);

  const flushPending = useCallback(() => {
    flush();
    flushTitle();
  }, [flush, flushTitle]);

  useEffect(() => flushPending, [noteId, flushPending]);
  useEffect(() => registerNoteEditFlush(flushPending), [registerNoteEditFlush, flushPending]);

  useEffect(() => {
    if (!isTauri()) return;
    let closing = false;
    const listener = getCurrentWindow().onCloseRequested(async (event) => {
      if (closing) {
        event.preventDefault();
        return;
      }
      closing = true;
      flushPending();
      await api.notes.waitForWrites();
    });
    const reportError = (error: unknown) => message.error(parseAppError(error).message);
    void listener.catch(reportError);
    return () => {
      void listener.then(
        (unlisten) => unlisten(),
        () => undefined,
      );
    };
  }, [flushPending]);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value;
      setLocalTitle(newTitle);
      if (!noteId) return;
      saveTitle(() => {
        updateNoteTitle(noteId, newTitle);
      });
    },
    [noteId, saveTitle, updateNoteTitle],
  );

  const handleChange = useCallback(
    (md: string) => {
      if (!noteId) return;
      if (md === lastContentRef.current) return;
      lastContentRef.current = md;
      save(() => {
        onContentChange?.(noteId, md);
      });
    },
    [noteId, save, onContentChange],
  );

  // Close menu on outside click
  useEffect(() => {
    if (!showExportMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showExportMenu]);

  const canRead = !isLocked || (sessionUnlocked && decrypted);
  const handleExport = useCallback(
    async (format: 'markdown' | 'html' | 'pdf') => {
      setShowExportMenu(false);
      if (!canRead) return;
      try {
        if (format === 'pdf') throw unavailable('PDF export');
        await api.export[format](localTitle, lastContentRef.current);
      } catch (error) {
        message.error(parseAppError(error).message);
      }
    },
    [canRead, localTitle],
  );

  const handleVerify = useCallback(
    async (password: string) => {
      return await verifyPassword(password);
    },
    [verifyPassword],
  );

  const handleLockToggle = useCallback(async () => {
    if (!noteId) return;
    if (isLocked) {
      await unlockNote(noteId);
    } else {
      await lockNote(noteId);
    }
  }, [noteId, isLocked, lockNote, unlockNote]);

  const handleSuggestTitle = useCallback(async () => {
    if (!noteId || suggestingTitle) return;
    const source = canRead ? lastContentRef.current : '';
    if (!source.trim()) {
      message.warning(t('Note is empty'));
      return;
    }
    const request = ++titleRequest.current;
    setSuggestingTitle(true);
    setTitleCandidate(null);
    try {
      const suggested = await api.ai.suggestTitle(source);
      if (titleRequest.current === request) setTitleCandidate(suggested);
    } catch (e) {
      if (titleRequest.current === request)
        message.error(e instanceof Error ? e.message : String(e));
    } finally {
      if (titleRequest.current === request) setSuggestingTitle(false);
    }
  }, [noteId, suggestingTitle, canRead, t]);

  const handleAcceptTitle = useCallback(() => {
    if (!noteId || !titleCandidate) return;
    flushTitle();
    setLocalTitle(titleCandidate);
    updateNoteTitle(noteId, titleCandidate);
    setTitleCandidate(null);
  }, [noteId, titleCandidate, flushTitle, updateNoteTitle]);

  const handleDismissTitle = useCallback(() => {
    setTitleCandidate(null);
  }, []);

  // Determine if we should show the password prompt
  const needsPassword = isLocked && !sessionUnlocked;

  return (
    <div
      className="relative flex-1 flex flex-col min-w-0 transition-colors"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Editor header with export button */}
      <div
        className="h-12 flex items-center justify-end px-4 gap-1 shrink-0 no-select"
        data-tauri-drag-region={navigator.userAgent.includes('Macintosh') ? true : undefined}
        style={{ borderBottom: '1px solid var(--border-secondary)' }}
      >
        {noteId && (
          <div className="flex items-center gap-1">
            {/* Lock/unlock button */}
            {encryptionReady && sessionUnlocked && (
              <button
                onClick={handleLockToggle}
                className="p-1.5 rounded transition-colors hover:opacity-70"
                style={{ color: isLocked ? '#3b82f6' : 'var(--text-tertiary)' }}
                title={isLocked ? t('Remove Encryption') : t('Encrypt Note')}
              >
                {isLocked ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                    />
                  </svg>
                )}
              </button>
            )}

            {/* Export button */}
            <div ref={menuRef} className="relative" hidden={!canRead}>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="p-1.5 rounded transition-colors hover:opacity-70"
                style={{ color: 'var(--text-tertiary)' }}
                title={t('Export')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
              </button>
              {showExportMenu && (
                <div
                  className="absolute right-0 top-full mt-1 w-40 rounded-lg shadow-lg border py-1 z-50"
                  style={{
                    backgroundColor: 'var(--card-bg)',
                    borderColor: 'var(--border-primary)',
                  }}
                >
                  <ExportMenuItem label="Markdown (.md)" onClick={() => handleExport('markdown')} />
                  <ExportMenuItem label="HTML (.html)" onClick={() => handleExport('html')} />
                  <ExportMenuItem label="PDF (.pdf)" onClick={() => handleExport('pdf')} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {noteId ? (
        needsPassword ? (
          <PasswordPrompt onVerify={handleVerify} />
        ) : !canRead ? (
          <div
            className="flex-1 flex items-center justify-center"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {decryptError || t('Decrypting...')}
          </div>
        ) : (
          <>
            {/* Row 1: Title input + AI suggest button */}
            <div className="shrink-0" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
              <div className="flex items-center">
                <input
                  type="text"
                  value={localTitle}
                  onChange={handleTitleChange}
                  placeholder={t('Untitled')}
                  className="flex-1 px-4 py-2 text-xl font-semibold outline-none"
                  style={{
                    backgroundColor: 'transparent',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  onClick={handleSuggestTitle}
                  disabled={suggestingTitle}
                  className="mr-3 p-1.5 rounded transition-colors hover:opacity-70 disabled:opacity-50"
                  style={{ color: 'var(--text-tertiary)' }}
                  title={t('Suggest title with AI')}
                >
                  {suggestingTitle ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="3"
                        opacity="0.25"
                      />
                      <path
                        d="M4 12a8 8 0 018-8"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                      />
                    </svg>
                  )}
                </button>
              </div>

              {titleCandidate && (
                <div
                  className="flex items-center gap-2 px-4 py-2"
                  style={{ backgroundColor: 'var(--bg-tertiary)' }}
                >
                  <svg
                    className="w-3.5 h-3.5 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 3l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                    />
                  </svg>
                  <span
                    className="flex-1 text-sm truncate"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {titleCandidate}
                  </span>
                  <button
                    onClick={handleAcceptTitle}
                    className="px-2 py-0.5 rounded text-xs text-white transition-colors"
                    style={{ backgroundColor: '#3b82f6' }}
                    title={t('Apply')}
                  >
                    {t('Apply')}
                  </button>
                  <button
                    onClick={handleDismissTitle}
                    className="p-1 rounded transition-colors hover:opacity-70"
                    style={{ color: 'var(--text-tertiary)' }}
                    title={t('Dismiss')}
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Row 2: Tags */}
            <TagBar noteId={noteId} />

            {/* Row 3: Markdown editor */}
            <MarkdownEditor
              key={`${noteId}-${resolvedTheme}-${i18n.language}`}
              defaultValue={lastContentRef.current}
              onChange={handleChange}
              onSave={flushPending}
            />
          </>
        )
      ) : (
        <div
          className="flex-1 flex items-center justify-center"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {loadError ??
            (loading ? t('Loading note...') : t('Select or create a note to start writing'))}
        </div>
      )}
    </div>
  );
}

function ExportMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-sm transition-colors hover:opacity-80"
      style={{ color: 'var(--text-secondary)' }}
    >
      {label}
    </button>
  );
}

export default Editor;
