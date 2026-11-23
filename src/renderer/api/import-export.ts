import { invokeCommand } from './client';
import type { NoteSummary } from './notes';

export interface ImportResult {
  created: NoteSummary[];
  failed: { name: string; error: string }[];
}

export const importNotes = {
  files(): Promise<ImportResult> {
    return invokeCommand('import_files');
  },
};

export const exportNotes = {
  markdown(title: string, content: string): Promise<boolean> {
    return invokeCommand('export_markdown', { title, content });
  },
  async html(title: string, content: string): Promise<boolean> {
    const { buildExportHtml } = await import('../utils/exportHtml');
    const html = await buildExportHtml(title, content, (name) =>
      invokeCommand('export_image_data_url', { name }),
    );
    return invokeCommand('export_html', { title, html });
  },
};
