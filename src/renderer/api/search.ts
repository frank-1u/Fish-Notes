import { invokeCommand } from './client';

export interface SearchResult {
  id: string;
  title: string;
  snippet: { text: string; matched: boolean }[];
}

export const search = {
  notes: (query: string) => invokeCommand<SearchResult[]>('search_notes', { query }),
};
