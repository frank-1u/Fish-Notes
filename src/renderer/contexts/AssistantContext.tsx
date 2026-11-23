import { api, parseAppError, type ChatData } from '../api';
import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useAppActions } from './AppContext';
import { message } from '../components/message';

export interface BoundNote {
  id: string;
  title: string;
}

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** live extended-thinking text (display only, not persisted) */
  thinking?: string;
  /** notes retrieved for a knowledge-base answer (display only, not persisted) */
  sources?: { id: string; title: string }[];
  streaming?: boolean;
  noteId?: string | null;
}

export interface Tab {
  key: string;
  chatId: string | null;
  title: string;
  boundNote: BoundNote | null;
  messages: UiMessage[];
  streamingMessage?: UiMessage;
  isStreaming: boolean;
  /** "ask my notes" mode — retrieve from the whole note library before answering */
  useKb: boolean;
}

interface AssistantContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** any tab currently streaming — drives the floating-ball indicator */
  isStreaming: boolean;

  // tabs
  tabs: Tab[];
  activeKey: string;
  /** null when no conversation is open (initial state) */
  activeTab: Tab | null;
  newTab: () => void;
  selectTab: (key: string) => void;
  closeTab: (key: string) => void;

  // active-tab conversation
  send: (text: string) => Promise<void>;
  abort: () => void;
  detachNote: () => void;
  /** toggle knowledge-base mode on the active tab */
  toggleKb: () => void;
  saveAsNote: (markdown: string) => Promise<void>;

  // entry points
  askWithSelection: (snippet: string) => void;
  askAboutNote: (note: BoundNote) => void;

  // history (persisted chats)
  chats: ChatData[];
  selectChat: (id: string) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;

  // composer prefill (quoted selection)
  prefill: string;
  clearPrefill: () => void;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);
const AssistantEntryPointsContext = createContext<Pick<
  AssistantContextValue,
  'askWithSelection' | 'askAboutNote'
> | null>(null);

const STREAM_UPDATE_MS = 64;

const AI_TAG = 'AI对话';

function genId(): string {
  return crypto.randomUUID();
}

function freshTab(boundNote: BoundNote | null = null): Tab {
  return {
    key: genId(),
    chatId: null,
    title: '',
    boundNote,
    messages: [],
    isStreaming: false,
    useKb: false,
  };
}

interface StreamEntry {
  chatId: string | null;
  cancelled: boolean;
  discard: boolean;
  stop?: () => Promise<void>;
  timer?: number;
}

function reportError(error: unknown) {
  message.error(parseAppError(error).message);
}

