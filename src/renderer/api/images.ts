import { unavailable } from './client';

// T4 replaces this placeholder.
export const images = {
  async saveFromBuffer(_buffer: ArrayBuffer, _mimeType: string): Promise<string> {
    throw unavailable('Images');
  },
};
