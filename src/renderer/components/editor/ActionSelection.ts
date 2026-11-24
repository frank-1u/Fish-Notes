type Coordinates = Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right'>;

export interface ActionSelection {
  text: string;
  getMarkdown: () => string;
  replaceMarkdown: (markdown: string) => boolean;
  getBounds: () => { start: Coordinates; end: Coordinates; editor: Coordinates } | null;
}

export const minimumSelectionLength = 4;