function stopStream(stream?: StreamEntry) {
  if (!stream || stream.cancelled) return;
  stream.cancelled = true;
  void stream.stop?.().catch((error: unknown) => {
    stream.cancelled = false;
    reportError(error);
  });
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { getNoteSummary, refreshNotes, refreshTags } = useAppActions();

  const [isOpen, setIsOpen] = useState(false);
  // starts with NO tab — a conversation only exists after the user opens one
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeKey, setActiveKey] = useState<string>('');
  const [chats, setChats] = useState<ChatData[]>([]);
  const [prefill, setPrefill] = useState<string>('');

  // Keep the current tab available to callbacks across asynchronous requests.
  const tabsRef = useRef<Tab[]>(tabs);
  tabsRef.current = tabs;
  const activeKeyRef = useRef<string>(activeKey);
  activeKeyRef.current = activeKey;
  // Reserve a tab before the first IPC call so concurrent sends cannot share its history.
  const streams = useRef<Map<string, StreamEntry>>(new Map());

  const deletingChats = useRef(new Set<string>());

  const activeTab = tabs.find((tb) => tb.key === activeKey) ?? null;

  // helpers
  const patchTab = useCallback((key: string, patch: (tb: Tab) => Tab) => {
    setTabs((prev) => prev.map((tb) => (tb.key === key ? patch(tb) : tb)));
  }, []);

  const chatListRevision = useRef(0);
  const refreshChats = useCallback(async () => {
    const revision = ++chatListRevision.current;
    try {
      const history = await api.chats.list();
      if (chatListRevision.current === revision) setChats(history);
    } catch (error) {
      if (chatListRevision.current === revision) reportError(error);
    }
  }, []);

  useEffect(() => {
    void refreshChats();
    const entries = streams.current;
    return () => {
      chatListRevision.current += 1;
      for (const entry of entries.values()) {
        entry.discard = true;
        if (entry.timer != null) window.clearTimeout(entry.timer);
        stopStream(entry);
      }
      entries.clear();
    };
  }, [refreshChats]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  // ---- tabs ----
  const newTab = useCallback(() => {
    const tab = freshTab();
    setTabs((prev) => [...prev, tab]);
    setActiveKey(tab.key);
    setPrefill('');
  }, []);

  const selectTab = useCallback((key: string) => setActiveKey(key), []);

  const closeTab = useCallback((key: string) => {
    stopStream(streams.current.get(key));
    setTabs((prev) => {
      const idx = prev.findIndex((tb) => tb.key === key);
      if (idx === -1) return prev;
      const next = prev.filter((tb) => tb.key !== key);
      if (next.length === 0) {
        setActiveKey('');
        return [];
      }
      // if closing the active tab, focus a neighbour
      setActiveKey((cur) => (cur === key ? next[Math.max(0, idx - 1)].key : cur));
      return next;
    });
  }, []);

  // ---- send / abort ----
  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      const key = activeKeyRef.current;
      const tab = tabsRef.current.find((tb) => tb.key === key);
      if (
        !trimmed ||
        !tab ||
        streams.current.has(key) ||
        (tab.chatId && deletingChats.current.has(tab.chatId))
      )
        return;

      const entry: StreamEntry = { chatId: tab.chatId, cancelled: false, discard: false };
      streams.current.set(key, entry);
      patchTab(key, (tb) => ({ ...tb, isStreaming: true }));

      const assistantId = genId();
      let accumulated = '';
      let thinking = '';
      let sources: UiMessage['sources'];
      const assistantMessage = (content: string, streaming: boolean): UiMessage => ({
        id: assistantId,
        role: 'assistant',
        content,
        thinking,
        sources,
        streaming,
      });

      const publish = () => {
        entry.timer = undefined;
        if (entry.discard) return;
        const streamingMessage = assistantMessage(accumulated, true);
        patchTab(key, (tb) => ({ ...tb, streamingMessage }));
      };

      try {
        let noteContext: string | undefined;
        const noteId = tab.boundNote?.id;
        if (noteId) {
          const note = await api.notes.get(noteId);
          noteContext = note?.isLocked
            ? (await api.notes.getDecrypted(noteId))?.content
            : note?.content;
          if (!noteContext?.trim()) {
            message.warning(
              note?.isLocked
                ? t('Unlock this note first to ask about it')
                : t('This note is empty'),
            );
            return;
          }
        }
        if (entry.cancelled) return;

        const title = Array.from(trimmed).slice(0, 24).join('');
        let chatId = entry.chatId;
        if (!chatId) {
          const chat = await api.chats.create(title);
          entry.chatId = chatId = chat.id;
          patchTab(key, (tb) => ({ ...tb, chatId: chat.id, title: chat.title }));
          void refreshChats();
        }
        if (entry.cancelled) return;

        const userMessage = await api.chats.addMessage(chatId, 'user', trimmed, noteId);
        if (entry.discard) return;
        patchTab(key, (tb) => ({
          ...tb,
          title: tb.title || title,
          messages: [...tb.messages, userMessage],
          streamingMessage: { id: assistantId, role: 'assistant', content: '', streaming: true },
        }));
        setPrefill('');
        void refreshChats();
        if (entry.cancelled) return;

        const messages = [...tab.messages, userMessage].map(({ role, content }) => ({
          role,
          content,
        }));
        const stream = api.ai.chatStream(
          {
            requestId: genId(),
            messages,
            noteContext,
            scope: !tab.boundNote && tab.useKb ? 'notes' : undefined,
          },
          (event) => {
            if (entry.discard) return;
            switch (event.type) {
              case 'chunk':
                accumulated += event.delta;
                break;
              case 'thinking':
                thinking += event.delta;
                break;
              case 'sources':
                sources = event.sources;
                break;
            }
            entry.timer ??= window.setTimeout(publish, STREAM_UPDATE_MS);
          },
        );
        entry.stop = stream.abort;
        try {
          accumulated = (await stream.result).fullText;
        } finally {
          if (entry.timer != null) {
            window.clearTimeout(entry.timer);
            publish();
          }
          if (!entry.discard && accumulated.trim()) {
            try {
              await api.chats.addMessage(chatId, 'assistant', accumulated.trim());
              void refreshChats();
            } catch (error) {
              if (!entry.discard) throw error;
            }
          }
        }
      } finally {
        if (streams.current.get(key) === entry) {
          streams.current.delete(key);
          const reply = assistantMessage(accumulated.trim(), false);
          patchTab(key, (tb) => ({
            ...tb,
            isStreaming: false,
            streamingMessage: undefined,
            messages: reply.content ? [...tb.messages, reply] : tb.messages,
          }));
        }
      }
    },
    [patchTab, refreshChats, t],
  );

  const abort = useCallback(() => {
    stopStream(streams.current.get(activeKeyRef.current));
  }, []);

  const detachNote = useCallback(() => {
    patchTab(activeKeyRef.current, (tb) => ({ ...tb, boundNote: null }));
  }, [patchTab]);

  const toggleKb = useCallback(() => {
    patchTab(activeKeyRef.current, (tb) => (tb.boundNote ? tb : { ...tb, useKb: !tb.useKb }));
  }, [patchTab]);

  const saveAsNote = useCallback(
    async (markdown: string) => {
      const body = markdown.trim();
      if (!body) return;
      const note = await api.notes.create();
      const tab = tabsRef.current.find((tb) => tb.key === activeKeyRef.current);
      const title = tab?.title?.trim() || body.split('\n')[0].slice(0, 30);
      const contentText = body.replace(/[#*`>\-[\]()!]/g, '').trim();
      await api.notes.update(note.id, { title, content: body, contentText });
      await api.tags.setNoteTags(note.id, [AI_TAG]);
      await refreshNotes();
      await refreshTags();
      message.success(t('Saved as note'));
    },
    [refreshNotes, refreshTags, t],
  );

  // ---- entry points ----
  const askWithSelection = useCallback((snippet: string) => {
    const tab = freshTab(null);
    setTabs((prev) => [...prev, tab]);
    setActiveKey(tab.key);
    setPrefill(`> ${snippet.replace(/\n/g, '\n> ')}\n\n`);
    setIsOpen(true);
  }, []);

  const askAboutNote = useCallback((note: BoundNote) => {
    const tab = freshTab(note);
    setTabs((prev) => [...prev, tab]);
    setActiveKey(tab.key);
    setPrefill('');
    setIsOpen(true);
  }, []);

  // ---- history ----
  const historySelection = useRef(0);

  const selectChat = useCallback(
    async (id: string) => {
      if (deletingChats.current.has(id)) return;
      const selection = ++historySelection.current;
      const existing = tabsRef.current.find((tb) => tb.chatId === id);
      if (existing) {
        setActiveKey(existing.key);
        return;
      }
      const msgs = await api.chats.getMessages(id);
      if (historySelection.current !== selection) return;
      const boundId = msgs.find((m) => m.noteId)?.noteId;
      const note = boundId ? getNoteSummary(boundId) : undefined;
      const tab: Tab = {
        key: genId(),
        chatId: id,
        title: chats.find((c) => c.id === id)?.title || '',
        boundNote: note ? { id: note.id, title: note.title || t('Untitled') } : null,
        messages: msgs,
        isStreaming: false,
        useKb: false,
      };
      setTabs((prev) => [...prev, tab]);
      setActiveKey(tab.key);
    },
    [chats, getNoteSummary, t],
  );

  const deleteChat = useCallback(
    async (id: string) => {
      if (deletingChats.current.has(id)) return;
      deletingChats.current.add(id);
      historySelection.current += 1;
      for (const entry of streams.current.values()) {
        if (entry.chatId === id) {
          entry.discard = true;
          stopStream(entry);
        }
      }
      try {
        await api.chats.delete(id);
      } catch (error) {
        for (const entry of streams.current.values()) {
          if (entry.chatId === id) entry.discard = false;
        }
        throw error;
      } finally {
        deletingChats.current.delete(id);
      }
      void refreshChats();
      const removedKey = tabsRef.current.find((tb) => tb.chatId === id)?.key;
      const nextKey = tabsRef.current.find((tb) => tb.chatId !== id)?.key ?? '';
      setTabs((prev) => prev.filter((tb) => tb.chatId !== id));
      setActiveKey((key) => (key === removedKey ? nextKey : key));
    },
    [refreshChats],
  );

  const clearPrefill = useCallback(() => setPrefill(''), []);

  const isStreaming = tabs.some((tb) => tb.isStreaming);

  const value = useMemo<AssistantContextValue>(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      isStreaming,
      tabs,
      activeKey,
      activeTab,
      newTab,
      selectTab,
      closeTab,
      send,
      abort,
      detachNote,
      toggleKb,
      saveAsNote,
      askWithSelection,
      askAboutNote,
      chats,
      selectChat,
      deleteChat,
      prefill,
      clearPrefill,
    }),
    [
      isOpen,
      open,
      close,
      toggle,
      isStreaming,
      tabs,
      activeKey,
      activeTab,
      newTab,
      selectTab,
      closeTab,
      send,
      abort,
      detachNote,
      toggleKb,
      saveAsNote,
      askWithSelection,
      askAboutNote,
      chats,
      selectChat,
      deleteChat,
      prefill,
      clearPrefill,
    ],
  );

  const entryPoints = useMemo(
    () => ({ askWithSelection, askAboutNote }),
    [askWithSelection, askAboutNote],
  );
  return (
    <AssistantEntryPointsContext.Provider value={entryPoints}>
      <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
    </AssistantEntryPointsContext.Provider>
  );
}

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error('useAssistant must be used within AssistantProvider');
  return ctx;
}

export function useAssistantEntryPoints() {
  const context = useContext(AssistantEntryPointsContext);
  if (!context) throw new Error('useAssistantEntryPoints must be used within AssistantProvider');
  return context;
}
