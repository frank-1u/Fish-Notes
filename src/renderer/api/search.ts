import type { NoteSummary } from './notes';

// T2 will add match snippets and relevance ordering.
export const search = {
  async notes(_query: string): Promise<NoteSummary[]> {
    return [];
  },
};
