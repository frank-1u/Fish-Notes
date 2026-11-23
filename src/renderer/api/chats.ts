import { unavailable } from './client';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatData {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageData extends ChatMessage {
  id: string;
  chatId: string;
  noteId: string | null;
  createdAt: string;
}

// T6 replaces these placeholders.
export const chats = {
  async list(): Promise<ChatData[]> {
    return [];
  },
  async getMessages(_chatId: string): Promise<ChatMessageData[]> {
    return [];
  },
  async create(_title?: string): Promise<ChatData> {
    throw unavailable('Chat');
  },
  async addMessage(
    _chatId: string,
    _role: ChatMessage['role'],
    _content: string,
    _noteId?: string | null,
  ): Promise<ChatMessageData> {
    throw unavailable('Chat');
  },
  async delete(_id: string): Promise<void> {
    throw unavailable('Chat');
  },
};
