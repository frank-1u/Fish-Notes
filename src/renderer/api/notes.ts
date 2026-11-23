import { invokeCommand } from './client';

export interface NoteSummary {
  id: string;
  title: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
  isTrashed: boolean;
  isPinned: boolean;
  isLocked: boolean;
}

export interface NoteData extends NoteSummary {
  content: string;
  contentText: string;
}

export type NoteUpdate = Partial<Pick<NoteData, 'title' | 'content' | 'contentText'>>;

const writes = new Map<string, Promise<unknown>>();

function writeNote<T>(id: string, operation: () => Promise<T>): Promise<T> {
  // Saves can overlap across IPC. Keep writes ordered per note while other notes remain independent.
  const pending = writes.get(id);
  const next = (pending ? pending.catch(() => undefined) : Promise.resolve()).then(operation);
  writes.set(id, next);
  const clear = () => {
    if (writes.get(id) === next) writes.delete(id);
  };
  void next.then(clear, clear);
  return next;
}

export const notes = {
  create: () => invokeCommand<NoteSummary>('notes_create'),
  getAll: () => invokeCommand<NoteSummary[]>('notes_list', { isTrashed: false }),
  getTrashed: () => invokeCommand<NoteSummary[]>('notes_list', { isTrashed: true }),
  async get(id: string): Promise<NoteData | null> {
    await writes.get(id)?.catch(() => undefined);
    return invokeCommand<NoteData | null>('notes_get', { id });
  },
  update: (id: string, data: NoteUpdate) =>
    writeNote(id, () => invokeCommand<NoteSummary>('notes_update', { id, data })),
  trash: (id: string) => writeNote(id, () => invokeCommand<void>('notes_trash', { id })),
  restore: (id: string) => writeNote(id, () => invokeCommand<void>('notes_restore', { id })),
  deletePermanently: (id: string) =>
    writeNote(id, () => invokeCommand<void>('notes_delete_permanently', { id })),
  togglePin: (id: string) =>
    writeNote(id, () => invokeCommand<boolean>('notes_toggle_pin', { id })),
  async waitForWrites(): Promise<void> {
    let firstError: unknown;
    let hasError = false;
    while (writes.size > 0) {
      const snapshot = Array.from(writes.values());
      const results = await Promise.allSettled(snapshot);
      if (!hasError) {
        const rejected = results.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        );
        if (rejected) {
          hasError = true;
          firstError = rejected.reason;
        }
      }
    }
    if (hasError) throw firstError;
  },

  lock: (id: string) => writeNote(id, () => invokeCommand<NoteSummary>('notes_lock', { id })),
  unlock: (id: string) => writeNote(id, () => invokeCommand<NoteSummary>('notes_unlock', { id })),
  async getDecrypted(id: string): Promise<NoteData> {
    await writes.get(id)?.catch(() => undefined);
    return invokeCommand<NoteData>('notes_get_decrypted', { id });
  },
};
