import { api, parseAppError, type ImportResult, type NoteSummary, type TagData } from '../api';
import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { stripMarkdown } from '../utils/mdUtils';
import { message } from '../components/message';

type ViewMode = 'all' | 'trash' | 'tag';

interface AppState {
  notes: NoteSummary[];
  tags: TagData[];
  selectedNoteId: string | null;
  /** bumps on every explicit SELECT_NOTE — lets the list re-reveal even for the same id */
  selectSeq: number;
  viewMode: ViewMode;
  selectedTagId: string | null;
}

type AppAction =
  | { type: 'SET_NOTES'; notes: NoteSummary[] }
  | { type: 'SET_TAGS'; tags: TagData[] }
  | { type: 'SELECT_NOTE'; id: string | null }
  | { type: 'ADD_NOTE'; note: NoteSummary }
  | { type: 'UPDATE_NOTE'; id: string; data: Partial<NoteSummary> }
  | { type: 'REMOVE_NOTE'; id: string }
  | { type: 'SET_VIEW_MODE'; mode: ViewMode; tagId?: string | null };

function compareNotes(a: NoteSummary, b: NoteSummary): number {
  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
  return b.updatedAt.localeCompare(a.updatedAt);
}

function reportError(error: unknown) {
  message.error(parseAppError(error).message);
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_NOTES':
      return { ...state, notes: action.notes };
    case 'SET_TAGS':
      return { ...state, tags: action.tags };
    case 'SELECT_NOTE':
      return { ...state, selectedNoteId: action.id, selectSeq: state.selectSeq + 1 };
    case 'ADD_NOTE':
      return {
        ...state,
        notes: [action.note, ...state.notes.filter((note) => note.id !== action.note.id)].sort(
          compareNotes,
        ),
        selectedNoteId: action.note.id,
      };
    case 'UPDATE_NOTE': {
      const index = state.notes.findIndex((note) => note.id === action.id);
      if (index === -1) return state;
      const note = state.notes[index];
      if (
        Object.entries(action.data).every(
          ([key, value]) => note[key as keyof NoteSummary] === value,
        )
      ) {
        return state;
      }
      const notes = state.notes.slice();
      notes[index] = { ...note, ...action.data };
      if (action.data.isPinned !== undefined) notes.sort(compareNotes);
      return { ...state, notes };
    }
    case 'REMOVE_NOTE': {
      const filtered = state.notes.filter((n) => n.id !== action.id);
      return {
        ...state,
        notes: filtered,
        selectedNoteId:
          state.selectedNoteId === action.id ? (filtered[0]?.id ?? null) : state.selectedNoteId,
      };
    }
    case 'SET_VIEW_MODE':
      return {
        ...state,
        viewMode: action.mode,
        selectedTagId: action.tagId ?? null,
        selectedNoteId: null,
        notes:
          state.viewMode === action.mode && state.selectedTagId === (action.tagId ?? null)
            ? state.notes
            : [],
      };
    default:
      return state;
  }
}

interface AppActions {
  getNoteSummary: (id: string) => NoteSummary | undefined;
  createNote: () => Promise<void>;
  importNotes: () => Promise<ImportResult>;
  selectNote: (id: string | null) => void;
  updateNoteTitle: (id: string, title: string) => void;
  updateNoteContent: (id: string, content: string) => void;
  addNoteTag: (noteId: string, tagName: string) => Promise<void>;
  removeNoteTag: (noteId: string, tagId: string) => Promise<void>;
  trashNote: (id: string) => Promise<void>;
  restoreNote: (id: string) => Promise<void>;
  deleteNotePermanently: (id: string) => Promise<void>;
  setViewMode: (mode: ViewMode, tagId?: string | null) => void;
  refreshNotes: () => Promise<void>;
  refreshTags: () => Promise<void>;
  deleteTag: (tagId: string) => Promise<void>;
  renameTag: (tagId: string, newName: string) => Promise<void>;
  togglePinTag: (tagId: string) => Promise<void>;
  reorderTags: (orderedIds: string[]) => Promise<void>;
  togglePinNote: (id: string) => Promise<void>;
  lockNote: (id: string) => Promise<void>;
  unlockNote: (id: string) => Promise<void>;
  verifyPassword: (password: string) => Promise<boolean>;
  lockAllNotes: () => Promise<void>;
  refreshEncryptionState: () => Promise<void>;
  registerNoteEditFlush: (flush: () => void) => () => void;
}

