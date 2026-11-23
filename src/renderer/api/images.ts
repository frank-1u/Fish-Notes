import { invokeCommand } from './client';

export const images = {
  saveFromBuffer(buffer: ArrayBuffer, mimeType: string): Promise<string> {
    return invokeCommand<string>('images_save_from_buffer', buffer, {
      headers: { 'x-mime-type': mimeType },
    });
  },
};
