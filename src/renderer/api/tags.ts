import { invokeCommand } from './client';
import type { NoteSummary } from './notes';

export interface TagData {
  id: string;
  name: string;
  parentId: string | null;
  noteCount: number;
  isPinned: boolean;
  sortOrder: number;
}

export const tags = {
  getAll: () => invokeCommand<TagData[]>('tags_get_all'),
  getByNoteId: (noteId: string) => invokeCommand<TagData[]>('tags_get_by_note_id', { noteId }),
  getNotesByTag: (tagId: string) =>
    invokeCommand<NoteSummary[]>('tags_get_notes_by_tag', { tagId }),
  setNoteTags: (noteId: string, tagNames: string[]) =>
    invokeCommand<void>('tags_set_note_tags', { noteId, tagNames }),
  addNoteTag: (noteId: string, tagName: string) =>
    invokeCommand<void>('tags_add_note_tag', { noteId, tagName }),
  removeNoteTag: (noteId: string, tagId: string) =>
    invokeCommand<void>('tags_remove_note_tag', { noteId, tagId }),
  cleanupUnused: () => invokeCommand<void>('tags_cleanup_unused'),
  delete: (tagId: string) => invokeCommand<string[]>('tags_delete', { tagId }),
  rename: (tagId: string, newName: string) =>
    invokeCommand<string | null>('tags_rename', { tagId, newName }),
  togglePin: (tagId: string) => invokeCommand<boolean>('tags_toggle_pin', { tagId }),
  reorder: (orderedIds: string[]) => invokeCommand<void>('tags_reorder', { orderedIds }),
};
