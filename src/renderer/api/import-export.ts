import { unavailable } from './client';
import type { NoteData } from './notes';

export interface ImportResult {
  created: NoteData[];
  failed: { name: string; error: string }[];
}

// T5 replaces these placeholders. PDF will use the system print dialog.
export const importNotes = {
  async files(): Promise<ImportResult> {
    throw unavailable('Import');
  },
};

export const exportNotes = {
  async markdown(_title: string, _content: string): Promise<boolean> {
    throw unavailable('Markdown export');
  },
  async html(_title: string, _content: string): Promise<boolean> {
    throw unavailable('HTML export');
  },
};
