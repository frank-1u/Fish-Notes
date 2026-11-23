import { unavailable } from './client';

export interface TagData {
  id: string;
  name: string;
  parentId: string | null;
  noteCount: number;
  isPinned: boolean;
  sortOrder: number;
}

// T2 replaces these placeholders.
export const tags = {
  async getAll(): Promise<TagData[]> {
    return [];
  },
  async getByNoteId(_noteId: string): Promise<TagData[]> {
    return [];
  },
  async getNotesByTag(_tagId: string): Promise<string[]> {
    return [];
  },
  async setNoteTags(_noteId: string, _tagNames: string[]): Promise<void> {
    throw unavailable('Tags');
  },
  async cleanupUnused(): Promise<void> {},
  async delete(_tagId: string): Promise<string[]> {
    throw unavailable('Tags');
  },
  async rename(_tagId: string, _newName: string): Promise<string | null> {
    throw unavailable('Tags');
  },
  async togglePin(_tagId: string): Promise<boolean> {
    throw unavailable('Tags');
  },
  async reorder(_orderedIds: string[]): Promise<void> {
    throw unavailable('Tags');
  },
};
