import { renderPreview } from './markdownRender';

export async function printNote(title: string, markdown: string): Promise<void> {
  if (document.body.classList.contains('printing-note')) return;

  const note = document.createElement('article');
  note.className = 'print-note';
  const heading = document.createElement('h1');
  heading.textContent = title;
  const body = document.createElement('div');
  body.className = 'markdown-preview';
  body.innerHTML = renderPreview(markdown);
  note.append(heading, body);

  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    note.remove();
    document.body.classList.remove('printing-note');
  };

  document.body.classList.add('printing-note');
  document.body.append(note);

  let imageWaitTimer: number | undefined;
  try {
    const images = Array.from(body.querySelectorAll<HTMLImageElement>('img[src], img[srcset]'));
    // A slow remote image should not prevent the print dialog from opening.
    const waitForImages = Promise.allSettled(
      images.map((image) => {
        image.loading = 'eager';
        return image.decode();
      }),
    );
    await Promise.race([
      waitForImages,
      new Promise<void>((resolve) => {
        imageWaitTimer = window.setTimeout(resolve, 3000);
      }),
    ]);
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
  } catch (error) {
    cleanup();
    throw error;
  } finally {
    window.clearTimeout(imageWaitTimer);
  }
}
