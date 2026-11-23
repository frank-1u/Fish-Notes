import { unavailable } from './client';
import type { ChatMessage } from './chats';

// T6 will replace the configuration and streaming transport with the HTTP provider contract.
export interface AIConfig {
  token: string;
  model: string;
  claudePath?: string;
}

export interface PublicAIConfig {
  model: string;
  claudePath?: string;
  hasToken: boolean;
}

interface ChatRequest {
  requestId: string;
  messages: ChatMessage[];
  noteContext?: string;
  scope?: 'notes';
}

function ignoreEvent<T>(_callback: (event: T & { requestId: string }) => void): () => void {
  return () => {};
}

export const ai = {
  async getConfig(): Promise<PublicAIConfig> {
    return { model: '', hasToken: false };
  },
  async setConfig(_config: AIConfig): Promise<void> {
    throw unavailable('AI assistant');
  },
  async testConnection(
    _config?: AIConfig,
  ): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
    return { ok: false, error: unavailable('AI assistant').message };
  },
  async suggestTitle(_content: string): Promise<string> {
    throw unavailable('AI assistant');
  },
  async polishText(_text: string): Promise<string> {
    throw unavailable('AI assistant');
  },
  async chatStream(_payload: ChatRequest): Promise<void> {
    throw unavailable('AI assistant');
  },
  async abortChat(_requestId: string): Promise<void> {
    throw unavailable('AI assistant');
  },
  onChatChunk: ignoreEvent<{ delta: string }>,
  onChatSources: ignoreEvent<{ sources: { id: string; title: string }[] }>,
  onChatThinking: ignoreEvent<{ delta: string; tokens?: number }>,
  onChatDone: ignoreEvent<{ fullText: string }>,
  onChatError: ignoreEvent<{ message: string }>,
};
