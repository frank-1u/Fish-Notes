import { Channel } from '@tauri-apps/api/core';
import { AppError, invokeCommand } from './client';
import type { ChatMessage } from './chats';

export type AiProtocol = 'openai' | 'anthropic';

export interface PublicAIConfig {
  protocol: AiProtocol;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
}

export type AIConfig = Omit<PublicAIConfig, 'hasApiKey'> & { apiKey: string };

interface ChatRequest {
  requestId: string;
  messages: ChatMessage[];
  noteContext?: string;
  scope?: 'notes';
}

type ChatUpdate =
  | { type: 'chunk'; delta: string }
  | { type: 'thinking'; delta: string }
  | { type: 'sources'; sources: { id: string; title: string }[] };

type ChatDone = { type: 'done'; fullText: string; cancelled: boolean };

type ChatStreamEvent =
  | { type: 'started' }
  | ChatUpdate
  | ChatDone
  | { type: 'error'; message: string };

function abortChat(requestId: string): Promise<void> {
  return invokeCommand('ai_abort_chat', { requestId });
}

export const ai = {
  getConfig: (): Promise<PublicAIConfig | null> => invokeCommand('ai_get_config'),
  setConfig: (config: AIConfig): Promise<void> => invokeCommand('ai_set_config', { config }),
  testConnection: (config?: AIConfig): Promise<string> =>
    invokeCommand('ai_test_connection', { config }),
  suggestTitle: (content: string): Promise<string> =>
    invokeCommand('ai_suggest_title', { content }),
  polishText: (text: string): Promise<string> => invokeCommand('ai_polish_text', { text }),
  abortChat,

  chatStream(request: ChatRequest, onUpdate: (event: ChatUpdate) => void) {
    let finished = false;
    let markReady!: () => void;
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    const result = new Promise<ChatDone>((resolve, reject) => {
      const channel = new Channel<ChatStreamEvent>((event) => {
        if (finished) return;
        switch (event.type) {
          case 'started':
            markReady();
            break;
          case 'done':
            finished = true;
            markReady();
            resolve(event);
            break;
          case 'error':
            finished = true;
            markReady();
            reject(new AppError('ai_stream_error', event.message));
            break;
          default:
            onUpdate(event);
        }
      });
      // Channel delivery can lag the invoke response. Only a terminal channel event
      // completes a successful invocation.
      void invokeCommand<void>('ai_chat_stream', { request, channel }).catch((error) => {
        finished = true;
        markReady();
        reject(error);
      });
    });

    return {
      result,
      async abort() {
        await ready;
        if (!finished) await abortChat(request.requestId);
      },
    };
  },
};
