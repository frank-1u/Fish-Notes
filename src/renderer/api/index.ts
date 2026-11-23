import { ai } from './ai';
import { chats } from './chats';
import { encryption } from './encryption';
import { images } from './images';
import { exportNotes, importNotes } from './import-export';
import { notes } from './notes';
import { search } from './search';
import { tags } from './tags';

export const api = {
  notes,
  tags,
  search,
  encryption,
  images,
  export: exportNotes,
  import: importNotes,
  ai,
  chats,
};

export { AppError, parseAppError } from './client';
export type { AIConfig, AiProtocol, PublicAIConfig } from './ai';
export type { ChatData, ChatMessage, ChatMessageData } from './chats';
export type { ImportResult } from './import-export';
export type { NoteData, NoteSummary, NoteUpdate } from './notes';
export type { SearchResult } from './search';
export type { TagData } from './tags';