const AppActionsContext = createContext<AppActions | null>(null);
const NotesContext = createContext<NoteSummary[]>([]);
const TagsContext = createContext<TagData[]>([]);
const ViewContext = createContext({
  viewMode: 'all' as ViewMode,
  selectedTagId: null as string | null,
});
const SelectionContext = createContext({ selectedNoteId: null as string | null, selectSeq: 0 });
const SelectedNoteLockedContext = createContext(false);
const EncryptionContext = createContext({ encryptionReady: false, sessionUnlocked: false });

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, {
    notes: [],
    tags: [],
    selectedNoteId: null,
    selectSeq: 0,
    viewMode: 'all',
    selectedTagId: null,
  });

  const [encryptionReady, setEncryptionReady] = useState(false);
  const [sessionUnlocked, setSessionUnlocked] = useState(false);
  const noteEditFlush = useRef<(() => void) | null>(null);
  const notesRef = useRef(state.notes);
  const tagsRef = useRef(state.tags);
  const selectedNoteIdRef = useRef(state.selectedNoteId);
  useLayoutEffect(() => {
    notesRef.current = state.notes;
    tagsRef.current = state.tags;
    selectedNoteIdRef.current = state.selectedNoteId;
  }, [state.notes, state.tags, state.selectedNoteId]);

  const getNoteSummary = useCallback(
    (id: string) => notesRef.current.find((note) => note.id === id),
    [],
  );
  const notesRequest = useRef(0);
  const tagsRequest = useRef(0);
  const view = useRef<{ mode: ViewMode; tagId: string | null }>({ mode: 'all', tagId: null });

  const setViewMode = useCallback((mode: ViewMode, tagId: string | null = null) => {
    if (view.current.mode !== mode || view.current.tagId !== tagId) {
      ++notesRequest.current;
      view.current = { mode, tagId };
    }
    noteEditFlush.current?.();
    dispatch({ type: 'SET_VIEW_MODE', mode, tagId });
  }, []);

  const refreshEncryptionState = useCallback(async () => {
    const [hasPassword, isUnlocked] = await Promise.all([
      api.encryption.hasPassword(),
      api.encryption.isUnlocked(),
    ]);
    setEncryptionReady(hasPassword);
    setSessionUnlocked(isUnlocked);
  }, []);

  const refreshTags = useCallback(async () => {
    const request = ++tagsRequest.current;
    const tags = await api.tags.getAll();
    if (request !== tagsRequest.current) return;
    dispatch({ type: 'SET_TAGS', tags });
    const { mode, tagId } = view.current;
    if (mode === 'tag' && !tags.some((tag) => tag.id === tagId)) setViewMode('all');
  }, [setViewMode]);

  const refreshNotes = useCallback(async () => {
    const request = ++notesRequest.current;
    const { mode, tagId } = view.current;
    let notes: NoteSummary[];
    if (mode === 'trash') {
      notes = await api.notes.getTrashed();
    } else if (mode === 'tag') {
      notes = tagId ? await api.tags.getNotesByTag(tagId) : [];
    } else {
      notes = await api.notes.getAll();
    }
    if (request === notesRequest.current) dispatch({ type: 'SET_NOTES', notes });
  }, []);

  useEffect(() => {
    void refreshNotes().catch(reportError);
  }, [refreshNotes, state.viewMode, state.selectedTagId]);

  useEffect(() => {
    void refreshTags().catch(reportError);
    void refreshEncryptionState().catch(reportError);
  }, [refreshTags, refreshEncryptionState]);

  const createNote = useCallback(async () => {
    try {
      const origin = view.current;
      const note = await api.notes.create();

      // Auto-tag when creating a note under a tag view
      if (origin.mode === 'tag' && origin.tagId) {
        const tag = tagsRef.current.find((t) => t.id === origin.tagId);
        if (tag) {
          await api.tags.setNoteTags(note.id, [tag.name]);
          await refreshTags();
        }
      }
      if (view.current === origin) {
        if (origin.mode === 'trash') setViewMode('all');
        noteEditFlush.current?.();
        dispatch({ type: 'ADD_NOTE', note });
      }
      await refreshNotes();
    } catch (error) {
      reportError(error);
    }
  }, [refreshNotes, refreshTags, setViewMode]);

  const importNotes = useCallback(async () => {
    const origin = view.current;
    const result = await api.import.files();
    if (result.created.length) {
      // Tag imported notes with the current tag when importing inside a tag view.
      if (origin.mode === 'tag' && origin.tagId) {
        const tag = tagsRef.current.find((tg) => tg.id === origin.tagId);
        if (tag) {
          for (const note of result.created) {
            await api.tags.setNoteTags(note.id, [tag.name]);
          }
          await refreshTags();
        }
      }
      await refreshNotes();
      noteEditFlush.current?.();
      dispatch({ type: 'SELECT_NOTE', id: result.created[0].id });
    }
    return result;
  }, [refreshTags, refreshNotes]);

  const selectNote = useCallback((id: string | null) => {
    if (id !== selectedNoteIdRef.current) noteEditFlush.current?.();
    dispatch({ type: 'SELECT_NOTE', id });
  }, []);

  const updateNoteTitle = useCallback((id: string, title: string) => {
    void api.notes
      .update(id, { title })
      .then(({ title, updatedAt }) => {
        dispatch({ type: 'UPDATE_NOTE', id, data: { title, updatedAt } });
      })
      .catch(reportError);
  }, []);

  const updateNoteContent = useCallback((id: string, content: string) => {
    const contentText = stripMarkdown(content);
    void api.notes
      .update(id, { content, contentText })
      .then(({ preview, updatedAt }) => {
        dispatch({ type: 'UPDATE_NOTE', id, data: { preview, updatedAt } });
      })
      .catch(reportError);
  }, []);

  const addNoteTag = useCallback(
    async (noteId: string, tagName: string) => {
      await api.tags.addNoteTag(noteId, tagName);
      await refreshTags();
      if (view.current.mode === 'tag') await refreshNotes();
    },
    [refreshNotes, refreshTags],
  );

  const removeNoteTag = useCallback(
    async (noteId: string, tagId: string) => {
      await api.tags.removeNoteTag(noteId, tagId);
      await refreshTags();
      if (view.current.mode === 'tag') await refreshNotes();
    },
    [refreshNotes, refreshTags],
  );

  const trashNote = useCallback(
    async (id: string) => {
      try {
        if (id === selectedNoteIdRef.current) noteEditFlush.current?.();
        await api.notes.trash(id);
        if (view.current.mode !== 'trash') dispatch({ type: 'REMOVE_NOTE', id });
        await Promise.all([refreshNotes(), refreshTags()]);
      } catch (error) {
        reportError(error);
      }
    },
    [refreshNotes, refreshTags],
  );

  const restoreNote = useCallback(
    async (id: string) => {
      try {
        if (id === selectedNoteIdRef.current) noteEditFlush.current?.();
        await api.notes.restore(id);
        if (view.current.mode === 'trash') dispatch({ type: 'REMOVE_NOTE', id });
        await Promise.all([refreshNotes(), refreshTags()]);
      } catch (error) {
        reportError(error);
      }
    },
    [refreshNotes, refreshTags],
  );

  const deleteNotePermanently = useCallback(
    async (id: string) => {
      try {
        if (id === selectedNoteIdRef.current) noteEditFlush.current?.();
        await api.notes.deletePermanently(id);
        dispatch({ type: 'REMOVE_NOTE', id });
        await Promise.all([refreshNotes(), refreshTags()]);
      } catch (error) {
        reportError(error);
      }
    },
    [refreshNotes, refreshTags],
  );

  const deleteTag = useCallback(
    async (tagId: string) => {
      await api.tags.delete(tagId);
      await refreshTags();
      await refreshNotes();
    },
    [refreshTags, refreshNotes],
  );

  const renameTag = useCallback(
    async (tagId: string, newName: string) => {
      await api.tags.rename(tagId, newName);

      await refreshTags();
    },
    [refreshTags],
  );

  const togglePinTag = useCallback(
    async (tagId: string) => {
      await api.tags.togglePin(tagId);
      await refreshTags();
    },
    [refreshTags],
  );

  const reorderTags = useCallback(
    async (orderedIds: string[]) => {
      await api.tags.reorder(orderedIds);
      await refreshTags();
    },
    [refreshTags],
  );

  const togglePinNote = useCallback(async (id: string) => {
    try {
      const isPinned = await api.notes.togglePin(id);
      dispatch({ type: 'UPDATE_NOTE', id, data: { isPinned } });
    } catch (error) {
      reportError(error);
    }
  }, []);

  const registerNoteEditFlush = useCallback((flush: () => void) => {
    noteEditFlush.current = flush;
    return () => {
      if (noteEditFlush.current === flush) noteEditFlush.current = null;
    };
  }, []);

  const lockNote = useCallback(async (id: string) => {
    try {
      noteEditFlush.current?.();
      const data = await api.notes.lock(id);
      dispatch({ type: 'UPDATE_NOTE', id, data });
    } catch (error) {
      reportError(error);
    }
  }, []);

  const unlockNote = useCallback(async (id: string) => {
    try {
      noteEditFlush.current?.();
      const data = await api.notes.unlock(id);
      dispatch({ type: 'UPDATE_NOTE', id, data });
    } catch (error) {
      reportError(error);
    }
  }, []);

  const verifyPassword = useCallback(async (password: string) => {
    const ok = await api.encryption.verifyPassword(password);
    if (ok) {
      setSessionUnlocked(true);
    }
    return ok;
  }, []);

  const lockAllNotes = useCallback(async () => {
    try {
      noteEditFlush.current?.();
      await api.notes.waitForWrites();
      await api.encryption.lockAll();
      setSessionUnlocked(false);
    } catch (error) {
      reportError(error);
    }
  }, []);

  const actions = useMemo<AppActions>(
    () => ({
      getNoteSummary,
      createNote,
      importNotes,
      selectNote,
      updateNoteTitle,
      updateNoteContent,
      addNoteTag,
      removeNoteTag,
      trashNote,
      restoreNote,
      deleteNotePermanently,
      setViewMode,
      refreshNotes,
      refreshTags,
      deleteTag,
      renameTag,
      togglePinTag,
      reorderTags,
      togglePinNote,
      lockNote,
      unlockNote,
      verifyPassword,
      lockAllNotes,
      refreshEncryptionState,
      registerNoteEditFlush,
    }),
    [
      getNoteSummary,
      createNote,
      importNotes,
      selectNote,
      updateNoteTitle,
      updateNoteContent,
      addNoteTag,
      removeNoteTag,
      trashNote,
      restoreNote,
      deleteNotePermanently,
      setViewMode,
      refreshNotes,
      refreshTags,
      deleteTag,
      renameTag,
      togglePinTag,
      reorderTags,
      togglePinNote,
      lockNote,
      unlockNote,
      verifyPassword,
      lockAllNotes,
      refreshEncryptionState,
      registerNoteEditFlush,
    ],
  );

  const { notes, tags, selectedNoteId, selectSeq, viewMode, selectedTagId } = state;
  const viewState = useMemo(() => ({ viewMode, selectedTagId }), [viewMode, selectedTagId]);
  const selection = useMemo(() => ({ selectedNoteId, selectSeq }), [selectedNoteId, selectSeq]);
  const encryption = useMemo(
    () => ({ encryptionReady, sessionUnlocked }),
    [encryptionReady, sessionUnlocked],
  );
  const selectedNoteLocked = notes.find((note) => note.id === selectedNoteId)?.isLocked ?? false;

  return (
    <AppActionsContext.Provider value={actions}>
      <ViewContext.Provider value={viewState}>
        <SelectionContext.Provider value={selection}>
          <SelectedNoteLockedContext.Provider value={selectedNoteLocked}>
            <EncryptionContext.Provider value={encryption}>
              <TagsContext.Provider value={tags}>
                <NotesContext.Provider value={notes}>{children}</NotesContext.Provider>
              </TagsContext.Provider>
            </EncryptionContext.Provider>
          </SelectedNoteLockedContext.Provider>
        </SelectionContext.Provider>
      </ViewContext.Provider>
    </AppActionsContext.Provider>
  );
}

export function useAppActions() {
  const context = useContext(AppActionsContext);
  if (!context) throw new Error('useAppActions must be used within AppProvider');
  return context;
}

export const useNotes = () => useContext(NotesContext);
export const useTags = () => useContext(TagsContext);
export const useNoteView = () => useContext(ViewContext);
export const useNoteSelection = () => useContext(SelectionContext);
export const useSelectedNoteLocked = () => useContext(SelectedNoteLockedContext);
export const useEncryption = () => useContext(EncryptionContext);
