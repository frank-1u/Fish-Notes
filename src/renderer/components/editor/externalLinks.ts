import { openUrl } from '@tauri-apps/plugin-opener';
import { parseAppError } from '../../api';
import { message } from '../message';

export const isExternalLink = (href: string) => /^(https?|mailto|tel):/i.test(href);

export function openExternalLink(href: string) {
  if (isExternalLink(href))
    void openUrl(href).catch((error: unknown) => message.error(parseAppError(error).message));
}
