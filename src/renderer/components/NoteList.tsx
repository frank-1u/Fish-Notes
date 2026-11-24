import { type NoteSummary } from '../api';
import { useState, useEffect, useLayoutEffect, useCallback, useRef, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';
import {
  useAppActions,
  useEncryption,
  useNotes,
  useNoteSelection,
  useNoteView,
} from '../contexts/AppContext';
import { useAssistantEntryPoints } from '../contexts/AssistantContext';
import PasswordPrompt from './PasswordPrompt';
import { PinIcon, RobotIcon } from './icons';
import { message } from './message';

interface NoteListProps {
  width: number;
  onResizeStart: (e: React.MouseEvent) => void;
}

interface NoteContextMenu {
  x: number;
  y: number;
  noteId: string;
}

function NoteList({ width, onResizeStart }: NoteListProps) {
  const { t } = useTranslation();
  const {
    getNoteSummary,
    createNote,
    importNotes,
    selectNote,
    trashNote,
    restoreNote,
    deleteNotePermanently,
    togglePinNote,
    lockNote,
    unlockNote,
    verifyPassword,
  } = useAppActions();
  const { encryptionReady, sessionUnlocked } = useEncryption();
  const { askAboutNote } = useAssistantEntryPoints();
  const { viewMode } = useNoteView();

  const [contextMenu, setContextMenu] = useState<NoteContextMenu | null>(null);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [importing, setImporting] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const newMenuTimerRef = useRef<number | null>(null);
  const pendingActionRef = useRef<(() => Promise<void>) | null>(null);

  const headerLabel = viewMode === 'trash' ? t('Trash') : t('All Notes');

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  // Hover-driven new/import dropdown. A short close delay lets the pointer travel
  // across the small gap from the button to the menu without it disappearing.
  const openNewMenu = useCallback(() => {
    if (newMenuTimerRef.current) {
      clearTimeout(newMenuTimerRef.current);
      newMenuTimerRef.current = null;
    }
    setShowNewMenu(true);
  }, []);

  const scheduleCloseNewMenu = useCallback(() => {
    if (newMenuTimerRef.current) clearTimeout(newMenuTimerRef.current);
    newMenuTimerRef.current = window.setTimeout(() => setShowNewMenu(false), 150);
  }, []);

  useEffect(() => {
    return () => {
      if (newMenuTimerRef.current) clearTimeout(newMenuTimerRef.current);
    };
  }, []);

  const handleNewNote = useCallback(() => {
    setShowNewMenu(false);
    createNote();
  }, [createNote]);

  const handleImport = useCallback(async () => {
    setShowNewMenu(false);
    if (importing) return;
    setImporting(true);
    try {
      const result = await importNotes();
      if (result.created.length) {
        message.success(t('Imported {{n}} notes', { n: result.created.length }));
      }
      if (result.failed.length) {
        message.error(
          t('Failed to import {{n}} files: {{names}}', {
            n: result.failed.length,
            names: result.failed.map((f) => f.name).join(', '),
          }),
        );
      } else if (!result.created.length) {
        // user cancelled the dialog — no toast
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }, [importing, importNotes, t]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, noteId: string) => {
      e.preventDefault();
      selectNote(noteId);
      setContextMenu({ x: e.clientX, y: e.clientY, noteId });
    },
    [selectNote],
  );

  const handleTrash = useCallback(async () => {
    if (!contextMenu) return;
    const { noteId } = contextMenu;
    setContextMenu(null);
    await trashNote(noteId);
  }, [contextMenu, trashNote]);

  const handleAskAi = useCallback(() => {
    if (!contextMenu) return;
    const note = getNoteSummary(contextMenu.noteId);
    setContextMenu(null);
    if (note) askAboutNote({ id: note.id, title: note.title || t('Untitled') });
  }, [contextMenu, getNoteSummary, askAboutNote, t]);

  const handleRestore = useCallback(async () => {
    if (!contextMenu) return;
    const { noteId } = contextMenu;
    setContextMenu(null);
    await restoreNote(noteId);
  }, [contextMenu, restoreNote]);

  const handleDeletePermanently = useCallback(async () => {
    if (!contextMenu) return;
    const { noteId } = contextMenu;
    setContextMenu(null);
    await deleteNotePermanently(noteId);
  }, [contextMenu, deleteNotePermanently]);

  const handleTogglePin = useCallback(async () => {
    if (!contextMenu) return;
    const { noteId } = contextMenu;
    setContextMenu(null);
    await togglePinNote(noteId);
  }, [contextMenu, togglePinNote]);

  const handleLock = useCallback(async () => {
    if (!contextMenu) return;
    const { noteId } = contextMenu;
    setContextMenu(null);
    if (!sessionUnlocked) {
      pendingActionRef.current = () => lockNote(noteId);
      setShowPasswordPrompt(true);
      return;
    }
    await lockNote(noteId);
  }, [contextMenu, lockNote, sessionUnlocked]);

  const handleUnlock = useCallback(async () => {
    if (!contextMenu) return;
    const { noteId } = contextMenu;
    setContextMenu(null);
    if (!sessionUnlocked) {
      pendingActionRef.current = () => unlockNote(noteId);
      setShowPasswordPrompt(true);
      return;
    }
    await unlockNote(noteId);
  }, [contextMenu, unlockNote, sessionUnlocked]);

  const handlePasswordVerify = useCallback(
    async (password: string) => {
      const ok = await verifyPassword(password);
      if (ok) {
        const pendingAction = pendingActionRef.current;
        pendingActionRef.current = null;
        setShowPasswordPrompt(false);
        await pendingAction?.();
      }
      return ok;
    },
    [verifyPassword],
  );

  const handlePasswordCancel = useCallback(() => {
    setShowPasswordPrompt(false);
    pendingActionRef.current = null;
  }, []);

  const contextNote = contextMenu ? getNoteSummary(contextMenu.noteId) : null;

  return (
    <section
      aria-label={t('Note List')}
      className="relative flex flex-col no-select min-w-0 transition-colors"
      style={{
        width,
        backgroundColor: 'var(--bg-primary)',
        borderRight: '1px solid var(--border-primary)',
      }}
    >
      {/* Header */}
      <div
        className="fn-pane-header h-12 flex items-center justify-between px-4 shrink-0"
        data-tauri-drag-region={navigator.userAgent.includes('Macintosh') ? true : undefined}
        style={{ borderBottom: '1px solid var(--border-secondary)' }}
      >
        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          {headerLabel}
        </span>
        {viewMode !== 'trash' && (
          <div
            ref={newMenuRef}
            className="relative"
            onMouseEnter={openNewMenu}
            onMouseLeave={scheduleCloseNewMenu}
          >
            <button
              onClick={openNewMenu}
              className="fn-accent-btn p-1 rounded-lg transition-all hover:opacity-90"
              style={{
                background: 'var(--accent-bg)',
                color: 'var(--accent-fg)',
                boxShadow: 'var(--accent-shadow)',
              }}
              title={t('New Note')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
            {showNewMenu && (
              <div
                className="absolute right-0 top-full mt-1 w-max rounded-lg shadow-lg border py-1 z-50"
                style={{
                  backgroundColor: 'var(--card-bg)',
                  borderColor: 'var(--border-primary)',
                  boxShadow: 'var(--card-shadow)',
                }}
              >
                <NewMenuItem
                  label={t('New blank note')}
                  onClick={handleNewNote}
                  icon="M12 4v16m8-8H4"
                />
                <NewMenuItem
                  label={importing ? t('Importing...') : t('Import (md / txt / html)')}
                  onClick={handleImport}
                  disabled={importing}
                  icon="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 4v12m0 0l-4-4m4 4l4-4"
                />
              </div>
            )}
          </div>
        )}
      </div>

      <VirtualNoteList onSelect={selectNote} onContextMenu={handleContextMenu} />

      {/* Resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400/50 transition-colors"
        onMouseDown={onResizeStart}
      />

      {/* Context menu */}
      {contextMenu &&
        (viewMode === 'trash' ? (
          <NoteContextMenuPopup x={contextMenu.x} y={contextMenu.y}>
            <ContextMenuItem label={t('Restore')} onClick={handleRestore} />
            <div className="my-1 border-t" style={{ borderColor: 'var(--border-secondary)' }} />
            <ContextMenuItem
              label={t('Delete Permanently')}
              onClick={handleDeletePermanently}
              danger
            />
          </NoteContextMenuPopup>
        ) : (
          <NoteContextMenuPopup x={contextMenu.x} y={contextMenu.y}>
            <ContextMenuItem
              label={
                <span className="inline-flex items-center gap-1.5">
                  <RobotIcon size={14} style={{ color: 'var(--accent-solid)' }} />
                  {t('Ask AI')}
                </span>
              }
              onClick={handleAskAi}
            />
            <div className="my-1 border-t" style={{ borderColor: 'var(--border-secondary)' }} />
            <ContextMenuItem
              label={contextNote?.isPinned ? t('Unpin') : t('Pin')}
              onClick={handleTogglePin}
            />
            {encryptionReady && (
              <>
                <div className="my-1 border-t" style={{ borderColor: 'var(--border-secondary)' }} />
                {contextNote?.isLocked ? (
                  <ContextMenuItem label={t('Remove Encryption')} onClick={handleUnlock} />
                ) : (
                  <ContextMenuItem label={t('Encrypt Note')} onClick={handleLock} />
                )}
              </>
            )}
            <div className="my-1 border-t" style={{ borderColor: 'var(--border-secondary)' }} />
            <ContextMenuItem label={t('Delete')} onClick={handleTrash} danger />
          </NoteContextMenuPopup>
        ))}

      {/* Password prompt modal */}
      {showPasswordPrompt && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ backgroundColor: 'var(--overlay-bg)' }}
        >
          <div
            className="w-80 rounded-xl shadow-2xl p-6"
            style={{ backgroundColor: 'var(--card-bg)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <PasswordPrompt
              onVerify={handlePasswordVerify}
              onCancel={handlePasswordCancel}
              message={t('Enter password to continue')}
              buttonText={t('Confirm')}
            />
          </div>
        </div>
      )}
    </section>
  );
}

const VirtualNoteList = memo(function VirtualNoteList({
  onSelect,
  onContextMenu,
}: {
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, noteId: string) => void;
}) {
  const { t } = useTranslation();
  const notes = useNotes();
  const { selectedNoteId, selectSeq } = useNoteSelection();
  const scrollRef = useRef<HTMLDivElement>(null);
  const revealed = useRef<{ id: string; seq: number }>();
  const getItemKey = useCallback((index: number) => notes[index].id, [notes]);
  const virtualizer = useVirtualizer({
    count: notes.length,
    getScrollElement: () => scrollRef.current,
    getItemKey,
    estimateSize: (index) => (notes[index].isLocked || notes[index].preview ? 85 : 65),
    overscan: 6,
    useFlushSync: false,
  });

  useLayoutEffect(() => {
    if (!selectedNoteId) {
      revealed.current = undefined;
      return;
    }
    if (revealed.current?.id === selectedNoteId && revealed.current.seq === selectSeq) return;
    const index = notes.findIndex((note) => note.id === selectedNoteId);
    if (index === -1) return; // Search may select an ID before its list has loaded.
    revealed.current = { id: selectedNoteId, seq: selectSeq };
    virtualizer.scrollToIndex(index, { align: 'auto' });
  }, [notes, selectedNoteId, selectSeq, virtualizer]);

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
      {notes.length === 0 ? (
        <div
          className="flex items-center justify-center h-full text-sm"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {t('No notes')}
        </div>
      ) : (
        <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map(({ key, index, start }) => (
            <div
              key={key}
              ref={virtualizer.measureElement}
              data-index={index}
              className="absolute inset-x-0 top-0"
              style={{ transform: `translateY(${start}px)` }}
            >
              <NoteListItem
                note={notes[index]}
                isSelected={notes[index].id === selectedNoteId}
                onSelect={onSelect}
                onContextMenu={onContextMenu}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

function formatRelativeDate(
  dateStr: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);

  if (diffMin < 1) return t('Just now');
  if (diffHour < 1) return t('{{n}} min ago', { n: diffMin });
  if (diffHour < 24) return t('{{n}} hr ago', { n: diffHour });

  const sameYear = now.getFullYear() === date.getFullYear();
  if (sameYear) {
    return t('{{month}}/{{day}}', { month: date.getMonth() + 1, day: date.getDate() });
  }
  return t('{{month}}/{{day}}/{{year}}', {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
}

const NoteListItem = memo(function NoteListItem({
  note,
  isSelected,
  onSelect,
  onContextMenu,
}: {
  note: NoteSummary;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, noteId: string) => void;
}) {
  const { t } = useTranslation();
  const title = note.title || t('Untitled');
  const preview = note.preview;
  const date = formatRelativeDate(note.updatedAt, t);

  return (
    <button
      onClick={() => onSelect(note.id)}
      onContextMenu={(e) => onContextMenu(e, note.id)}
      className={`fn-note-item block w-full text-left px-4 py-3 ${isSelected ? 'fn-note-active' : ''}`}
      style={{ borderBottom: '1px solid var(--border-secondary)' }}
    >
      <div
        className="flex items-center text-sm font-medium truncate"
        style={{ color: 'var(--text-primary)' }}
      >
        {note.isPinned && (
          <PinIcon
            size={14}
            className="mr-1 shrink-0"
            style={{ color: 'var(--pin-color, var(--accent-solid))' }}
          />
        )}
        {note.isLocked && (
          <svg
            className="w-3.5 h-3.5 mr-1 shrink-0 opacity-60"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        )}
        {title}
      </div>
      {note.isLocked ? (
        <div className="mt-1 text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
          {t('Encrypted note')}
        </div>
      ) : (
        preview && (
          <div className="mt-1 text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
            {preview}
          </div>
        )
      )}
      <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        {date}
      </div>
    </button>
  );
});

function NoteContextMenuPopup({
  x,
  y,
  children,
}: {
  x: number;
  y: number;
  children: React.ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) {
      menuRef.current.style.top = `${window.innerHeight - rect.height - 8}px`;
    }
    if (rect.right > window.innerWidth) {
      menuRef.current.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
  }, []);

  return (
    <div
      ref={menuRef}
      className="fixed rounded-lg shadow-lg border py-1 z-[100] min-w-[140px]"
      style={{
        left: x,
        top: y,
        backgroundColor: 'var(--card-bg)',
        borderColor: 'var(--border-primary)',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      {children}
    </div>
  );
}

function NewMenuItem({
  label,
  onClick,
  icon,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  icon: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2 whitespace-nowrap text-left px-3 py-1.5 text-sm transition-colors hover:opacity-80 disabled:opacity-50"
      style={{ color: 'var(--text-secondary)' }}
    >
      <svg
        className="w-4 h-4 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
      </svg>
      {label}
    </button>
  );
}

function ContextMenuItem({
  label,
  onClick,
  danger = false,
}: {
  label: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="w-full text-left px-3 py-1.5 text-sm transition-colors hover:opacity-80"
      style={{ color: danger ? '#ef4444' : 'var(--text-secondary)' }}
    >
      {label}
    </button>
  );
}

export default NoteList;
