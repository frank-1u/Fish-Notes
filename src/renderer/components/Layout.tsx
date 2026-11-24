import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { api, AppError, parseAppError, type NoteData } from '../api';
import Sidebar from './Sidebar';
import NoteList from './NoteList';
import Editor, { PaneToggles } from './Editor';
import SearchBar from './SearchBar';
import Settings from './Settings';
import { useAppActions, useNoteSelection, useSelectedNoteLocked } from '../contexts/AppContext';

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 350;
const NOTELIST_MIN = 200;
const NOTELIST_MAX = 450;

function usePaneVisibility(storageKey: string) {
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== 'false';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(visible));
    } catch {
      // Keep the in-memory preference when storage is unavailable.
    }
  }, [storageKey, visible]);
  return [visible, () => setVisible((previous) => !previous)] as const;
}

function Layout() {
  const [sidebarVisible, toggleSidebar] = usePaneVisibility('fish-notes:sidebar-visible');
  const [noteListVisible, toggleNoteList] = usePaneVisibility('fish-notes:note-list-visible');
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [noteListWidth, setNoteListWidth] = useState(280);
  const [showSearch, setShowSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const sidebarWidthRef = useRef(sidebarWidth);
  const noteListWidthRef = useRef(noteListWidth);

  const { createNote } = useAppActions();

  const openSearch = useCallback(() => setShowSearch(true), []);
  const closeSearch = useCallback(() => setShowSearch(false), []);
  const openSettings = useCallback(() => setShowSettings(true), []);
  const closeSettings = useCallback(() => setShowSettings(false), []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        createNote();
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setShowSettings(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createNote]);

  // Track active drag listeners so they can be cleaned up on unmount
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  const handleSidebarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragCleanupRef.current?.();
    sidebarWidthRef.current = sidebarWidth;
    const startX = e.clientX;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(
        SIDEBAR_MIN,
        Math.min(SIDEBAR_MAX, sidebarWidthRef.current + moveEvent.clientX - startX),
      );
      setSidebarWidth(newWidth);
    };

    const cleanup = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', cleanup);
      dragCleanupRef.current = null;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', cleanup);
    dragCleanupRef.current = cleanup;
  };

  const handleNoteListMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragCleanupRef.current?.();
    noteListWidthRef.current = noteListWidth;
    const startX = e.clientX;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(
        NOTELIST_MIN,
        Math.min(NOTELIST_MAX, noteListWidthRef.current + moveEvent.clientX - startX),
      );
      setNoteListWidth(newWidth);
    };

    const cleanup = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', cleanup);
      dragCleanupRef.current = null;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', cleanup);
    dragCleanupRef.current = cleanup;
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {sidebarVisible && (
        <Sidebar
          width={sidebarWidth}
          onResizeStart={handleSidebarMouseDown}
          onSearchClick={openSearch}
          onSettingsClick={openSettings}
        />
      )}
      {noteListVisible && (
        <NoteList width={noteListWidth} onResizeStart={handleNoteListMouseDown} />
      )}
      <SelectedNoteEditor
        headerStart={
          <PaneToggles
            sidebarVisible={sidebarVisible}
            noteListVisible={noteListVisible}
            onToggleSidebar={toggleSidebar}
            onToggleNoteList={toggleNoteList}
          />
        }
      />
      {showSearch && <SearchBar onClose={closeSearch} />}
      {showSettings && <Settings onClose={closeSettings} />}
    </div>
  );
}

function SelectedNoteEditor({ headerStart }: { headerStart: ReactNode }) {
  const { updateNoteContent } = useAppActions();
  const { selectedNoteId } = useNoteSelection();
  const isLocked = useSelectedNoteLocked();
  const [loadedNote, setLoadedNote] = useState<{
    id: string;
    isLocked: boolean;
    data?: NoteData;
    error?: string;
  } | null>(null);

  useEffect(() => {
    setLoadedNote(null);
    if (!selectedNoteId) return;

    let active = true;
    void api.notes
      .get(selectedNoteId)
      .then((data) => {
        if (!data) throw new AppError('note_not_found', 'Note not found.');
        if (active) setLoadedNote({ id: selectedNoteId, isLocked, data });
      })
      .catch((error: unknown) => {
        if (active)
          setLoadedNote({ id: selectedNoteId, isLocked, error: parseAppError(error).message });
      });
    return () => {
      active = false;
    };
  }, [selectedNoteId, isLocked]);

  const current =
    loadedNote?.id === selectedNoteId && loadedNote.isLocked === isLocked ? loadedNote : null;

  return (
    <Editor
      headerStart={headerStart}
      noteId={current?.data?.id ?? null}
      title={current?.data?.title ?? ''}
      content={current?.data?.content ?? ''}
      isLocked={current?.data?.isLocked ?? isLocked}
      loading={selectedNoteId !== null && current === null}
      loadError={current?.error}
      onContentChange={updateNoteContent}
    />
  );
}

export default Layout;
