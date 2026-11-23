import { invokeCommand } from './client';

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

export const chats = {
  list: (): Promise<ChatData[]> => invokeCommand('chats_list'),
  getMessages: (chatId: string): Promise<ChatMessageData[]> =>
    invokeCommand('chats_get_messages', { chatId }),
  create: (title?: string): Promise<ChatData> => invokeCommand('chats_create', { title }),
  addMessage: (
    chatId: string,
    role: ChatMessage['role'],
    content: string,
    noteId?: string | null,
  ): Promise<ChatMessageData> =>
    invokeCommand('chats_add_message', { chatId, role, content, noteId }),
  delete: (id: string): Promise<void> => invokeCommand('chats_delete', { id }),
};
