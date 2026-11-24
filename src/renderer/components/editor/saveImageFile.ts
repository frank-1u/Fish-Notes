import { api } from '../../api';

export async function saveImageFile(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null;
  try {
    return await api.images.saveFromBuffer(await file.arrayBuffer(), file.type);
  } catch (error) {
    console.error('Failed to save image:', error);
    return null;
  }
}
