import previewCss from '../styles/markdown-preview.css?inline';
import themeCss from '../styles/themes/variables.css?raw';
import { fishImageName, renderMarkdown } from './markdownRender';

const documentCss = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    max-width: 820px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: system-ui, sans-serif;
    overflow-wrap: anywhere;
  }
  .note-title { margin: 0 0 1em; font-size: 2em; line-height: 1.25; }
  .markdown-preview img { display: block; }
  .markdown-preview pre { overflow-wrap: normal; }
  .markdown-preview :not(pre) > code { overflow-wrap: anywhere; }
`;

export async function buildExportHtml(
  title: string,
  markdown: string,
  readImage: (name: string) => Promise<string>,
): Promise<string> {
  const template = document.createElement('template');
  template.content.append(renderMarkdown(markdown));

  const embeddedImages = new Map<string, Promise<string | null>>();
  await Promise.all(
    Array.from(template.content.querySelectorAll<HTMLImageElement>('img[src]'), async (image) => {
      const name = fishImageName(image);
      if (!name) return;
      let embedded = embeddedImages.get(name);
      if (!embedded) {
        embedded = readImage(name).catch(() => null);
        embeddedImages.set(name, embedded);
      }
      const src = await embedded;
      if (src) {
        image.setAttribute('src', src);
        image.removeAttribute('srcset');
      }
    }),
  );

  const text = document.createElement('div');
  text.textContent = title;
  const escapedTitle = text.innerHTML;
  const theme = document.documentElement.dataset.theme?.match(/^[a-z-]+$/)?.[0] ?? 'light';

  return `<!doctype html>
<html data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escapedTitle}</title>
<style>${themeCss}\n${previewCss}\n${documentCss}</style>
</head>
<body>
<main>
  <h1 class="note-title">${escapedTitle}</h1>
  <article class="markdown-preview">${template.innerHTML}</article>
</main>
</body>
</html>
`;
}
